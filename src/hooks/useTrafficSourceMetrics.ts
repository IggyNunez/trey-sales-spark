import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

export interface TrafficSourceMetrics {
  source: string;
  scheduledCount: number;
  bookedCount: number;
  showed: number;
  noShows: number;
  showRate: number;
  dealsClosed: number;
  closeRate: number;
}

interface UseTrafficSourceMetricsParams {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

export function useTrafficSourceMetrics({ startDate, endDate, bookingPlatform }: UseTrafficSourceMetricsParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['traffic-source-metrics', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('id, booking_metadata, close_custom_fields, event_outcome, call_status, scheduled_at, booked_at')
        .eq('organization_id', orgId!)
        .not('call_status', 'in', '("canceled","rescheduled")');

      if (startDate) {
        query = query.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('scheduled_at', endDate.toISOString());
      }
      if (bookingPlatform) {
        query = query.eq('booking_platform', bookingPlatform);
      }

      const { data: events, error } = await query;
      if (error) throw error;

      const now = new Date();
      const sourceMap: Record<string, {
        scheduledCount: number;
        bookedCount: number;
        showed: number;
        noShows: number;
        closed: number;
      }> = {};

      // Count total events and events with UTM data
      let totalEvents = 0;
      let eventsWithUtm = 0;

      for (const event of events || []) {
        totalEvents++;
        const metadata = event.booking_metadata as { utm_platform?: string } | null;
        const customFields = event.close_custom_fields as { platform?: string } | null;
        
        // Merge: UTM takes priority for Attribution, fallback to CRM
        const rawPlatform = metadata?.utm_platform?.trim() || customFields?.platform?.trim();
        
        if (!rawPlatform) continue;
        eventsWithUtm++;
        
        const source = getCanonicalSource(rawPlatform);

        if (!sourceMap[source]) {
          sourceMap[source] = { scheduledCount: 0, bookedCount: 0, showed: 0, noShows: 0, closed: 0 };
        }

        // Count scheduled (all events with this source)
        sourceMap[source].scheduledCount++;
        
        // Count booked (events with booked_at)
        if (event.booked_at) {
          sourceMap[source].bookedCount++;
        }

        // Only count outcomes for past events
        const isPastEvent = new Date(event.scheduled_at) < now;
        if (!isPastEvent) continue;

        // Count showed/no-shows/closed
        if (event.event_outcome && event.event_outcome !== 'no_show') {
          sourceMap[source].showed++;
        }
        if (event.event_outcome === 'no_show') {
          sourceMap[source].noShows++;
        }
        if (event.event_outcome === 'closed') {
          sourceMap[source].closed++;
        }
      }

      // Convert to array with calculated rates
      const metrics: TrafficSourceMetrics[] = Object.entries(sourceMap).map(([source, data]) => {
        const attendedOrNoShow = data.showed + data.noShows;
        return {
          source,
          scheduledCount: data.scheduledCount,
          bookedCount: data.bookedCount,
          showed: data.showed,
          noShows: data.noShows,
          showRate: attendedOrNoShow > 0 ? Math.round((data.showed / attendedOrNoShow) * 100) : 0,
          dealsClosed: data.closed,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        };
      });

      // Sort by scheduled count descending
      metrics.sort((a, b) => b.scheduledCount - a.scheduledCount);

      // Calculate summary stats
      const topSource = metrics[0]?.source || null;
      const utmCoverage = totalEvents > 0 ? Math.round((eventsWithUtm / totalEvents) * 100) : 0;

      return {
        metrics,
        summary: {
          totalEvents,
          eventsWithUtm,
          topSource,
          utmCoverage,
        },
      };
    },
    enabled: !!orgId,
  });
}
