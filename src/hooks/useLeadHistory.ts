import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export function useLeadHistory(leadEmail: string | undefined, currentEventId: string | undefined) {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['lead-history', leadEmail, currentOrganization?.id, currentEventId],
    queryFn: async () => {
      if (!leadEmail || !currentOrganization?.id) return [];

      let query = supabase
        .from('events')
        .select('id, scheduled_at, event_outcome, closer_name, event_name, booking_platform, pcf_submitted')
        .eq('organization_id', currentOrganization.id)
        .eq('lead_email', leadEmail)
        .order('scheduled_at', { ascending: false });

      // Exclude current event if provided
      if (currentEventId) {
        query = query.neq('id', currentEventId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching lead history:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!leadEmail && !!currentOrganization?.id,
  });
}
