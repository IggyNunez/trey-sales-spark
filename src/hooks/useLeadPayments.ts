import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useLeadPayments(eventId: string | undefined) {
  return useQuery({
    queryKey: ['lead-payments', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      const { data, error } = await supabase
        .from('payments')
        .select('id, amount, payment_date, payment_type, refund_amount, net_revenue, package_id')
        .eq('event_id', eventId)
        .order('payment_date', { ascending: false });

      if (error) {
        console.error('Error fetching lead payments:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!eventId,
  });
}
