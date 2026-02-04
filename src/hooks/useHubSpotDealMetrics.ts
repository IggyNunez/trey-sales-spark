import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useIsHubSpotSyncEnabled } from './useHubSpotSync';

interface DealStageMetric {
  stage: string;
  count: number;
  totalAmount: number;
  showed: number;
  closed: number;
  showRate: number;
  closeRate: number;
}

interface HubSpotDealMetrics {
  byStage: DealStageMetric[];
  totalDeals: number;
  totalPipeline: number;
  stageLabels: string[];
}

/**
 * Hook to fetch HubSpot deal stage metrics.
 * Aggregates events by their HubSpot deal stage.
 */
export function useHubSpotDealMetrics(options: {
  startDate?: Date;
  endDate?: Date;
}) {
  const { currentOrganization } = useOrganization();
  const isEnabled = useIsHubSpotSyncEnabled();

  return useQuery({
    queryKey: ['hubspot-deal-metrics', currentOrganization?.id, options.startDate, options.endDate],
    queryFn: async (): Promise<HubSpotDealMetrics> => {
      if (!currentOrganization?.id) {
        return { byStage: [], totalDeals: 0, totalPipeline: 0, stageLabels: [] };
      }

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
      if (!events) return { byStage: [], totalDeals: 0, totalPipeline: 0, stageLabels: [] };

      // Aggregate by deal stage
      const stageMap = new Map<string, { 
        count: number; 
        totalAmount: number; 
        showed: number; 
        closed: number;
      }>();

      let totalDeals = 0;
      let totalPipeline = 0;

      for (const event of events) {
        const fields = event.hubspot_custom_fields as Record<string, string | null> | null;
        const dealStage = fields?.deal_stage;
        
        // Only count events that have deal data
        if (!dealStage) continue;

        totalDeals++;
        const amount = parseFloat(fields?.deal_amount || '0') || 0;
        totalPipeline += amount;

        const outcome = event.event_outcome;
        const current = stageMap.get(dealStage) || { 
          count: 0, 
          totalAmount: 0, 
          showed: 0, 
          closed: 0 
        };
        
        current.count++;
        current.totalAmount += amount;
        
        if (outcome && outcome !== 'no_show') {
          current.showed++;
        }
        if (outcome === 'closed') {
          current.closed++;
        }
        
        stageMap.set(dealStage, current);
      }

      // Convert to array and calculate rates
      const byStage: DealStageMetric[] = Array.from(stageMap.entries())
        .map(([stage, data]) => ({
          stage,
          count: data.count,
          totalAmount: data.totalAmount,
          showed: data.showed,
          closed: data.closed,
          showRate: data.count > 0 ? Math.round((data.showed / data.count) * 100) : 0,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        byStage,
        totalDeals,
        totalPipeline,
        stageLabels: byStage.map(s => s.stage),
      };
    },
    enabled: isEnabled && !!currentOrganization?.id,
  });
}
