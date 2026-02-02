import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

interface DuplicateGroup {
  event_name: string;
  scheduled_at: string;
  booked_at: string | null;
  closer_name: string | null;
  count: number;
}

export function useDuplicateEvents() {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['duplicate-events', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return { duplicateCount: 0, duplicateGroups: [] };

      // Fetch all events with the relevant fields
      const { data: events, error } = await supabase
        .from('events')
        .select('id, event_name, scheduled_at, booked_at, closer_name')
        .eq('organization_id', currentOrganization.id)
        .not('event_name', 'is', null);

      if (error) throw error;

      // Group events by event_name + scheduled_at + booked_at + closer_name
      const groupMap = new Map<string, { count: number; event_name: string; scheduled_at: string; booked_at: string | null; closer_name: string | null }>();

      for (const event of events || []) {
        const key = `${event.event_name}|${event.scheduled_at}|${event.booked_at || 'null'}|${event.closer_name || 'null'}`;
        
        if (groupMap.has(key)) {
          groupMap.get(key)!.count++;
        } else {
          groupMap.set(key, {
            count: 1,
            event_name: event.event_name || '',
            scheduled_at: event.scheduled_at,
            booked_at: event.booked_at,
            closer_name: event.closer_name,
          });
        }
      }

      // Filter to only groups with duplicates (count > 1)
      const duplicateGroups: DuplicateGroup[] = [];
      let totalDuplicates = 0;

      groupMap.forEach((group) => {
        if (group.count > 1) {
          duplicateGroups.push(group);
          totalDuplicates += group.count - 1; // Count extra duplicates (not the original)
        }
      });

      return {
        duplicateCount: totalDuplicates,
        duplicateGroups: duplicateGroups.sort((a, b) => b.count - a.count),
      };
    },
    enabled: !!currentOrganization?.id,
    staleTime: 60000, // 1 minute cache
  });
}
