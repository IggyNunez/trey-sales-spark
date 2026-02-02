import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface RepStats {
  bookedCalls: number;
  completedCalls: number;
  showRate: number;
  closeRate: number;
  offersMade: number;
  dealsClosed: number;
  cashCollected: number;
}

export function useRepStats(startDate?: Date, endDate?: Date) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const monthStart = startDate || startOfMonth(new Date());
  const monthEnd = endDate || endOfMonth(startDate || new Date());

  return useQuery({
    queryKey: ['rep-stats', orgId, user?.id, monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async (): Promise<RepStats> => {
      if (!user) throw new Error('Not authenticated');

      // RLS policies filter events by linked_closer_name or email
      // So we just fetch all events we have access to in the date range
      let eventsQuery = supabase
        .from('events')
        .select('*')
        .gte('scheduled_at', monthStart.toISOString())
        .lte('scheduled_at', monthEnd.toISOString());
      
      if (orgId) {
        eventsQuery = eventsQuery.eq('organization_id', orgId);
      }
      
      const { data: events, error: eventsError } = await eventsQuery;

      if (eventsError) throw eventsError;

      const now = new Date();

      // Get payments - for sales reps, we need to match by their events
      // This is simpler since they can only see their own events
      const eventIds = events?.map(e => e.id) || [];
      
      let cashCollected = 0;
      if (eventIds.length > 0) {
        // CRITICAL: Include org filter for data isolation
        let paymentsQuery = supabase
          .from('payments')
          .select('amount, net_revenue')
          .in('event_id', eventIds);

        if (orgId) {
          paymentsQuery = paymentsQuery.eq('organization_id', orgId);
        }

        const { data: payments, error: paymentsError } = await paymentsQuery;

        if (paymentsError) throw paymentsError;
        cashCollected = payments?.reduce((sum, p) => sum + Number(p.net_revenue || p.amount || 0), 0) || 0;
      }

      // Booked calls = all events in range excluding canceled/rescheduled
      const bookedCalls = events?.filter(e => e.call_status !== 'canceled' && e.call_status !== 'rescheduled').length || 0;
      
      // IMPORTANT: Filter to PAST events only for outcome-based metrics
      // Future calls shouldn't affect show rate since they haven't occurred yet
      const pastEvents = events?.filter(e => 
        new Date(e.scheduled_at) < now && 
        e.call_status !== 'canceled' && 
        e.call_status !== 'rescheduled'
      ) || [];

      const showedEvents = pastEvents.filter(e => 
        e.event_outcome && e.event_outcome !== 'no_show'
      );
      const completedCalls = showedEvents.length;
      const noShows = pastEvents.filter(e => e.event_outcome === 'no_show').length;
      const offersMade = pastEvents.filter(e => 
        e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
      ).length;
      const dealsClosed = pastEvents.filter(e => e.event_outcome === 'closed').length;
      
      // Show Rate = showed / (showed + no-shows) - only count calls where outcome is determined
      const attendedOrNoShow = completedCalls + noShows;
      const showRate = attendedOrNoShow > 0 ? Math.round((completedCalls / attendedOrNoShow) * 100) : 0;
      const closeRate = completedCalls > 0 ? Math.round((dealsClosed / completedCalls) * 100) : 0;

      return {
        bookedCalls,
        completedCalls,
        showRate,
        closeRate,
        offersMade,
        dealsClosed,
        cashCollected,
      };
    },
    enabled: !!user && !!orgId,
  });
}
