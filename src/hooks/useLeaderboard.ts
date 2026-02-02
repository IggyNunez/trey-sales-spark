import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export interface SalesRepStats {
  userId: string;
  name: string;
  email: string;
  totalCalls: number;
  completedCalls: number;
  noShows: number;
  showRate: number;
  offersMade: number;
  dealsClosed: number;
  closeRate: number;
  offerRate: number;
  totalRevenue: number;
  avgDealSize: number;
}

interface LeaderboardFilters {
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'revenue' | 'closeRate' | 'dealsClosed' | 'completedCalls';
}

export function useLeaderboard(filters?: LeaderboardFilters) {
  const { user, isAdmin } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: [
      'leaderboard',
      orgId,
      filters?.startDate?.toISOString(),
      filters?.endDate?.toISOString(),
      filters?.sortBy,
      user?.id,
    ],
    queryFn: async () => {
      // CRITICAL: First get organization members to filter profiles by org
      let orgMemberUserIds: string[] = [];
      if (orgId) {
        const { data: orgMembers, error: orgMembersError } = await supabase
          .from('organization_members')
          .select('user_id')
          .eq('organization_id', orgId);

        if (orgMembersError) throw orgMembersError;
        orgMemberUserIds = orgMembers?.map(m => m.user_id) || [];
      }

      // Fetch profiles - only those in the current org
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, name, email');

      if (profilesError) throw profilesError;

      // Filter profiles to only org members
      const orgProfiles = orgId
        ? profiles?.filter(p => orgMemberUserIds.includes(p.user_id)) || []
        : profiles || [];

      // Fetch user roles for org members only
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Filter to only sales reps and admins who are also org members
      const salesRepUserIds = userRoles
        ?.filter(r => r.role === 'sales_rep' || r.role === 'admin')
        .map(r => r.user_id) || [];

      const salesProfiles = orgProfiles.filter(p => salesRepUserIds.includes(p.user_id));

      // Fetch all events for this organization
      let eventsQuery = supabase.from('events').select('*');
      
      if (orgId) {
        eventsQuery = eventsQuery.eq('organization_id', orgId);
      }
      // Apply date filters - default to past events only if no explicit range
      const nowISO = new Date().toISOString();
      if (filters?.startDate) {
        eventsQuery = eventsQuery.gte('scheduled_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        eventsQuery = eventsQuery.lte('scheduled_at', filters.endDate.toISOString());
      } else if (!filters?.startDate && !filters?.endDate) {
        // Default: only show past events when no date range is selected
        eventsQuery = eventsQuery.lt('scheduled_at', nowISO);
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

      // Calculate stats per sales rep
      const now = new Date();
      const stats: SalesRepStats[] = salesProfiles.map(profile => {
        const repEvents = events?.filter(e => e.closer_id === profile.user_id) || [];
        
        // Filter to only PAST events for rate calculations
        const pastRepEvents = repEvents.filter(e => new Date(e.scheduled_at) < now);
        
        const totalCalls = repEvents.length;
        const completedCalls = repEvents.filter(e => e.call_status === 'completed').length;
        const noShows = repEvents.filter(e => e.call_status === 'no_show').length;
        
        // Only count showed/offers/closed from PAST events
        const showedEvents = pastRepEvents.filter(e => 
          e.event_outcome && e.event_outcome !== 'no_show'
        ).length;
        
        const offersMade = pastRepEvents.filter(e => 
          e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
        ).length;
        
        const dealsClosed = pastRepEvents.filter(e => e.event_outcome === 'closed').length;
        
        // Count past no-shows for rate calculation
        const pastNoShows = pastRepEvents.filter(e => e.call_status === 'no_show').length;

        // Calculate revenue
        const eventIds = repEvents.map(e => e.id);
        const repPayments = payments?.filter(p => eventIds.includes(p.event_id)) || [];
        const totalRevenue = repPayments.reduce((sum, p) => {
          const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
          const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
          return sum + (amount - refund);
        }, 0);

        // Calculate rates using PAST events only
        // Show Rate = showed / (showed + no-shows) from past events
        const attendedOrNoShow = showedEvents + pastNoShows;
        const showRate = attendedOrNoShow > 0 ? (showedEvents / attendedOrNoShow) * 100 : 0;
        const closeRate = showedEvents > 0 ? (dealsClosed / showedEvents) * 100 : 0;
        const offerRate = showedEvents > 0 ? (offersMade / showedEvents) * 100 : 0;
        const avgDealSize = dealsClosed > 0 ? totalRevenue / dealsClosed : 0;

        return {
          userId: profile.user_id,
          name: profile.name,
          email: profile.email,
          totalCalls,
          completedCalls,
          noShows,
          showRate: Math.round(showRate * 10) / 10,
          offersMade,
          dealsClosed,
          closeRate: Math.round(closeRate * 10) / 10,
          offerRate: Math.round(offerRate * 10) / 10,
          totalRevenue,
          avgDealSize: Math.round(avgDealSize),
        };
      });

      // Sort by selected metric
      const sortBy = filters?.sortBy || 'revenue';
      stats.sort((a, b) => {
        switch (sortBy) {
          case 'revenue':
            return b.totalRevenue - a.totalRevenue;
          case 'closeRate':
            return b.closeRate - a.closeRate;
          case 'dealsClosed':
            return b.dealsClosed - a.dealsClosed;
          case 'completedCalls':
            return b.completedCalls - a.completedCalls;
          default:
            return b.totalRevenue - a.totalRevenue;
        }
      });

      return stats;
    },
    enabled: !!user && isAdmin && !!orgId,
  });
}
