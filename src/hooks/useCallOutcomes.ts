import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface CallOutcome {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface OpportunityStatus {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_active: boolean;
}

export function useCallOutcomes() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['call-outcomes', orgId],
    queryFn: async () => {
      let query = supabase
        .from('call_outcomes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CallOutcome[];
    },
    enabled: !!orgId,
  });
}

export function useOpportunityStatuses() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['opportunity-statuses', orgId],
    queryFn: async () => {
      let query = supabase
        .from('opportunity_statuses')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OpportunityStatus[];
    },
    enabled: !!orgId,
  });
}
