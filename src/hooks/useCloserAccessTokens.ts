import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export interface CloserAccessToken {
  id: string;
  token: string;
  closer_name: string;
  organization_id: string | null;
  created_by: string | null;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export function useCloserAccessTokens() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['closer-access-tokens', orgId],
    queryFn: async () => {
      let query = supabase
        .from('closer_access_tokens')
        .select('*')
        .order('closer_name', { ascending: true });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CloserAccessToken[];
    },
    enabled: !!orgId,
  });
}

export function useCreateCloserAccessToken() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();

  return useMutation({
    mutationFn: async ({ 
      closerName, 
    }: { 
      closerName: string; 
    }) => {
      const { data, error } = await supabase
        .from('closer_access_tokens')
        .insert({
          closer_name: closerName,
          organization_id: currentOrganization?.id || null,
          created_by: user?.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CloserAccessToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closer-access-tokens'] });
    },
  });
}

export function useRegenerateCloserAccessToken() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      // CRITICAL: Include org filter to prevent cross-org token regeneration
      let fetchQuery = supabase
        .from('closer_access_tokens')
        .select('closer_name, organization_id, created_by')
        .eq('id', id);

      if (orgId) {
        fetchQuery = fetchQuery.eq('organization_id', orgId);
      }

      const { data: existing, error: fetchError } = await fetchQuery.single();

      if (fetchError) throw fetchError;

      // Delete the old token with org filter
      let deleteQuery = supabase
        .from('closer_access_tokens')
        .delete()
        .eq('id', id);

      if (orgId) {
        deleteQuery = deleteQuery.eq('organization_id', orgId);
      }

      const { error: deleteError } = await deleteQuery;

      if (deleteError) throw deleteError;

      // Create a new one with a fresh token
      const { data, error } = await supabase
        .from('closer_access_tokens')
        .insert({
          closer_name: existing.closer_name,
          organization_id: existing.organization_id,
          created_by: existing.created_by,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CloserAccessToken;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closer-access-tokens'] });
    },
  });
}

export function useDeleteCloserAccessToken() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      // CRITICAL: Include org filter to prevent cross-org deletions
      let query = supabase
        .from('closer_access_tokens')
        .delete()
        .eq('id', id);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closer-access-tokens'] });
    },
  });
}

export function useValidateCloserToken() {
  return useMutation({
    mutationFn: async (token: string) => {
      const { data, error } = await supabase
        .from('closer_access_tokens')
        .select('*')
        .eq('token', token)
        .eq('is_active', true)
        .single();

      if (error) throw error;

      // Update last_used_at
      await supabase
        .from('closer_access_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

      return data as CloserAccessToken;
    },
  });
}
