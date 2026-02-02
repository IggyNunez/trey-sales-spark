import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { buildCloserDisplayNameMap } from '@/lib/identityResolver';

/**
 * Fetch closer display names for the current organization
 * Returns a Map for O(1) lookup performance
 */
export function useCloserDisplayNames() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data: closers, isLoading, error } = useQuery({
    queryKey: ['closers-display-names', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('id, name, email, display_name')
        .eq('organization_id', orgId!);
      
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
  
  const displayNameMap = closers 
    ? buildCloserDisplayNameMap(closers) 
    : new Map<string, string>();
  
  return {
    displayNameMap,
    closers,
    isLoading,
    error,
  };
}
