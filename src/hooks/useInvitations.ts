import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';

export type InviteType = 'whitelabel' | 'sales_rep' | 'admin';
export type InviteRole = 'admin' | 'member';

export interface Invitation {
  id: string;
  email: string;
  invite_type: InviteType;
  organization_id: string | null;
  invited_by: string | null;
  token: string;
  status: 'pending' | 'accepted' | 'expired';
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
  closer_name: string | null;
  role: InviteRole | null;
}

export function useInvitations(type?: InviteType) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['invitations', orgId, type],
    queryFn: async () => {
      let query = supabase
        .from('invitations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      if (type) {
        query = query.eq('invite_type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Invitation[];
    },
    enabled: !!orgId,
  });
}

export function useCreateInvitation() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();

  return useMutation({
    mutationFn: async ({ 
      email, 
      inviteType, 
      closerName,
      role,
    }: { 
      email: string; 
      inviteType: InviteType;
      closerName?: string;
      role?: InviteRole;
    }) => {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          email,
          invite_type: inviteType,
          organization_id: currentOrganization?.id || null,
          invited_by: user?.id,
          closer_name: closerName || null,
          role: role || 'member',
        })
        .select()
        .single();

      if (error) throw error;
      return data as Invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

export function useDeleteInvitation() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      // CRITICAL: Include org filter to prevent cross-org deletions
      let query = supabase
        .from('invitations')
        .delete()
        .eq('id', id);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { error } = await query;

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      // CRITICAL: Include org filter to prevent cross-org updates
      let query = supabase
        .from('invitations')
        .update({
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'pending',
        })
        .eq('id', id);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query.select().single();

      if (error) throw error;
      return data as Invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}

export function useUpdateInvitationRole() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, role }: { id: string; role: InviteRole }) => {
      let query = supabase
        .from('invitations')
        .update({ role })
        .eq('id', id);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query.select().single();

      if (error) throw error;
      return data as Invitation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
  });
}
