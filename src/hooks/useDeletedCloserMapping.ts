import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';

export interface DeletedCloserGroup {
  deletedUserUuid: string;
  eventCount: number;
  firstEvent: string;
  lastEvent: string;
}

export function useDeletedCloserGroups() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['deleted-closer-groups', orgId],
    queryFn: async () => {
      if (!orgId) return [];

      const { data, error } = await supabase
        .from('events')
        .select('closer_email, scheduled_at')
        .eq('organization_id', orgId)
        .eq('closer_name', 'deleted')
        .not('closer_email', 'is', null);

      if (error) throw error;

      // Group by the UUID portion of the deleted email
      const groupMap = new Map<string, { count: number; minDate: string; maxDate: string }>();

      for (const event of data || []) {
        if (!event.closer_email) continue;
        const uuid = event.closer_email.split('@')[0];
        
        if (groupMap.has(uuid)) {
          const group = groupMap.get(uuid)!;
          group.count++;
          if (event.scheduled_at < group.minDate) group.minDate = event.scheduled_at;
          if (event.scheduled_at > group.maxDate) group.maxDate = event.scheduled_at;
        } else {
          groupMap.set(uuid, {
            count: 1,
            minDate: event.scheduled_at,
            maxDate: event.scheduled_at,
          });
        }
      }

      const groups: DeletedCloserGroup[] = [];
      groupMap.forEach((value, key) => {
        groups.push({
          deletedUserUuid: key,
          eventCount: value.count,
          firstEvent: value.minDate,
          lastEvent: value.maxDate,
        });
      });

      return groups.sort((a, b) => b.eventCount - a.eventCount);
    },
    enabled: !!orgId,
  });
}

export function useMapDeletedCloser() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deletedUserUuid, newCloserName }: { deletedUserUuid: string; newCloserName: string }) => {
      if (!currentOrganization?.id) throw new Error('No organization selected');

      // Update all events with this deleted user UUID
      const deletedEmail = `${deletedUserUuid}@deleted.calendly.com`;
      
      const { data, error } = await supabase
        .from('events')
        .update({ closer_name: newCloserName })
        .eq('organization_id', currentOrganization.id)
        .eq('closer_email', deletedEmail)
        .eq('closer_name', 'deleted')
        .select('id');

      if (error) throw error;
      return { updatedCount: data?.length || 0 };
    },
    onSuccess: (result, variables) => {
      toast.success(`Updated ${result.updatedCount} events to "${variables.newCloserName}"`);
      queryClient.invalidateQueries({ queryKey: ['deleted-closer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
    },
    onError: (error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });
}
