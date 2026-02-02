import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

// Feature flag - only enabled for Data In Motion org
const DATA_IN_MOTION_ORG_ID = 'c85abed2-6ae7-4388-806e-3d60a09d558d';

export function useIsWebhookDashboardEnabled() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id === DATA_IN_MOTION_ORG_ID;
}

// Types for the webhook dashboard system
export interface Dataset {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  retention_days: number;
  realtime_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface DatasetField {
  id: string;
  dataset_id: string;
  organization_id: string;
  field_slug: string;
  field_name: string;
  field_type: 'text' | 'number' | 'currency' | 'boolean' | 'date' | 'datetime' | 'json' | 'array';
  source_type: 'mapped' | 'calculated' | 'enriched';
  source_config: {
    webhook_connection_id?: string;
    json_path?: string;
    fallback_paths?: string[];
    default_value?: any;
  };
  formula: string | null;
  format: string | null;
  is_visible: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface DatasetRecord {
  id: string;
  dataset_id: string;
  organization_id: string;
  webhook_connection_id: string | null;
  raw_payload: Record<string, any>;
  extracted_data: Record<string, any>;
  processing_status: 'success' | 'partial' | 'failed';
  error_message: string | null;
  created_at: string;
}

export interface WebhookDashboard {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_shared: boolean;
  share_token: string | null;
  layout_config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface DashboardWidget {
  id: string;
  dashboard_id: string;
  organization_id: string;
  dataset_id: string;
  widget_type: 'card' | 'line' | 'bar' | 'pie' | 'table' | 'number' | 'gauge' | 'multi-bar' | 'summary' | 'notes';
  title: string | null;
  metric_config: {
    field?: string;
    aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';
    groupBy?: string;
    filters?: Array<{ field: string; op: string; value: any }>;
  };
  chart_config: Record<string, any>;
  filters: Array<{ field: string; op: string; value: any }>;
  comparison_enabled: boolean;
  position: { x: number; y: number; w: number; h: number };
  refresh_interval_seconds: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Hook to fetch datasets
export function useDatasets() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['datasets', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Dataset[];
    },
    enabled: !!orgId,
  });
}

// Hook to fetch a single dataset with its fields
export function useDataset(datasetId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dataset', datasetId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datasets')
        .select('*')
        .eq('id', datasetId)
        .eq('organization_id', orgId)
        .single();
      
      if (error) throw error;
      return data as Dataset;
    },
    enabled: !!datasetId && !!orgId,
  });
}

// Hook to fetch dataset fields
export function useDatasetFields(datasetId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dataset-fields', datasetId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_fields')
        .select('*')
        .eq('dataset_id', datasetId)
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as DatasetField[];
    },
    enabled: !!datasetId && !!orgId,
  });
}

// Hook to fetch dataset records with real-time subscription
export function useDatasetRecords(datasetId: string | undefined, limit = 100) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['dataset-records', datasetId, orgId, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_records')
        .select('*')
        .eq('dataset_id', datasetId)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data as DatasetRecord[];
    },
    enabled: !!datasetId && !!orgId,
  });

  // Real-time subscription effect - properly handled with useEffect pattern via staleTime
  useQuery({
    queryKey: ['dataset-records-subscription', datasetId, orgId],
    queryFn: async () => {
      if (!datasetId || !orgId) return null;

      const channel = supabase
        .channel(`dataset-records-${datasetId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'dataset_records',
            filter: `dataset_id=eq.${datasetId}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ['dataset-records', datasetId, orgId] });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    },
    enabled: !!datasetId && !!orgId,
    staleTime: Infinity, // Keep subscription alive
  });

  return query;
}

// Hook to fetch webhook dashboards
export function useWebhookDashboards() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['webhook-dashboards', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_dashboards')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as WebhookDashboard[];
    },
    enabled: !!orgId,
  });
}

// Hook to fetch dashboard widgets
export function useDashboardWidgets(dashboardId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dashboard-widgets', dashboardId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .select('*')
        .eq('dashboard_id', dashboardId)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as DashboardWidget[];
    },
    enabled: !!dashboardId && !!orgId,
  });
}

// Mutation hooks
export function useCreateDataset() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (dataset: Partial<Dataset>) => {
      const { data, error } = await supabase
        .from('datasets')
        .insert({
          name: dataset.name || '',
          description: dataset.description || null,
          icon: dataset.icon || null,
          color: dataset.color || null,
          retention_days: dataset.retention_days || 90,
          realtime_enabled: dataset.realtime_enabled ?? true,
          organization_id: orgId!,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', orgId] });
    },
  });
}

export function useUpdateDataset() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Dataset> & { id: string }) => {
      const { data, error } = await supabase
        .from('datasets')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['datasets', orgId] });
      queryClient.invalidateQueries({ queryKey: ['dataset', variables.id, orgId] });
    },
  });
}

