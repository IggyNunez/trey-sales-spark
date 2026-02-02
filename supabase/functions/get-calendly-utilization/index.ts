import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Rate limiting configuration
const CALENDLY_RATE_LIMIT_DELAY = 100; // 100ms between calls = ~10 calls/sec
const MAX_API_CALLS = 150; // Increased limit to allow proper busy time fetching for team events
let apiCallCount = 0;

interface EventType {
  uri: string;
  name: string;
  slug: string;
  active: boolean;
  duration: number;
  kind: string;
  pooling_type?: string;
  scheduling_url?: string;
  profile?: {
    type: string;  // 'User' or 'Team'
    name: string;
  };
}

interface AvailableTime {
  status: string;
  start_time: string;
  invitees_remaining: number;
}

interface ScheduledEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  status: string;
  event_type: string;
}

interface TeamMember {
  uri: string;
  name: string;
  email: string;
}

interface UserBusyTime {
  type: 'calendly' | 'external' | 'reserved';
  start_time: string;
  end_time: string;
  buffered_start_time?: string;
  buffered_end_time?: string;
  event?: { uri: string };
}

interface AvailabilityRule {
  type: 'wday' | 'date';
  wday?: string; // 'monday', 'tuesday', etc.
  date?: string; // specific date
  intervals: Array<{ from: string; to: string }>; // e.g., "09:00", "17:00"
}

interface UserAvailabilitySchedule {
  uri: string;
  default: boolean;
  name: string;
  timezone: string;
  rules: AvailabilityRule[];
}

