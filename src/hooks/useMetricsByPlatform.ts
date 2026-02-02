import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

export interface UTMBreakdown {
  field: 'utm_source' | 'utm_medium' | 'utm_campaign';
  value: string;
  calls: number;
  showed: number;
  noShows: number;
  showRate: number;
  dealsClosed: number;
  closeRate: number;
}

export interface PlatformMetrics {
  platform: string;
  totalCalls: number;
  showed: number;
  noShows: number;
  showRate: number;
  offersMade: number;
  dealsClosed: number;
  closeRate: number;
  offerRate: number;
  utmBreakdowns: {
    utm_source: UTMBreakdown[];
    utm_medium: UTMBreakdown[];
    utm_campaign: UTMBreakdown[];
  };
}

interface UseMetricsByPlatformParams {
  startDate?: Date;
  endDate?: Date;
  closerId?: string | null;
  sourceIds?: string[];
  bookingPlatform?: string;
  closeFieldFilters?: Record<string, string | null>;
}

interface UTMAccumulator {
  calls: number;
  showed: number;
  noShows: number;
  dealsClosed: number;
}

export function useMetricsByPlatform({
  startDate,
  endDate,
  closerId,
  sourceIds,
  bookingPlatform,
  closeFieldFilters,
}: UseMetricsByPlatformParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data: events, isLoading } = useQuery({
    queryKey: ['events-for-platform-metrics', orgId, startDate?.toISOString(), endDate?.toISOString(), closerId, sourceIds, bookingPlatform, closeFieldFilters],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('id, event_outcome, call_status, close_custom_fields, booking_metadata, booking_platform, scheduled_at, no_show_guest, meeting_started_at')
        .eq('organization_id', orgId!);

      if (startDate) {
        query = query.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('scheduled_at', endDate.toISOString());
      }
      if (closerId) {
        query = query.eq('closer_name', closerId);
      }
      if (sourceIds && sourceIds.length > 0) {
        query = query.in('source_id', sourceIds);
      }
      if (bookingPlatform) {
        query = query.eq('booking_platform', bookingPlatform);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const platformMetrics = useMemo(() => {
    if (!events) return [];

    const now = new Date();

    // Group events by platform with UTM breakdowns
    const platformMap = new Map<string, {
      totalCalls: number;
      showed: number;
      noShows: number;
      offersMade: number;
      dealsClosed: number;
      utmSource: Map<string, UTMAccumulator>;
      utmMedium: Map<string, UTMAccumulator>;
      utmCampaign: Map<string, UTMAccumulator>;
    }>();

    events.forEach(event => {
      // Skip canceled/rescheduled events
      if (['canceled', 'cancelled', 'rescheduled'].includes(event.call_status)) {
        return;
      }

      const customFields = event.close_custom_fields as Record<string, string> | null;
      const bookingMeta = event.booking_metadata as Record<string, string> | null;
      
      // Merge: CRM platform takes priority, fallback to UTM platform
      const rawPlatform = customFields?.platform || bookingMeta?.utm_platform || null;
      const platform = rawPlatform ? getCanonicalSource(rawPlatform) : 'Unknown';

      // Extract UTM parameters
      const utmSource = bookingMeta?.utm_source || '(none)';
      const utmMedium = bookingMeta?.utm_medium || '(none)';
      const utmCampaign = bookingMeta?.utm_campaign || '(none)';

      if (!platformMap.has(platform)) {
        platformMap.set(platform, {
          totalCalls: 0,
          showed: 0,
          noShows: 0,
          offersMade: 0,
          dealsClosed: 0,
          utmSource: new Map(),
          utmMedium: new Map(),
          utmCampaign: new Map(),
        });
      }

      const metrics = platformMap.get(platform)!;
      metrics.totalCalls++;

      // Helper to get or create UTM accumulator
      const getOrCreateUTM = (map: Map<string, UTMAccumulator>, key: string): UTMAccumulator => {
        if (!map.has(key)) {
          map.set(key, { calls: 0, showed: 0, noShows: 0, dealsClosed: 0 });
        }
        return map.get(key)!;
      };

      // Increment call counts for UTM breakdowns
      getOrCreateUTM(metrics.utmSource, utmSource).calls++;
      getOrCreateUTM(metrics.utmMedium, utmMedium).calls++;
      getOrCreateUTM(metrics.utmCampaign, utmCampaign).calls++;

      // ONLY count outcome metrics for PAST events (scheduled_at < now)
      const eventDate = new Date(event.scheduled_at);
      if (eventDate >= now) return;

      const outcome = event.event_outcome as string | null;
      const callStatus = event.call_status;
      const noShowGuest = event.no_show_guest;
      const meetingStartedAt = event.meeting_started_at;
      
      const isExplicitNoShow = 
        outcome === 'no_show' || 
        callStatus === 'no_show' ||
        noShowGuest === true;
      
      const isExplicitShow = 
        (outcome && outcome !== 'no_show') ||
        meetingStartedAt !== null;
      
      if (isExplicitNoShow) {
        metrics.noShows++;
        getOrCreateUTM(metrics.utmSource, utmSource).noShows++;
        getOrCreateUTM(metrics.utmMedium, utmMedium).noShows++;
        getOrCreateUTM(metrics.utmCampaign, utmCampaign).noShows++;
      } else if (isExplicitShow) {
        metrics.showed++;
        getOrCreateUTM(metrics.utmSource, utmSource).showed++;
        getOrCreateUTM(metrics.utmMedium, utmMedium).showed++;
        getOrCreateUTM(metrics.utmCampaign, utmCampaign).showed++;
        
        if (outcome === 'showed_offer_no_close' || outcome === 'closed') {
          metrics.offersMade++;
        }
        if (outcome === 'closed') {
          metrics.dealsClosed++;
          getOrCreateUTM(metrics.utmSource, utmSource).dealsClosed++;
          getOrCreateUTM(metrics.utmMedium, utmMedium).dealsClosed++;
          getOrCreateUTM(metrics.utmCampaign, utmCampaign).dealsClosed++;
        }
      }
    });

    // Helper to convert UTM map to breakdown array
    const mapToBreakdowns = (map: Map<string, UTMAccumulator>, field: 'utm_source' | 'utm_medium' | 'utm_campaign'): UTMBreakdown[] => {
      const breakdowns: UTMBreakdown[] = [];
      map.forEach((acc, value) => {
        const attendedOrNoShow = acc.showed + acc.noShows;
        breakdowns.push({
          field,
          value,
          calls: acc.calls,
          showed: acc.showed,
          noShows: acc.noShows,
          showRate: attendedOrNoShow > 0 ? Math.round((acc.showed / attendedOrNoShow) * 100) : 0,
          dealsClosed: acc.dealsClosed,
          closeRate: acc.showed > 0 ? Math.round((acc.dealsClosed / acc.showed) * 100) : 0,
        });
      });
      // Sort by calls descending, but keep (none) at the end
      return breakdowns.sort((a, b) => {
        if (a.value === '(none)') return 1;
        if (b.value === '(none)') return -1;
        return b.calls - a.calls;
      });
    };

    // Convert to array with calculated rates
    const result: PlatformMetrics[] = [];
    platformMap.forEach((metrics, platform) => {
      const attendedOrNoShow = metrics.showed + metrics.noShows;
      result.push({
        platform,
        totalCalls: metrics.totalCalls,
        showed: metrics.showed,
        noShows: metrics.noShows,
        showRate: attendedOrNoShow > 0 ? Math.round((metrics.showed / attendedOrNoShow) * 100) : 0,
        offersMade: metrics.offersMade,
        dealsClosed: metrics.dealsClosed,
        closeRate: metrics.showed > 0 ? Math.round((metrics.dealsClosed / metrics.showed) * 100) : 0,
        offerRate: metrics.showed > 0 ? Math.round((metrics.offersMade / metrics.showed) * 100) : 0,
        utmBreakdowns: {
          utm_source: mapToBreakdowns(metrics.utmSource, 'utm_source'),
          utm_medium: mapToBreakdowns(metrics.utmMedium, 'utm_medium'),
          utm_campaign: mapToBreakdowns(metrics.utmCampaign, 'utm_campaign'),
        },
      });
    });

    // Sort by total calls descending, but keep Unknown at the end
    return result.sort((a, b) => {
      if (a.platform === 'Unknown') return 1;
      if (b.platform === 'Unknown') return -1;
      return b.totalCalls - a.totalCalls;
    });
  }, [events]);

  return { data: platformMetrics, isLoading };
}
