import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

// Formula types supported by the calculation engine
export type FormulaType = 'expression' | 'aggregation' | 'date_diff' | 'conditional';
export type TimeScope = 'all' | 'today' | 'week' | 'month' | 'quarter' | 'year' | 'mtd' | 'ytd' | 'rolling_7d' | 'rolling_30d' | 'custom';
export type RefreshMode = 'realtime' | 'on_insert' | 'manual';
export type ComparisonPeriod = 'previous_period' | 'previous_year' | 'none';

export interface CalculatedField {
  id: string;
  dataset_id: string;
  organization_id: string;
  field_slug: string;
  display_name: string;
  formula_type: FormulaType;
  formula: string;
  time_scope: TimeScope;
  comparison_period: ComparisonPeriod | null;
  refresh_mode: RefreshMode;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Formula examples for the UI
export const FORMULA_EXAMPLES = {
  expression: [
    { label: 'Percentage', formula: '(field_a / field_b) * 100', description: 'Calculate percentage' },
    { label: 'Commission', formula: 'amount * 0.1', description: '10% of amount' },
    { label: 'Markup', formula: 'cost * 1.25', description: '25% markup on cost' },
    { label: 'Difference', formula: 'revenue - expenses', description: 'Net calculation' },
  ],
  aggregation: [
    { label: 'Total', formula: 'SUM(amount)', description: 'Sum of all amounts' },
    { label: 'Average', formula: 'AVG(amount)', description: 'Average amount' },
    { label: 'Count', formula: 'COUNT(*)', description: 'Count all records' },
    { label: 'Count If', formula: 'COUNT(status = "paid")', description: 'Count with filter' },
    { label: 'Sum If', formula: 'SUM(amount WHERE status = "completed")', description: 'Conditional sum' },
  ],
  date_diff: [
    { label: 'Days Since', formula: 'DAYS_SINCE(created_at)', description: 'Days from date to now' },
    { label: 'Days Between', formula: 'DAYS_BETWEEN(start_date, end_date)', description: 'Days between two dates' },
    { label: 'Age in Months', formula: 'MONTHS_SINCE(birth_date)', description: 'Age in months' },
    { label: 'Hours Elapsed', formula: 'HOURS_SINCE(last_activity)', description: 'Hours since activity' },
  ],
  conditional: [
    { label: 'Status Label', formula: 'IF(amount > 1000, "High", "Low")', description: 'Conditional value' },
    { label: 'Tier', formula: 'CASE(amount, [0, 100, "Bronze"], [100, 500, "Silver"], [500, null, "Gold"])', description: 'Range-based tier' },
  ],
};

export const FORMULA_TYPE_OPTIONS = [
  { value: 'expression', label: 'Math Expression', icon: 'Calculator', description: 'Arithmetic on fields (e.g., revenue * 0.1)' },
  { value: 'aggregation', label: 'Aggregation', icon: 'BarChart3', description: 'SUM, COUNT, AVG across records' },
  { value: 'date_diff', label: 'Date Calculation', icon: 'Calendar', description: 'Days between, age, time since' },
  { value: 'conditional', label: 'Conditional', icon: 'GitBranch', description: 'IF/CASE logic' },
] as const;

export const TIME_SCOPE_OPTIONS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'mtd', label: 'Month to Date' },
  { value: 'quarter', label: 'This Quarter' },
  { value: 'year', label: 'This Year' },
  { value: 'ytd', label: 'Year to Date' },
  { value: 'rolling_7d', label: 'Rolling 7 Days' },
  { value: 'rolling_30d', label: 'Rolling 30 Days' },
] as const;

export const REFRESH_MODE_OPTIONS = [
  { value: 'realtime', label: 'Real-time', description: 'Calculate on every view' },
  { value: 'on_insert', label: 'On Insert', description: 'Calculate when new records arrive' },
  { value: 'manual', label: 'Manual', description: 'Only update on demand' },
] as const;

// Hook to fetch calculated fields for a dataset
export function useCalculatedFields(datasetId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['calculated-fields', datasetId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_calculated_fields')
        .select('*')
        .eq('dataset_id', datasetId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as CalculatedField[];
    },
    enabled: !!datasetId && !!orgId,
  });
}

// Hook to create a calculated field
export function useCreateCalculatedField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (field: Partial<CalculatedField>) => {
      const { data, error } = await supabase
        .from('dataset_calculated_fields')
        .insert({
          dataset_id: field.dataset_id!,
          organization_id: orgId!,
          field_slug: field.field_slug || '',
          display_name: field.display_name || '',
          formula_type: field.formula_type || 'expression',
          formula: field.formula || '',
          time_scope: field.time_scope || 'all',
          comparison_period: field.comparison_period || null,
          refresh_mode: field.refresh_mode || 'realtime',
          is_active: field.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CalculatedField;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calculated-fields', data.dataset_id, orgId] });
    },
  });
}

// Hook to update a calculated field
export function useUpdateCalculatedField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CalculatedField> & { id: string }) => {
      const { data, error } = await supabase
        .from('dataset_calculated_fields')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CalculatedField;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calculated-fields', data.dataset_id, orgId] });
    },
  });
}

// Hook to delete a calculated field
export function useDeleteCalculatedField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, datasetId }: { id: string; datasetId: string }) => {
      const { error } = await supabase
        .from('dataset_calculated_fields')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { datasetId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['calculated-fields', result.datasetId, orgId] });
    },
  });
}
