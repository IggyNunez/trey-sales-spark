import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

/**
 * Hook to fetch distinct traffic source values from BOTH:
 * 1. close_custom_fields.platform (CRM attribution)
 * 2. booking_metadata.utm_platform (UTM attribution)
 * 
 * Returns a merged, deduplicated list of CANONICAL names for the unified Traffic Source filter.
 * Aliases like "IG", "ig", "Instagram" are all normalized to "Instagram".
 */
export function useTrafficSourceValues() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['traffic-source-values', orgId],
    queryFn: async () => {
      // Fetch events with either close_custom_fields or booking_metadata
      const { data, error } = await supabase
        .from('events')
        .select('close_custom_fields, booking_metadata')
        .eq('organization_id', orgId!)
        .limit(5000);

      if (error) throw error;

      // Extract unique CANONICAL values from both sources
      const sourceSet = new Set<string>();
      
      data?.forEach(event => {
        // Extract from CRM platform field and normalize
        const customFields = event.close_custom_fields as Record<string, unknown> | null;
        if (customFields && typeof customFields.platform === 'string' && customFields.platform.trim()) {
          const canonical = getCanonicalSource(customFields.platform);
          sourceSet.add(canonical);
        }
        
        // Extract from UTM platform field and normalize
        const metadata = event.booking_metadata as Record<string, unknown> | null;
        if (metadata && typeof metadata.utm_platform === 'string' && metadata.utm_platform.trim()) {
          const canonical = getCanonicalSource(metadata.utm_platform);
          sourceSet.add(canonical);
        }
      });

      // Return sorted array of canonical names
      return Array.from(sourceSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    },
    enabled: !!user && !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
