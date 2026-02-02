import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface DashboardConfig {
  id: string;
  organization_id: string;
  user_id: string | null;
  config_name: string;
  enabled_metrics: string[];
  metric_order: string[];
  enabled_widgets: string[];
  widget_layout: Record<string, { order: number; size: string }>;
  show_date_range_selector: boolean;
  default_date_range: string;
  show_filters: boolean;
  compact_mode: boolean;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type MetricType =
  | 'scheduled_calls'
  | 'calls_booked'
  | 'slot_utilization'
  | 'cash_collected'
  | 'conversion_rate'
  | 'show_rate'
  | 'close_rate'
  | 'avg_deal_size';

export type WidgetType =
  | 'recent_events'
  | 'calls_by_source'
  | 'performance_chart'
  | 'top_performers'
  | 'upcoming_calls';

interface UpdateDashboardConfigInput {
  enabled_metrics?: string[];
  metric_order?: string[];
  enabled_widgets?: string[];
  widget_layout?: Record<string, { order: number; size: string }>;
  show_date_range_selector?: boolean;
  default_date_range?: string;
  show_filters?: boolean;
  compact_mode?: boolean;
}

// Helper to get typed table access (table not yet in generated types)
const getDashboardConfigsTable = () => {
  return (supabase as any).from('organization_dashboard_configs');
};

export function useDashboardConfig() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dashboard config (user-specific or org default)
  const {
    data: dashboardConfig,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard-config', currentOrganization?.id, user?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // First, try to get user-specific config
      let { data, error } = await getDashboardConfigsTable()
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user?.id || '')
        .eq('is_active', true)
        .maybeSingle();

      // If no user-specific config, get org default
      if (!data) {
        const result = await getDashboardConfigsTable()
          .select('*')
          .eq('organization_id', currentOrganization.id)
          .is('user_id', null)
          .eq('is_default', true)
          .maybeSingle();

        data = result.data;
        error = result.error;
      }

      if (error) {
        console.error('Error fetching dashboard config:', error);
        throw error;
      }

      return data as DashboardConfig | null;
    },
    enabled: !!currentOrganization?.id,
  });

  // Update dashboard config
  const updateDashboardConfig = useMutation({
    mutationFn: async (updates: UpdateDashboardConfigInput) => {
      if (!currentOrganization?.id || !user?.id) {
        throw new Error('No organization or user');
      }

      // Check if user has a personal config
      const { data: existingConfig } = await getDashboardConfigsTable()
        .select('id')
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingConfig) {
        // Update existing user config
        const { data, error } = await getDashboardConfigsTable()
          .update(updates)
          .eq('id', existingConfig.id)
          .select()
          .single();

        if (error) throw error;
        return data as DashboardConfig;
      } else {
        // Create new user-specific config
        const { data, error } = await getDashboardConfigsTable()
          .insert({
            organization_id: currentOrganization.id,
            user_id: user.id,
            config_name: 'My Dashboard',
            ...updates,
            is_active: true,
            is_default: false,
          })
          .select()
          .single();

        if (error) throw error;
        return data as DashboardConfig;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config', currentOrganization?.id, user?.id] });
      toast({
        title: 'Dashboard updated',
        description: 'Your dashboard configuration has been saved.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating dashboard',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Update org default config (admin only)
  const updateOrgDefaultConfig = useMutation({
    mutationFn: async (updates: UpdateDashboardConfigInput) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // Get the org default config
      const { data: orgConfig } = await getDashboardConfigsTable()
        .select('id')
        .eq('organization_id', currentOrganization.id)
        .is('user_id', null)
        .eq('is_default', true)
        .single();

      if (!orgConfig) {
        throw new Error('No org default config found');
      }

      const { data, error } = await getDashboardConfigsTable()
        .update(updates)
        .eq('id', orgConfig.id)
        .select()
        .single();

      if (error) throw error;
      return data as DashboardConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config'] });
      toast({
        title: 'Organization dashboard updated',
        description: 'The default dashboard for your organization has been updated.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating organization dashboard',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Reset to org default
  const resetToOrgDefault = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id || !user?.id) {
        throw new Error('No organization or user');
      }

      // Delete user-specific config
      const { error } = await getDashboardConfigsTable()
        .delete()
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard-config', currentOrganization?.id, user?.id] });
      toast({
        title: 'Dashboard reset',
        description: 'Your dashboard has been reset to organization defaults.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error resetting dashboard',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Helper to check if metric is enabled
  const isMetricEnabled = (metricId: string) => {
    return dashboardConfig?.enabled_metrics?.includes(metricId) ?? true;
  };

  // Helper to check if widget is enabled
  const isWidgetEnabled = (widgetId: string) => {
    return dashboardConfig?.enabled_widgets?.includes(widgetId) ?? true;
  };

  // Helper to get metric order
  const getMetricOrder = () => {
    return dashboardConfig?.metric_order ?? ['scheduled_calls', 'calls_booked', 'slot_utilization', 'cash_collected'];
  };

  // Helper to get widget order
  const getWidgetOrder = (widgetId: string) => {
    return dashboardConfig?.widget_layout?.[widgetId]?.order ?? 999;
  };

  return {
    dashboardConfig,
    isLoading,
    error,
    refetch,
    updateDashboardConfig: updateDashboardConfig.mutate,
    updateDashboardConfigAsync: updateDashboardConfig.mutateAsync,
    isUpdating: updateDashboardConfig.isPending,
    updateOrgDefaultConfig: updateOrgDefaultConfig.mutate,
    updateOrgDefaultConfigAsync: updateOrgDefaultConfig.mutateAsync,
    isUpdatingOrgDefault: updateOrgDefaultConfig.isPending,
    resetToOrgDefault: resetToOrgDefault.mutate,
    resetToOrgDefaultAsync: resetToOrgDefault.mutateAsync,
    isResetting: resetToOrgDefault.isPending,
    isMetricEnabled,
    isWidgetEnabled,
    getMetricOrder,
    getWidgetOrder,
  };
}
