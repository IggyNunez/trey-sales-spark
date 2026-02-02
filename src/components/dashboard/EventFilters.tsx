import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, X, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/hooks/useOrganization';
import { useUtmFieldValues } from '@/hooks/useUtmFieldValues';

export interface UtmFilters {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_channel?: string | null;
  utm_campaign?: string | null;
  utm_setter?: string | null;
}

interface EventFiltersProps {
  closerId: string | null;
  setterId: string | null;
  sourceId: string | null;
  eventNameFilter: string | null;
  eventNameFilterMode: 'exact' | 'contains' | 'starts' | 'ends';
  status: string | null;
  outcome: string | null;
  pcfStatus: string | null;
  scheduledDateStart: Date | null;
  scheduledDateEnd: Date | null;
  utmFilters?: UtmFilters;
  onCloserChange: (id: string | null) => void;
  onSetterChange: (id: string | null) => void;
  onSourceChange: (id: string | null) => void;
  onEventNameFilterChange: (name: string | null) => void;
  onEventNameFilterModeChange: (mode: 'exact' | 'contains' | 'starts' | 'ends') => void;
  onStatusChange: (status: string | null) => void;
  onOutcomeChange: (outcome: string | null) => void;
  onPcfStatusChange: (status: string | null) => void;
  onScheduledDateStartChange: (date: Date | null) => void;
  onScheduledDateEndChange: (date: Date | null) => void;
  onUtmFiltersChange?: (filters: UtmFilters) => void;
}

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'no_show', label: 'No Show' },
];

const OUTCOME_OPTIONS = [
  { value: 'no_show', label: 'No Show' },
  { value: 'showed_no_offer', label: 'Showed - No Offer' },
  { value: 'showed_offer_no_close', label: 'Offered - No Close' },
  { value: 'closed', label: 'Closed' },
];

const PCF_STATUS_OPTIONS = [
  { value: 'pending', label: 'PCF Pending' },
  { value: 'submitted', label: 'PCF Submitted' },
];

const FILTER_MODE_OPTIONS = [
  { value: 'contains', label: 'Contains' },
  { value: 'exact', label: 'Exact Match' },
  { value: 'starts', label: 'Starts With' },
  { value: 'ends', label: 'Ends With' },
];

