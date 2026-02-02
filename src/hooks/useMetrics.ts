import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from 'date-fns';

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
}

export interface MetricFilters {
  startDate?: Date;
  endDate?: Date;
  closerId?: string;
}

export function useDashboardMetrics(filters?: MetricFilters) {
  const { user, isAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dashboard-metrics', orgId, filters, user?.id, isAdmin],
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

      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      // Fetch payments for this organization
      let paymentsQuery = supabase.from('payments').select('*');
      if (orgId) {
        paymentsQuery = paymentsQuery.eq('organization_id', orgId);
      }
      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Calculate metrics
      const now = new Date();
      const totalEvents = events?.length || 0;
      const scheduledCalls = events?.filter(e => e.call_status === 'scheduled').length || 0;
      const completedCalls = events?.filter(e => e.call_status === 'completed').length || 0;
      const noShows = events?.filter(e => e.call_status === 'no_show').length || 0;
      const canceled = events?.filter(e => e.call_status === 'canceled').length || 0;
      const rescheduled = events?.filter(e => e.call_status === 'rescheduled').length || 0;
      
      // Booked calls = events excluding canceled/rescheduled (aligns with CRM logic)
      const bookedCalls = events?.filter(e => 
        e.call_status !== 'canceled' && e.call_status !== 'rescheduled'
      ).length || 0;
      
      // IMPORTANT: Filter to PAST events only for rate calculations
      // Future calls shouldn't affect show rate since they haven't occurred yet
      const pastEvents = events?.filter(e => new Date(e.scheduled_at) < now) || [];

      // Helper to determine if an event is a no-show (explicit indicators only)
      const isNoShow = (e: typeof pastEvents[0]) => {
        // Explicit no-show indicators only - don't assume!
        if (e.event_outcome === 'no_show') return true;
        if (e.call_status === 'no_show') return true;
        // Cal.com no_show_guest flag
        if ((e as Record<string, unknown>).no_show_guest === true) return true;
        return false;
      };

      // Helper to determine if an event is a show (explicit indicators only)
      const isShow = (e: typeof pastEvents[0]) => {
        // Explicit show outcomes from PCF
        if (e.event_outcome && e.event_outcome !== 'no_show') return true;
        // Cal.com: meeting_started_at means they showed up
        if ((e as Record<string, unknown>).meeting_started_at) return true;
        return false;
      };

      // Only count events with EXPLICIT outcomes for rate calculations
      // Events without outcome (no PCF, no webhook data) are excluded from rate calcs
      const showedEvents = pastEvents.filter(e => isShow(e)).length;
      
      const offersMade = pastEvents.filter(e => 
        e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
      ).length;
      
      const dealsClosed = pastEvents.filter(e => e.event_outcome === 'closed').length;
      
      // Count explicit no-shows only for rate calculations
      const pastNoShows = pastEvents.filter(e => isNoShow(e)).length;
      
      // Pending PCFs = past events (scheduled_at < now) without PCF submitted, excluding cancelled
      const pendingPCFs = events?.filter(e => 
        !e.pcf_submitted && 
        new Date(e.scheduled_at) < now &&
        e.call_status !== 'cancelled' &&
        e.call_status !== 'canceled'
      ).length || 0;

      // Calculate rates using PAST events only
      // Show Rate = showed / (showed + no-shows) from past events
      const attendedOrNoShow = showedEvents + pastNoShows;
      const showRate = attendedOrNoShow > 0 ? (showedEvents / attendedOrNoShow) * 100 : 0;
      
      // Close Rate = Closed / Shows (past events)
      const closeRate = showedEvents > 0 ? (dealsClosed / showedEvents) * 100 : 0;
      
      // Offer Rate = Offers / Shows (past events)
      const offerRate = showedEvents > 0 ? (offersMade / showedEvents) * 100 : 0;

      // Calculate total revenue from payments linked to filtered events
      const eventIds = events?.map(e => e.id) || [];
      const filteredPayments = payments?.filter(p => eventIds.includes(p.event_id)) || [];
      
      const totalRevenue = filteredPayments.reduce((sum, p) => {
        const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
        const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
        return sum + (amount - refund);
      }, 0);

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
      } as DashboardMetrics;
    },
    enabled: !!user && !!orgId,
  });
}

export function useTodayMetrics() {
  const today = new Date();
  return useDashboardMetrics({
    startDate: startOfDay(today),
    endDate: endOfDay(today),
  });
}

export function useMonthMetrics() {
  const today = new Date();
  return useDashboardMetrics({
    startDate: startOfMonth(today),
    endDate: endOfMonth(today),
  });
}

export function useRevenueByCloser() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['revenue-by-closer', orgId, user?.id],
    queryFn: async () => {
      let eventsQuery = supabase
        .from('events')
        .select('id, closer_id, event_outcome');
      
      if (orgId) {
        eventsQuery = eventsQuery.eq('organization_id', orgId);
      }
      
      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      let paymentsQuery = supabase
        .from('payments')
        .select('event_id, amount, refund_amount');
      
      if (orgId) {
        paymentsQuery = paymentsQuery.eq('organization_id', orgId);
      }
      
      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('user_id, name');
      
      if (profilesError) throw profilesError;

      // Map payments to closers
      const closerRevenue: Record<string, { name: string; revenue: number; deals: number }> = {};

      events?.forEach(event => {
        if (event.closer_id && event.event_outcome === 'closed') {
          const eventPayments = payments?.filter(p => p.event_id === event.id) || [];
          const revenue = eventPayments.reduce((sum, p) => {
            const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
            const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
            return sum + (amount - refund);
          }, 0);

          const profile = profiles?.find(p => p.user_id === event.closer_id);
          const name = profile?.name || 'Unknown';

          if (!closerRevenue[event.closer_id]) {
            closerRevenue[event.closer_id] = { name, revenue: 0, deals: 0 };
          }
          closerRevenue[event.closer_id].revenue += revenue;
          closerRevenue[event.closer_id].deals += 1;
        }
      });

      return Object.entries(closerRevenue).map(([id, data]) => ({
        id,
        ...data,
      }));
    },
    enabled: !!user && !!orgId,
  });
}
