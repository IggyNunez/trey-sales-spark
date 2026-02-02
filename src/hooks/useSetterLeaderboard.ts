import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useSetterAliasMap } from './useSetterAliases';
import { resolveSetterName } from '@/lib/identityResolver';

export interface SetterStats {
  setterName: string;
  attributionSource: 'crm' | 'utm' | 'mixed';
  callsSet: number;
  showed: number;
  showRate: number;
  closed: number;
  closeRate: number;
}

interface UseSetterLeaderboardParams {
  startDate?: Date;
  endDate?: Date;
  sortBy?: 'callsSet' | 'showRate' | 'closeRate';
}

export function useSetterLeaderboard({ startDate, endDate, sortBy = 'callsSet' }: UseSetterLeaderboardParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { aliasMap, isLoading: aliasesLoading } = useSetterAliasMap();

  const query = useQuery({
    queryKey: ['setter-leaderboard', orgId, startDate?.toISOString(), endDate?.toISOString(), sortBy, Array.from(aliasMap.entries())],
    queryFn: async () => {
      // First, get all valid setters for this org (ones with proper names in the setters table)
      const { data: validSetters, error: settersError } = await supabase
        .from('setters')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('is_active', true);

      if (settersError) throw settersError;

      // If no setters configured, return empty
      if (!validSetters || validSetters.length === 0) {
        return [];
      }

      // Create a set of valid setter names for quick lookup (case-insensitive)
      const validSetterNames = new Set(validSetters.map(s => s.name.toLowerCase().trim()));

      // Fetch events with setter info for this organization
      let eventsQuery = supabase
        .from('events')
        .select('id, setter_name, event_outcome, call_status, scheduled_at, booking_metadata')
        .eq('organization_id', orgId!)
        .not('setter_name', 'is', null)
        .neq('setter_name', '');

      // Apply date filters - default to past events only if no explicit range
      const nowISO = new Date().toISOString();
      if (startDate) {
        eventsQuery = eventsQuery.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        eventsQuery = eventsQuery.lte('scheduled_at', endDate.toISOString());
      } else if (!startDate && !endDate) {
        // Default: only show past events when no date range is selected
        eventsQuery = eventsQuery.lt('scheduled_at', nowISO);
      }

      const { data: events, error } = await eventsQuery;

      if (error) throw error;

      // Group by setter - only include setters that match valid setter names (after alias resolution)
      const now = new Date();
      const setterMap: Record<string, { 
        callsSet: number; 
        showed: number; 
        noShows: number;
        closed: number;
        hasCRM: boolean;
        hasUTM: boolean;
      }> = {};

      for (const event of events || []) {
        // Get setter from either CRM (setter_name) or UTM (booking_metadata.utm_setter)
        const crmSetter = event.setter_name?.trim();
        const bookingMetadata = event.booking_metadata as { utm_setter?: string } | null;
        const utmSetter = bookingMetadata?.utm_setter?.trim();
        
        // Use alias resolution to get canonical name
        const rawSetter = crmSetter || utmSetter;
        const setter = resolveSetterName(rawSetter, aliasMap);
        
        // Skip if junk data or null
        if (!setter) continue;

        // Check if this setter (after resolution) exists in the setters table
        if (!validSetterNames.has(setter.toLowerCase())) {
          continue;
        }

        if (!setterMap[setter]) {
          setterMap[setter] = { callsSet: 0, showed: 0, noShows: 0, closed: 0, hasCRM: false, hasUTM: false };
        }
        
        // Track attribution sources
        if (crmSetter) setterMap[setter].hasCRM = true;
        if (utmSetter) setterMap[setter].hasUTM = true;
        
        // Always count callsSet (all scheduled events)
        setterMap[setter].callsSet++;
        
        // Only count showed/noShows/closed for PAST events
        const isPastEvent = new Date(event.scheduled_at) < now;
        if (!isPastEvent) continue;

        // Count showed (any outcome that indicates they showed up)
        if (event.event_outcome && event.event_outcome !== 'no_show') {
          setterMap[setter].showed++;
        }
        
        // Count no-shows
        if (event.event_outcome === 'no_show') {
          setterMap[setter].noShows++;
        }

        // Count closed
        if (event.event_outcome === 'closed') {
          setterMap[setter].closed++;
        }
      }

      // Convert to array with calculated rates
      const stats: SetterStats[] = Object.entries(setterMap).map(([setterName, data]) => {
        const attendedOrNoShow = data.showed + data.noShows;
        
        // Determine attribution source
        let attributionSource: 'crm' | 'utm' | 'mixed' = 'crm';
        if (data.hasCRM && data.hasUTM) {
          attributionSource = 'mixed';
        } else if (data.hasUTM && !data.hasCRM) {
          attributionSource = 'utm';
        }
        
        return {
          setterName,
          attributionSource,
          callsSet: data.callsSet,
          showed: data.showed,
          showRate: attendedOrNoShow > 0 ? Math.round((data.showed / attendedOrNoShow) * 100) : 0,
          closed: data.closed,
          closeRate: data.showed > 0 ? Math.round((data.closed / data.showed) * 100) : 0,
        };
      });

      // Sort by selected metric
      stats.sort((a, b) => {
        switch (sortBy) {
          case 'showRate':
            return b.showRate - a.showRate;
          case 'closeRate':
            return b.closeRate - a.closeRate;
          case 'callsSet':
          default:
            return b.callsSet - a.callsSet;
        }
      });

      return stats;
    },
    enabled: !!orgId && !aliasesLoading,
  });

  return {
    ...query,
    isLoading: query.isLoading || aliasesLoading,
  };
}
