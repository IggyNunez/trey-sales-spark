import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { buildAliasMap } from '@/lib/identityResolver';

export interface SetterAlias {
  id: string;
  alias_name: string;
  canonical_name: string;
  organization_id: string;
  created_at: string;
}

/**
 * Fetch setter aliases for the current organization
 * Returns a Map for O(1) lookup performance
 */
export function useSetterAliases() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['setter-aliases', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setter_aliases')
        .select('id, alias_name, canonical_name, organization_id, created_at')
        .eq('organization_id', orgId!);
      
      if (error) throw error;
      
      return data as SetterAlias[];
    },
    enabled: !!orgId,
  });
}

/**
 * Returns the alias map directly for O(1) lookup
 * Use this in aggregation hooks for performance
 */
export function useSetterAliasMap() {
  const { data: aliases, isLoading, error } = useSetterAliases();
  
  const aliasMap = aliases ? buildAliasMap(aliases) : new Map<string, string>();
  
  return {
    aliasMap,
    isLoading,
    error,
  };
}
