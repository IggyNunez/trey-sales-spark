import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

interface HostData {
  id: number;
  name: string;
  email: string;
  availableSlots: number;
  bookedSlots: number;
  utilizationPercent: number;
  bookings: Array<{
    id: string;
    title: string;
    start: string;
    attendeeName: string;
    attendeeEmail: string;
  }>;
  byDay: Record<string, { available: number; booked: number }>;
  byEventType: Record<string, { name: string; booked: number }>;
}

interface WeeklyCapacityResponse {
  success: boolean;
  weekStart: string;
  weekEnd: string;
  overall: {
    availableSlots: number;
    bookedSlots: number;
    utilizationPercent: number;
  };
  byHost: HostData[];
  byDay: Record<string, {
    date: string;
    dayName: string;
    availableSlots: number;
    bookedSlots: number;
  }>;
  byEventType: Array<{
    id: number;
    name: string;
    duration: number;
    availableSlots: number;
    bookedSlots: number;
  }>;
}

const CALCOM_API_BASE = "https://api.cal.com";
// Cal.com docs commonly show 2024-06-14; some installations accept later versions.
const CALCOM_API_VERSIONS = ["2024-08-13", "2024-06-14"];

type CalcomApiError = {
  url: string;
  status: number;
  statusText: string;
  body: string;
  apiVersion?: string;
};

// Helper to extract host info from nested Cal.com API v2 structures
function extractHostInfo(host: any): { id: number; name: string; email: string } | null {
  // Try nested user object first (Cal.com v2 standard)
  if (host?.user?.email) {
    return {
      id: host.user.id || host.userId || 0,
      name: host.user.name || host.user.email.split('@')[0],
      email: host.user.email,
    };
  }
  
  // Fallback to direct properties
  if (host?.email) {
    return {
      id: host.id || host.userId || 0,
      name: host.name || host.email.split('@')[0],
      email: host.email,
    };
  }
  
  return null;
}

function buildCalcomHeaders(apiKey: string, apiVersion?: string) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (apiVersion) headers["cal-api-version"] = apiVersion;
  return headers;
}

