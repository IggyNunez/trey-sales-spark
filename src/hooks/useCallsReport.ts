import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';
import { startOfMonth, endOfMonth } from 'date-fns';

export interface CallsReportFilters {
  startDate?: Date;
  endDate?: Date;
  trafficSources?: string[];
  closerName?: string;
  setterName?: string;
  eventType?: string;
  outcome?: 'all' | 'showed' | 'closed' | 'no_show';
  bookingPlatform?: string;
}

export interface SourceBreakdownItem {
  source: string;
  scheduledCount: number;
  bookedCount: number;
  showed: number;
  noShows: number;
  showRate: number;
  dealsClosed: number;
  closeRate: number;
  revenue: number;
}

export interface CallsReportSummary {
  totalCalls: number;
  showed: number;
  noShows: number;
  showRate: number;
  dealsClosed: number;
  closeRate: number;
  totalRevenue: number;
}

export interface CallsReportEvent {
  id: string;
  lead_name: string;
  lead_email: string;
  lead_phone: string | null;
  scheduled_at: string;
  booked_at: string | null;
  event_outcome: string | null;
  call_status: string;
  closer_name: string | null;
  setter_name: string | null;
  event_name: string | null;
  booking_platform: string | null;
  pcf_submitted: boolean;
  trafficSource: string | null;
  utmCampaign: string | null;
  revenue: number;
}

export interface CallsReportData {
  summary: CallsReportSummary;
  sourceBreakdown: SourceBreakdownItem[];
  events: CallsReportEvent[];
  availableSources: string[];
  availableClosers: string[];
  availableSetters: string[];
  availableEventTypes: string[];
}

function extractTrafficSource(event: {
  booking_metadata: unknown;
  close_custom_fields: unknown;
}): string | null {
  const bookingMeta = event.booking_metadata as Record<string, string> | null;
  const closeFields = event.close_custom_fields as Record<string, string> | null;
  
  const raw = bookingMeta?.utm_platform || closeFields?.platform || null;
  return raw ? getCanonicalSource(raw) : null;
}

function extractSetterName(event: {
  booking_metadata: unknown;
  setter_name: string | null;
}): string | null {
  const bookingMeta = event.booking_metadata as Record<string, string> | null;
  return bookingMeta?.utm_setter || event.setter_name || null;
}

function extractUtmCampaign(event: { booking_metadata: unknown }): string | null {
  const bookingMeta = event.booking_metadata as Record<string, string> | null;
  return bookingMeta?.utm_campaign || null;
}

