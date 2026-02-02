import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { MetricFilter } from '@/types/metricFilter';
import { matchesCanonicalSource } from '@/lib/trafficSourceNormalization';

interface UseFilteredEventsParams {
  filter: MetricFilter | null;
  startDate?: Date;
  endDate?: Date;
  enabled: boolean;
}

export function useFilteredEventsForMetric({
  filter,
  startDate,
  endDate,
  enabled,
}: UseFilteredEventsParams) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['filtered-events-metric', orgId, filter, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!filter) return [];

      let query = supabase
        .from('events')
        .select(`
          id,
          lead_name,
          lead_email,
          scheduled_at,
          booked_at,
          closer_name,
          closer_email,
          setter_name,
          event_name,
          event_outcome,
          call_status,
          close_custom_fields,
          booking_metadata,
          booking_responses,
          booking_platform,
          pcf_submitted
        `)
        .eq('organization_id', orgId!)
        .not('call_status', 'in', '("canceled","rescheduled")')
        .order('scheduled_at', { ascending: false });

      // Apply date range based on filter type
      if (filter.dateType === 'booked') {
        if (startDate) query = query.gte('booked_at', startDate.toISOString());
        if (endDate) query = query.lte('booked_at', endDate.toISOString());
      } else {
        if (startDate) query = query.gte('scheduled_at', startDate.toISOString());
        if (endDate) query = query.lte('scheduled_at', endDate.toISOString());
      }

      // Apply filter based on type
      switch (filter.type) {
        case 'showed':
          query = query.in('event_outcome', ['showed_no_offer', 'showed_offer_no_close', 'closed']);
          break;
        case 'deals':
          query = query.eq('event_outcome', 'closed');
          break;
        case 'callType':
          if (filter.value) {
            query = query.eq('event_name', filter.value);
          }
          break;
        case 'closer':
          if (filter.closerEmail) {
            query = query.eq('closer_email', filter.closerEmail);
          } else if (filter.value) {
            query = query.eq('closer_name', filter.value);
          }
          break;
        case 'setter':
          // Client-side filter for setter_name OR utm_setter
          break;
        case 'trafficSource':
          // Client-side filter for utm_platform
          break;
        // 'total', 'source', 'platform' - no additional DB filter, we filter client-side
      }

      const { data, error } = await query.limit(1000);
      if (error) throw error;

      // Client-side filtering for platform/source (from close_custom_fields)
      let filteredData = data || [];
      
      if ((filter.type === 'source' || filter.type === 'platform') && filter.value) {
        filteredData = filteredData.filter(event => {
          const customFields = event.close_custom_fields as Record<string, string> | null;
          const platform = customFields?.platform || 'N/A';
          return platform === filter.value;
        });
      }

      // For closer filter with platform selection
      if (filter.type === 'closer' && filter.selectedPlatform) {
        filteredData = filteredData.filter(event => {
          const customFields = event.close_custom_fields as Record<string, string> | null;
          const platform = customFields?.platform || 'N/A';
          return platform === filter.selectedPlatform;
        });
      }

      // Filter by setter (from setter_name OR booking_metadata.utm_setter)
      if (filter.type === 'setter' && filter.value) {
        filteredData = filteredData.filter(event => {
          const setterName = event.setter_name;
          const metadata = event.booking_metadata as Record<string, unknown> | null;
          const utmSetter = metadata?.utm_setter as string | undefined;
          return setterName === filter.value || utmSetter === filter.value;
        });
      }

      // Filter by traffic source (utm_platform OR close_custom_fields.platform)
      // Uses alias matching: "x", "X", "twitter" all match canonical "X"
      if (filter.type === 'trafficSource' && filter.value) {
        filteredData = filteredData.filter(event => {
          const metadata = event.booking_metadata as Record<string, unknown> | null;
          const customFields = event.close_custom_fields as Record<string, unknown> | null;
          
          const utmPlatform = metadata?.utm_platform as string | undefined;
          const crmPlatform = customFields?.platform as string | undefined;
          
          // Priority: UTM first, then CRM field (matching metrics aggregation logic)
          const rawSource = utmPlatform || crmPlatform;
          
          return matchesCanonicalSource(rawSource, filter.value);
        });
      }

      // Filter by attribution node (platform + channel + setter + capitalTier hierarchy)
      if (filter.type === 'attributionNode') {
        filteredData = filteredData.filter(event => {
          const metadata = event.booking_metadata as Record<string, unknown> | null;
          const customFields = event.close_custom_fields as Record<string, unknown> | null;
          const bookingResponses = event.booking_responses as Record<string, unknown> | null;
          
          // Detect quiz funnel for special platform matching
          const isQuizFunnel = !!(bookingResponses?.quiz_email || bookingResponses?.['quiz email'] || bookingResponses?.quizEmail);
          
          // Match platform
          if (filter.platform) {
            if (filter.platform === '(No Attribution)') {
              // Only show events without any platform attribution and not quiz funnel
              const rawPlatform = (metadata?.utm_platform as string) || (customFields?.platform as string);
              if (rawPlatform || isQuizFunnel) return false;
            } else if (filter.platform === 'Quiz Funnel') {
              // Only show quiz funnel events
              if (!isQuizFunnel) return false;
            } else {
              const rawPlatform = (metadata?.utm_platform as string) || (customFields?.platform as string);
              if (!matchesCanonicalSource(rawPlatform, filter.platform)) return false;
            }
          }
          
          // Match channel
          if (filter.channel && filter.channel !== '(none)') {
            const rawChannel = metadata?.utm_channel as string | undefined;
            if (!rawChannel || rawChannel.trim() !== filter.channel) return false;
          } else if (filter.channel === '(none)') {
            const rawChannel = metadata?.utm_channel as string | undefined;
            if (rawChannel && rawChannel.trim()) return false;
          }
          
          // Match setter
          if (filter.setter && filter.setter !== '(unattributed)') {
            const rawSetter = (metadata?.utm_setter as string) || event.setter_name;
            // Simple match - could use resolveSetterName for alias matching if needed
            if (!rawSetter || rawSetter.trim() !== filter.setter) return false;
          } else if (filter.setter === '(unattributed)') {
            const rawSetter = (metadata?.utm_setter as string) || event.setter_name;
            if (rawSetter && rawSetter.trim()) return false;
          }
          
          // Match capital tier
          if (filter.capitalTier && filter.capitalTier !== '(unknown)') {
            const tier = (bookingResponses?.capital_question as string) ||
                        (bookingResponses?.['Long capital question'] as string) ||
                        (bookingResponses?.capitalQuestion as string);
            if (!tier || tier.trim() !== filter.capitalTier) return false;
          } else if (filter.capitalTier === '(unknown)') {
            const tier = (bookingResponses?.capital_question as string) ||
                        (bookingResponses?.['Long capital question'] as string) ||
                        (bookingResponses?.capitalQuestion as string);
            if (tier && tier.trim()) return false;
          }
          
          return true;
        });
      }

      return filteredData;
    },
    enabled: enabled && !!user && !!orgId && !!filter,
  });
}
