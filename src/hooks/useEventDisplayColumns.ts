import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface EventDisplayColumn {
  id: string;
  organization_id: string;
  field_key: string;
  display_label: string;
  is_visible: boolean;
  sort_order: number;
  field_source: string;
  created_at: string;
  updated_at: string;
}

/**
 * Hook to fetch and manage event display columns for the current organization.
 * These columns control which booking_metadata fields appear in the EventsTable.
 */
export function useEventDisplayColumns() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['event-display-columns', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('event_display_columns')
        .select('*')
        .eq('organization_id', orgId!)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as EventDisplayColumn[];
    },
    enabled: !!user && !!orgId,
    staleTime: 5 * 60 * 1000,
  });

  // Get only visible columns
  const visibleColumns = query.data?.filter(col => col.is_visible) || [];

  // Update column visibility
  const updateVisibilityMutation = useMutation({
    mutationFn: async ({ id, is_visible }: { id: string; is_visible: boolean }) => {
      const { error } = await supabase
        .from('event_display_columns')
        .update({ is_visible })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-display-columns', orgId] });
      toast({
        title: 'Column updated',
        description: 'Column visibility has been changed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update column visibility.',
        variant: 'destructive',
      });
      console.error('Failed to update column visibility:', error);
    },
  });

  // Update column label
  const updateLabelMutation = useMutation({
    mutationFn: async ({ id, display_label }: { id: string; display_label: string }) => {
      const { error } = await supabase
        .from('event_display_columns')
        .update({ display_label })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-display-columns', orgId] });
      toast({
        title: 'Column updated',
        description: 'Column label has been changed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to update column label.',
        variant: 'destructive',
      });
      console.error('Failed to update column label:', error);
    },
  });

  // Add a new column
  const addColumnMutation = useMutation({
    mutationFn: async ({ field_key, display_label, field_source = 'booking_metadata' }: { 
      field_key: string; 
      display_label: string;
      field_source?: string;
    }) => {
      const maxSortOrder = Math.max(...(query.data?.map(c => c.sort_order) || [0]));
      
      const { error } = await supabase
        .from('event_display_columns')
        .insert({
          organization_id: orgId,
          field_key,
          display_label,
          field_source,
          is_visible: true,
          sort_order: maxSortOrder + 1,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-display-columns', orgId] });
      toast({
        title: 'Column added',
        description: 'New column has been added.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message.includes('duplicate') 
          ? 'This column already exists.' 
          : 'Failed to add column.',
        variant: 'destructive',
      });
      console.error('Failed to add column:', error);
    },
  });

  // Delete a column
  const deleteColumnMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('event_display_columns')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-display-columns', orgId] });
      toast({
        title: 'Column removed',
        description: 'Column has been removed.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'Failed to remove column.',
        variant: 'destructive',
      });
      console.error('Failed to delete column:', error);
    },
  });

  return {
    columns: query.data || [],
    visibleColumns,
    isLoading: query.isLoading,
    isError: query.isError,
    updateVisibility: updateVisibilityMutation.mutate,
    updateLabel: updateLabelMutation.mutate,
    addColumn: addColumnMutation.mutate,
    deleteColumn: deleteColumnMutation.mutate,
    isUpdating: updateVisibilityMutation.isPending || updateLabelMutation.isPending,
    isAdding: addColumnMutation.isPending,
    isDeleting: deleteColumnMutation.isPending,
  };
}
