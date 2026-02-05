import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';

interface AggregateItem {
  name: string;
  count: number;
}

interface PlatformCashItem {
  platform: string;
  cashCollected: number;
}

export interface PlatformAggregatesResult {
  callTypeCompleted: AggregateItem[];
  callTypeCreated: AggregateItem[];
  sourceCompleted: AggregateItem[];
  sourceCreated: AggregateItem[];
  platformCash: PlatformCashItem[];
  isLoading: boolean;
}

interface UsePlatformAggregatesParams {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  utmPlatform?: string;
}

export function usePlatformAggregates({ startDate, endDate, bookingPlatform, utmPlatform }: UsePlatformAggregatesParams): PlatformAggregatesResult {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['platform-aggregates', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform, utmPlatform],
    queryFn: async () => {
      // Fetch events with date range filtering
      let eventsQuery = supabase
        .from('events')
        .select('id, event_name, scheduled_at, booked_at, call_status, close_custom_fields, booking_metadata, booking_platform, event_outcome, no_show_guest, meeting_started_at')
        .eq('organization_id', orgId!)
        .not('call_status', 'in', '("canceled","rescheduled")');

      if (startDate) {
        eventsQuery = eventsQuery.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        eventsQuery = eventsQuery.lte('scheduled_at', endDate.toISOString());
      }
      if (bookingPlatform) {
        eventsQuery = eventsQuery.eq('booking_platform', bookingPlatform);
      }
      if (utmPlatform) {
        eventsQuery = eventsQuery.contains('booking_metadata', { utm_platform: utmPlatform });
      }

      const { data: events, error: eventsError } = await eventsQuery.limit(5000);
      if (eventsError) throw eventsError;

      // Fetch payments with event_id for cash calculation
      // SECURITY: Always filter by organization_id to prevent cross-org data leak
      let paymentsQuery = supabase
        .from('payments')
        .select('event_id, amount, refund_amount')
        .eq('organization_id', orgId!)
        .not('event_id', 'is', null);

      const { data: payments, error: paymentsError } = await paymentsQuery.limit(5000);
      if (paymentsError) throw paymentsError;

      // Create a map of event_id to payment totals
      const paymentsByEventId = new Map<string, number>();
      payments?.forEach(p => {
        if (p.event_id) {
          const net = (p.amount || 0) - (p.refund_amount || 0);
          paymentsByEventId.set(
            p.event_id,
            (paymentsByEventId.get(p.event_id) || 0) + net
          );
        }
      });

      // Aggregate Call Types - Completed (past events) vs Created (by booked_at)
      // "Completed" = events where scheduled_at < now (for accurate outcome metrics)
      // "Created" = events where booked_at is in range (for UTM tracking journey)
      const now = new Date();
      const callTypeCompletedMap = new Map<string, number>();
      const callTypeCreatedMap = new Map<string, number>();
      const sourceCompletedMap = new Map<string, number>();
      const sourceCreatedMap = new Map<string, number>();
      const platformCashMap = new Map<string, number>();

      events?.forEach(event => {
        const callType = event.event_name || 'Unknown';
        const customFields = event.close_custom_fields as Record<string, string> | null;
        const bookingMeta = event.booking_metadata as Record<string, string> | null;
        
        // Merge: CRM platform takes priority, fallback to UTM platform
        const rawPlatform = customFields?.platform || bookingMeta?.utm_platform || null;
        const platform = rawPlatform ? getCanonicalSource(rawPlatform) : 'Unknown';

        // Count by scheduled_at < now (only PAST events count as "completed")
        const eventDate = new Date(event.scheduled_at);
        if (eventDate < now) {
          callTypeCompletedMap.set(callType, (callTypeCompletedMap.get(callType) || 0) + 1);
          sourceCompletedMap.set(platform, (sourceCompletedMap.get(platform) || 0) + 1);
        }

        // Count by booked_at (events created/booked in range - for UTM tracking)
        if (event.booked_at) {
          const bookedDate = new Date(event.booked_at);
          const inRange = (!startDate || bookedDate >= startDate) && (!endDate || bookedDate <= endDate);
          if (inRange) {
            callTypeCreatedMap.set(callType, (callTypeCreatedMap.get(callType) || 0) + 1);
            sourceCreatedMap.set(platform, (sourceCreatedMap.get(platform) || 0) + 1);
          }
        }

        // Cash collected per platform (only from past completed events)
        if (eventDate < now) {
          const eventCash = paymentsByEventId.get(event.id) || 0;
          if (eventCash > 0) {
            platformCashMap.set(platform, (platformCashMap.get(platform) || 0) + eventCash);
          }
        }
      });

      // Convert maps to sorted arrays
      const toSortedArray = (map: Map<string, number>): AggregateItem[] => 
        Array.from(map.entries())
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count);

      const toPlatformCashArray = (map: Map<string, number>): PlatformCashItem[] =>
        Array.from(map.entries())
          .map(([platform, cashCollected]) => ({ platform, cashCollected: Math.round(cashCollected * 100) / 100 }))
          .sort((a, b) => b.cashCollected - a.cashCollected);

      return {
        callTypeCompleted: toSortedArray(callTypeCompletedMap),
        callTypeCreated: toSortedArray(callTypeCreatedMap),
        sourceCompleted: toSortedArray(sourceCompletedMap),
        sourceCreated: toSortedArray(sourceCreatedMap),
        platformCash: toPlatformCashArray(platformCashMap),
      };
    },
    enabled: !!user && !!orgId,
  });

  return {
    callTypeCompleted: data?.callTypeCompleted || [],
    callTypeCreated: data?.callTypeCreated || [],
    sourceCompleted: data?.sourceCompleted || [],
    sourceCreated: data?.sourceCreated || [],
    platformCash: data?.platformCash || [],
    isLoading,
  };
}
