import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';

/**
 * Hook to fetch distinct UTM platform values from booking_metadata
 * Used for the UTM Platform filter dropdown in the dashboard
 */
export function useUtmPlatformValues() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['utm-platform-values', orgId],
    queryFn: async () => {
      // Fetch distinct utm_platform values from booking_metadata JSONB column
      const { data, error } = await supabase
        .from('events')
        .select('booking_metadata')
        .eq('organization_id', orgId!)
        .not('booking_metadata', 'is', null)
        .limit(5000);

      if (error) throw error;

      // Extract unique utm_platform values
      const utmPlatformSet = new Set<string>();
      
      data?.forEach(event => {
        const metadata = event.booking_metadata as Record<string, unknown> | null;
        if (metadata && typeof metadata.utm_platform === 'string' && metadata.utm_platform.trim()) {
          utmPlatformSet.add(metadata.utm_platform);
        }
      });

      // Return sorted array
      return Array.from(utmPlatformSet).sort();
    },
    enabled: !!user && !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