export function useCallsReport(filters: CallsReportFilters) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  // Default to current month if no dates provided
  const startDate = filters.startDate || startOfMonth(new Date());
  const endDate = filters.endDate || endOfMonth(new Date());

  return useQuery({
    queryKey: ['calls-report', orgId, startDate?.toISOString(), endDate?.toISOString(), filters],
    queryFn: async (): Promise<CallsReportData> => {
      // Fetch events with all attribution fields
      let query = supabase
        .from('events')
        .select(`
          id,
          lead_name,
          lead_email,
          lead_phone,
          scheduled_at,
          booked_at,
          event_outcome,
          call_status,
          closer_name,
          setter_name,
          event_name,
          booking_platform,
          booking_metadata,
          close_custom_fields,
          pcf_submitted
        `)
        .eq('organization_id', orgId!)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: false })
        .limit(5000);

      // Apply booking platform filter
      if (filters.bookingPlatform) {
        query = query.eq('booking_platform', filters.bookingPlatform);
      }

      // Apply closer filter
      if (filters.closerName) {
        query = query.eq('closer_name', filters.closerName);
      }

      // Apply event type filter
      if (filters.eventType) {
        query = query.eq('event_name', filters.eventType);
      }

      const { data: eventsData, error: eventsError } = await query;
      if (eventsError) throw eventsError;

      // Fetch payments for revenue calculation
      // Batch event IDs to avoid URL length limits (max ~100 IDs per request)
      const eventIds = eventsData?.map(e => e.id) || [];
      let paymentsMap: Record<string, number> = {};
      
      if (eventIds.length > 0) {
        const BATCH_SIZE = 100;
        const batches: string[][] = [];
        
        for (let i = 0; i < eventIds.length; i += BATCH_SIZE) {
          batches.push(eventIds.slice(i, i + BATCH_SIZE));
        }
        
        // Fetch payments in parallel batches
        const paymentsResults = await Promise.all(
          batches.map(batch =>
            supabase
              .from('payments')
              .select('event_id, amount, refund_amount')
              .in('event_id', batch)
          )
        );
        
        // Check for errors and aggregate payments
        for (const result of paymentsResults) {
          if (result.error) throw result.error;
          
          result.data?.forEach(p => {
            const netRevenue = (p.amount || 0) - (p.refund_amount || 0);
            paymentsMap[p.event_id] = (paymentsMap[p.event_id] || 0) + netRevenue;
          });
        }
      }

      // Process events with enrichments
      let processedEvents: CallsReportEvent[] = (eventsData || []).map(event => ({
        id: event.id,
        lead_name: event.lead_name,
        lead_email: event.lead_email,
        lead_phone: event.lead_phone,
        scheduled_at: event.scheduled_at,
        booked_at: event.booked_at,
        event_outcome: event.event_outcome,
        call_status: event.call_status,
        closer_name: event.closer_name,
        setter_name: extractSetterName(event),
        event_name: event.event_name,
        booking_platform: event.booking_platform,
        pcf_submitted: event.pcf_submitted,
        trafficSource: extractTrafficSource(event),
        utmCampaign: extractUtmCampaign(event),
        revenue: paymentsMap[event.id] || 0,
      }));

      // Apply setter filter (post-query since it's extracted from metadata)
      if (filters.setterName) {
        processedEvents = processedEvents.filter(e => e.setter_name === filters.setterName);
      }

      // Apply traffic source filter (post-query since it's normalized)
      if (filters.trafficSources && filters.trafficSources.length > 0) {
        processedEvents = processedEvents.filter(e => 
          e.trafficSource && filters.trafficSources!.includes(e.trafficSource)
        );
      }

      // Apply outcome filter
      if (filters.outcome && filters.outcome !== 'all') {
        processedEvents = processedEvents.filter(e => {
          switch (filters.outcome) {
            case 'showed':
              return e.event_outcome && e.event_outcome !== 'no_show';
            case 'closed':
              return e.event_outcome === 'closed';
            case 'no_show':
              return e.call_status === 'no_show' || e.event_outcome === 'no_show';
            default:
              return true;
          }
        });
      }

      // Calculate summary metrics - only count outcomes for past events
      const now = new Date();
      const pastEvents = processedEvents.filter(e => new Date(e.scheduled_at) < now);
      
      const totalCalls = processedEvents.length;
      const showed = pastEvents.filter(e => 
        e.event_outcome && e.event_outcome !== 'no_show'
      ).length;
      const noShows = pastEvents.filter(e => 
        e.call_status === 'no_show' || e.event_outcome === 'no_show'
      ).length;
      const dealsClosed = pastEvents.filter(e => e.event_outcome === 'closed').length;
      const totalRevenue = processedEvents.reduce((sum, e) => sum + e.revenue, 0);

      const showRate = (showed + noShows) > 0 ? (showed / (showed + noShows)) * 100 : 0;
      const closeRate = showed > 0 ? (dealsClosed / showed) * 100 : 0;

      // Build source breakdown
      const sourceMap = new Map<string, SourceBreakdownItem>();
      
      processedEvents.forEach(event => {
        const source = event.trafficSource || 'Unknown';
        
        if (!sourceMap.has(source)) {
          sourceMap.set(source, {
            source,
            scheduledCount: 0,
            bookedCount: 0,
            showed: 0,
            noShows: 0,
            showRate: 0,
            dealsClosed: 0,
            closeRate: 0,
            revenue: 0,
          });
        }
        
        const item = sourceMap.get(source)!;
        item.scheduledCount++;
        
        if (event.booked_at) {
          item.bookedCount++;
        }
        
        // Only count outcomes for past events in source breakdown
        const isPastEvent = new Date(event.scheduled_at) < now;
        
        if (isPastEvent && event.event_outcome && event.event_outcome !== 'no_show') {
          item.showed++;
        }
        
        if (isPastEvent && (event.call_status === 'no_show' || event.event_outcome === 'no_show')) {
          item.noShows++;
        }
        
        if (isPastEvent && event.event_outcome === 'closed') {
          item.dealsClosed++;
        }
        
        item.revenue += event.revenue;
      });

      // Calculate rates for each source
      const sourceBreakdown = Array.from(sourceMap.values()).map(item => ({
        ...item,
        showRate: (item.showed + item.noShows) > 0 
          ? (item.showed / (item.showed + item.noShows)) * 100 
          : 0,
        closeRate: item.showed > 0 
          ? (item.dealsClosed / item.showed) * 100 
          : 0,
      })).sort((a, b) => b.scheduledCount - a.scheduledCount);

      // Extract unique values for filter dropdowns
      const availableSources = [...new Set(
        (eventsData || [])
          .map(e => extractTrafficSource(e))
          .filter((s): s is string => !!s)
      )].sort();

      const availableClosers = [...new Set(
        (eventsData || [])
          .map(e => e.closer_name)
          .filter((s): s is string => !!s)
      )].sort();

      const availableSetters = [...new Set(
        (eventsData || [])
          .map(e => extractSetterName(e))
          .filter((s): s is string => !!s)
      )].sort();

      const availableEventTypes = [...new Set(
        (eventsData || [])
          .map(e => e.event_name)
          .filter((s): s is string => !!s)
      )].sort();

      return {
        summary: {
          totalCalls,
          showed,
          noShows,
          showRate,
          dealsClosed,
          closeRate,
          totalRevenue,
        },
        sourceBreakdown,
        events: processedEvents,
        availableSources,
        availableClosers,
        availableSetters,
        availableEventTypes,
      };
    },
    enabled: !!user && !!orgId,
    staleTime: 2 * 60 * 1000,
  });
}
