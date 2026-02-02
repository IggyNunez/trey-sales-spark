import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';
import type { MetricDefinition, FilterCondition } from '@/types/customMetrics';

interface DbMetricDefinition {
  id: string;
  organization_id: string | null;
  name: string;
  display_name: string;
  description: string | null;
  formula_type: string;
  data_source: string | null;
  date_field: string | null;
  numerator_field: string | null;
  denominator_field: string | null;
  numerator_conditions: Record<string, unknown> | null;
  denominator_conditions: Record<string, unknown> | null;
  include_no_shows: boolean | null;
  include_cancels: boolean | null;
  include_reschedules: boolean | null;
  exclude_overdue_pcf: boolean | null;
  pcf_field_id: string | null;
  sort_order: number | null;
  is_active: boolean | null;
  created_at: string;
  updated_at: string;
}

function parseConditions(conditions: Record<string, unknown> | null): FilterCondition[] {
  if (!conditions) return [];
  if (Array.isArray(conditions)) return conditions as FilterCondition[];
  // Handle object format
  if (typeof conditions === 'object') {
    const result: FilterCondition[] = [];
    for (const [field, value] of Object.entries(conditions)) {
      if (value !== undefined && value !== null) {
        result.push({
          field,
          operator: 'equals',
          value: String(value),
        });
      }
    }
    return result;
  }
  return [];
}

function transformDbToMetric(db: DbMetricDefinition): MetricDefinition {
  // Determine default date_field based on data_source
  const defaultDateField = db.data_source === 'payments' ? 'payment_date' : 'scheduled_at';
  
  return {
    id: db.id,
    organization_id: db.organization_id || '',
    name: db.name,
    display_name: db.display_name,
    description: db.description,
    formula_type: db.formula_type as MetricDefinition['formula_type'],
    data_source: (db.data_source as MetricDefinition['data_source']) || 'events',
    date_field: (db.date_field as MetricDefinition['date_field']) || defaultDateField,
    numerator_field: db.numerator_field,
    denominator_field: db.denominator_field,
    numerator_conditions: parseConditions(db.numerator_conditions),
    denominator_conditions: parseConditions(db.denominator_conditions),
    include_no_shows: db.include_no_shows ?? true,
    include_cancels: db.include_cancels ?? false,
    include_reschedules: db.include_reschedules ?? false,
    exclude_overdue_pcf: db.exclude_overdue_pcf ?? false,
    pcf_field_id: db.pcf_field_id || undefined,
    sort_order: db.sort_order ?? 0,
    is_active: db.is_active ?? true,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
}

export function useMetricDefinitions() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['metric-definitions', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('organization_id', orgId!)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data as DbMetricDefinition[]).map(transformDbToMetric);
    },
    enabled: !!orgId,
  });
}

export function useActiveMetricDefinitions() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['metric-definitions', orgId, 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metric_definitions')
        .select('*')
        .eq('organization_id', orgId!)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return (data as DbMetricDefinition[]).map(transformDbToMetric);
    },
    enabled: !!orgId,
  });
}

export function useCreateMetricDefinition() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();

  return useMutation({
    mutationFn: async (metric: Partial<MetricDefinition>) => {
      // Determine default date_field based on data_source
      const defaultDateField = metric.data_source === 'payments' ? 'payment_date' : 'scheduled_at';
      
      const { data, error } = await supabase
        .from('metric_definitions')
        .insert({
          organization_id: currentOrganization?.id,
          name: metric.name || '',
          display_name: metric.display_name || '',
          description: metric.description || null,
          formula_type: metric.formula_type || 'count',
          data_source: metric.data_source || 'events',
          date_field: metric.date_field || defaultDateField,
          numerator_field: metric.numerator_field || null,
          denominator_field: metric.denominator_field || null,
          numerator_conditions: metric.numerator_conditions || {},
          denominator_conditions: metric.denominator_conditions || {},
          include_no_shows: metric.include_no_shows ?? true,
          include_cancels: metric.include_cancels ?? false,
          include_reschedules: metric.include_reschedules ?? false,
          exclude_overdue_pcf: metric.exclude_overdue_pcf ?? false,
          sort_order: metric.sort_order ?? 0,
          is_active: metric.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['custom-metrics-values'] });
      toast.success('Metric created successfully');
    },
    onError: (error) => {
      toast.error('Failed to create metric: ' + error.message);
    },
  });
}

export function useUpdateMetricDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<MetricDefinition> & { id: string }) => {
      const updatePayload: Record<string, unknown> = {};
      
      if (updates.name !== undefined) updatePayload.name = updates.name;
      if (updates.display_name !== undefined) updatePayload.display_name = updates.display_name;
      if (updates.description !== undefined) updatePayload.description = updates.description;
      if (updates.formula_type !== undefined) updatePayload.formula_type = updates.formula_type;
      if (updates.data_source !== undefined) updatePayload.data_source = updates.data_source;
      if (updates.date_field !== undefined) updatePayload.date_field = updates.date_field;
      if (updates.numerator_field !== undefined) updatePayload.numerator_field = updates.numerator_field;
      if (updates.denominator_field !== undefined) updatePayload.denominator_field = updates.denominator_field;
      if (updates.numerator_conditions !== undefined) updatePayload.numerator_conditions = updates.numerator_conditions;
      if (updates.denominator_conditions !== undefined) updatePayload.denominator_conditions = updates.denominator_conditions;
      if (updates.include_no_shows !== undefined) updatePayload.include_no_shows = updates.include_no_shows;
      if (updates.include_cancels !== undefined) updatePayload.include_cancels = updates.include_cancels;
      if (updates.include_reschedules !== undefined) updatePayload.include_reschedules = updates.include_reschedules;
      if (updates.exclude_overdue_pcf !== undefined) updatePayload.exclude_overdue_pcf = updates.exclude_overdue_pcf;
      if (updates.sort_order !== undefined) updatePayload.sort_order = updates.sort_order;
      if (updates.is_active !== undefined) updatePayload.is_active = updates.is_active;

      const { data, error } = await supabase
        .from('metric_definitions')
        .update(updatePayload)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['custom-metrics-values'] });
      toast.success('Metric updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update metric: ' + error.message);
    },
  });
}

export function useDeleteMetricDefinition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('metric_definitions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['custom-metrics-values'] });
      toast.success('Metric deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete metric: ' + error.message);
    },
  });
}

export function useReorderMetrics() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      // Update each metric's sort_order
      const updates = orderedIds.map((id, index) => 
        supabase
          .from('metric_definitions')
          .update({ sort_order: index })
          .eq('id', id)
      );
      
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
    },
    onError: (error) => {
      toast.error('Failed to reorder metrics: ' + error.message);
    },
  });
}
