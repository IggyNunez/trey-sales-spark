import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';

interface PreviewDataFilters {
  startDate?: Date;
  endDate?: Date;
  includeCancels?: boolean;
  includeReschedules?: boolean;
  includeNoShows?: boolean;
  excludeOverduePcf?: boolean;
}

interface PreviewCounts {
  allScheduled: number;
  showedCalls: number;
  offersMade: number;
  closedDeals: number;
  noShows: number;
  isLoading: boolean;
}

// Derive event_outcome from PCF data
// Note: This is a fallback for events without a stored outcome - now the actual outcome 
// from the events table should be used when available as it reflects pipeline status
function deriveEventOutcome(pcf: { lead_showed: boolean; offer_made: boolean; deal_closed: boolean } | null): string | null {
  if (!pcf) return null;
  if (!pcf.lead_showed) return 'no_show';
  if (pcf.deal_closed) return 'closed';
  if (pcf.offer_made) return 'showed_offer_no_close';
  return 'showed_no_offer';
}

export function useMetricPreviewData(filters?: PreviewDataFilters): PreviewCounts {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  // Extract filter values with defaults
  const includeCancels = filters?.includeCancels ?? false;
  const includeReschedules = filters?.includeReschedules ?? false;
  const includeNoShows = filters?.includeNoShows ?? true;
  const excludeOverduePcf = filters?.excludeOverduePcf ?? false;

  const { data, isLoading } = useQuery({
    queryKey: [
      'metric-preview-data', 
      orgId, 
      filters?.startDate?.toISOString(), 
      filters?.endDate?.toISOString(),
      includeCancels,
      includeReschedules,
      includeNoShows,
      excludeOverduePcf,
    ],
    staleTime: 0, // Always refetch when toggle values change
    queryFn: async () => {
      const now = new Date().toISOString();
      
      // Fetch events with their PCF data
      let eventsQuery = supabase.from('events').select(`
        id,
        scheduled_at,
        call_status,
        event_outcome,
        pcf_submitted,
        post_call_forms (
          id,
          lead_showed,
          offer_made,
          deal_closed
        )
      `);
      
      if (orgId) eventsQuery = eventsQuery.eq('organization_id', orgId);
      if (filters?.startDate) eventsQuery = eventsQuery.gte('scheduled_at', filters.startDate.toISOString());
      if (filters?.endDate) eventsQuery = eventsQuery.lte('scheduled_at', filters.endDate.toISOString());

      const { data: eventsData, error } = await eventsQuery;
      if (error) throw error;

      // Process events with PCF-derived outcomes
      // Apply cancel/reschedule filters based on toggles
      const events = (eventsData || [])
        .filter(event => {
          // Filter out canceled unless explicitly included
          if (!includeCancels && event.call_status === 'canceled') return false;
          // Filter out rescheduled unless explicitly included
          if (!includeReschedules && event.call_status === 'rescheduled') return false;
          // Filter out overdue PCF events if excludeOverduePcf is enabled
          if (excludeOverduePcf && event.scheduled_at < now && !event.pcf_submitted) return false;
          return true;
        })
        .map(event => {
          const pcfs = event.post_call_forms as Array<{ lead_showed: boolean; offer_made: boolean; deal_closed: boolean }> | null;
          const pcf = pcfs && pcfs.length > 0 ? pcfs[0] : null;
          const derivedOutcome = deriveEventOutcome(pcf);
          
          return {
            ...event,
            event_outcome: derivedOutcome || event.event_outcome,
          };
        });

      // allScheduled = all events after status filters (for denominator when selecting "All Scheduled Calls")
      const allScheduled = events.length;
      
      // For outcome-based counts, only count events with valid outcome (PCF submitted)
      const eventsWithOutcome = events.filter(e => e.event_outcome !== null);
      const noShows = eventsWithOutcome.filter(e => e.event_outcome === 'no_show').length;
      const showedCalls = eventsWithOutcome.filter(e => e.event_outcome && e.event_outcome !== 'no_show').length;
      const offersMade = eventsWithOutcome.filter(e => 
        e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
      ).length;
      const closedDeals = eventsWithOutcome.filter(e => e.event_outcome === 'closed').length;

      return {
        allScheduled,
        showedCalls,
        offersMade,
        closedDeals,
        noShows,
      };
    },
    enabled: !!user && !!orgId,
  });

  return {
    allScheduled: data?.allScheduled ?? 0,
    showedCalls: data?.showedCalls ?? 0,
    offersMade: data?.offersMade ?? 0,
    closedDeals: data?.closedDeals ?? 0,
    noShows: data?.noShows ?? 0,
    isLoading,
  };
}
