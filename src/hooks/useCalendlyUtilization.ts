import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

export interface CalendlyEventType {
  uri: string;
  name: string;
  slug: string;
  duration: number;
}

export interface EventTypeUtilization {
  name: string;
  kind: string;
  totalSlots: number;
  bookedSlots: number;
  availableSlots: number;
  uniqueTimesAvailable: number; // Distinct time slots with at least 1 closer free
  totalSlotsAvailable: number; // Sum of all closer availability (2 closers at 2pm = 2)
  utilizationPercent: number;
  isTeamEvent: boolean;
  uri: string;
  fetchFailed?: boolean; // True if API call failed for this event type
  hostCount?: number; // Number of hosts assigned to this event type
}

export interface CalendlyUtilization {
  success: boolean;
  dateRange: {
    start: string;
    end: string;
  };
  overall: {
    totalSlots: number;
    bookedSlots: number;
    uniqueTimesAvailable: number; // Distinct time slots with at least 1 closer free
    totalSlotsAvailable: number; // Sum of all closer availability
    utilizationPercent: number;
  };
  byEventType: EventTypeUtilization[];
}

export function useCalendlyEventTypes() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['calendly-event-types', orgId],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-calendly-utilization', {
          body: {
            organizationId: orgId,
            listEventTypesOnly: true,
          },
        });

        // Handle missing API key gracefully - return empty array instead of throwing
        if (error || data?.error) {
          console.warn('Calendly API not configured:', data?.error || error?.message);
          return [] as CalendlyEventType[];
        }
        return (data?.eventTypes || []) as CalendlyEventType[];
      } catch (err) {
        console.warn('Calendly API error:', err);
        return [] as CalendlyEventType[];
      }
    },
    enabled: !!orgId,
    staleTime: 30 * 60 * 1000, // 30 minutes
    retry: false, // Don't retry if API key is missing
  });
}

export function useCalendlyUtilization(startDate?: Date, endDate?: Date, eventTypeUris?: string[]) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['calendly-utilization', orgId, startDate?.toISOString(), endDate?.toISOString(), eventTypeUris],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.functions.invoke('get-calendly-utilization', {
          body: {
            organizationId: orgId,
            startDate: startDate?.toISOString(),
            endDate: endDate?.toISOString(),
            eventTypeUris: eventTypeUris,
          },
        });

        // Handle missing API key gracefully - return null instead of throwing
        if (error || data?.error) {
          console.warn('Calendly API not configured:', data?.error || error?.message);
          return null;
        }
        return data as CalendlyUtilization;
      } catch (err) {
        console.warn('Calendly API error:', err);
        return null;
      }
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false, // Don't retry if API key is missing
  });
}
