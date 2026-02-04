import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useIsHubSpotSyncEnabled } from './useHubSpotSync';

interface HubSpotSourceMetric {
  source: string;
  count: number;
  showed: number;
  closed: number;
  showRate: number;
  closeRate: number;
}

interface HubSpotMetrics {
  bySource: HubSpotSourceMetric[];
  totalEvents: number;
  syncedEvents: number;
  coverageRate: number;
}

/**
 * Hook to fetch HubSpot-specific attribution metrics.
 * Only runs for Trenton organization.
 */
export function useHubSpotMetrics(options: {
  startDate?: Date;
  endDate?: Date;
}) {
  const { currentOrganization } = useOrganization();
  const isEnabled = useIsHubSpotSyncEnabled();

  return useQuery({
    queryKey: ['hubspot-metrics', currentOrganization?.id, options.startDate, options.endDate],
    queryFn: async (): Promise<HubSpotMetrics> => {
      if (!currentOrganization?.id) {
        return { bySource: [], totalEvents: 0, syncedEvents: 0, coverageRate: 0 };
      }

      // Build date filters
      let query = supabase
        .from('events')
        .select('id, hubspot_custom_fields, event_outcome')
        .eq('organization_id', currentOrganization.id)
        .not('hubspot_contact_id', 'is', null);

      if (options.startDate) {
        query = query.gte('scheduled_at', options.startDate.toISOString());
      }
      if (options.endDate) {
        query = query.lte('scheduled_at', options.endDate.toISOString());
      }

      const { data: events, error } = await query;

      if (error) throw error;
      if (!events) return { bySource: [], totalEvents: 0, syncedEvents: 0, coverageRate: 0 };

      const totalEvents = events.length;
      const syncedEvents = events.filter(e => 
        e.hubspot_custom_fields && 
        typeof e.hubspot_custom_fields === 'object' && 
        Object.keys(e.hubspot_custom_fields as object).length > 0
      ).length;

      // Aggregate by HubSpot analytics source
      const sourceMap = new Map<string, { count: number; showed: number; closed: number }>();

      for (const event of events) {
        const fields = event.hubspot_custom_fields as Record<string, string | null> | null;
        const source = fields?.hs_analytics_source || 'Unknown';
        const outcome = event.event_outcome;

        const current = sourceMap.get(source) || { count: 0, showed: 0, closed: 0 };
        current.count++;
        
        if (outcome && outcome !== 'no_show') {
          current.showed++;
        }
        if (outcome === 'closed') {
          current.closed++;
        }
        
        sourceMap.set(source, current);
      }

      // Convert to array and calculate rates
      const bySource: HubSpotSourceMetric[] = Array.from(sourceMap.entries())
        .map(([source, data]) => ({
          source,
          count: data.count,
          showed: data.showed,
          closed: data.closed,
          showRate: data.count > 0 ? Math.round((data.showed / data.count) * 100) : 0,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        bySource,
        totalEvents,
        syncedEvents,
        coverageRate: totalEvents > 0 ? Math.round((syncedEvents / totalEvents) * 100) : 0,
      };
    },
    enabled: isEnabled && !!currentOrganization?.id,
  });
}
