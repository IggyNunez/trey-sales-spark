import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export interface MetricConfig {
  includeCancels: boolean;
  includeReschedules: boolean;
  includeNoShows: boolean;
}

export interface ConfigurableMetricFilters {
  startDate?: Date;
  endDate?: Date;
  closerId?: string;
  sourceId?: string;
  callTypeId?: string;
  metricConfig?: MetricConfig;
}

export interface DashboardMetrics {
  totalEvents: number;
  scheduledCalls: number;
  bookedCalls: number;
  completedCalls: number;
  noShows: number;
  showRate: number;
  offersMade: number;
  dealsClosed: number;
  closeRate: number;
  offerRate: number;
  totalRevenue: number;
  pendingPCFs: number;
  canceled: number;
  rescheduled: number;
  cancelRate: number;
  rescheduleRate: number;
}

export function useConfigurableMetrics(filters?: ConfigurableMetricFilters) {
  const { user, isAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: [
      'configurable-metrics',
      orgId,
      filters?.startDate?.toISOString(),
      filters?.endDate?.toISOString(),
      filters?.closerId,
      filters?.sourceId,
      filters?.callTypeId,
      filters?.metricConfig?.includeCancels,
      filters?.metricConfig?.includeReschedules,
      filters?.metricConfig?.includeNoShows,
      user?.id,
      isAdmin,
    ],
    queryFn: async () => {
      // Fetch all events for this organization
      let eventsQuery = supabase.from('events').select('*');
      
      if (orgId) {
        eventsQuery = eventsQuery.eq('organization_id', orgId);
      }
      
      // Always filter by scheduled_at (when the call is slated to take place)
      if (filters?.startDate) {
        eventsQuery = eventsQuery.gte('scheduled_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        eventsQuery = eventsQuery.lte('scheduled_at', filters.endDate.toISOString());
      }
      if (filters?.closerId) {
        eventsQuery = eventsQuery.eq('closer_id', filters.closerId);
      }
      if (filters?.sourceId) {
        eventsQuery = eventsQuery.eq('source_id', filters.sourceId);
      }
      if (filters?.callTypeId) {
        eventsQuery = eventsQuery.eq('call_type_id', filters.callTypeId);
      }

      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      // Fetch payments for this organization
      let paymentsQuery = supabase.from('payments').select('*');
      if (orgId) {
        paymentsQuery = paymentsQuery.eq('organization_id', orgId);
      }
      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Fetch ALL past events for pending PCFs calculation (separate from date-filtered events)
      // Pending PCFs should show ALL overdue PCFs, not just ones in the current date range
      // Only consider calls that have already happened (scheduled_at < now)
      const now = new Date();
      let allPastEventsQuery = supabase
        .from('events')
        .select('id, pcf_submitted, call_status, scheduled_at')
        .eq('pcf_submitted', false)
        .neq('call_status', 'cancelled')
        .neq('call_status', 'canceled')
        .neq('call_status', 'rescheduled')
        .lt('scheduled_at', now.toISOString());

      if (orgId) {
        allPastEventsQuery = allPastEventsQuery.eq('organization_id', orgId);
      }
      if (filters?.sourceId) {
        allPastEventsQuery = allPastEventsQuery.eq('source_id', filters.sourceId);
      }
      if (filters?.callTypeId) {
        allPastEventsQuery = allPastEventsQuery.eq('call_type_id', filters.callTypeId);
      }

      const { data: allPendingPCFEvents, error: pendingError } = await allPastEventsQuery;
      if (pendingError) throw pendingError;

      // Get metric config
      const config = filters?.metricConfig || {
        includeCancels: false,
        includeReschedules: false,
        includeNoShows: true,
      };

      // Calculate metrics
      const totalEvents = events?.length || 0;
      // Active events = excluding canceled/rescheduled (aligns with CRM logic)
      const activeEvents = events?.filter(e => 
        e.call_status !== 'canceled' && e.call_status !== 'rescheduled'
      ) || [];
      // Scheduled calls = active events count
      const scheduledCalls = activeEvents.length;
      
      // IMPORTANT: For rate calculations (show rate, offer rate, close rate), only count 
      // calls that have ALREADY HAPPENED (scheduled_at < now). Future calls shouldn't 
      // affect these metrics since they haven't occurred yet.
      const pastEvents = events?.filter(e => new Date(e.scheduled_at) < now) || [];
      
      const completedCalls = events?.filter(e => e.call_status === 'completed').length || 0;
      const noShows = events?.filter(e => e.call_status === 'no_show').length || 0;
      const canceled = events?.filter(e => e.call_status === 'canceled').length || 0;
      const rescheduled = events?.filter(e => e.call_status === 'rescheduled').length || 0;
      
      const bookedCalls = activeEvents.length;

      // Only count showed/offers/closed from PAST events
      const showedEvents = pastEvents.filter(e => 
        e.event_outcome && e.event_outcome !== 'no_show'
      ).length;
      
      const offersMade = pastEvents.filter(e => 
        e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
      ).length;
      
      const dealsClosed = pastEvents.filter(e => e.event_outcome === 'closed').length;
      
      // Count no-shows only from past events for rate calculations
      const pastNoShows = pastEvents.filter(e => e.call_status === 'no_show').length;
      const pastCanceled = pastEvents.filter(e => e.call_status === 'canceled').length;
      const pastRescheduled = pastEvents.filter(e => e.call_status === 'rescheduled').length;
      const pastCompleted = pastEvents.filter(e => e.call_status === 'completed').length;
      
      // Pending PCFs count comes from the separate ALL past events query
      // This shows ALL overdue PCFs, not just ones in the current date range
      const pendingPCFs = allPendingPCFEvents?.length || 0;

      // Calculate rates based on config - using PAST events only
      // Denominator for show rate = completed + conditionally included statuses (from past events)
      let denominator = pastCompleted;
      if (config.includeNoShows) denominator += pastNoShows;
      if (config.includeCancels) denominator += pastCanceled;
      if (config.includeReschedules) denominator += pastRescheduled;
      
      // Show Rate = showed / (showed + no-shows) from past events only
      // Using attendedOrNoShow logic: denominator = showed + no-shows
      const attendedOrNoShowDenom = showedEvents + pastNoShows;
      const showRate = attendedOrNoShowDenom > 0 ? (showedEvents / attendedOrNoShowDenom) * 100 : 0;
      
      // Close Rate = Closed / Shows (from past events)
      const closeRate = showedEvents > 0 ? (dealsClosed / showedEvents) * 100 : 0;
      
      // Offer Rate = Offers / Shows (from past events)
      const offerRate = showedEvents > 0 ? (offersMade / showedEvents) * 100 : 0;

      // Calculate total revenue from payments linked to filtered events
      const eventIds = events?.map(e => e.id) || [];
      const filteredPayments = payments?.filter(p => eventIds.includes(p.event_id)) || [];
      
      const totalRevenue = filteredPayments.reduce((sum, p) => {
        const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
        const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
        return sum + (amount - refund);
      }, 0);

      // Cancel Rate = Canceled / Total Events
      const cancelRate = totalEvents > 0 ? (canceled / totalEvents) * 100 : 0;
      
      // Reschedule Rate = Rescheduled / Total Events
      const rescheduleRate = totalEvents > 0 ? (rescheduled / totalEvents) * 100 : 0;

      return {
        totalEvents,
        scheduledCalls,
        bookedCalls,
        completedCalls,
        noShows,
        showRate: Math.round(showRate * 10) / 10,
        offersMade,
        dealsClosed,
        closeRate: Math.round(closeRate * 10) / 10,
        offerRate: Math.round(offerRate * 10) / 10,
        totalRevenue,
        pendingPCFs,
        canceled,
        rescheduled,
        cancelRate: Math.round(cancelRate * 10) / 10,
        rescheduleRate: Math.round(rescheduleRate * 10) / 10,
      } as DashboardMetrics;
    },
    enabled: !!user && !!orgId,
  });
}
