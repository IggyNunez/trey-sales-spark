import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export interface Package {
  id: string;
  name: string;
  default_price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export function usePackages() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['packages', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as Package[];
    },
    enabled: !!orgId,
  });
}