serve(async (req) => {
  // Reset API call counter for each request
  apiCallCount = 0;

  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { organizationId, startDate, endDate, eventTypeUris, listEventTypesOnly } = await req.json();
    
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org name for logging
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();
    
    console.log(`Fetching utilization for organization: ${orgData?.name || 'Unknown'} (${organizationId})`);

    // STRICT ORG ISOLATION: Get Calendly API key using encrypted key helper (enables lazy migration)
    const CALENDLY_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'calendly', 'get-calendly-utilization');

    if (!CALENDLY_API_KEY) {
      console.error(`No Calendly API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Calendly API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using encrypted Calendly API key for ${orgData?.name}`);

    // Parse date range - default to today through end of day +2 (3 days total)
    // Using EST timezone for consistent business day boundaries
    const now = new Date();
    
    // Get current date in EST
    const estOffset = -5 * 60; // EST is UTC-5
    const nowEST = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
    
    // Start of today in EST (midnight)
    const todayStartEST = new Date(nowEST);
    todayStartEST.setHours(0, 0, 0, 0);
    
    // Default end: 11:59:59 PM EST on day +2 (3 days total: today, tomorrow, day after)
    const defaultDaysAhead = 2; // Today + 2 more days
    const defaultEndEST = new Date(todayStartEST);
    defaultEndEST.setDate(defaultEndEST.getDate() + defaultDaysAhead);
    defaultEndEST.setHours(23, 59, 59, 999);
    
    // Convert EST times back to UTC for API calls
    const todayStartUTC = new Date(todayStartEST.getTime() - (estOffset - now.getTimezoneOffset()) * 60000);
    const defaultEndUTC = new Date(defaultEndEST.getTime() - (estOffset - now.getTimezoneOffset()) * 60000);
    
    const start = startDate ? new Date(startDate) : todayStartUTC;
    const end = endDate ? new Date(endDate) : defaultEndUTC;

    // For scheduled events, use the full range
    // For availability, only query future dates (Calendly API limitation)
    // Use current timestamp (not midnight) to ensure we're in the future
    const availabilityStart = new Date(Math.max(now.getTime(), start.getTime()));
    
    // Ensure availability end is not more than 7 days from availability start
    const maxEnd = new Date(availabilityStart.getTime() + 7 * 24 * 60 * 60 * 1000);
    const availabilityEnd = end > maxEnd ? maxEnd : end;
    
    // Check if we have any future dates to query availability
    const hasFutureDates = availabilityStart < availabilityEnd;

    console.log('Current time (UTC):', now.toISOString());
    console.log('Date range (today + 2 days EST):', start.toISOString(), 'to', end.toISOString());
    console.log('Availability range:', hasFutureDates ? `${availabilityStart.toISOString()} to ${availabilityEnd.toISOString()}` : 'N/A (all past dates)');

    // Rate-limited fetch wrapper with retry logic
    const rateLimitedFetch = async (
      url: string, 
      options: RequestInit, 
      maxRetries = 3,
      skipRateLimit = false
    ): Promise<Response | null> => {
      // Check hard limit
      if (apiCallCount >= MAX_API_CALLS) {
        console.log(`[API LIMIT] Reached ${MAX_API_CALLS} API calls, returning null`);
        return null;
      }
      
      // Add delay between calls (unless skipping for first call)
      if (!skipRateLimit) {
        await new Promise(r => setTimeout(r, CALENDLY_RATE_LIMIT_DELAY));
      }
      
      apiCallCount++;
      console.log(`[API Call #${apiCallCount}] ${url.substring(0, 80)}...`);
      
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20 second timeout
          
          const response = await fetch(url, {
            ...options,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          
          // Handle rate limiting (429)
          if (response.status === 429) {
            console.log(`[RATE LIMITED] 429 from Calendly, waiting 2 seconds... (attempt ${attempt}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (attempt < maxRetries) {
              continue;
            }
            // If we've exhausted retries, return the 429 response
            return response;
          }
          
          // If we get a 5xx error, retry
          if (response.status >= 500 && attempt < maxRetries) {
            console.log(`Calendly API returned ${response.status}, retrying (attempt ${attempt}/${maxRetries})...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
          
          return response;
        } catch (error: unknown) {
          lastError = error instanceof Error ? error : new Error('Unknown error');
          console.log(`Calendly API fetch error (attempt ${attempt}/${maxRetries}): ${lastError.message}`);
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
            continue;
          }
        }
      }
      throw lastError || new Error('All retry attempts failed');
    };

    // Get current user info with retry
    let userResponse: Response | null;
    try {
      userResponse = await rateLimitedFetch('https://api.calendly.com/users/me', {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }, 3, true); // Skip rate limit delay for first call
    } catch (fetchError: unknown) {
      const message = fetchError instanceof Error ? fetchError.message : 'Unknown error';
      console.error('Calendly API fetch error after retries:', message);
      return new Response(
        JSON.stringify({ error: 'Calendly API is currently unavailable. Please try again later.' }),
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userResponse) {
      return new Response(
        JSON.stringify({ error: 'API call limit reached. Please try again later.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (userResponse.status === 429) {
      return new Response(
        JSON.stringify({ error: 'Calendly rate limit reached. Please wait a moment and try again.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!userResponse.ok) {
      // Only read a small portion to avoid hanging on large HTML error pages
      const errorText = await userResponse.text().catch(() => 'Could not read error');
      const truncatedError = errorText.substring(0, 200);
      console.error('Calendly user API error:', userResponse.status, truncatedError);
      
      // Return proper status code based on what Calendly returned
      const statusCode = userResponse.status === 429 ? 429 : 503;
      return new Response(
        JSON.stringify({ error: statusCode === 429 ? 'Calendly rate limit reached. Please wait a moment and try again.' : 'Calendly API is currently unavailable. Please try again later.' }),
        { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = await userResponse.json();
    const organizationUri = userData.resource.current_organization;

    console.log('Calendly user:', userData.resource.name);

    // Get organization members
    let teamMembers: TeamMember[] = [];
    try {
      const membersUrl = new URL('https://api.calendly.com/organization_memberships');
      membersUrl.searchParams.append('organization', organizationUri);
      
      const membersResponse = await rateLimitedFetch(membersUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (membersResponse?.ok) {
        const membersData = await membersResponse.json();
        teamMembers = (membersData.collection || []).map((m: any) => ({
          uri: m.user.uri,
          name: m.user.name,
          email: m.user.email,
        }));
        console.log(`Found ${teamMembers.length} team members`);
      } else if (membersResponse?.status === 429) {
        console.log('Rate limited while fetching team members');
      }
    } catch (e) {
      console.log('Could not fetch team members:', e);
    }

    // LAZY LOADING: Store schedules and busy times but only fetch on-demand
    const memberAvailabilitySchedules: Map<string, { name: string; schedules: UserAvailabilitySchedule[] }> = new Map();
    const memberBusyTimes: Map<string, { name: string; busyTimes: UserBusyTime[] }> = new Map();
    const scheduleFetchedFor: Set<string> = new Set();
    const busyTimesFetchedFor: Set<string> = new Set();
    
    // Helper function to lazily fetch availability schedule for a member
    const ensureScheduleFetched = async (member: TeamMember): Promise<UserAvailabilitySchedule[]> => {
      if (scheduleFetchedFor.has(member.uri)) {
        return memberAvailabilitySchedules.get(member.uri)?.schedules || [];
      }
      
      scheduleFetchedFor.add(member.uri);
      
      try {
        const schedulesUrl = new URL('https://api.calendly.com/user_availability_schedules');
        schedulesUrl.searchParams.append('user', member.uri);
        
        const schedulesResponse = await rateLimitedFetch(schedulesUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${CALENDLY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (schedulesResponse?.ok) {
          const schedulesData = await schedulesResponse.json();
          const schedules: UserAvailabilitySchedule[] = schedulesData.collection || [];
          memberAvailabilitySchedules.set(member.uri, { name: member.name, schedules });
          console.log(`[LAZY] Fetched ${schedules.length} schedules for ${member.name}`);
          return schedules;
        } else if (schedulesResponse?.status === 429) {
          console.log(`[LAZY] Rate limited fetching schedules for ${member.name}`);
        } else if (schedulesResponse) {
          console.log(`[LAZY] Could not fetch schedules for ${member.name}: ${schedulesResponse.status}`);
        }
      } catch (e) {
        console.log(`[LAZY] Error fetching schedules for ${member.name}:`, e);
      }
      
      return [];
    };
    
    // Helper function to lazily fetch busy times for a member
    const ensureBusyTimesFetched = async (member: TeamMember): Promise<UserBusyTime[]> => {
      if (busyTimesFetchedFor.has(member.uri)) {
        return memberBusyTimes.get(member.uri)?.busyTimes || [];
      }
      
      busyTimesFetchedFor.add(member.uri);
      
      try {
        const busyTimesUrl = new URL('https://api.calendly.com/user_busy_times');
        busyTimesUrl.searchParams.append('user', member.uri);
        busyTimesUrl.searchParams.append('start_time', availabilityStart.toISOString());
        busyTimesUrl.searchParams.append('end_time', availabilityEnd.toISOString());
        
        const busyTimesResponse = await rateLimitedFetch(busyTimesUrl.toString(), {
          headers: {
            'Authorization': `Bearer ${CALENDLY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (busyTimesResponse?.ok) {
          const busyTimesData = await busyTimesResponse.json();
          const busyTimes: UserBusyTime[] = busyTimesData.collection || [];
          memberBusyTimes.set(member.uri, { name: member.name, busyTimes });
          console.log(`[LAZY] Fetched ${busyTimes.length} busy times for ${member.name}`);
          return busyTimes;
        } else if (busyTimesResponse?.status === 429) {
          console.log(`[LAZY] Rate limited fetching busy times for ${member.name}`);
        } else if (busyTimesResponse) {
          console.log(`[LAZY] Could not fetch busy times for ${member.name}: ${busyTimesResponse.status}`);
        }
      } catch (e) {
        console.log(`[LAZY] Error fetching busy times for ${member.name}:`, e);
      }
      
      return [];
    };
    
    // Helper function to generate time slots from availability schedule for a date range
    const generateSlotsFromSchedule = (
      schedules: UserAvailabilitySchedule[],
      startDate: Date,
      endDate: Date,
      slotDurationMinutes: number
    ): Date[] => {
      const slots: Date[] = [];
      const defaultSchedule = schedules.find(s => s.default) || schedules[0];
      if (!defaultSchedule?.rules) return slots;
      
      const dayOfWeekMap: { [key: string]: number } = {
        'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
        'thursday': 4, 'friday': 5, 'saturday': 6
      };
      
      // Iterate through each day in the range
      const currentDate = new Date(startDate);
      while (currentDate < endDate) {
        const dayOfWeek = currentDate.getDay();
        const dayName = Object.keys(dayOfWeekMap).find(k => dayOfWeekMap[k] === dayOfWeek);
        
        // Find rule for this day
        const dayRule = defaultSchedule.rules.find(r => r.type === 'wday' && r.wday === dayName);
        
        if (dayRule?.intervals) {
          for (const interval of dayRule.intervals) {
            // Parse start and end times (format: "HH:MM")
            const [startHour, startMin] = interval.from.split(':').map(Number);
            const [endHour, endMin] = interval.to.split(':').map(Number);
            
            // Create slots for this interval
            const intervalStart = new Date(currentDate);
            intervalStart.setHours(startHour, startMin, 0, 0);
            
            const intervalEnd = new Date(currentDate);
            intervalEnd.setHours(endHour, endMin, 0, 0);
            
            // Generate slots within this interval
            const slotTime = new Date(intervalStart);
            while (slotTime.getTime() + slotDurationMinutes * 60000 <= intervalEnd.getTime()) {
              if (slotTime >= startDate && slotTime < endDate) {
                slots.push(new Date(slotTime));
              }
              slotTime.setMinutes(slotTime.getMinutes() + slotDurationMinutes);
            }
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
        currentDate.setHours(0, 0, 0, 0);
      }
      
      return slots;
    };
    
    // Helper to check if a slot overlaps with busy times
    const isSlotBusy = (slotStart: Date, slotDurationMinutes: number, busyTimes: UserBusyTime[]): boolean => {
      const slotEnd = new Date(slotStart.getTime() + slotDurationMinutes * 60000);
      return busyTimes.some(bt => {
        const busyStart = new Date(bt.start_time);
        const busyEnd = new Date(bt.end_time);
        return slotStart < busyEnd && slotEnd > busyStart;
      });
    };

    // Get all event types for the organization (with pagination)
    // NOTE: Calendly API only returns solo event types when querying by organization.
    // Round robin and collective event types require querying per-user.
    let allEventTypes: EventType[] = [];
    let eventTypesNextPage: string | null = null;
    const seenEventUris = new Set<string>();
    
    // Track which team members are assigned to each event type (for round robin/collective)
    const eventTypeHosts: Map<string, TeamMember[]> = new Map();
    
    // First, fetch organization-level event types (solo events)
    console.log('=== FETCHING ORGANIZATION-LEVEL EVENT TYPES ===');
    do {
      const eventTypesUrl = new URL('https://api.calendly.com/event_types');
      eventTypesUrl.searchParams.append('organization', organizationUri);
      eventTypesUrl.searchParams.append('count', '100');
      // Don't filter by active - get all event types
      if (eventTypesNextPage) {
        eventTypesUrl.searchParams.append('page_token', eventTypesNextPage);
      }

      const eventTypesResponse = await rateLimitedFetch(eventTypesUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!eventTypesResponse?.ok) {
        if (eventTypesResponse?.status === 429) {
          console.log('Rate limited while fetching event types');
          break;
        }
        console.error('Failed to fetch event types:', eventTypesResponse?.status);
        break;
      }

      const eventTypesData = await eventTypesResponse.json();
      const pageEventTypes: EventType[] = (eventTypesData.collection || []).map((et: any) => {
        const profileType = et.profile?.type || 'unknown';
        console.log(`ORG_EVENT_TYPE: "${et.name}" | active=${et.active} | kind=${et.kind} | pooling_type=${et.pooling_type} | profile.type=${profileType} | scheduling_url=${et.scheduling_url}`);
        seenEventUris.add(et.uri);
        return {
          uri: et.uri,
          name: et.name,
          slug: et.slug,
          active: et.active,
          duration: et.duration,
          kind: et.kind || 'solo',
          pooling_type: et.pooling_type,
          scheduling_url: et.scheduling_url,
          profile: et.profile ? { type: et.profile.type, name: et.profile.name } : undefined,
        };
      });
      
      allEventTypes = [...allEventTypes, ...pageEventTypes];
      eventTypesNextPage = eventTypesData.pagination?.next_page_token || null;
    } while (eventTypesNextPage);
    
    console.log(`Found ${allEventTypes.length} organization-level event types`);
    
    // ========== FETCH PER-USER EVENT TYPES (catches shared/team events) ==========
    // Calendly's organization query may miss shared events that each user is assigned to.
    // Query each team member's event types and dedupe by URI.
    console.log('=== FETCHING PER-USER EVENT TYPES (to catch shared events) ===');
    
    for (const member of teamMembers) {
      try {
        let userEventTypesNextPage: string | null = null;
        let userEventTypesCount = 0;
        
        do {
          const userEventTypesUrl = new URL('https://api.calendly.com/event_types');
          userEventTypesUrl.searchParams.append('user', member.uri);
          userEventTypesUrl.searchParams.append('count', '100');
          if (userEventTypesNextPage) {
            userEventTypesUrl.searchParams.append('page_token', userEventTypesNextPage);
          }
          
          const userEventTypesResponse = await rateLimitedFetch(userEventTypesUrl.toString(), {
            headers: {
              'Authorization': `Bearer ${CALENDLY_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (!userEventTypesResponse?.ok) {
            if (userEventTypesResponse?.status === 429) {
              console.log(`Rate limited while fetching event types for ${member.name}`);
            } else {
              console.log(`Could not fetch event types for ${member.name}: ${userEventTypesResponse?.status}`);
            }
            break;
          }
          
          const userEventTypesData = await userEventTypesResponse.json();
          const userEventTypes = userEventTypesData.collection || [];
          
          for (const et of userEventTypes) {
            // Only add if we haven't seen this URI before (dedupe)
            if (!seenEventUris.has(et.uri)) {
              seenEventUris.add(et.uri);
              const newEventType: EventType = {
                uri: et.uri,
                name: et.name,
                slug: et.slug,
                active: et.active,
                duration: et.duration,
                kind: et.kind || 'solo',
                pooling_type: et.pooling_type,
                scheduling_url: et.scheduling_url,
                profile: et.profile ? { type: et.profile.type, name: et.profile.name } : undefined,
              };
              allEventTypes.push(newEventType);
              userEventTypesCount++;
              console.log(`  NEW from ${member.name}: "${et.name}" | kind=${et.kind} | pooling_type=${et.pooling_type}`);
            }
          }
          
          userEventTypesNextPage = userEventTypesData.pagination?.next_page_token || null;
        } while (userEventTypesNextPage);
        
        if (userEventTypesCount > 0) {
          console.log(`  Added ${userEventTypesCount} new event types from ${member.name}`);
        }
      } catch (e) {
        console.log(`Error fetching event types for ${member.name}:`, e);
      }
    }
    
    console.log(`Total event types after combining: ${allEventTypes.length}`);
    
    // ========== FETCH HOSTS FOR EACH EVENT TYPE ==========
    // Use Calendly's "event_type_memberships" endpoint for definitive host counts
    // This is the authoritative source for round robin detection
    console.log('=== FETCHING HOSTS FOR EACH EVENT TYPE (via memberships API) ===');
    
    // Helper function to fetch hosts for a specific event type using memberships endpoint (with caching)
    const hostsCache = new Map<string, TeamMember[]>();
    const fetchEventTypeHosts = async (etUri: string, etName: string): Promise<TeamMember[]> => {
      // Check cache first
      if (hostsCache.has(etUri)) {
        return hostsCache.get(etUri)!;
      }
      
      try {
        // Use the event_type_memberships endpoint with the full event type URI
        // This is the authoritative source for who is assigned to an event type
        const membershipsUrl = `https://api.calendly.com/event_type_memberships?event_type=${encodeURIComponent(etUri)}`;
        
        const membershipsResponse = await rateLimitedFetch(membershipsUrl, {
          headers: {
            'Authorization': `Bearer ${CALENDLY_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (membershipsResponse?.ok) {
          const membershipsData = await membershipsResponse.json();
          const membershipsList = membershipsData.collection || [];
          
          // DEBUG: Log the raw API response to see the actual structure
          if (membershipsList.length > 0) {
            console.log(`"${etName}": Raw memberships response (first item):`, JSON.stringify(membershipsList[0]));
          }
          
          // Map memberships to our host format
          // The Calendly event_type_memberships API returns objects like:
          // { uri: "membership-uri", user: "https://api.calendly.com/users/xxx", user_email: "...", user_name: "..." }
          const fetchedHosts: TeamMember[] = [];
          
          for (const m of membershipsList) {
            // Extract user URI - try multiple possible field locations
            let userUri: string | null = null;
            
            // Method 1: Direct "user" field as string (most common)
            if (typeof m.user === 'string' && m.user.includes('calendly.com/users/')) {
              userUri = m.user;
            }
            // Method 2: Nested user object with uri
            else if (m.user && typeof m.user === 'object' && m.user.uri) {
              userUri = m.user.uri;
            }
            // Method 3: user_uri field
            else if (m.user_uri && typeof m.user_uri === 'string') {
              userUri = m.user_uri;
            }
            
            if (!userUri) {
              console.log(`  WARNING: Could not extract user URI from membership:`, JSON.stringify(m).substring(0, 300));
              continue;
            }
            
            // Try to match with team members for name/email
            const matchingMember = teamMembers.find(tm => tm.uri === userUri);
            
            // Extract name from various sources
            const name = matchingMember?.name || 
                         m.user_name || 
                         (m.user && typeof m.user === 'object' ? m.user.name : null) || 
                         'Unknown';
            
            // Extract email from various sources  
            const email = matchingMember?.email || 
                          m.user_email || 
                          (m.user && typeof m.user === 'object' ? m.user.email : null) || 
                          '';
            
            fetchedHosts.push({
              uri: userUri,
              name: name,
              email: email,
            });
            
            console.log(`  -> Host: ${name} (URI: ${userUri.substring(userUri.lastIndexOf('/') + 1)})`);
          }
          
          // FALLBACK: If memberships API returned empty but this looks like a team event,
          // use ALL team members as hosts for Round Robin calculation
          if (fetchedHosts.length === 0 && teamMembers.length > 1) {
            console.log(`"${etName}": Memberships API returned empty - FALLBACK: using all ${teamMembers.length} team members as hosts`);
            for (const tm of teamMembers) {
              fetchedHosts.push({
                uri: tm.uri,
                name: tm.name,
                email: tm.email || '',
              });
            }
            console.log(`  -> ROUND ROBIN (fallback: ${fetchedHosts.length} team members)`);
          }
          
          hostsCache.set(etUri, fetchedHosts);
          eventTypeHosts.set(etUri, fetchedHosts);
          console.log(`"${etName}": TOTAL ${fetchedHosts.length} hosts from memberships API`);
          console.log(`  -> ${fetchedHosts.length >= 2 ? 'ROUND ROBIN' : 'SOLO'} (based on host count)`);
          return fetchedHosts;
        } else if (membershipsResponse?.status === 429) {
          console.log(`"${etName}": Rate limited fetching memberships`);
          // FALLBACK: Use all team members when rate limited
          if (teamMembers.length > 1) {
            console.log(`  -> FALLBACK: using all ${teamMembers.length} team members as hosts`);
            const fallbackHosts = teamMembers.map(tm => ({ uri: tm.uri, name: tm.name, email: tm.email || '' }));
            hostsCache.set(etUri, fallbackHosts);
            eventTypeHosts.set(etUri, fallbackHosts);
            return fallbackHosts;
          }
          hostsCache.set(etUri, []);
          return [];
        } else if (membershipsResponse?.status === 404) {
          // 404 means no memberships found - but fallback to team members for team events
          console.log(`"${etName}": Memberships endpoint returned 404`);
          if (teamMembers.length > 1) {
            console.log(`  -> FALLBACK: using all ${teamMembers.length} team members as hosts`);
            const fallbackHosts = teamMembers.map(tm => ({ uri: tm.uri, name: tm.name, email: tm.email || '' }));
            hostsCache.set(etUri, fallbackHosts);
            eventTypeHosts.set(etUri, fallbackHosts);
            return fallbackHosts;
          }
          hostsCache.set(etUri, []);
          return [];
        } else {
          console.log(`"${etName}": Could not fetch memberships: ${membershipsResponse?.status}`);
          // FALLBACK: Use all team members when API fails
          if (teamMembers.length > 1) {
            console.log(`  -> FALLBACK: using all ${teamMembers.length} team members as hosts`);
            const fallbackHosts = teamMembers.map(tm => ({ uri: tm.uri, name: tm.name, email: tm.email || '' }));
            hostsCache.set(etUri, fallbackHosts);
            eventTypeHosts.set(etUri, fallbackHosts);
            return fallbackHosts;
          }
          hostsCache.set(etUri, []);
          return [];
        }
      } catch (e) {
        console.log(`"${etName}": Error fetching memberships:`, e);
        // FALLBACK: Use all team members on error
        if (teamMembers.length > 1) {
          console.log(`  -> FALLBACK: using all ${teamMembers.length} team members as hosts`);
          const fallbackHosts = teamMembers.map(tm => ({ uri: tm.uri, name: tm.name, email: tm.email || '' }));
          hostsCache.set(etUri, fallbackHosts);
          eventTypeHosts.set(etUri, fallbackHosts);
          return fallbackHosts;
        }
        hostsCache.set(etUri, []);
        return [];
      }
    };

    console.log(`TOTAL_EVENT_TYPES_FOUND: ${allEventTypes.length}`);
    console.log(`API calls used so far: ${apiCallCount}/${MAX_API_CALLS}`);
    
    // Fetch hosts for ACTIVE event types only (inactive can't be booked)
    // PRIORITY: Selected event types first (from eventTypeUris), then others
    const activeEventTypes = allEventTypes.filter(et => et.active);
    
    // Separate selected events from others - prioritize selected for host fetching
    const selectedUris = eventTypeUris && eventTypeUris.length > 0 ? new Set(eventTypeUris) : null;
    const selectedEvents = selectedUris 
      ? activeEventTypes.filter(et => selectedUris.has(et.uri))
      : [];
    const otherEvents = selectedUris 
      ? activeEventTypes.filter(et => !selectedUris.has(et.uri))
      : activeEventTypes;
    
    // Sort other events: prioritize those without explicit pooling_type (need detection)
    const sortedOtherEvents = [...otherEvents].sort((a, b) => {
      const aNeeds = !a.pooling_type ? 0 : 1;
      const bNeeds = !b.pooling_type ? 0 : 1;
      return aNeeds - bNeeds;
    });
    
    // Combine: selected events first, then others
    const sortedForHostFetch = [...selectedEvents, ...sortedOtherEvents];
    
    // Limit to avoid rate limits - but allow more for selected events
    const maxHostFetches = Math.min(sortedForHostFetch.length, 40);
    console.log(`Fetching memberships for ${maxHostFetches} of ${activeEventTypes.length} active event types`);
    console.log(`  Priority: ${selectedEvents.length} selected events first`);
    
    for (let i = 0; i < maxHostFetches; i++) {
      const et = sortedForHostFetch[i];
      await fetchEventTypeHosts(et.uri, et.name);
      
      // Check if we're running low on API calls - but allow more headroom for busy times
      if (apiCallCount >= MAX_API_CALLS - 50) {
        console.log(`Stopping membership fetch early - saving API calls for busy times (${apiCallCount}/${MAX_API_CALLS})`);
        break;
      }
    }
    
    if (sortedForHostFetch.length > maxHostFetches) {
      console.log(`Skipped membership fetch for ${sortedForHostFetch.length - maxHostFetches} event types to stay within rate limits`);
    }
    
    console.log('=== END HOST FETCH ===');
    console.log(`API calls used after membership fetch: ${apiCallCount}/${MAX_API_CALLS}`);
    
    // ========== DEFINITIVE ROUND ROBIN DETECTION ==========
    // The ONLY reliable way to detect round robin is by HOST COUNT from memberships API
    // If 2+ hosts are assigned to an event type, it's a round robin (or collective)
    // pooling_type field is often null/missing, so we CANNOT rely on it alone
    
    // Detection function 1: Explicit pooling_type field (when available)
    const isRoundRobinByPoolingType = (et: EventType) => 
      et.pooling_type === 'round_robin' || et.pooling_type === 'multi_pool';
    
    const isCollectiveByPoolingType = (et: EventType) => 
      et.pooling_type === 'collective';
    
    // Detection function 2: HOST COUNT from memberships API (PRIMARY DETECTION METHOD)
    // This is the AUTHORITATIVE way to detect team events
    const isRoundRobinByHostCount = (et: EventType) => {
      const hosts = eventTypeHosts.get(et.uri) || [];
      // 2+ hosts = Round Robin, regardless of what pooling_type says
      return hosts.length >= 2;
    };
    
    // Detection function 3: kind field (secondary)
    const isRoundRobinByKind = (et: EventType) => {
      return et.kind === 'group' || et.kind === 'round_robin';
    };
    
    // Detection function 4: scheduling_url pattern (secondary)
    const isRoundRobinByUrl = (et: EventType) => {
      return et.scheduling_url?.includes('/team/') === true;
    };
    
    // Detection function 5: profile.type === 'Team' (secondary)
    const isTeamEventByProfile = (et: EventType) => {
      return et.profile?.type === 'Team';
    };
    
    // Combined check: Use host count FIRST (most reliable), then fallbacks
    // NOTE: isRoundRobinByHostCount takes PRIORITY because pooling_type is unreliable
    const isRoundRobinEvent = (et: EventType): boolean => 
      isRoundRobinByHostCount(et) ||      // PRIMARY: 2+ hosts assigned
      isRoundRobinByPoolingType(et) ||    // SECONDARY: explicit pooling_type
      isRoundRobinByKind(et) ||           // FALLBACK: kind field
      isRoundRobinByUrl(et) ||            // FALLBACK: URL pattern
      isTeamEventByProfile(et);           // FALLBACK: profile type
    
    // Collective events are ONLY those with explicit pooling_type='collective'
    const isCollectiveEvent = (et: EventType): boolean => 
      isCollectiveByPoolingType(et);
    
    // Get the specific detection reason for logging
    const getDetectionReason = (et: EventType): string => {
      if (isRoundRobinByHostCount(et)) {
        const hosts = eventTypeHosts.get(et.uri) || [];
        return `host_count=${hosts.length} (from memberships API)`;
      }
      if (isRoundRobinByPoolingType(et)) return `pooling_type=${et.pooling_type}`;
      if (isCollectiveByPoolingType(et)) return `pooling_type=collective`;
      if (isRoundRobinByKind(et)) return `kind=${et.kind}`;
      if (isRoundRobinByUrl(et)) return `scheduling_url=/team/`;
      if (isTeamEventByProfile(et)) return `profile.type=Team`;
      return 'solo (1 host or no hosts detected)';
    };
    
    const isSoloEvent = (et: EventType) => 
      !isRoundRobinEvent(et) && !isCollectiveEvent(et);
    
    // Log active vs inactive counts and kinds
    const activeCount = allEventTypes.filter(et => et.active).length;
    const inactiveCount = allEventTypes.filter(et => !et.active).length;
    const roundRobinByTypeCount = allEventTypes.filter(et => isRoundRobinByPoolingType(et)).length;
    const roundRobinByKindCount = allEventTypes.filter(et => isRoundRobinByKind(et)).length;
    const roundRobinByUrlCount = allEventTypes.filter(et => isRoundRobinByUrl(et)).length;
    const roundRobinByHostCountVal = allEventTypes.filter(et => isRoundRobinByHostCount(et) && !isRoundRobinByPoolingType(et) && !isRoundRobinByKind(et) && !isRoundRobinByUrl(et)).length;
    const roundRobinByProfileCount = allEventTypes.filter(et => isTeamEventByProfile(et) && !isRoundRobinByPoolingType(et) && !isRoundRobinByKind(et) && !isRoundRobinByUrl(et) && !isRoundRobinByHostCount(et)).length;
    const collectiveCount = allEventTypes.filter(et => isCollectiveEvent(et)).length;
    const soloCount = allEventTypes.filter(et => isSoloEvent(et)).length;
    console.log(`Active: ${activeCount}, Inactive: ${inactiveCount}`);
    console.log(`Detection breakdown:`);
    console.log(`  Round Robin (by pooling_type): ${roundRobinByTypeCount}`);
    console.log(`  Round Robin (by kind=group/round_robin): ${roundRobinByKindCount}`);
    console.log(`  Round Robin (by scheduling_url=/team/): ${roundRobinByUrlCount}`);
    console.log(`  Round Robin (by host_count>=2): ${roundRobinByHostCountVal}`);
    console.log(`  Round Robin (by profile.type=Team): ${roundRobinByProfileCount}`);
    console.log(`  Collective: ${collectiveCount}`);
    console.log(`  Solo: ${soloCount}`);
    console.log(`Total team members in org: ${teamMembers.length}`);
    
    // Log detailed classification for each event type with all raw API fields
    console.log('=== EVENT TYPE CLASSIFICATION DETAILS ===');
    for (const et of allEventTypes) {
      const hosts = eventTypeHosts.get(et.uri) || [];
      const isRR = isRoundRobinEvent(et);
      const isColl = isCollectiveEvent(et);
      const classification = isColl ? 'COLLECTIVE' : isRR ? 'ROUND_ROBIN' : 'SOLO';
      const reason = getDetectionReason(et);
      console.log(`"${et.name}": ${classification}`);
      console.log(`  -> reason=${reason}`);
      console.log(`  -> raw_fields: pooling_type=${et.pooling_type || 'null'}, kind=${et.kind || 'null'}, profile.type=${et.profile?.type || 'null'}`);
      console.log(`  -> scheduling_url=${et.scheduling_url || 'null'}`);
      console.log(`  -> hosts_from_memberships=${hosts.length} (${hosts.map(h => h.name).join(', ') || 'none'})`);
    }
    console.log('=== END CLASSIFICATION ===');

    // If only listing event types, return ACTIVE ones only (inactive can't be booked)
    if (listEventTypesOnly) {
      const activeEventTypes = allEventTypes.filter(et => et.active);
      console.log(`Returning ${activeEventTypes.length} active event types for dropdown`);
      console.log(`Total API calls made: ${apiCallCount}`);
      return new Response(
        JSON.stringify({
          success: true,
          eventTypes: activeEventTypes.map(et => ({
            uri: et.uri,
            name: et.name,
            slug: et.slug,
            duration: et.duration,
            pooling_type: et.pooling_type || null,
            kind: isRoundRobinEvent(et) ? 'round_robin' : isCollectiveEvent(et) ? 'collective' : 'solo',
            isTeamEvent: isRoundRobinEvent(et) || isCollectiveEvent(et),
          })),
          teamMembers: teamMembers.map(m => ({
            uri: m.uri,
            name: m.name,
          })),
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter to selected event types
    const selectedEventTypeUris = eventTypeUris && eventTypeUris.length > 0 ? eventTypeUris : [];
    const eventTypes = selectedEventTypeUris.length > 0
      ? allEventTypes.filter(et => selectedEventTypeUris.includes(et.uri))
      : allEventTypes;

    console.log(`Processing ${eventTypes.length} event types`);

    // Get ALL scheduled events for the date range
    let allScheduledEvents: ScheduledEvent[] = [];
    let nextPageToken: string | null = null;
    
    do {
      const scheduledEventsUrl = new URL('https://api.calendly.com/scheduled_events');
      scheduledEventsUrl.searchParams.append('organization', organizationUri);
      scheduledEventsUrl.searchParams.append('min_start_time', start.toISOString());
      scheduledEventsUrl.searchParams.append('max_start_time', end.toISOString());
      scheduledEventsUrl.searchParams.append('count', '100');
      if (nextPageToken) {
        scheduledEventsUrl.searchParams.append('page_token', nextPageToken);
      }

      const scheduledEventsResponse = await rateLimitedFetch(scheduledEventsUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!scheduledEventsResponse?.ok) {
        if (scheduledEventsResponse?.status === 429) {
          console.log('Rate limited while fetching scheduled events');
          break;
        }
        console.error('Failed to fetch scheduled events:', scheduledEventsResponse?.status);
        break;
      }

      const scheduledEventsData = await scheduledEventsResponse.json();
      const events = (scheduledEventsData.collection || [])
        .filter((e: any) => e.status === 'active')
        .map((e: any) => ({
          uri: e.uri,
          name: e.name,
          start_time: e.start_time,
          end_time: e.end_time,
          status: e.status,
          event_type: e.event_type,
        }));
      
      allScheduledEvents = [...allScheduledEvents, ...events];
      nextPageToken = scheduledEventsData.pagination?.next_page_token || null;
    } while (nextPageToken);

    console.log(`Found ${allScheduledEvents.length} total scheduled events`);
    console.log(`API calls used: ${apiCallCount}/${MAX_API_CALLS}`);

    // Calculate utilization per event type
    const utilizationByEventType: Array<{
      name: string;
      kind: string;
      totalSlots: number;
      bookedSlots: number;
      availableSlots: number;
      uniqueTimesAvailable: number; // Number of distinct time slots with at least 1 closer free
      totalSlotsAvailable: number; // Sum of all closer availability (2 closers free at 2pm = 2)
      utilizationPercent: number;
      isTeamEvent: boolean;
      uri: string;
      slotDetails: Array<{ start_time: string; invitees_remaining: number }>;
      fetchFailed?: boolean; // Flag for UI to show warning if data couldn't be fetched
      hostCount?: number; // Number of hosts assigned to this event type
    }> = [];

    let totalAvailableSlots = 0;
    let totalBookedSlots = 0;
    let overallUniqueTimesAvailable = 0;
    let overallTotalSlotsAvailable = 0;

    for (const eventType of eventTypes) {
      // Count booked events for this event type
      // Match by event_type URI or by event name (as fallback)
      const bookedForType = allScheduledEvents.filter(event => 
        event.event_type === eventType.uri || event.name === eventType.name
      ).length;

      let availableSlotCount = 0;
      let slotDetails: Array<{ start_time: string; invitees_remaining: number }> = [];

      // Only process if we have future dates AND the event type is active
      console.log(`\n=== Processing event type "${eventType.name}" ===`);
      console.log(`  active=${eventType.active}, hasFutureDates=${hasFutureDates}`);
      
      if (hasFutureDates && eventType.active) {
        const futureStart = new Date(Math.max(Date.now() + 60000, availabilityStart.getTime()));
        const slotDuration = eventType.duration || 60; // minutes
        
        // STEP 1: ALWAYS fetch hosts first (if not already cached)
        // This is critical because host count determines if it's round robin
        let eventTypeHostsList = eventTypeHosts.get(eventType.uri) || [];
        
        if (eventTypeHostsList.length === 0) {
          console.log(`  Fetching memberships for "${eventType.name}" to determine event type...`);
          eventTypeHostsList = await fetchEventTypeHosts(eventType.uri, eventType.name);
        } else {
          console.log(`  Using cached hosts: ${eventTypeHostsList.length} hosts (${eventTypeHostsList.map(h => h.name).join(', ')})`);
        }
        
        // STEP 2: NOW determine event type based on host count (primary) and other indicators
        // Note: isRoundRobinEvent() will now correctly use the host count we just fetched
        const isRoundRobin = isRoundRobinEvent(eventType);
        const isCollective = isCollectiveEvent(eventType);
        const detectionReason = getDetectionReason(eventType);
        
        console.log(`  Detection: ${isCollective ? 'COLLECTIVE' : isRoundRobin ? 'ROUND ROBIN' : 'SOLO'} (${detectionReason})`);
        
        // Determine which hosts to use for availability calculation
        // For team events: ONLY use the hosts assigned to this event type
        // Do NOT fall back to all team members - that's incorrect
        // For solo events: we'll use the API which handles it automatically
        const hostsToUse = eventTypeHostsList;
        
        // Log if we couldn't find hosts for a team event
        if ((isRoundRobin || isCollective) && hostsToUse.length === 0) {
          console.log(`  WARNING: No hosts found for team event "${eventType.name}" - treating as solo for slot calculation`);
        }
        if (isCollective && hostsToUse.length > 0) {
          // COLLECTIVE: All hosts must be available for the slot
          console.log(`\n=== CALCULATING SLOTS FOR COLLECTIVE "${eventType.name}" ===`);
          console.log(`Event type has ${eventTypeHostsList.length} assigned hosts: ${eventTypeHostsList.map(h => h.name).join(', ')}`);
          
          const availableTimesUrl = new URL('https://api.calendly.com/event_type_available_times');
          availableTimesUrl.searchParams.append('event_type', eventType.uri);
          availableTimesUrl.searchParams.append('start_time', futureStart.toISOString());
          availableTimesUrl.searchParams.append('end_time', availabilityEnd.toISOString());
          
          console.log(`Trying event_type_available_times for Collective "${eventType.name}"`);
          
          try {
            const availableTimesResponse = await rateLimitedFetch(availableTimesUrl.toString(), {
              headers: {
                'Authorization': `Bearer ${CALENDLY_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            
            if (availableTimesResponse?.ok) {
              const availableTimesData = await availableTimesResponse.json();
              const availableTimes: AvailableTime[] = availableTimesData.collection || [];
              
              // For collective, unique times = total slots (1 slot per time, requires all hosts)
              const uniqueTimesAvailable = availableTimes.length;
              const totalSlotsAvailable = availableTimes.length;
              
              slotDetails = availableTimes.map(slot => ({
                start_time: slot.start_time,
                invitees_remaining: 1, // Only 1 booking possible per slot
              }));
              
              availableSlotCount = availableTimes.length;
              console.log(`Collective "${eventType.name}": ${uniqueTimesAvailable} slots where ALL hosts are free`);
              console.log(`  Booked: ${bookedForType}`);
              
              (eventType as any)._uniqueTimesAvailable = uniqueTimesAvailable;
              (eventType as any)._totalSlotsAvailable = totalSlotsAvailable;
            } else {
              // Fallback: manually calculate slots where ALL hosts are free
              console.log(`API failed for collective ${eventType.name}: ${availableTimesResponse?.status}`);
              console.log(`Falling back to manual calculation...`);
              
              // Get all potential slots from all hosts, then find intersections
              const hostSlotMaps: Map<string, Set<string>> = new Map();
              
              for (const member of hostsToUse) {
                // LAZY FETCH: Get schedule and busy times on-demand
                const schedules = await ensureScheduleFetched(member);
                const busyTimes = await ensureBusyTimesFetched(member);
                const memberOpenSlots = new Set<string>();
                
                if (schedules.length > 0) {
                  const memberSlots = generateSlotsFromSchedule(
                    schedules,
                    futureStart,
                    availabilityEnd,
                    slotDuration
                  );
                  
                  for (const slot of memberSlots) {
                    if (!isSlotBusy(slot, slotDuration, busyTimes)) {
                      memberOpenSlots.add(slot.toISOString());
                    }
                  }
                }
                
                hostSlotMaps.set(member.uri, memberOpenSlots);
                console.log(`  ${member.name}: ${memberOpenSlots.size} open slots`);
              }
              
              // Find slots where ALL hosts are free (intersection)
              const allHostsFree: string[] = [];
              if (hostSlotMaps.size > 0) {
                const firstHostSlots = hostSlotMaps.values().next().value as Set<string>;
                for (const slotTime of firstHostSlots) {
                  let allFree = true;
                  for (const [, hostSlots] of hostSlotMaps) {
                    if (!hostSlots.has(slotTime)) {
                      allFree = false;
                      break;
                    }
                  }
                  if (allFree) {
                    allHostsFree.push(slotTime);
                  }
                }
              }
              
              const uniqueTimesAvailable = allHostsFree.length;
              const totalSlotsAvailable = allHostsFree.length;
              
              slotDetails = allHostsFree
                .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
                .map(time => ({
                  start_time: time,
                  invitees_remaining: 1,
                }));
              
              availableSlotCount = allHostsFree.length;
              console.log(`Collective "${eventType.name}" SUMMARY (fallback):`);
              console.log(`  Slots where ALL ${hostsToUse.length} hosts are free: ${uniqueTimesAvailable}`);
              console.log(`  Booked: ${bookedForType}`);
              
              (eventType as any)._uniqueTimesAvailable = uniqueTimesAvailable;
              (eventType as any)._totalSlotsAvailable = totalSlotsAvailable;
            }
          } catch (e) {
            console.error(`Error fetching availability for collective ${eventType.name}:`, e);
          }
          
        } else if (isRoundRobin && hostsToUse.length > 0) {
          // ROUND ROBIN CALCULATION - CORRECT WAY
          // For each available time slot, count how many hosts are actually free (not busy)
          console.log(`\n=== CALCULATING SLOTS FOR ROUND ROBIN "${eventType.name}" ===`);
          console.log(`Hosts assigned: ${hostsToUse.map(h => h.name).join(', ')} (${hostsToUse.length} total)`);
          
          // Step 1: Get unique available times from Calendly API
          const availableTimesUrl = new URL('https://api.calendly.com/event_type_available_times');
          availableTimesUrl.searchParams.append('event_type', eventType.uri);
          availableTimesUrl.searchParams.append('start_time', futureStart.toISOString());
          availableTimesUrl.searchParams.append('end_time', availabilityEnd.toISOString());
          
          const availableTimesResponse = await rateLimitedFetch(availableTimesUrl.toString(), {
            headers: {
              'Authorization': `Bearer ${CALENDLY_API_KEY}`,
              'Content-Type': 'application/json',
            },
          });
          
          if (!availableTimesResponse?.ok) {
            console.log(`Failed to fetch available times: ${availableTimesResponse?.status}`);
            // Set explicit values so we don't fall back to identical defaults
            (eventType as any)._uniqueTimesAvailable = 0;
            (eventType as any)._totalSlotsAvailable = 0;
            (eventType as any)._fetchFailed = true;
          } else {
            const availableTimesData = await availableTimesResponse.json();
            const availableTimes: AvailableTime[] = availableTimesData.collection || [];
            
            // UNIQUE TIMES = distinct time slots from API
            const uniqueTimesAvailable = availableTimes.length;
            console.log(`Unique available times from API: ${uniqueTimesAvailable}`);
            
            // Step 2: Get busy times for EACH host assigned to this event
            const hostBusyTimesMap: Map<string, UserBusyTime[]> = new Map();
            
            for (const host of hostsToUse) {
              // Check if we already have busy times cached from earlier
              const cachedBusyData = memberBusyTimes.get(host.uri);
              if (cachedBusyData) {
                hostBusyTimesMap.set(host.uri, cachedBusyData.busyTimes);
                console.log(`  ${host.name}: Using cached busy times (${cachedBusyData.busyTimes.length} blocks)`);
              } else {
                // Fetch busy times for this host
                try {
                  const busyTimesUrl = new URL('https://api.calendly.com/user_busy_times');
                  busyTimesUrl.searchParams.append('user', host.uri);
                  busyTimesUrl.searchParams.append('start_time', futureStart.toISOString());
                  busyTimesUrl.searchParams.append('end_time', availabilityEnd.toISOString());
                  
                  const busyResponse = await rateLimitedFetch(busyTimesUrl.toString(), {
                    headers: {
                      'Authorization': `Bearer ${CALENDLY_API_KEY}`,
                      'Content-Type': 'application/json',
                    },
                  });
                  
                  if (busyResponse?.ok) {
                    const busyData = await busyResponse.json();
                    const busyTimes: UserBusyTime[] = busyData.collection || [];
                    hostBusyTimesMap.set(host.uri, busyTimes);
                    console.log(`  ${host.name}: Fetched ${busyTimes.length} busy blocks`);
                    // Log the busy periods for debugging
                    for (const bt of busyTimes) {
                      console.log(`    - Busy: ${bt.start_time} to ${bt.end_time} (${bt.type || 'unknown'})`);
                    }
                  } else {
                    console.log(`  ${host.name}: Failed to fetch busy times (${busyResponse?.status})`);
                    hostBusyTimesMap.set(host.uri, []);
                  }
                  
                  // Rate limit protection
                  await new Promise(r => setTimeout(r, 50));
                } catch (e) {
                  console.log(`  ${host.name}: Error fetching busy times: ${e}`);
                  hostBusyTimesMap.set(host.uri, []);
                }
              }
            }
            
            // Step 3: For EACH available time slot, count how many hosts are free
            let totalSlotsAvailable = 0;
            const newSlotDetails: Array<{ start_time: string; invitees_remaining: number }> = [];
            
            console.log(`\nPER-SLOT BREAKDOWN:`);
            
            for (const slot of availableTimes) {
              const slotStart = new Date(slot.start_time);
              const slotEnd = new Date(slotStart.getTime() + slotDuration * 60000);
              
              let hostsAvailableAtThisSlot = 0;
              const availableHostNames: string[] = [];
              const busyHostNames: string[] = [];
              
              for (const host of hostsToUse) {
                const busyTimes = hostBusyTimesMap.get(host.uri) || [];
                
                // Check if this host is busy during this specific slot
                const isBusy = busyTimes.some(bt => {
                  const busyStart = new Date(bt.start_time);
                  const busyEnd = new Date(bt.end_time);
                  // Overlap check: slot overlaps with busy block if slotStart < busyEnd AND slotEnd > busyStart
                  return slotStart < busyEnd && slotEnd > busyStart;
                });
                
                if (!isBusy) {
                  hostsAvailableAtThisSlot++;
                  availableHostNames.push(host.name);
                } else {
                  busyHostNames.push(host.name);
                }
              }
              
              totalSlotsAvailable += hostsAvailableAtThisSlot;
              
              newSlotDetails.push({
                start_time: slot.start_time,
                invitees_remaining: hostsAvailableAtThisSlot,
              });
              
              // Log each slot's breakdown
              console.log(`  ${slot.start_time}: ${hostsAvailableAtThisSlot}/${hostsToUse.length} hosts free`);
              console.log(`    FREE: ${availableHostNames.join(', ') || 'none'}`);
              if (busyHostNames.length > 0) {
                console.log(`    BUSY: ${busyHostNames.join(', ')}`);
              }
            }
            
            slotDetails = newSlotDetails;
            
            // Step 4: Log summary
            console.log(`\nSUMMARY FOR "${eventType.name}":`);
            console.log(`  Total hosts: ${hostsToUse.length}`);
            console.log(`  Unique times: ${uniqueTimesAvailable}`);
            console.log(`  WRONG calculation (naive multiply): ${uniqueTimesAvailable} × ${hostsToUse.length} = ${uniqueTimesAvailable * hostsToUse.length}`);
            console.log(`  RIGHT calculation (sum of per-slot availability): ${totalSlotsAvailable}`);
            console.log(`  Booked: ${bookedForType}`);
            
            // Sanity check
            if (totalSlotsAvailable < uniqueTimesAvailable) {
              console.error(`  WARNING: total (${totalSlotsAvailable}) < unique (${uniqueTimesAvailable}) - this shouldn't happen!`);
              totalSlotsAvailable = uniqueTimesAvailable; // Fix to minimum valid value
            }
            
            availableSlotCount = totalSlotsAvailable;
            (eventType as any)._uniqueTimesAvailable = uniqueTimesAvailable;
            (eventType as any)._totalSlotsAvailable = totalSlotsAvailable;
          }
          
        } else {
          // Solo event: Use the standard event_type_available_times endpoint
          const availableTimesUrl = new URL('https://api.calendly.com/event_type_available_times');
          availableTimesUrl.searchParams.append('event_type', eventType.uri);
          availableTimesUrl.searchParams.append('start_time', futureStart.toISOString());
          availableTimesUrl.searchParams.append('end_time', availabilityEnd.toISOString());

          console.log(`Fetching availability for Solo "${eventType.name}": ${futureStart.toISOString()} to ${availabilityEnd.toISOString()}`);

          try {
            const availableTimesResponse = await rateLimitedFetch(availableTimesUrl.toString(), {
              headers: {
                'Authorization': `Bearer ${CALENDLY_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });

            if (availableTimesResponse?.ok) {
              const availableTimesData = await availableTimesResponse.json();
              const availableTimes: AvailableTime[] = availableTimesData.collection || [];
              
              const uniqueTimesAvailable = availableTimes.length;
              const totalSlotsAvailable = availableTimes.length; // Solo = 1 slot per time
              
              slotDetails = availableTimes.map(slot => ({
                start_time: slot.start_time,
                invitees_remaining: 1,
              }));
              
              availableSlotCount = availableTimes.length;
              console.log(`Solo "${eventType.name}": ${uniqueTimesAvailable} unique times = ${availableSlotCount} total slots, ${bookedForType} booked`);
              
              (eventType as any)._uniqueTimesAvailable = uniqueTimesAvailable;
              (eventType as any)._totalSlotsAvailable = totalSlotsAvailable;
            } else if (availableTimesResponse?.status === 429) {
              console.log(`Rate limited fetching availability for ${eventType.name}`);
            } else if (availableTimesResponse) {
              const errorText = await availableTimesResponse.text();
              console.log(`Could not fetch availability for ${eventType.name}: ${availableTimesResponse.status} - ${errorText}`);
            }
          } catch (e) {
            console.error(`Error fetching availability for ${eventType.name}:`, e);
          }
        }
      } else if (!eventType.active) {
        console.log(`Skipping availability for inactive event type: ${eventType.name}`);
      } else {
        console.log(`Skipping availability (no future dates) for: ${eventType.name}`);
      }

      // Total slots = available + booked
      const totalSlotsForType = availableSlotCount + bookedForType;
      const utilizationPercent = totalSlotsForType > 0 
        ? Math.round((bookedForType / totalSlotsForType) * 100) 
        : 0;

      // Use the same detection logic used earlier (isRoundRobinEvent, isCollectiveEvent)
      // to ensure consistent classification
      const isRoundRobin = isRoundRobinEvent(eventType);
      const isCollective = isCollectiveEvent(eventType);
      const isTeamEvent = isRoundRobin || isCollective;
      
      // Use nullish coalescing (??) instead of || to handle 0 values correctly
      let uniqueTimesAvailable = (eventType as any)._uniqueTimesAvailable ?? 0;
      let totalSlotsAvailable = (eventType as any)._totalSlotsAvailable ?? 0;
      const fetchFailed = (eventType as any)._fetchFailed === true;

      // For Round Robin with hosts, if API failed, estimate based on host count
      const hosts = eventTypeHosts.get(eventType.uri) || [];
      if (isRoundRobin && hosts.length > 0 && uniqueTimesAvailable === 0 && totalSlotsAvailable === 0 && !fetchFailed) {
        // We have hosts but no calculated data yet - use slotDetails length as unique times
        uniqueTimesAvailable = slotDetails.length;
        // Estimate total: each unique time could have up to hosts.length availability
        totalSlotsAvailable = slotDetails.length * hosts.length;
        console.log(`ESTIMATE for "${eventType.name}": ${uniqueTimesAvailable} unique × ${hosts.length} hosts = ${totalSlotsAvailable} total (estimated)`);
      }

      // VALIDATION: Total must ALWAYS be >= Unique (it's impossible to have fewer total slots than unique times)
      if (totalSlotsAvailable < uniqueTimesAvailable && totalSlotsAvailable > 0) {
        console.error(`VALIDATION FIX: "${eventType.name}" had total (${totalSlotsAvailable}) < unique (${uniqueTimesAvailable}), correcting to ${uniqueTimesAvailable}`);
        totalSlotsAvailable = uniqueTimesAvailable;
      }
      
      // Display proper kind label
      const kindLabel = isCollective ? 'Collective' : isRoundRobin ? 'Round Robin' : 'Solo';

      utilizationByEventType.push({
        name: eventType.name,
        kind: kindLabel,
        totalSlots: totalSlotsForType,
        bookedSlots: bookedForType,
        availableSlots: availableSlotCount,
        uniqueTimesAvailable,
        totalSlotsAvailable,
        utilizationPercent,
        isTeamEvent,
        uri: eventType.uri,
        slotDetails,
        fetchFailed, // Flag for UI to show warning if data couldn't be fetched
        hostCount: hosts.length, // Include host count for UI display
      });

      totalAvailableSlots += totalSlotsForType;
      totalBookedSlots += bookedForType;
      overallUniqueTimesAvailable += uniqueTimesAvailable;
      overallTotalSlotsAvailable += totalSlotsAvailable;
    }

    // Sort by booked slots (highest first)
    utilizationByEventType.sort((a, b) => b.bookedSlots - a.bookedSlots);

    const overallUtilization = totalAvailableSlots > 0 
      ? Math.round((totalBookedSlots / totalAvailableSlots) * 100) 
      : 0;

    console.log(`Overall: ${totalBookedSlots} booked / ${totalAvailableSlots} total (${overallUtilization}%)`);
    console.log(`Unique times available: ${overallUniqueTimesAvailable}, Total slots available: ${overallTotalSlotsAvailable}`);
    console.log(`Total API calls made: ${apiCallCount}/${MAX_API_CALLS}`);

    return new Response(
      JSON.stringify({
        success: true,
        dateRange: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        availabilityRange: hasFutureDates ? {
          start: availabilityStart.toISOString(),
          end: availabilityEnd.toISOString(),
        } : null,
        overall: {
          totalSlots: totalAvailableSlots,
          bookedSlots: totalBookedSlots,
          uniqueTimesAvailable: overallUniqueTimesAvailable, // Distinct time slots with at least 1 closer
          totalSlotsAvailable: overallTotalSlotsAvailable, // Sum of all closer availability
          utilizationPercent: overallUtilization,
        },
        byEventType: utilizationByEventType,
        teamMembers: teamMembers.map(m => ({ name: m.name })),
        apiCallsUsed: apiCallCount,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in get-calendly-utilization:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
