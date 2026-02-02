import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';

interface UtmFieldValues {
  utm_platform: string[];
  utm_source: string[];
  utm_medium: string[];
  utm_channel: string[];
  utm_campaign: string[];
  utm_setter: string[];
}

/**
 * Hook to fetch distinct UTM field values from booking_metadata
 * Used for the UTM filter dropdowns in the events table
 */
export function useUtmFieldValues() {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['utm-field-values', orgId],
    queryFn: async () => {
      // Fetch booking_metadata from events
      const { data, error } = await supabase
        .from('events')
        .select('booking_metadata')
        .eq('organization_id', orgId!)
        .not('booking_metadata', 'is', null)
        .limit(5000);

      if (error) throw error;

      // Initialize sets for each UTM field
      const values: UtmFieldValues = {
        utm_platform: [],
        utm_source: [],
        utm_medium: [],
        utm_channel: [],
        utm_campaign: [],
        utm_setter: [],
      };

      const sets: Record<keyof UtmFieldValues, Set<string>> = {
        utm_platform: new Set(),
        utm_source: new Set(),
        utm_medium: new Set(),
        utm_channel: new Set(),
        utm_campaign: new Set(),
        utm_setter: new Set(),
      };

      // Extract unique values for each UTM field
      data?.forEach(event => {
        const metadata = event.booking_metadata as Record<string, unknown> | null;
        if (!metadata) return;

        (Object.keys(sets) as Array<keyof UtmFieldValues>).forEach(field => {
          const value = metadata[field];
          if (typeof value === 'string' && value.trim()) {
            sets[field].add(value.trim());
          }
        });
      });

      // Convert sets to sorted arrays
      (Object.keys(sets) as Array<keyof UtmFieldValues>).forEach(field => {
        values[field] = Array.from(sets[field]).sort((a, b) => 
          a.toLowerCase().localeCompare(b.toLowerCase())
        );
      });

      return values;
    },
    enabled: !!user && !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
