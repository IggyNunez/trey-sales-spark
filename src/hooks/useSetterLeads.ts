import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export interface Lead {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  source_id: string | null;
  organization_id: string | null;
  original_setter_name: string | null;
  current_setter_name: string | null;
  created_at: string;
  updated_at: string;
  source?: { id: string; name: string } | null;
}

/**
 * Hook for setters to fetch their own leads
 * Returns leads where the setter is either the original_setter_name or current_setter_name
 */
export function useSetterLeads(filters?: {
  startDate?: Date;
  endDate?: Date;
  sourceId?: string;
  limit?: number;
}) {
  const { user, profile, isSetter, isAdminOrAbove } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const setterName = profile?.linked_setter_name;

  return useQuery({
    queryKey: [
      'setter-leads',
      orgId,
      setterName,
      filters?.startDate?.toISOString(),
      filters?.endDate?.toISOString(),
      filters?.sourceId,
      filters?.limit,
      user?.id,
      isSetter,
    ],
    queryFn: async () => {
      let query = supabase
        .from('leads')
        .select(`
          *,
          source:sources(id, name)
        `)
        .order('created_at', { ascending: false });

      // CRITICAL: Filter by organization for data isolation
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      // For setters: filter by their setter name (original or current)
      // Admins can see all leads if they call this hook (though they'd typically use a different hook)
      if (setterName && !isAdminOrAbove) {
        query = query.or(`original_setter_name.eq.${setterName},current_setter_name.eq.${setterName}`);
      }

      // Date range filter
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate.toISOString());
      }

      // Source filter
      if (filters?.sourceId) {
        query = query.eq('source_id', filters.sourceId);
      }

      // Limit
      const effectiveLimit = filters?.limit ?? 500;
      query = query.limit(effectiveLimit);

      const { data, error } = await query;

      if (error) throw error;
      return data as Lead[];
    },
    enabled: !!user && !!orgId && (isSetter || isAdminOrAbove),
  });
}

/**
 * Hook for setters to get their lead statistics
 */
export function useSetterLeadStats() {
  const { user, profile, isSetter, isAdminOrAbove } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const setterName = profile?.linked_setter_name;

  return useQuery({
    queryKey: ['setter-lead-stats', orgId, setterName, user?.id],
    queryFn: async () => {
      if (!setterName) {
        return { totalLeads: 0, leadsThisMonth: 0, leadsThisWeek: 0 };
      }

      // Get total leads count
      let totalQuery = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId!);

      if (!isAdminOrAbove) {
        totalQuery = totalQuery.or(`original_setter_name.eq.${setterName},current_setter_name.eq.${setterName}`);
      }

      const { count: totalLeads } = await totalQuery;

      // Get leads this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      let monthQuery = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId!)
        .gte('created_at', startOfMonth.toISOString());

      if (!isAdminOrAbove) {
        monthQuery = monthQuery.or(`original_setter_name.eq.${setterName},current_setter_name.eq.${setterName}`);
      }

      const { count: leadsThisMonth } = await monthQuery;

      // Get leads this week
      const startOfWeek = new Date();
      const day = startOfWeek.getDay();
      const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
      startOfWeek.setDate(diff);
      startOfWeek.setHours(0, 0, 0, 0);

      let weekQuery = supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId!)
        .gte('created_at', startOfWeek.toISOString());

      if (!isAdminOrAbove) {
        weekQuery = weekQuery.or(`original_setter_name.eq.${setterName},current_setter_name.eq.${setterName}`);
      }

      const { count: leadsThisWeek } = await weekQuery;

      return {
        totalLeads: totalLeads ?? 0,
        leadsThisMonth: leadsThisMonth ?? 0,
        leadsThisWeek: leadsThisWeek ?? 0,
      };
    },
    enabled: !!user && !!orgId && (isSetter || isAdminOrAbove),
  });
}
