import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useSetterAliasMap } from './useSetterAliases';
import { resolveSetterName } from '@/lib/identityResolver';

export interface UtmSetterMetrics {
  setterName: string;
  callsSet: number;
  showed: number;
  noShows: number;
  showRate: number;
  closed: number;
  closeRate: number;
}

interface UseUtmSetterMetricsParams {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

export function useUtmSetterMetrics({ startDate, endDate, bookingPlatform }: UseUtmSetterMetricsParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { aliasMap, isLoading: aliasesLoading } = useSetterAliasMap();

  const query = useQuery({
    queryKey: ['utm-setter-metrics', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform, Array.from(aliasMap.entries())],
    queryFn: async () => {
      let eventsQuery = supabase
        .from('events')
        .select('id, booking_metadata, event_outcome, call_status, scheduled_at')
        .eq('organization_id', orgId!)
        .not('call_status', 'in', '("canceled","rescheduled")');

      if (startDate) {
        eventsQuery = eventsQuery.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        eventsQuery = eventsQuery.lte('scheduled_at', endDate.toISOString());
      }
      if (bookingPlatform) {
        eventsQuery = eventsQuery.eq('booking_platform', bookingPlatform);
      }

      const { data: events, error } = await eventsQuery;
      if (error) throw error;

      const now = new Date();
      const setterMap: Record<string, {
        callsSet: number;
        showed: number;
        noShows: number;
        closed: number;
      }> = {};

      for (const event of events || []) {
        const metadata = event.booking_metadata as { utm_setter?: string } | null;
        const rawUtmSetter = metadata?.utm_setter?.trim();
        
        // Apply alias resolution and junk filtering
        const utmSetter = resolveSetterName(rawUtmSetter, aliasMap);
        
        // Only count events with valid UTM setter data
        if (!utmSetter) continue;

        if (!setterMap[utmSetter]) {
          setterMap[utmSetter] = { callsSet: 0, showed: 0, noShows: 0, closed: 0 };
        }

        // Count all calls set
        setterMap[utmSetter].callsSet++;

        // Only count outcomes for past events
        const isPastEvent = new Date(event.scheduled_at) < now;
        if (!isPastEvent) continue;

        // Count showed/no-shows/closed
        if (event.event_outcome && event.event_outcome !== 'no_show') {
          setterMap[utmSetter].showed++;
        }
        if (event.event_outcome === 'no_show') {
          setterMap[utmSetter].noShows++;
        }
        if (event.event_outcome === 'closed') {
          setterMap[utmSetter].closed++;
        }
      }

      // Convert to array with calculated rates
      const metrics: UtmSetterMetrics[] = Object.entries(setterMap).map(([setterName, data]) => {
        const attendedOrNoShow = data.showed + data.noShows;
        return {
          setterName,
          callsSet: data.callsSet,
          showed: data.showed,
          noShows: data.noShows,
          showRate: attendedOrNoShow > 0 ? Math.round((data.showed / attendedOrNoShow) * 100) : 0,
          closed: data.closed,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        };
      });

      // Sort by calls set descending
      metrics.sort((a, b) => b.callsSet - a.callsSet);

      return metrics;
    },
    enabled: !!orgId && !aliasesLoading,
  });

  return {
    ...query,
    isLoading: query.isLoading || aliasesLoading,
  };
}
