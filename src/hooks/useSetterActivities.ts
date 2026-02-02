import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useToast } from './use-toast';

export interface SetterActivity {
  id: string;
  organization_id: string;
  setter_id: string | null;
  close_user_id: string;
  activity_date: string;
  total_dials: number;
  connected_calls: number;
  voicemails_left: number;
  total_talk_time_seconds: number;
  emails_sent: number;
  sms_sent: number;
  created_at: string;
  updated_at: string;
  setter?: {
    id: string;
    name: string;
  } | null;
}

interface UseSetterActivitiesParams {
  startDate?: Date;
  endDate?: Date;
}

export function useSetterActivities({ startDate, endDate }: UseSetterActivitiesParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['setter-activities', orgId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from('setter_activities')
        .select(`
          *,
          setter:setters(id, name)
        `)
        .eq('organization_id', orgId!);

      if (startDate) {
        query = query.gte('activity_date', startDate.toISOString().split('T')[0]);
      }
      if (endDate) {
        query = query.lte('activity_date', endDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query.order('activity_date', { ascending: false });

      if (error) throw error;
      return data as SetterActivity[];
    },
    enabled: !!orgId,
  });
}

export function useSetterActivityAggregates({ startDate, endDate }: UseSetterActivitiesParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['setter-activity-aggregates', orgId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from('setter_activities')
        .select(`
          close_user_id,
          setter:setters(id, name),
          total_dials,
          connected_calls,
          voicemails_left,
          total_talk_time_seconds,
          emails_sent,
          sms_sent
        `)
        .eq('organization_id', orgId!);

      if (startDate) {
        query = query.gte('activity_date', startDate.toISOString().split('T')[0]);
      }
      if (endDate) {
        query = query.lte('activity_date', endDate.toISOString().split('T')[0]);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Aggregate by close_user_id
      const aggregates: Record<string, {
        close_user_id: string;
        setter_name: string;
        total_dials: number;
        connected_calls: number;
        voicemails_left: number;
        total_talk_time_seconds: number;
        emails_sent: number;
        sms_sent: number;
        connection_rate: number;
      }> = {};

      for (const row of data || []) {
        const userId = row.close_user_id;
        if (!aggregates[userId]) {
          aggregates[userId] = {
            close_user_id: userId,
            setter_name: (row.setter as any)?.name || userId,
            total_dials: 0,
            connected_calls: 0,
            voicemails_left: 0,
            total_talk_time_seconds: 0,
            emails_sent: 0,
            sms_sent: 0,
            connection_rate: 0,
          };
        }

        aggregates[userId].total_dials += row.total_dials || 0;
        aggregates[userId].connected_calls += row.connected_calls || 0;
        aggregates[userId].voicemails_left += row.voicemails_left || 0;
        aggregates[userId].total_talk_time_seconds += row.total_talk_time_seconds || 0;
        aggregates[userId].emails_sent += row.emails_sent || 0;
        aggregates[userId].sms_sent += row.sms_sent || 0;
      }

      // Calculate connection rates
      for (const agg of Object.values(aggregates)) {
        agg.connection_rate = agg.total_dials > 0 
          ? Math.round((agg.connected_calls / agg.total_dials) * 100) 
          : 0;
      }

      return Object.values(aggregates);
    },
    enabled: !!orgId,
  });
}

export function useSyncSetterActivities() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ startDate, endDate, closeUserIds }: { 
      startDate?: string; 
      endDate?: string; 
      closeUserIds?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('sync-close-activities', {
        body: {
          organizationId: currentOrganization?.id,
          closeUserIds,
          startDate,
          endDate,
        },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['setter-activities'] });
      queryClient.invalidateQueries({ queryKey: ['setter-activity-aggregates'] });
      toast({
        title: 'Sync Complete',
        description: `Synced ${data.synced} activity records from Close`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Sync Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
