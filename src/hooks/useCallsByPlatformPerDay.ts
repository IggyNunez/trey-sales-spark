import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { format, eachDayOfInterval } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

export interface PlatformDayData {
  date: string;
  dateLabel: string;
  platforms: Record<string, number>;
  total: number;
}

export interface UTMBreakdownItem {
  value: string;
  count: number;
}

export interface PlatformUTMBreakdowns {
  utm_source: UTMBreakdownItem[];
  utm_medium: UTMBreakdownItem[];
  utm_campaign: UTMBreakdownItem[];
  utm_content: UTMBreakdownItem[];
  utm_term: UTMBreakdownItem[];
  utm_channel: UTMBreakdownItem[];
  utm_setter: UTMBreakdownItem[];
}

export interface EventSummary {
  id: string;
  lead_name: string;
  lead_email: string;
  lead_phone?: string | null;
  closer_name?: string | null;
  closer_email?: string | null;
  setter_name?: string | null;
  event_outcome?: string | null;
  booked_at?: string | null;
  scheduled_at: string;
  booking_platform?: string | null;
  booking_metadata: Record<string, unknown>;
  booking_responses: Record<string, unknown>;
}

export interface DayPlatformBreakdown {
  utmBreakdowns: PlatformUTMBreakdowns;
  events: EventSummary[];
}

export interface CallsByPlatformResult {
  days: PlatformDayData[];
  platforms: string[];
  totals: Record<string, number>;
  grandTotal: number;
  platformBreakdowns: Record<string, PlatformUTMBreakdowns>;
  dayPlatformBreakdowns: Record<string, Record<string, DayPlatformBreakdown>>;
}

interface UseCallsByPlatformParams {
  startDate?: Date;
  endDate?: Date;
  dateType?: 'completed' | 'created';
  bookingPlatform?: string;
}

// Helper to sort UTM breakdown items: by count desc, "(none)" last
function sortBreakdownItems(items: UTMBreakdownItem[]): UTMBreakdownItem[] {
  return [...items].sort((a, b) => {
    if (a.value === '(none)') return 1;
    if (b.value === '(none)') return -1;
    return b.count - a.count;
  });
}

function createEmptyUTMAggregates(): Record<UTMKey, Map<string, number>> {
  return {
    utm_source: new Map(),
    utm_medium: new Map(),
    utm_campaign: new Map(),
    utm_content: new Map(),
    utm_term: new Map(),
    utm_channel: new Map(),
    utm_setter: new Map(),
  };
}

function convertAggregatesToBreakdowns(agg: Record<UTMKey, Map<string, number>>): PlatformUTMBreakdowns {
  return {
    utm_source: sortBreakdownItems(Array.from(agg.utm_source.entries()).map(([value, count]) => ({ value, count }))),
    utm_medium: sortBreakdownItems(Array.from(agg.utm_medium.entries()).map(([value, count]) => ({ value, count }))),
    utm_campaign: sortBreakdownItems(Array.from(agg.utm_campaign.entries()).map(([value, count]) => ({ value, count }))),
    utm_content: sortBreakdownItems(Array.from(agg.utm_content.entries()).map(([value, count]) => ({ value, count }))),
    utm_term: sortBreakdownItems(Array.from(agg.utm_term.entries()).map(([value, count]) => ({ value, count }))),
    utm_channel: sortBreakdownItems(Array.from(agg.utm_channel.entries()).map(([value, count]) => ({ value, count }))),
    utm_setter: sortBreakdownItems(Array.from(agg.utm_setter.entries()).map(([value, count]) => ({ value, count }))),
  };
}

type UTMKey = 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term' | 'utm_channel' | 'utm_setter';
const utmKeys: UTMKey[] = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'utm_channel', 'utm_setter'];

