import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export type AlertOperator = '>' | '<' | '>=' | '<=' | '=' | '!=' | 'contains' | 'not_contains';
export type NotificationType = 'slack' | 'email' | 'in_app';
export type AggregationType = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'VALUE';

export interface AlertCondition {
  field: string;
  operator: AlertOperator;
  value: number | string;
  aggregation?: AggregationType;
  time_window?: 'all' | 'today' | 'hour' | 'day' | 'week' | 'month';
}

export interface NotificationConfig {
  slack_webhook_url?: string;
  slack_channel?: string;
  email_addresses?: string[];
  email_subject_template?: string;
  in_app_title?: string;
  in_app_message?: string;
  cooldown_minutes?: number; // Prevent spam
}

export interface DatasetAlert {
  id: string;
  dataset_id: string;
  organization_id: string;
  name: string;
  condition: AlertCondition;
  notification_type: NotificationType;
  notification_config: NotificationConfig;
  is_active: boolean;
  last_triggered_at: string | null;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface AlertTriggerLog {
  id: string;
  alert_id: string;
  triggered_at: string;
  condition_value: number | string;
  notification_sent: boolean;
  error_message: string | null;
}

// Constants for UI
export const ALERT_OPERATORS: { id: AlertOperator; label: string; description: string }[] = [
  { id: '>', label: 'Greater than', description: 'Value exceeds threshold' },
  { id: '<', label: 'Less than', description: 'Value falls below threshold' },
  { id: '>=', label: 'Greater or equal', description: 'Value meets or exceeds threshold' },
  { id: '<=', label: 'Less or equal', description: 'Value meets or falls below threshold' },
  { id: '=', label: 'Equals', description: 'Value exactly matches' },
  { id: '!=', label: 'Not equals', description: 'Value does not match' },
  { id: 'contains', label: 'Contains', description: 'Text contains value' },
  { id: 'not_contains', label: 'Does not contain', description: 'Text does not contain value' },
];

export const NOTIFICATION_TYPES: { id: NotificationType; label: string; icon: string; description: string }[] = [
  { id: 'in_app', label: 'In-App', icon: 'Bell', description: 'Show notification in the app' },
  { id: 'slack', label: 'Slack', icon: 'MessageSquare', description: 'Send to Slack channel' },
  { id: 'email', label: 'Email', icon: 'Mail', description: 'Send email notification' },
];

export const AGGREGATION_TYPES: { id: AggregationType; label: string }[] = [
  { id: 'VALUE', label: 'Single Value (latest)' },
  { id: 'SUM', label: 'Sum' },
  { id: 'COUNT', label: 'Count' },
  { id: 'AVG', label: 'Average' },
  { id: 'MIN', label: 'Minimum' },
  { id: 'MAX', label: 'Maximum' },
];

export const TIME_WINDOWS = [
  { id: 'all', label: 'All Time' },
  { id: 'hour', label: 'Last Hour' },
  { id: 'today', label: 'Today' },
  { id: 'day', label: 'Last 24 Hours' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'Last 30 Days' },
];

// Helper to map DB row to typed DatasetAlert
function mapToDatasetAlert(row: any): DatasetAlert {
  return {
    id: row.id,
    dataset_id: row.dataset_id,
    organization_id: row.organization_id,
    name: row.name,
    condition: row.condition as AlertCondition,
    notification_type: row.notification_type as NotificationType,
    notification_config: row.notification_config as NotificationConfig,
    is_active: row.is_active,
    last_triggered_at: row.last_triggered_at,
    cooldown_minutes: row.cooldown_minutes ?? 5,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Hook to fetch alerts for a dataset
export function useDatasetAlerts(datasetId: string | undefined) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['dataset-alerts', datasetId, orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_alerts')
        .select('*')
        .eq('dataset_id', datasetId!)
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(mapToDatasetAlert);
    },
    enabled: !!datasetId && !!orgId,
  });
}

// Hook to fetch all alerts for the organization
export function useOrganizationAlerts() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['organization-alerts', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dataset_alerts')
        .select(`
          *,
          datasets:dataset_id (name, color, icon)
        `)
        .eq('organization_id', orgId!)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map(row => ({
        ...mapToDatasetAlert(row),
        datasets: row.datasets as { name: string; color: string; icon: string },
      }));
    },
    enabled: !!orgId,
  });
}

// Hook to create an alert
export function useCreateDatasetAlert() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async (alert: Partial<DatasetAlert>) => {
      const conditionJson = JSON.parse(JSON.stringify(alert.condition || { field: '', operator: '>', value: 0 }));
      const configJson = JSON.parse(JSON.stringify(alert.notification_config || {}));

      const { data, error } = await supabase
        .from('dataset_alerts')
        .insert([{
          dataset_id: alert.dataset_id!,
          organization_id: orgId!,
          name: alert.name || 'New Alert',
          condition: conditionJson,
          notification_type: alert.notification_type || 'in_app',
          notification_config: configJson,
          is_active: alert.is_active ?? true,
          cooldown_minutes: alert.cooldown_minutes ?? 5,
        }])
        .select()
        .single();

      if (error) throw error;
      return mapToDatasetAlert(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-alerts', data.dataset_id, orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-alerts', orgId] });
    },
  });
}

// Hook to update an alert
export function useUpdateDatasetAlert() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<DatasetAlert> & { id: string }) => {
      // Convert typed objects to JSON-compatible format using JSON stringify/parse
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      
      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.condition !== undefined) updateData.condition = JSON.parse(JSON.stringify(updates.condition));
      if (updates.notification_type !== undefined) updateData.notification_type = updates.notification_type;
      if (updates.notification_config !== undefined) updateData.notification_config = JSON.parse(JSON.stringify(updates.notification_config));
      if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
      if (updates.cooldown_minutes !== undefined) updateData.cooldown_minutes = updates.cooldown_minutes;

      const { data, error } = await supabase
        .from('dataset_alerts')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return mapToDatasetAlert(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-alerts', data.dataset_id, orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-alerts', orgId] });
    },
  });
}

// Hook to delete an alert
export function useDeleteDatasetAlert() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, datasetId }: { id: string; datasetId: string }) => {
      const { error } = await supabase
        .from('dataset_alerts')
        .delete()
        .eq('id', id);

      if (error) throw error;
      return { datasetId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-alerts', result.datasetId, orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-alerts', orgId] });
    },
  });
}

// Hook to toggle alert active status
export function useToggleDatasetAlert() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  return useMutation({
    mutationFn: async ({ id, is_active, datasetId }: { id: string; is_active: boolean; datasetId: string }) => {
      const { error } = await supabase
        .from('dataset_alerts')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      return { datasetId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['dataset-alerts', result.datasetId, orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-alerts', orgId] });
    },
  });
}

// Hook to manually test/trigger an alert
export function useTestAlert() {
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase.functions.invoke('check-dataset-alerts', {
        body: { alert_id: alertId, test_mode: true },
      });

      if (error) throw error;
      return data;
    },
  });
}
