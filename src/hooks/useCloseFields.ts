import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';

export interface CloseFieldMapping {
  id: string;
  organization_id: string;
  close_field_id: string;
  close_field_name: string;
  close_field_type: string;
  close_field_choices: any[] | null;
  local_field_slug: string;
  is_synced: boolean;
  show_in_filters: boolean;
  show_in_dashboard: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DiscoveredField {
  close_field_id: string;
  close_field_name: string;
  close_field_type: string;
  close_field_choices: any[] | null;
  existing: {
    is_synced: boolean;
    show_in_filters: boolean;
    show_in_dashboard: boolean;
  } | null;
}

// Hook to fetch distinct Close custom field values from events for filter dropdowns
// Supports fallback to native event columns (e.g., setter_name) when Close data is sparse
export function useCloseFieldDistinctValues(fieldSlug: string) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['close-field-distinct-values', orgId, fieldSlug],
    queryFn: async () => {
      if (!fieldSlug) return [];
      
      // Fetch events with the close_custom_fields JSONB column
      const { data, error } = await supabase
        .from('events')
        .select('close_custom_fields, setter_name')
        .eq('organization_id', orgId)
        .order('scheduled_at', { ascending: false })
        .limit(2000);

      if (error) throw error;

      // Extract unique values for the specific field
      const valuesSet = new Set<string>();
      (data || []).forEach((event) => {
        const closeFields = event.close_custom_fields as Record<string, unknown> | null;
        
        // Try Close custom field first
        if (closeFields) {
          const value = closeFields[fieldSlug];
          if (value && typeof value === 'string' && value.trim()) {
            // Filter out ID-like values (e.g., user_d9Zd9PKljd5pAOxg...)
            if (!value.startsWith('user_') && !/^[a-f0-9-]{36}$/i.test(value)) {
              valuesSet.add(value);
            }
            return;
          }
        }
        
        // Fallback: if fieldSlug is 'setter_name', use native event.setter_name column
        if (fieldSlug === 'setter_name' && event.setter_name && event.setter_name.trim()) {
          const setterName = event.setter_name.trim();
          // Filter out ID-like values
          if (!setterName.startsWith('user_') && !/^[a-f0-9-]{36}$/i.test(setterName)) {
            valuesSet.add(setterName);
          }
        }
      });

      return Array.from(valuesSet).sort();
    },
    enabled: !!orgId && !!fieldSlug,
    staleTime: 60 * 1000, // Cache for 1 minute (faster refresh after sync)
  });
}

export function useCloseFieldMappings() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['close-field-mappings', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('close_field_mappings')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as CloseFieldMapping[];
    },
    enabled: !!orgId,
  });
}

export function useSyncedCloseFields() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['close-field-mappings-synced', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('close_field_mappings')
        .select('*')
        .eq('organization_id', orgId)
        .eq('is_synced', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as CloseFieldMapping[];
    },
    enabled: !!orgId,
  });
}

export function useFilterableCloseFields() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['close-field-mappings-filterable', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('close_field_mappings')
        .select('*')
        .eq('organization_id', orgId)
        .eq('show_in_filters', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as CloseFieldMapping[];
    },
    enabled: !!orgId,
  });
}

export function useDiscoverCloseFields() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization selected');

      const { data, error } = await supabase.functions.invoke('fetch-close-custom-fields', {
        body: { action: 'discover', organizationId: orgId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data.fields as DiscoveredField[];
    },
    onError: (error) => {
      toast.error('Failed to discover Close fields', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

export function useSaveCloseFieldMappings() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (fields: Partial<DiscoveredField & { is_synced?: boolean; show_in_filters?: boolean; show_in_dashboard?: boolean; sort_order?: number }>[]) => {
      if (!orgId) throw new Error('No organization selected');

      const { data, error } = await supabase.functions.invoke('fetch-close-custom-fields', {
        body: { action: 'save', organizationId: orgId, fields },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-field-mappings'] });
      toast.success('Field mappings saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save field mappings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

export function useUpdateCloseFieldMapping() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<CloseFieldMapping>;
    }) => {
      if (!orgId) throw new Error('No organization selected');

      const { error } = await supabase
        .from('close_field_mappings')
        .update(updates)
        .eq('id', id)
        .eq('organization_id', orgId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-field-mappings'] });
    },
    onError: (error) => {
      toast.error('Failed to update field mapping', {
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    },
  });
}

export function usePreviewCloseField() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (email: string) => {
      if (!orgId) throw new Error('No organization selected');

      const { data, error } = await supabase.functions.invoke('fetch-close-custom-fields', {
        body: { action: 'preview', organizationId: orgId, email },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data.lead;
    },
  });
}
