import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

// Supported target tables for enrichment
export type TargetTable = 'leads' | 'closers' | 'events' | 'setters' | 'sources';

// Field mappings: which extracted fields to copy to target record
export interface FieldMapping {
  source_field: string; // Field slug from dataset_fields
  target_column: string; // Column name in target table
}

export interface DatasetEnrichment {
  id: string;
  dataset_id: string;
  organization_id: string;
  match_field: string; // Field slug from extracted data to match on (e.g., 'email')
  target_table: TargetTable;
  target_field: string; // Column in target table to match against (e.g., 'email')
  auto_create_if_missing: boolean;
  field_mappings: FieldMapping[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Target table configurations with their matchable fields
export const TARGET_TABLE_CONFIG: Record<TargetTable, { 
  label: string; 
  matchFields: { value: string; label: string }[];
  updatableFields: { value: string; label: string; type: string }[];
}> = {
  leads: {
    label: 'Leads',
    matchFields: [
      { value: 'email', label: 'Email' },
      { value: 'phone', label: 'Phone' },
    ],
    updatableFields: [
      { value: 'full_name', label: 'Full Name', type: 'text' },
      { value: 'phone', label: 'Phone', type: 'text' },
      { value: 'original_setter_name', label: 'Original Setter Name', type: 'text' },
      { value: 'current_setter_name', label: 'Current Setter Name', type: 'text' },
    ],
  },
  closers: {
    label: 'Closers',
    matchFields: [
      { value: 'email', label: 'Email' },
      { value: 'name', label: 'Name' },
    ],
    updatableFields: [
      { value: 'name', label: 'Name', type: 'text' },
      { value: 'email', label: 'Email', type: 'text' },
    ],
  },
  events: {
    label: 'Events',
    matchFields: [
      { value: 'lead_email', label: 'Lead Email' },
      { value: 'calendly_event_uuid', label: 'Calendly Event UUID' },
    ],
    updatableFields: [
      { value: 'notes', label: 'Notes', type: 'text' },
      { value: 'call_status', label: 'Call Status', type: 'text' },
      { value: 'pcf_outcome_label', label: 'PCF Outcome Label', type: 'text' },
    ],
  },
  setters: {
    label: 'Setters',
    matchFields: [
      { value: 'email', label: 'Email' },
      { value: 'name', label: 'Name' },
    ],
    updatableFields: [
      { value: 'name', label: 'Name', type: 'text' },
      { value: 'email', label: 'Email', type: 'text' },
    ],
  },
  sources: {
    label: 'Sources',
    matchFields: [
      { value: 'name', label: 'Name' },
    ],
    updatableFields: [
      { value: 'name', label: 'Name', type: 'text' },
    ],
  },
};

// Helper to parse field_mappings from unknown JSON
function parseFieldMappings(value: unknown): FieldMapping[] {
  if (!value || !Array.isArray(value)) return [];
  return value.filter((item): item is FieldMapping => {
    return typeof item === 'object' && item !== null && 
           'source_field' in item && 'target_column' in item;
  });
}

// Hook to fetch enrichments for a dataset
export function useDatasetEnrichments(datasetId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dataset-enrichments', datasetId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_enrichments')
        .select('*')
        .eq('dataset_id', datasetId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Parse field_mappings from JSONB
      return (data || []).map(row => ({
        ...row,
        target_table: row.target_table as TargetTable,
        auto_create_if_missing: row.auto_create_if_missing ?? false,
        is_active: row.is_active ?? true,
        field_mappings: parseFieldMappings(row.field_mappings),
      })) as DatasetEnrichment[];
    },
    enabled: !!datasetId && !!orgId,
  });
}

// Hook to create an enrichment
export function useCreateDatasetEnrichment() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (enrichment: Partial<DatasetEnrichment>) => {
      const insertData = {
        dataset_id: enrichment.dataset_id!,
        organization_id: orgId!,
        match_field: enrichment.match_field || '',
        target_table: enrichment.target_table || 'leads',
        target_field: enrichment.target_field || 'email',
        auto_create_if_missing: enrichment.auto_create_if_missing ?? false,
        field_mappings: JSON.parse(JSON.stringify(enrichment.field_mappings || [])),
        is_active: enrichment.is_active ?? true,
      };

      const { data, error } = await supabase
        .from('dataset_enrichments')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;
      
      return {
        ...data,
        target_table: data.target_table as TargetTable,
        auto_create_if_missing: data.auto_create_if_missing ?? false,
        is_active: data.is_active ?? true,
        field_mappings: parseFieldMappings(data.field_mappings),
      } as DatasetEnrichment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-enrichments', data.dataset_id, orgId] });
    },
  });
}

// Hook to update an enrichment
export function useUpdateDatasetEnrichment() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DatasetEnrichment> & { id: string }) => {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (updates.match_field !== undefined) updateData.match_field = updates.match_field;
      if (updates.target_table !== undefined) updateData.target_table = updates.target_table;
      if (updates.target_field !== undefined) updateData.target_field = updates.target_field;
      if (updates.auto_create_if_missing !== undefined) updateData.auto_create_if_missing = updates.auto_create_if_missing;
      if (updates.field_mappings !== undefined) updateData.field_mappings = JSON.parse(JSON.stringify(updates.field_mappings));
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;

      const { data, error } = await supabase
        .from('dataset_enrichments')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      return {
        ...data,
        target_table: data.target_table as TargetTable,
        auto_create_if_missing: data.auto_create_if_missing ?? false,
        is_active: data.is_active ?? true,
        field_mappings: parseFieldMappings(data.field_mappings),
      } as DatasetEnrichment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-enrichments', data.dataset_id, orgId] });
    },
  });
}

// Hook to delete an enrichment
export function useDeleteDatasetEnrichment() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, datasetId }: { id: string; datasetId: string }) => {
      const { error } = await supabase
        .from('dataset_enrichments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { datasetId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-enrichments', result.datasetId, orgId] });
    },
  });
}

// Hook to toggle enrichment active state
export function useToggleDatasetEnrichment() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, isActive, datasetId }: { id: string; isActive: boolean; datasetId: string }) => {
      const { data, error } = await supabase
        .from('dataset_enrichments')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      
      return {
        ...data,
        datasetId,
        target_table: data.target_table as TargetTable,
        auto_create_if_missing: data.auto_create_if_missing ?? false,
        is_active: data.is_active ?? true,
        field_mappings: parseFieldMappings(data.field_mappings),
      } as DatasetEnrichment & { datasetId: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-enrichments', data.datasetId, orgId] });
    },
  });
}
