import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';

interface CalcomEventType {
  id: string;
  name: string;
  count: number;
}

interface CalcomSyncSettings {
  autoSyncEnabled: boolean;
  excludedEventTypeIds: string[];
  lastSyncAt: string | null;
}

export function useCalcomSyncSettings() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  // Fetch current settings from organization_integrations
  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['calcom-sync-settings', orgId],
    queryFn: async (): Promise<CalcomSyncSettings | null> => {
      if (!orgId) return null;
      
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('calcom_auto_sync_enabled, calcom_excluded_event_type_ids, calcom_last_auto_sync_at')
        .eq('organization_id', orgId)
        .maybeSingle();
      
      if (error) throw error;
      if (!data) return null;
      
      return {
        autoSyncEnabled: data.calcom_auto_sync_enabled ?? true,
        excludedEventTypeIds: (data.calcom_excluded_event_type_ids as string[]) || [],
        lastSyncAt: data.calcom_last_auto_sync_at,
      };
    },
    enabled: !!orgId,
  });

  // Fetch event types from events table (distinct calcom_event_type_id + event_name with counts)
  const { data: eventTypes, isLoading: eventTypesLoading } = useQuery({
    queryKey: ['calcom-event-types', orgId],
    queryFn: async (): Promise<CalcomEventType[]> => {
      if (!orgId) return [];
      
      // Get all Cal.com events and aggregate by event type
      const { data, error } = await supabase
        .from('events')
        .select('calcom_event_type_id, event_name')
        .eq('organization_id', orgId)
        .eq('booking_platform', 'calcom')
        .not('calcom_event_type_id', 'is', null);
      
      if (error) throw error;
      
      // Aggregate by event type ID
      const typeMap = new Map<string, { name: string; count: number }>();
      
      for (const event of data || []) {
        const id = event.calcom_event_type_id!;
        const existing = typeMap.get(id);
        if (existing) {
          existing.count++;
        } else {
          typeMap.set(id, { 
            name: event.event_name || `Event Type ${id}`,
            count: 1 
          });
        }
      }
      
      return Array.from(typeMap.entries()).map(([id, { name, count }]) => ({
        id,
        name,
        count,
      })).sort((a, b) => b.count - a.count); // Sort by count descending
    },
    enabled: !!orgId,
  });

  // Toggle auto-sync enabled/disabled
  const toggleAutoSync = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!orgId) throw new Error('No organization');
      
      const { error } = await supabase
        .from('organization_integrations')
        .update({ calcom_auto_sync_enabled: enabled })
        .eq('organization_id', orgId);
      
      if (error) throw error;
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['calcom-sync-settings', orgId] });
      toast.success(enabled ? 'Auto-sync enabled' : 'Auto-sync disabled');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update');
    },
  });

  // Toggle a specific event type exclusion
  const toggleEventType = useMutation({
    mutationFn: async ({ eventTypeId, exclude }: { eventTypeId: string; exclude: boolean }) => {
      if (!orgId) throw new Error('No organization');
      
      const currentExcluded = settings?.excludedEventTypeIds || [];
      let newExcluded: string[];
      
      if (exclude) {
        // Add to exclusion list
        newExcluded = [...new Set([...currentExcluded, eventTypeId])];
      } else {
        // Remove from exclusion list
        newExcluded = currentExcluded.filter(id => id !== eventTypeId);
      }
      
      const { error } = await supabase
        .from('organization_integrations')
        .update({ calcom_excluded_event_type_ids: newExcluded })
        .eq('organization_id', orgId);
      
      if (error) throw error;
      
      return newExcluded;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calcom-sync-settings', orgId] });
      toast.success('Event type settings updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update');
    },
  });

  // Trigger manual sync
  const triggerSync = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No organization');
      
      const { data, error } = await supabase.functions.invoke('auto-sync-calcom', {
        body: {},
      });
      
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['calcom-sync-settings', orgId] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      toast.success(`Sync complete: ${data?.totalCreated || 0} created, ${data?.totalUpdated || 0} updated`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Sync failed');
    },
  });

  return {
    settings,
    eventTypes: eventTypes || [],
    isLoading: settingsLoading || eventTypesLoading,
    toggleAutoSync,
    toggleEventType,
    triggerSync,
  };
}