export function EventFilters({
  closerId,
  setterId,
  sourceId,
  eventNameFilter,
  eventNameFilterMode,
  status,
  outcome,
  pcfStatus,
  scheduledDateStart,
  scheduledDateEnd,
  utmFilters = {},
  onCloserChange,
  onSetterChange,
  onSourceChange,
  onEventNameFilterChange,
  onEventNameFilterModeChange,
  onStatusChange,
  onOutcomeChange,
  onPcfStatusChange,
  onScheduledDateStartChange,
  onScheduledDateEndChange,
  onUtmFiltersChange,
}: EventFiltersProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [showUtmFilters, setShowUtmFilters] = useState(false);
  
  // Fetch UTM field values for dropdowns
  const { data: utmFieldValues } = useUtmFieldValues();

  // Fetch closers
  const { data: closers } = useQuery({
    queryKey: ['closers', orgId],
    queryFn: async () => {
      let query = supabase.from('closers').select('*').eq('is_active', true).order('name');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch setters
  const { data: setters } = useQuery({
    queryKey: ['setters', orgId],
    queryFn: async () => {
      let query = supabase.from('setters').select('*').eq('is_active', true).order('name');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch sources
  const { data: sources } = useQuery({
    queryKey: ['sources', orgId],
    queryFn: async () => {
      let query = supabase.from('sources').select('*').order('name');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch unique event names for filter
  const { data: eventNames } = useQuery({
    queryKey: ['event-names', orgId],
    queryFn: async () => {
      let query = supabase.from('events').select('event_name').not('event_name', 'is', null);
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      // Get unique event names and sort
      const uniqueNames = [...new Set(data?.map(e => e.event_name).filter(Boolean) as string[])];
      return uniqueNames.sort();
    },
    enabled: !!orgId,
  });

  // Get unique closer names from events (for those not in closers table)
  const { data: eventClosers } = useQuery({
    queryKey: ['event-closers', orgId],
    queryFn: async () => {
      let query = supabase.from('events').select('closer_name').not('closer_name', 'is', null);
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      // Get unique closer names
      const uniqueNames = [...new Set(data?.map(e => e.closer_name).filter(Boolean))];
      return uniqueNames.sort();
    },
    enabled: !!orgId,
  });

  // Get unique setter names from events
  const { data: eventSetters } = useQuery({
    queryKey: ['event-setters', orgId],
    queryFn: async () => {
      let query = supabase.from('events').select('setter_name').not('setter_name', 'is', null);
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      // Get unique setter names
      const uniqueNames = [...new Set(data?.map(e => e.setter_name).filter(Boolean))];
      return uniqueNames.sort();
    },
    enabled: !!orgId,
  });

  const hasUtmFilters = utmFilters.utm_source || utmFilters.utm_medium || 
    utmFilters.utm_channel || utmFilters.utm_campaign || utmFilters.utm_setter;

  const hasFilters = closerId || setterId || sourceId || eventNameFilter || status || outcome || pcfStatus || 
    scheduledDateStart || scheduledDateEnd || hasUtmFilters;

  const handleUtmFilterChange = (field: keyof UtmFilters, value: string | null) => {
    onUtmFiltersChange?.({
      ...utmFilters,
      [field]: value,
    });
  };

  const clearFilters = () => {
    onCloserChange(null);
    onSetterChange(null);
    onSourceChange(null);
    onEventNameFilterChange(null);
    onStatusChange(null);
    onOutcomeChange(null);
    onPcfStatusChange(null);
    onScheduledDateStartChange(null);
    onScheduledDateEndChange(null);
    onUtmFiltersChange?.({});
  };

  // Merge closers from table and events
  const allCloserNames = [...new Set([
    ...(closers?.map(c => c.name) || []),
    ...(eventClosers || []),
  ])].sort();

  // Merge setters from table and events
  const allSetterNames = [...new Set([
    ...(setters?.map(s => s.name) || []),
    ...(eventSetters || []),
  ])].sort();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Closer filter */}
      <Select value={closerId || 'all'} onValueChange={(v) => onCloserChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[140px] h-9 text-xs bg-background">
          <SelectValue placeholder="Closer" />
        </SelectTrigger>
        <SelectContent className="bg-popover max-h-60">
          <SelectItem value="all">All Closers</SelectItem>
          {allCloserNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Setter filter */}
      <Select value={setterId || 'all'} onValueChange={(v) => onSetterChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[140px] h-9 text-xs bg-background">
          <SelectValue placeholder="Setter" />
        </SelectTrigger>
        <SelectContent className="bg-popover max-h-60">
          <SelectItem value="all">All Setters</SelectItem>
          {allSetterNames.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Source filter */}
      <Select value={sourceId || 'all'} onValueChange={(v) => onSourceChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[140px] h-9 text-xs bg-background">
          <SelectValue placeholder="Source" />
        </SelectTrigger>
        <SelectContent className="bg-popover max-h-60">
          <SelectItem value="all">All Sources</SelectItem>
          {sources?.map((source) => (
            <SelectItem key={source.id} value={source.id}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Event Name filter */}
      {eventNames && eventNames.length > 0 && (
        <>
          <Select value={eventNameFilter || 'all'} onValueChange={(v) => onEventNameFilterChange(v === 'all' ? null : v)}>
            <SelectTrigger className="w-[180px] h-9 text-xs bg-background">
              <SelectValue placeholder="Event Name" />
            </SelectTrigger>
            <SelectContent className="bg-popover max-h-60">
              <SelectItem value="all">All Event Names</SelectItem>
              {eventNames.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Filter Mode selector - only show when a filter is active */}
          {eventNameFilter && (
            <Select value={eventNameFilterMode} onValueChange={(v) => onEventNameFilterModeChange(v as 'exact' | 'contains' | 'starts' | 'ends')}>
              <SelectTrigger className="w-[120px] h-9 text-xs bg-background border-dashed">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {FILTER_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}

      {/* Status filter */}
      <Select value={status || 'all'} onValueChange={(v) => onStatusChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[130px] h-9 text-xs bg-background">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="all">All Statuses</SelectItem>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Outcome filter */}
      <Select value={outcome || 'all'} onValueChange={(v) => onOutcomeChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[150px] h-9 text-xs bg-background">
          <SelectValue placeholder="Outcome" />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="all">All Outcomes</SelectItem>
          {OUTCOME_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* PCF Status filter */}
      <Select value={pcfStatus || 'all'} onValueChange={(v) => onPcfStatusChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[130px] h-9 text-xs bg-background">
          <SelectValue placeholder="PCF" />
        </SelectTrigger>
        <SelectContent className="bg-popover">
          <SelectItem value="all">All PCF</SelectItem>
          {PCF_STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Scheduled Date Range */}
      <div className="flex items-center gap-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 text-xs justify-start",
                !scheduledDateStart && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {scheduledDateStart ? format(scheduledDateStart, "MMM d") : "Sched From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={scheduledDateStart || undefined}
              onSelect={(date) => onScheduledDateStartChange(date || null)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "h-9 text-xs justify-start",
                !scheduledDateEnd && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {scheduledDateEnd ? format(scheduledDateEnd, "MMM d") : "Sched To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={scheduledDateEnd || undefined}
              onSelect={(date) => onScheduledDateEndChange(date || null)}
              initialFocus
              className="p-3 pointer-events-auto"
            />
          </PopoverContent>
        </Popover>
      </div>

      {/* UTM Filters Toggle */}
      {onUtmFiltersChange && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowUtmFilters(!showUtmFilters)}
          className={cn(
            "h-9 text-xs gap-1",
            hasUtmFilters && "border-primary text-primary"
          )}
        >
          UTM
          {showUtmFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {hasUtmFilters && <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 text-[10px] flex items-center justify-center">
            {[utmFilters.utm_source, utmFilters.utm_medium, utmFilters.utm_channel, utmFilters.utm_campaign, utmFilters.utm_setter].filter(Boolean).length}
          </span>}
        </Button>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}

      {/* UTM Filters Row */}
      {showUtmFilters && onUtmFiltersChange && (
        <div className="w-full flex flex-wrap items-center gap-2 pt-2 mt-2 border-t border-dashed">
          {/* utm_source */}
          {utmFieldValues?.utm_source && utmFieldValues.utm_source.length > 0 && (
            <Select 
              value={utmFilters.utm_source || 'all'} 
              onValueChange={(v) => handleUtmFilterChange('utm_source', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                <SelectItem value="all">All Sources</SelectItem>
                {utmFieldValues.utm_source.map((val) => (
                  <SelectItem key={val} value={val}>{val}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* utm_medium */}
          {utmFieldValues?.utm_medium && utmFieldValues.utm_medium.length > 0 && (
            <Select 
              value={utmFilters.utm_medium || 'all'} 
              onValueChange={(v) => handleUtmFilterChange('utm_medium', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                <SelectValue placeholder="Medium" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                <SelectItem value="all">All Mediums</SelectItem>
                {utmFieldValues.utm_medium.map((val) => (
                  <SelectItem key={val} value={val}>{val}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* utm_channel */}
          {utmFieldValues?.utm_channel && utmFieldValues.utm_channel.length > 0 && (
            <Select 
              value={utmFilters.utm_channel || 'all'} 
              onValueChange={(v) => handleUtmFilterChange('utm_channel', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                <SelectItem value="all">All Channels</SelectItem>
                {utmFieldValues.utm_channel.map((val) => (
                  <SelectItem key={val} value={val}>{val}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* utm_campaign */}
          {utmFieldValues?.utm_campaign && utmFieldValues.utm_campaign.length > 0 && (
            <Select 
              value={utmFilters.utm_campaign || 'all'} 
              onValueChange={(v) => handleUtmFilterChange('utm_campaign', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs bg-background">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                <SelectItem value="all">All Campaigns</SelectItem>
                {utmFieldValues.utm_campaign.map((val) => (
                  <SelectItem key={val} value={val}>{val}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {/* utm_setter */}
          {utmFieldValues?.utm_setter && utmFieldValues.utm_setter.length > 0 && (
            <Select 
              value={utmFilters.utm_setter || 'all'} 
              onValueChange={(v) => handleUtmFilterChange('utm_setter', v === 'all' ? null : v)}
            >
              <SelectTrigger className="w-[130px] h-8 text-xs bg-background">
                <SelectValue placeholder="UTM Setter" />
              </SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                <SelectItem value="all">All UTM Setters</SelectItem>
                {utmFieldValues.utm_setter.map((val) => (
                  <SelectItem key={val} value={val}>{val}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
    </div>
  );
}