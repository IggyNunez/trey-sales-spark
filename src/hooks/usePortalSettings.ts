import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface PortalSettings {
  id: string;
  organization_id: string | null;
  show_booked_calls: boolean;
  show_show_rate: boolean;
  show_close_rate: boolean;
  show_cash_collected: boolean;
  show_upcoming_events: boolean;
  show_overdue_pcfs: boolean;
  show_past_events: boolean;
  custom_domain: string | null;
  created_at: string;
  updated_at: string;
}

// Helper to get the portal base URL (custom domain or current origin)
export function getPortalBaseUrl(portalSettings: PortalSettings | null | undefined): string {
  if (portalSettings?.custom_domain) {
    // Ensure it has https:// prefix
    const domain = portalSettings.custom_domain.trim();
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      return domain.replace(/\/$/, ''); // Remove trailing slash
    }
    return `https://${domain}`;
  }
  return window.location.origin;
}

export function usePortalSettings() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['portal-settings', orgId],
    queryFn: async (): Promise<PortalSettings | null> => {
      let query = supabase
        .from('portal_settings')
        .select('*')
        .limit(1);
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      
      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data as PortalSettings | null;
    },
    enabled: !!orgId,
  });
}

export function useUpdatePortalSettings() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (settings: Partial<PortalSettings> & { id: string }) => {
      const { id, ...updateData } = settings;

      // CRITICAL: Include org filter to prevent cross-org updates
      let query = supabase
        .from('portal_settings')
        .update(updateData)
        .eq('id', id);

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query.select().single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portal-settings'] });
    },
  });
}