export function useCallsByPlatformPerDay({ startDate, endDate, dateType = 'completed', bookingPlatform }: UseCallsByPlatformParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['calls-by-platform-per-day', orgId, startDate?.toISOString(), endDate?.toISOString(), dateType, bookingPlatform],
    queryFn: async () => {
      if (!startDate || !endDate) {
        return { days: [], platforms: [], totals: {}, grandTotal: 0, platformBreakdowns: {}, dayPlatformBreakdowns: {} };
      }

      // "completed" = scheduled_at in range AND < now (past events only)
      // "created" = booked_at in range (when events were created - for UTM tracking)
      const dateField = dateType === 'created' ? 'booked_at' : 'scheduled_at';

      // Fetch events with platform info and all event details for drill-down
      let query = supabase
        .from('events')
        .select('id, scheduled_at, booked_at, close_custom_fields, booking_metadata, booking_responses, call_status, lead_name, lead_email, lead_phone, closer_name, closer_email, setter_name, event_outcome, booking_platform')
        .eq('organization_id', orgId!)
        .gte(dateField, startDate.toISOString())
        .lte(dateField, endDate.toISOString());
      
      if (bookingPlatform) {
        query = query.eq('booking_platform', bookingPlatform);
      }
      
      query = query.order(dateField, { ascending: true });

      const { data: events, error } = await query;

      if (error) throw error;

      const now = new Date();

      // Filter out canceled/rescheduled
      // For "completed" mode, also filter to past events only
      const activeEvents = (events || []).filter(e => {
        if (['canceled', 'cancelled', 'rescheduled'].includes(e.call_status)) return false;
        // For "completed" mode, only include past events
        if (dateType === 'completed' && new Date(e.scheduled_at) >= now) return false;
        return true;
      });

      // Get unique platforms (with normalization)
      const platformSet = new Set<string>();
      platformSet.add('Unknown');
      
      activeEvents.forEach(e => {
        const customFields = e.close_custom_fields as Record<string, string> | null;
        const bookingMeta = e.booking_metadata as Record<string, string> | null;
        const rawPlatform = customFields?.platform || bookingMeta?.utm_platform;
        if (rawPlatform) {
          platformSet.add(getCanonicalSource(rawPlatform));
        }
      });

      const platforms = Array.from(platformSet).sort((a, b) => {
        if (a === 'Unknown') return 1;
        if (b === 'Unknown') return -1;
        return a.localeCompare(b);
      });

      // Generate all days in range
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Initialize data structure
      const dayData: PlatformDayData[] = days.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        dateLabel: format(day, 'EEE MMM d'),
        platforms: {},
        total: 0,
      }));

      // Count events per platform per day AND aggregate UTM breakdowns
      const totals: Record<string, number> = {};
      let grandTotal = 0;
      
      // UTM aggregation maps per platform (totals)
      const platformUTMAggregates: Record<string, Record<UTMKey, Map<string, number>>> = {};
      
      // NEW: Day+Platform breakdowns
      const dayPlatformBreakdowns: Record<string, Record<string, DayPlatformBreakdown>> = {};

      activeEvents.forEach(event => {
        const dateValue = dateType === 'created' ? event.booked_at : event.scheduled_at;
        if (!dateValue) return;
        
        // Get the day in EST
        const eventDate = formatInTimeZone(new Date(dateValue), 'America/New_York', 'yyyy-MM-dd');
        const dayEntry = dayData.find(d => d.date === eventDate);
        
        if (dayEntry) {
          const customFields = event.close_custom_fields as Record<string, string> | null;
          const bookingMeta = event.booking_metadata as Record<string, unknown> | null;
          const rawPlatform = customFields?.platform || (bookingMeta?.utm_platform as string | undefined);
          const platform = rawPlatform ? getCanonicalSource(rawPlatform) : 'Unknown';
          
          dayEntry.platforms[platform] = (dayEntry.platforms[platform] || 0) + 1;
          dayEntry.total += 1;
          totals[platform] = (totals[platform] || 0) + 1;
          grandTotal += 1;
          
          // Aggregate UTM parameters for this platform (totals)
          if (!platformUTMAggregates[platform]) {
            platformUTMAggregates[platform] = createEmptyUTMAggregates();
          }
          
          // NEW: Initialize day+platform breakdown if needed
          if (!dayPlatformBreakdowns[eventDate]) {
            dayPlatformBreakdowns[eventDate] = {};
          }
          if (!dayPlatformBreakdowns[eventDate][platform]) {
            dayPlatformBreakdowns[eventDate][platform] = {
              utmBreakdowns: {
                utm_source: [],
                utm_medium: [],
                utm_campaign: [],
                utm_content: [],
                utm_term: [],
                utm_channel: [],
                utm_setter: [],
              },
              events: [],
            };
            // Create temp aggregates for this day+platform
            (dayPlatformBreakdowns[eventDate][platform] as any)._tempAgg = createEmptyUTMAggregates();
          }
          
          const dayPlatformAgg = (dayPlatformBreakdowns[eventDate][platform] as any)._tempAgg as Record<UTMKey, Map<string, number>>;
          
          for (const key of utmKeys) {
            const value = (bookingMeta?.[key] as string) || '(none)';
            
            // Aggregate for platform totals
            const platformMap = platformUTMAggregates[platform][key];
            platformMap.set(value, (platformMap.get(value) || 0) + 1);
            
            // Aggregate for day+platform
            const dayMap = dayPlatformAgg[key];
            dayMap.set(value, (dayMap.get(value) || 0) + 1);
          }
          
          // Create event summary and add to day+platform
          const eventSummary: EventSummary = {
            id: event.id,
            lead_name: event.lead_name,
            lead_email: event.lead_email,
            lead_phone: event.lead_phone,
            closer_name: event.closer_name,
            closer_email: event.closer_email,
            setter_name: event.setter_name,
            event_outcome: event.event_outcome,
            booked_at: event.booked_at,
            scheduled_at: event.scheduled_at,
            booking_platform: event.booking_platform,
            booking_metadata: (bookingMeta || {}) as Record<string, unknown>,
            booking_responses: (event.booking_responses || {}) as Record<string, unknown>,
          };
          
          dayPlatformBreakdowns[eventDate][platform].events.push(eventSummary);
        }
      });

      // Convert UTM aggregates to sorted arrays for platform totals
      const platformBreakdowns: Record<string, PlatformUTMBreakdowns> = {};
      for (const platform of Object.keys(platformUTMAggregates)) {
        platformBreakdowns[platform] = convertAggregatesToBreakdowns(platformUTMAggregates[platform]);
      }
      
      // Convert day+platform temp aggregates to final breakdowns
      for (const date of Object.keys(dayPlatformBreakdowns)) {
        for (const platform of Object.keys(dayPlatformBreakdowns[date])) {
          const entry = dayPlatformBreakdowns[date][platform] as any;
          if (entry._tempAgg) {
            entry.utmBreakdowns = convertAggregatesToBreakdowns(entry._tempAgg);
            delete entry._tempAgg;
          }
        }
      }

      return {
        days: dayData,
        platforms,
        totals,
        grandTotal,
        platformBreakdowns,
        dayPlatformBreakdowns,
      } as CallsByPlatformResult;
    },
    enabled: !!orgId && !!startDate && !!endDate,
  });
}