export function useDeleteDataset() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('datasets')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['datasets', orgId] });
    },
  });
}

export function useCreateDatasetField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (field: Partial<DatasetField>) => {
      const { data, error } = await supabase
        .from('dataset_fields')
        .insert({
          dataset_id: field.dataset_id!,
          field_slug: field.field_slug || '',
          field_name: field.field_name || '',
          field_type: field.field_type || 'text',
          source_type: field.source_type || 'mapped',
          source_config: field.source_config || {},
          formula: field.formula || null,
          format: field.format || null,
          is_visible: field.is_visible ?? true,
          sort_order: field.sort_order || 0,
          organization_id: orgId!,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-fields', variables.dataset_id, orgId] });
    },
  });
}

export function useUpdateDatasetField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DatasetField> & { id: string }) => {
      const { data, error } = await supabase
        .from('dataset_fields')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-fields', data.dataset_id, orgId] });
    },
  });
}

export function useDeleteDatasetField() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, datasetId, fieldSlug }: { id: string; datasetId: string; fieldSlug: string }) => {
      // Check if this field is referenced by any calculated fields
      const { data: calculatedFields } = await supabase
        .from('dataset_calculated_fields')
        .select('field_slug, formula')
        .eq('dataset_id', datasetId)
        .eq('organization_id', orgId);

      const referencingFields = (calculatedFields || []).filter(cf => {
        // Check if the formula contains a reference to this field
        const fieldPattern = new RegExp(`\\b${fieldSlug}\\b`, 'i');
        return fieldPattern.test(cf.formula);
      });

      if (referencingFields.length > 0) {
        const refs = referencingFields.map(f => f.field_slug).join(', ');
        throw new Error(`Cannot delete field "${fieldSlug}" - it is referenced by calculated field(s): ${refs}. Delete or update those fields first.`);
      }

      const { error } = await supabase
        .from('dataset_fields')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { datasetId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-fields', result.datasetId, orgId] });
    },
  });
}

export function useCreateWebhookDashboard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (dashboard: Partial<WebhookDashboard>) => {
      const { data, error } = await supabase
        .from('webhook_dashboards')
        .insert({
          name: dashboard.name || '',
          description: dashboard.description || null,
          is_shared: dashboard.is_shared ?? false,
          layout_config: dashboard.layout_config || {},
          organization_id: orgId!,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-dashboards', orgId] });
    },
  });
}

export function useCreateDashboardWidget() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (widget: Partial<DashboardWidget>) => {
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .insert({
          dashboard_id: widget.dashboard_id!,
          dataset_id: widget.dataset_id!,
          widget_type: widget.widget_type || 'card',
          title: widget.title || null,
          metric_config: widget.metric_config || {},
          chart_config: widget.chart_config || {},
          filters: widget.filters || [],
          comparison_enabled: widget.comparison_enabled ?? false,
          position: widget.position || { x: 0, y: 0, w: 1, h: 1 },
          refresh_interval_seconds: widget.refresh_interval_seconds || 30,
          is_active: widget.is_active ?? true,
          organization_id: orgId!,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets', variables.dashboard_id, orgId] });
    },
  });
}

export function useUpdateDashboardWidget() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, dashboardId, ...updates }: Partial<DashboardWidget> & { id: string; dashboardId: string }) => {
      // Only include fields that can actually be updated (exclude dashboard_id, organization_id)
      const { dashboard_id, organization_id, ...safeUpdates } = updates as any;
      
      const { data, error } = await supabase
        .from('dashboard_widgets')
        .update(safeUpdates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return { ...data, dashboardId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets', result.dashboardId, orgId] });
    },
  });
}

export function useDeleteDashboardWidget() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, dashboardId }: { id: string; dashboardId: string }) => {
      const { error } = await supabase
        .from('dashboard_widgets')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      return { dashboardId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-widgets', result.dashboardId, orgId] });
    },
  });
}

export function useUpdateWebhookDashboard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<WebhookDashboard> & { id: string }) => {
      const { data, error } = await supabase
        .from('webhook_dashboards')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-dashboards', orgId] });
    },
  });
}

export function useDeleteWebhookDashboard() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhook_dashboards')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-dashboards', orgId] });
    },
  });
}

// Hook to fetch single dashboard
export function useWebhookDashboard(dashboardId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['webhook-dashboard', dashboardId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_dashboards')
        .select('*')
        .eq('id', dashboardId)
        .eq('organization_id', orgId)
        .single();
      
      if (error) throw error;
      return data as WebhookDashboard;
    },
    enabled: !!dashboardId && !!orgId,
  });
}

// Hook to fetch webhook logs
export function useWebhookLogs(connectionId?: string, limit = 50) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['webhook-logs', connectionId, orgId, limit],
    queryFn: async () => {
      let query = supabase
        .from('webhook_logs')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (connectionId) {
        query = query.eq('connection_id', connectionId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });
}