async function readBodySafe(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function fetchEventTypesWithFallback(apiKey: string): Promise<
  | { ok: true; eventTypes: any[]; source: "event-types" | "teams" }
  | { ok: false; error: CalcomApiError }
> {
  let lastError: CalcomApiError | null = null;

  // Attempt #1: /v2/event-types (with a couple known api-version headers)
  for (const apiVersion of CALCOM_API_VERSIONS) {
    const url = `${CALCOM_API_BASE}/v2/event-types`;
    const res = await fetch(url, {
      headers: buildCalcomHeaders(apiKey, apiVersion),
    });

    if (res.ok) {
      const json = await res.json();
      const eventTypes = json?.data ?? [];
      return { ok: true, eventTypes, source: "event-types" };
    }

    const body = await readBodySafe(res);
    lastError = { url, status: res.status, statusText: res.statusText, body, apiVersion };

    // If it isn't a 404, don't keep trying other strategies.
    if (res.status !== 404) {
      console.error("Cal.com event-types API error:", lastError);
      return { ok: false, error: lastError };
    }
  }

  // Attempt #2: teams-based API (common for org/team setups)
  //  - GET /v2/teams
  //  - GET /v2/teams/{teamId}/event-types
  for (const apiVersion of CALCOM_API_VERSIONS) {
    const teamsUrl = `${CALCOM_API_BASE}/v2/teams`;
    const teamsRes = await fetch(teamsUrl, {
      headers: buildCalcomHeaders(apiKey, apiVersion),
    });

    if (!teamsRes.ok) {
      const body = await readBodySafe(teamsRes);
      lastError = {
        url: teamsUrl,
        status: teamsRes.status,
        statusText: teamsRes.statusText,
        body,
        apiVersion,
      };
      // Keep trying other api versions.
      continue;
    }

    const teamsJson = await teamsRes.json();
    const teams: Array<{ id: number }> = teamsJson?.data ?? [];
    const allEventTypes: any[] = [];

    for (const team of teams) {
      const teamEventTypesUrl = `${CALCOM_API_BASE}/v2/teams/${team.id}/event-types`;
      const etRes = await fetch(teamEventTypesUrl, {
        headers: buildCalcomHeaders(apiKey, apiVersion),
      });

      if (!etRes.ok) {
        const body = await readBodySafe(etRes);
        console.error("Cal.com team event-types API error:", {
          url: teamEventTypesUrl,
          status: etRes.status,
          statusText: etRes.statusText,
          body,
          apiVersion,
        });
        continue;
      }

      const etJson = await etRes.json();
      const teamEventTypes = etJson?.data ?? [];
      allEventTypes.push(...teamEventTypes);
    }

    // Deduplicate by id
    const byId = new Map<number, any>();
    for (const et of allEventTypes) {
      if (typeof et?.id === "number") byId.set(et.id, et);
    }
    const deduped = Array.from(byId.values());

    if (deduped.length > 0) {
      return { ok: true, eventTypes: deduped, source: "teams" };
    }
  }

  if (lastError) {
    console.error("Cal.com event types fetch failed:", lastError);
    return { ok: false, error: lastError };
  }

  return {
    ok: false,
    error: {
      url: `${CALCOM_API_BASE}/v2/event-types`,
      status: 500,
      statusText: "Unknown",
      body: "Unable to fetch event types (no response)",
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { organizationId, startDate, endDate, eventTypeIds, action, weekStart } = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Cal.com API key
    const decryptResponse = await fetch(`${supabaseUrl}/functions/v1/manage-api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'decrypt',
        organizationId,
        keyType: 'calcom',
      }),
    });

    if (!decryptResponse.ok) {
      return new Response(JSON.stringify({ error: 'Cal.com API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { apiKey } = await decryptResponse.json();

    // Handle test-connection action (used by Settings)
    if (action === 'test-connection') {
      const eventTypesResult = await fetchEventTypesWithFallback(apiKey);
      if (!eventTypesResult.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `Cal.com API error: ${eventTypesResult.error.status}`,
          errorDetails: eventTypesResult.error.body,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        success: true,
        eventTypes: eventTypesResult.eventTypes,
        source: eventTypesResult.source,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle get-event-types action
    if (action === 'get-event-types') {
      const eventTypesResult = await fetchEventTypesWithFallback(apiKey);
      if (!eventTypesResult.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `Cal.com API error: ${eventTypesResult.error.status}`,
          errorDetails: eventTypesResult.error.body,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify(eventTypesResult.eventTypes || []), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle weekly-capacity action - new hierarchical data structure
    if (action === 'weekly-capacity') {
      // Calculate week boundaries
      const weekStartDate = weekStart ? new Date(weekStart) : new Date();
      // Ensure we start from Sunday of the week
      const dayOfWeek = weekStartDate.getDay();
      weekStartDate.setDate(weekStartDate.getDate() - dayOfWeek);
      weekStartDate.setHours(0, 0, 0, 0);
      
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 6);
      weekEndDate.setHours(23, 59, 59, 999);

      const effectiveStart = weekStartDate.toISOString().split('T')[0];
      const effectiveEnd = weekEndDate.toISOString().split('T')[0];

      console.log(`Fetching Cal.com weekly capacity from ${effectiveStart} to ${effectiveEnd}`);

      // Step 1: Fetch event types with hosts (fallbacks to team endpoint if needed)
      const eventTypesResult = await fetchEventTypesWithFallback(apiKey);
      if (!eventTypesResult.ok) {
        return new Response(JSON.stringify({
          success: false,
          error: `Cal.com API error: ${eventTypesResult.error.status}`,
          errorDetails: eventTypesResult.error.body,
          weekStart: effectiveStart,
          weekEnd: effectiveEnd,
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const eventTypes = eventTypesResult.eventTypes || [];
      console.log(`Found ${eventTypes.length} event types`);

      // Step 2: Fetch slots for each event type
      const slotsMap: Record<string, string[]> = {}; // eventTypeId -> array of slot times
      const hostEventTypes: Record<string, Set<number>> = {}; // hostEmail -> set of event type IDs
      
      for (const eventType of eventTypes) {
        try {
          const slotsUrl = new URL('https://api.cal.com/v2/slots');
          slotsUrl.searchParams.set('start', effectiveStart);
          slotsUrl.searchParams.set('end', effectiveEnd);
          slotsUrl.searchParams.set('eventTypeId', eventType.id.toString());

          const slotsResponse = await fetch(slotsUrl.toString(), {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'cal-api-version': '2024-06-14',
            },
          });

          if (slotsResponse.ok) {
            const slotsData = await slotsResponse.json();
            const slots: string[] = [];
            
            // Cal.com returns slots grouped by date
            if (slotsData.data && typeof slotsData.data === 'object') {
              Object.values(slotsData.data).forEach((daySlots: any) => {
                if (Array.isArray(daySlots)) {
                  daySlots.forEach((slot: any) => {
                    if (slot.start) {
                      slots.push(slot.start);
                    }
                  });
                }
              });
            }
            
            slotsMap[eventType.id] = slots;
            console.log(`Event type ${eventType.id} (${eventType.title}): ${slots.length} slots`);

            // Map hosts to event types using extractHostInfo helper
            const hosts = eventType.hosts || eventType.users || [];
            console.log(`Event type ${eventType.id} has ${hosts.length} hosts:`, 
              hosts.map((h: any) => extractHostInfo(h)?.email || 'unknown'));
            
            hosts.forEach((host: any) => {
              const info = extractHostInfo(host);
              if (info?.email) {
                if (!hostEventTypes[info.email]) {
                  hostEventTypes[info.email] = new Set();
                }
                hostEventTypes[info.email].add(eventType.id);
              }
            });
          }
        } catch (err) {
          console.error(`Error fetching slots for event type ${eventType.id}:`, err);
        }
      }

      // Step 3: Fetch bookings for the week
      const bookingsUrl = new URL('https://api.cal.com/v2/bookings');
      bookingsUrl.searchParams.set('afterStart', weekStartDate.toISOString());
      bookingsUrl.searchParams.set('beforeEnd', weekEndDate.toISOString());
      bookingsUrl.searchParams.set('take', '500');
      bookingsUrl.searchParams.set('status', 'upcoming,past');

      const bookingsResponse = await fetch(bookingsUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': '2024-06-14',
        },
      });

      let bookings: any[] = [];
      if (bookingsResponse.ok) {
        const bookingsData = await bookingsResponse.json();
        // Handle different response structures from Cal.com API
        // Structure: { status: "success", data: { bookings: [...] } }
        if (Array.isArray(bookingsData?.data?.bookings)) {
          bookings = bookingsData.data.bookings;
        } else if (Array.isArray(bookingsData?.data)) {
          bookings = bookingsData.data;
        } else if (Array.isArray(bookingsData?.bookings)) {
          bookings = bookingsData.bookings;
        } else if (Array.isArray(bookingsData)) {
          bookings = bookingsData;
        } else {
          console.log('Bookings response structure:', JSON.stringify(bookingsData).slice(0, 500));
          bookings = [];
        }
        console.log(`Found ${bookings.length} bookings`);
      } else {
        const errorBody = await bookingsResponse.text();
        console.error('Bookings API error:', bookingsResponse.status, errorBody.slice(0, 300));
      }

      // Step 4: Build host data structure
      const hostDataMap: Record<string, HostData> = {};
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      
      // Initialize day structure
      const byDayOverall: Record<string, { date: string; dayName: string; availableSlots: number; bookedSlots: number }> = {};
      for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStartDate);
        dayDate.setDate(weekStartDate.getDate() + i);
        const dateStr = dayDate.toISOString().split('T')[0];
        byDayOverall[dateStr] = {
          date: dateStr,
          dayName: dayNames[dayDate.getDay()],
          availableSlots: 0,
          bookedSlots: 0,
        };
      }

      // Build event type summary
      const byEventTypeMap: Record<number, { id: number; name: string; duration: number; availableSlots: number; bookedSlots: number }> = {};

      // Process each event type
      for (const eventType of eventTypes) {
        const slots = slotsMap[eventType.id] || [];
        const duration = eventType.length || eventType.lengthInMinutes || 30;
        
        // Count bookings for this event type
        const eventTypeBookings = bookings.filter((b: any) => 
          b.eventType?.id === eventType.id || b.eventTypeId === eventType.id
        );

        byEventTypeMap[eventType.id] = {
          id: eventType.id,
          name: eventType.title || eventType.slug || `Event ${eventType.id}`,
          duration,
          availableSlots: slots.length,
          bookedSlots: eventTypeBookings.length,
        };

        // Add to day totals
        slots.forEach((slotTime: string) => {
          const slotDate = slotTime.split('T')[0];
          if (byDayOverall[slotDate]) {
            byDayOverall[slotDate].availableSlots++;
          }
        });

        // Get hosts for this event type using extractHostInfo helper
        const hosts = eventType.hosts || eventType.users || [];
        
        for (const host of hosts) {
          const info = extractHostInfo(host);
          if (!info?.email) continue;
          
          const { id: hostId, name, email } = info;
          
          if (!hostDataMap[email]) {
            hostDataMap[email] = {
              id: hostId,
              name,
              email,
              availableSlots: 0,
              bookedSlots: 0,
              utilizationPercent: 0,
              bookings: [],
              byDay: {},
              byEventType: {},
            };
            
            // Initialize days for this host
            for (let i = 0; i < 7; i++) {
              const dayDate = new Date(weekStartDate);
              dayDate.setDate(weekStartDate.getDate() + i);
              const dateStr = dayDate.toISOString().split('T')[0];
              hostDataMap[email].byDay[dateStr] = { available: 0, booked: 0 };
            }
          }
          
          // Add slots to host (divide by number of hosts if team event)
          const hostShare = Math.ceil(slots.length / Math.max(hosts.length, 1));
          hostDataMap[email].availableSlots += hostShare;
          
          // Add slots to host's daily breakdown
          slots.forEach((slotTime: string) => {
            const slotDate = slotTime.split('T')[0];
            if (hostDataMap[email].byDay[slotDate]) {
              hostDataMap[email].byDay[slotDate].available++;
            }
          });
          
          // Track event type for this host
          if (!hostDataMap[email].byEventType[eventType.id]) {
            hostDataMap[email].byEventType[eventType.id] = {
              name: eventType.title || eventType.slug || `Event ${eventType.id}`,
              booked: 0,
            };
          }
        }
      }

      // Process bookings
      for (const booking of bookings) {
        const bookingStart = booking.start || booking.startTime;
        const bookingDate = bookingStart ? bookingStart.split('T')[0] : null;
        
        // Add to day totals
        if (bookingDate && byDayOverall[bookingDate]) {
          byDayOverall[bookingDate].bookedSlots++;
        }

        // Find the host for this booking - handle nested structures
        let hostEmail = '';
        if (booking.host?.email) {
          hostEmail = booking.host.email;
        } else if (booking.host?.user?.email) {
          hostEmail = booking.host.user.email;
        } else if (booking.organizer?.email) {
          hostEmail = booking.organizer.email;
        } else if (booking.hosts?.[0]) {
          const info = extractHostInfo(booking.hosts[0]);
          hostEmail = info?.email || '';
        }
        
        if (hostDataMap[hostEmail]) {
          hostDataMap[hostEmail].bookedSlots++;
          
          // Add to host's daily breakdown
          if (bookingDate && hostDataMap[hostEmail].byDay[bookingDate]) {
            hostDataMap[hostEmail].byDay[bookingDate].booked++;
          }
          
          // Add booking details
          const attendee = booking.attendees?.[0] || {};
          hostDataMap[hostEmail].bookings.push({
            id: booking.id || booking.uid,
            title: booking.title || booking.eventType?.title || 'Meeting',
            start: bookingStart,
            attendeeName: attendee.name || 'Guest',
            attendeeEmail: attendee.email || '',
          });
          
          // Track by event type
          const eventTypeId = booking.eventType?.id || booking.eventTypeId;
          if (eventTypeId && hostDataMap[hostEmail].byEventType[eventTypeId]) {
            hostDataMap[hostEmail].byEventType[eventTypeId].booked++;
          }
        }
      }

      // Calculate utilization percentages
      let totalAvailable = 0;
      let totalBooked = 0;
      
      const byHost = Object.values(hostDataMap).map(host => {
        host.utilizationPercent = host.availableSlots > 0 
          ? Math.round((host.bookedSlots / host.availableSlots) * 100) 
          : 0;
        totalAvailable += host.availableSlots;
        totalBooked += host.bookedSlots;
        
        // Sort bookings by start time
        host.bookings.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
        
        return host;
      });

      // Sort hosts by name
      byHost.sort((a, b) => a.name.localeCompare(b.name));

      const result: WeeklyCapacityResponse = {
        success: true,
        weekStart: effectiveStart,
        weekEnd: effectiveEnd,
        overall: {
          availableSlots: totalAvailable,
          bookedSlots: totalBooked,
          utilizationPercent: totalAvailable > 0 
            ? Math.round((totalBooked / totalAvailable) * 100) 
            : 0,
        },
        byHost,
        byDay: byDayOverall,
        byEventType: Object.values(byEventTypeMap),
      };

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default action: get utilization data (legacy)
    const now = new Date();
    const weekStartDefault = new Date(now);
    weekStartDefault.setDate(now.getDate() - now.getDay());
    weekStartDefault.setHours(0, 0, 0, 0);
    
    const weekEnd = new Date(weekStartDefault);
    weekEnd.setDate(weekStartDefault.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const effectiveStart = startDate || weekStartDefault.toISOString();
    const effectiveEnd = endDate || weekEnd.toISOString();

    console.log(`Fetching Cal.com utilization from ${effectiveStart} to ${effectiveEnd}`);

    // Fetch event types
    const eventTypesResult = await fetchEventTypesWithFallback(apiKey);
    if (!eventTypesResult.ok) {
      return new Response(JSON.stringify({
        success: false,
        error: `Cal.com API error: ${eventTypesResult.error.status}`,
        errorDetails: eventTypesResult.error.body,
        dateRange: { start: effectiveStart, end: effectiveEnd },
        overall: {
          totalSlots: 0,
          bookedSlots: 0,
          uniqueTimesAvailable: 0,
          totalSlotsAvailable: 0,
          utilizationPercent: 0,
        },
        byEventType: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let eventTypes = eventTypesResult.eventTypes || [];

    // Filter event types if specified
    if (eventTypeIds && eventTypeIds.length > 0) {
      eventTypes = eventTypes.filter((et: any) => eventTypeIds.includes(et.id));
    }

    // Fetch bookings for the date range
    const bookingsUrl = new URL('https://api.cal.com/v2/bookings');
    bookingsUrl.searchParams.set('afterStart', effectiveStart);
    bookingsUrl.searchParams.set('beforeEnd', effectiveEnd);
    bookingsUrl.searchParams.set('take', '100');

    const bookingsResponse = await fetch(bookingsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-06-14',
      },
    });

    if (!bookingsResponse.ok) {
      const errorBody = await bookingsResponse.text();
      console.error('Cal.com bookings API error:', {
        status: bookingsResponse.status,
        statusText: bookingsResponse.statusText,
        body: errorBody,
      });
      return new Response(JSON.stringify({
        success: false,
        error: `Cal.com API error: ${bookingsResponse.status}`,
        errorDetails: errorBody,
        dateRange: { start: effectiveStart, end: effectiveEnd },
        overall: {
          totalSlots: 0,
          bookedSlots: 0,
          uniqueTimesAvailable: 0,
          totalSlotsAvailable: 0,
          utilizationPercent: 0,
        },
        byEventType: [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const bookingsData = await bookingsResponse.json();
    // Handle different response structures from Cal.com API
    // Structure: { status: "success", data: { bookings: [...] } }
    let bookings: any[] = [];
    if (Array.isArray(bookingsData?.data?.bookings)) {
      bookings = bookingsData.data.bookings;
    } else if (Array.isArray(bookingsData?.data)) {
      bookings = bookingsData.data;
    } else if (Array.isArray(bookingsData?.bookings)) {
      bookings = bookingsData.bookings;
    } else if (Array.isArray(bookingsData)) {
      bookings = bookingsData;
    } else {
      console.log('Legacy bookings response structure:', JSON.stringify(bookingsData).slice(0, 500));
      bookings = [];
    }

    // Calculate utilization by event type
    const byEventType: Array<{
      id: string;
      name: string;
      duration: number;
      totalSlots: number;
      bookedSlots: number;
      utilizationPercent: number;
    }> = [];

    let totalSlots = 0;
    let bookedSlots = 0;

    for (const eventType of eventTypes) {
      const etBookings = bookings.filter((b: any) => 
        b.eventType?.id === eventType.id || b.eventTypeId === eventType.id
      );

      const duration = eventType.length || 30;
      const daysInRange = Math.ceil(
        (new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 
        (1000 * 60 * 60 * 24)
      );
      
      const slotsPerDay = Math.floor((8 * 60) / duration);
      const estimatedSlots = slotsPerDay * daysInRange;
      
      totalSlots += estimatedSlots;
      bookedSlots += etBookings.length;

      byEventType.push({
        id: eventType.id.toString(),
        name: eventType.title || eventType.name,
        duration: duration,
        totalSlots: estimatedSlots,
        bookedSlots: etBookings.length,
        utilizationPercent: estimatedSlots > 0 
          ? Math.round((etBookings.length / estimatedSlots) * 100) 
          : 0,
      });
    }

    const result = {
      success: true,
      dateRange: { start: effectiveStart, end: effectiveEnd },
      overall: {
        totalSlots,
        bookedSlots,
        uniqueTimesAvailable: totalSlots,
        totalSlotsAvailable: totalSlots - bookedSlots,
        utilizationPercent: totalSlots > 0 
          ? Math.round((bookedSlots / totalSlots) * 100) 
          : 0,
      },
      byEventType,
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in get-calcom-utilization:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal error',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
