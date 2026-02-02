import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface UtmCloserMetrics {
  closerName: string;
  callsTaken: number;
  showed: number;
  noShows: number;
  showRate: number;
  closed: number;
  closeRate: number;
}

interface UseUtmCloserMetricsParams {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

export function useUtmCloserMetrics({ startDate, endDate, bookingPlatform }: UseUtmCloserMetricsParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['utm-closer-metrics', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('id, booking_metadata, event_outcome, call_status, scheduled_at, closer_name')
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
      const closerMap: Record<string, {
        callsTaken: number;
        showed: number;
        noShows: number;
        closed: number;
      }> = {};

      for (const event of events || []) {
        // Use closer_name from the event directly
        const closerName = event.closer_name?.trim();
        if (!closerName) continue;

        if (!closerMap[closerName]) {
          closerMap[closerName] = { callsTaken: 0, showed: 0, noShows: 0, closed: 0 };
        }

        // Count all calls taken
        closerMap[closerName].callsTaken++;

        // Only count outcomes for past events
        const isPastEvent = new Date(event.scheduled_at) < now;
        if (!isPastEvent) continue;

        // Count showed/no-shows/closed
        if (event.event_outcome && event.event_outcome !== 'no_show') {
          closerMap[closerName].showed++;
        }
        if (event.event_outcome === 'no_show') {
          closerMap[closerName].noShows++;
        }
        if (event.event_outcome === 'closed') {
          closerMap[closerName].closed++;
        }
      }

      // Convert to array with calculated rates
      const metrics: UtmCloserMetrics[] = Object.entries(closerMap).map(([closerName, data]) => {
        const attendedOrNoShow = data.showed + data.noShows;
        return {
          closerName,
          callsTaken: data.callsTaken,
          showed: data.showed,
          noShows: data.noShows,
          showRate: attendedOrNoShow > 0 ? Math.round((data.showed / attendedOrNoShow) * 100) : 0,
          closed: data.closed,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        };
      });

      // Sort by calls taken descending
      metrics.sort((a, b) => b.callsTaken - a.callsTaken);

      return metrics;
    },
    enabled: !!orgId,
  });
}
