import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface Source {
  id: string;
  name: string;
  organization_id: string | null;
  created_at: string;
}

export function useSources() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['sources', orgId],
    queryFn: async () => {
      let query = supabase
        .from('sources')
        .select('*')
        .order('name');

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Source[];
    },
    enabled: !!orgId,
  });
}
