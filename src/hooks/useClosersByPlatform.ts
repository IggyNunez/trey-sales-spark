import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { getCanonicalSource, matchesCanonicalSource } from '@/lib/trafficSourceNormalization';
import { useCloserDisplayNames } from './useCloserDisplayNames';
import { resolveCloserDisplayName } from '@/lib/identityResolver';

export interface CloserByPlatformMetrics {
  closerName: string;
  closerEmail: string | null;
  totalCalls: number;
  showed: number;
  noShows: number;
  showRate: number;
  offersMade: number;
  dealsClosed: number;
  closeRate: number;
  cashCollected: number;
}

interface UseClosersByPlatformParams {
  startDate?: Date;
  endDate?: Date;
  platform?: string | null;
  bookingPlatform?: string;
}

export function useClosersByPlatform({
  startDate,
  endDate,
  platform,
  bookingPlatform,
}: UseClosersByPlatformParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { displayNameMap, isLoading: displayNamesLoading } = useCloserDisplayNames();

  // Fetch events with platform data
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['events-for-closer-platform', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('id, event_outcome, call_status, close_custom_fields, booking_metadata, closer_name, closer_email, scheduled_at, booking_platform')
        .eq('organization_id', orgId!);

      if (startDate) {
        query = query.gte('scheduled_at', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('scheduled_at', endDate.toISOString());
      }
      if (bookingPlatform) {
        query = query.eq('booking_platform', bookingPlatform);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch payments for cash calculation
  const { data: payments, isLoading: paymentsLoading } = useQuery({
    queryKey: ['payments-for-closer-platform', orgId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('event_id, amount, refund_amount')
        .eq('organization_id', orgId!);

      if (startDate) {
        query = query.gte('payment_date', startDate.toISOString());
      }
      if (endDate) {
        query = query.lte('payment_date', endDate.toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const closerMetrics = useMemo(() => {
    if (!events) return [];

    // Filter by platform if specified (using alias-aware matching)
    let filteredEvents = events;
    if (platform && platform !== 'all') {
      filteredEvents = events.filter(event => {
        const customFields = event.close_custom_fields as Record<string, string> | null;
        const bookingMeta = event.booking_metadata as Record<string, string> | null;
        const rawPlatform = customFields?.platform || bookingMeta?.utm_platform;
        return matchesCanonicalSource(rawPlatform, platform);
      });
    }

    // Filter out canceled/rescheduled
    const activeEvents = filteredEvents.filter(
      e => !['canceled', 'cancelled', 'rescheduled'].includes(e.call_status)
    );

    // Create payment lookup by event_id
    const paymentsByEvent = new Map<string, number>();
    payments?.forEach(p => {
      if (p.event_id) {
        const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : (p.amount || 0);
        const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
        const current = paymentsByEvent.get(p.event_id) || 0;
        paymentsByEvent.set(p.event_id, current + (amount - refund));
      }
    });

    // Group events by closer email (for deduplication), but track display name
    const closerMap = new Map<string, {
      closerName: string;
      closerEmail: string | null;
      events: typeof activeEvents;
    }>();

    activeEvents.forEach(event => {
      if (!event.closer_name) return;
      
      // Use email as key for deduplication (already correct behavior)
      const key = event.closer_email?.toLowerCase() || event.closer_name.toLowerCase();
      
      if (!closerMap.has(key)) {
        // Use display name from closers table if available
        const displayName = resolveCloserDisplayName(
          event.closer_name,
          event.closer_email,
          displayNameMap
        ) || event.closer_name;
        
        closerMap.set(key, {
          closerName: displayName,
          closerEmail: event.closer_email,
          events: [],
        });
      }
      
      closerMap.get(key)!.events.push(event);
    });

    // Calculate metrics for each closer
    const result: CloserByPlatformMetrics[] = [];
    const now = new Date();

    closerMap.forEach(({ closerName, closerEmail, events: closerEvents }) => {
      const pastEvents = closerEvents.filter(e => new Date(e.scheduled_at) < now);
      const totalCalls = closerEvents.length;
      
      // Shows = events with outcome that isn't 'no_show'
      const showed = pastEvents.filter(e => 
        e.event_outcome && e.event_outcome !== 'no_show'
      ).length;
      
      // No Shows = events with 'no_show' outcome
      const noShows = pastEvents.filter(e => e.event_outcome === 'no_show').length;
      
      // Offers = showed_offer_no_close OR closed
      const offersMade = pastEvents.filter(e => 
        e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
      ).length;
      
      // Deals Closed = closed outcome
      const dealsClosed = pastEvents.filter(e => e.event_outcome === 'closed').length;

      // Calculate rates
      const attendedOrNoShow = showed + noShows;
      const showRate = attendedOrNoShow > 0 ? Math.round((showed / attendedOrNoShow) * 100) : 0;
      const closeRate = showed > 0 ? Math.round((dealsClosed / showed) * 100) : 0;

      // Calculate cash collected
      const cashCollected = closerEvents.reduce((sum, e) => {
        return sum + (paymentsByEvent.get(e.id) || 0);
      }, 0);

      result.push({
        closerName,
        closerEmail,
        totalCalls,
        showed,
        noShows,
        showRate,
        offersMade,
        dealsClosed,
        closeRate,
        cashCollected,
      });
    });

    // Sort by cash collected descending
    return result.sort((a, b) => b.cashCollected - a.cashCollected);
  }, [events, payments, platform, displayNameMap]);

  // Get unique platforms for dropdown (normalized to canonical names)
  const platforms = useMemo(() => {
    if (!events) return [];
    
    const platformSet = new Set<string>();
    events.forEach(event => {
      const customFields = event.close_custom_fields as Record<string, string> | null;
      const bookingMeta = event.booking_metadata as Record<string, string> | null;
      const rawPlatform = customFields?.platform || bookingMeta?.utm_platform;
      if (rawPlatform) {
        platformSet.add(getCanonicalSource(rawPlatform));
      }
    });
    
    return Array.from(platformSet).sort();
  }, [events]);

  return { 
    data: closerMetrics, 
    platforms,
    isLoading: eventsLoading || paymentsLoading || displayNamesLoading 
  };
}
