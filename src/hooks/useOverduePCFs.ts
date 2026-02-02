import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { matchesCloseFieldFilters } from '@/lib/closeFieldFiltering';

interface OverduePCFFilters {
  startDate?: Date;
  endDate?: Date;
  closeFieldFilters?: Record<string, string | null>;
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  bookingPlatform?: string;
  // Note: If endDate is provided, it's used as the cutoff; otherwise, start of today is used
}

interface OverdueEvent {
  id: string;
  scheduled_at: string;
  call_status: string;
  pcf_submitted: boolean;
  closer_name: string | null;
  lead_name: string;
  lead_email: string;
  event_name: string | null;
  close_custom_fields: Record<string, unknown> | null;
}

// Helper to get EST/EDT offset based on month
function getESTOffsetForMonth(month: number): number {
  // EDT (UTC-4) is roughly March-November, EST (UTC-5) is November-March
  // Simplified check - month is 0-indexed (0 = January)
  if (month >= 2 && month <= 10) {
    return 4; // EDT offset (UTC-4)
  }
  return 5; // EST offset (UTC-5)
}

// Helper to get start of today in EST timezone
function getStartOfTodayEST(): Date {
  const EST_TIMEZONE = 'America/New_York';
  const now = new Date();
  
  // Get current date in EST
  const estFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: EST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = estFormatter.formatToParts(now);
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '2026');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  
  // Create midnight EST/EDT and convert to UTC using dynamic offset
  const offset = getESTOffsetForMonth(month);
  const estMidnight = new Date(Date.UTC(year, month, day, offset, 0, 0, 0));
  
  return estMidnight;
}

export function useOverduePCFs(filters?: OverduePCFFilters) {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: [
      'overdue-pcfs', 
      orgId, 
      filters?.startDate?.toISOString(), 
      filters?.endDate?.toISOString(),
      filters?.closeFieldFilters ? JSON.stringify(filters.closeFieldFilters) : null,
      filters?.sourceId ?? null,
      filters?.sourceIds?.length ? filters.sourceIds.join(',') : null,
      filters?.trafficTypeId ?? null,
      filters?.bookingPlatform ?? null,
    ],
    queryFn: async () => {
      // Determine the upper bound for overdue events:
      // - If endDate is provided (custom range), use min(endDate, startOfToday)
      // - Otherwise, use startOfToday (events can only be overdue if their day has passed)
      const startOfToday = getStartOfTodayEST();
      
      // For overdue calculation, we can only count events that have already occurred
      // So the effective end date is the minimum of: provided endDate or start of today
      let effectiveEndDate = startOfToday;
      if (filters?.endDate) {
        // Use the earlier of endDate or startOfToday
        effectiveEndDate = filters.endDate < startOfToday ? filters.endDate : startOfToday;
      }
      
      let query = supabase
        .from('events')
        .select('id, scheduled_at, call_status, pcf_submitted, closer_name, lead_name, lead_email, event_name, close_custom_fields')
        .eq('organization_id', orgId!)
        .eq('pcf_submitted', false)
        // Only events scheduled BEFORE the effective end date can be overdue
        .lt('scheduled_at', effectiveEndDate.toISOString())
        // Exclude cancelled/rescheduled - these don't need PCFs
        .not('call_status', 'in', '("cancelled","canceled","rescheduled")')
        .order('scheduled_at', { ascending: false });

      // Apply Platform/Traffic filters server-side (critical for dashboard reactivity)
      if (filters?.sourceIds && filters.sourceIds.length > 0) {
        query = query.in('source_id', filters.sourceIds);
      } else if (filters?.sourceId) {
        query = query.eq('source_id', filters.sourceId);
      }
      if (filters?.trafficTypeId) {
        query = query.eq('traffic_type_id', filters.trafficTypeId);
      }
      if (filters?.bookingPlatform) {
        query = query.eq('booking_platform', filters.bookingPlatform);
      }

      // Apply start date filter if provided
      if (filters?.startDate) {
        query = query.gte('scheduled_at', filters.startDate.toISOString());
      }

      const { data, error } = await query;
      
      if (error) throw error;
      
      let results = data as OverdueEvent[];
      
      // Apply Close CRM custom field filters client-side
      results = results.filter((event) =>
        matchesCloseFieldFilters(event.close_custom_fields, filters?.closeFieldFilters)
      );
      
      return results;
    },
    enabled: !!orgId && !!user,
    staleTime: 30000, // 30 seconds
  });
}

export function useOverduePCFCount(filters?: OverduePCFFilters) {
  const { data: overdueEvents, isLoading } = useOverduePCFs(filters);
  
  const count = overdueEvents?.length ?? 0;
  
  // Group by closer for the breakdown card
  const byCloser = overdueEvents?.reduce((acc, event) => {
    const name = event.closer_name || 'Unknown';
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) ?? {};
  
  const overdueByCloser = Object.entries(byCloser)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));
  
  return {
    count,
    overdueByCloser,
    events: overdueEvents ?? [],
    isLoading,
  };
}
