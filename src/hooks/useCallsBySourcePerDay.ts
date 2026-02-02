import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';

export interface SourceDayData {
  date: string;
  dateLabel: string;
  sources: Record<string, number>;
  total: number;
}

export interface CallsBySourceResult {
  days: SourceDayData[];
  sources: Array<{ id: string; name: string }>;
  totals: Record<string, number>;
  grandTotal: number;
}

interface UseCallsBySourceParams {
  startDate?: Date;
  endDate?: Date;
}

export function useCallsBySourcePerDay({ startDate, endDate }: UseCallsBySourceParams = {}) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['calls-by-source-per-day', orgId, startDate?.toISOString(), endDate?.toISOString()],
    queryFn: async () => {
      if (!startDate || !endDate) {
        return { days: [], sources: [], totals: {}, grandTotal: 0 };
      }

      // Fetch events with source info
      const { data: events, error } = await supabase
        .from('events')
        .select('id, scheduled_at, source_id, sources(id, name)')
        .eq('organization_id', orgId!)
        .gte('scheduled_at', startDate.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: true });

      if (error) throw error;

      // Get unique sources
      const sourceMap = new Map<string, string>();
      sourceMap.set('no_source', 'No Source');
      
      events?.forEach(e => {
        const source = e.sources as { id: string; name: string } | null;
        if (source) {
          sourceMap.set(source.id, source.name);
        }
      });

      const sources = Array.from(sourceMap.entries()).map(([id, name]) => ({ id, name }));

      // Generate all days in range
      const days = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Initialize data structure
      const dayData: SourceDayData[] = days.map(day => ({
        date: format(day, 'yyyy-MM-dd'),
        dateLabel: format(day, 'EEE MMM d'),
        sources: {},
        total: 0,
      }));

      // Count events per source per day
      const totals: Record<string, number> = {};
      let grandTotal = 0;

      events?.forEach(event => {
        // Get the day in EST
        const eventDate = formatInTimeZone(new Date(event.scheduled_at), 'America/New_York', 'yyyy-MM-dd');
        const dayEntry = dayData.find(d => d.date === eventDate);
        
        if (dayEntry) {
          const source = event.sources as { id: string; name: string } | null;
          const sourceId = source?.id || 'no_source';
          
          dayEntry.sources[sourceId] = (dayEntry.sources[sourceId] || 0) + 1;
          dayEntry.total += 1;
          totals[sourceId] = (totals[sourceId] || 0) + 1;
          grandTotal += 1;
        }
      });

      return {
        days: dayData,
        sources,
        totals,
        grandTotal,
      } as CallsBySourceResult;
    },
    enabled: !!orgId && !!startDate && !!endDate,
  });
}