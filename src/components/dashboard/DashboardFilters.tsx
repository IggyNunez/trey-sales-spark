import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { X, ChevronDown } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useFilterableCloseFields, useCloseFieldDistinctValues } from '@/hooks/useCloseFields';
import { useTrafficSourceValues } from '@/hooks/useTrafficSourceValues';
import { cn } from '@/lib/utils';

interface DashboardFiltersProps {
  sourceId: string | null;
  trafficTypeId?: string | null;
  callTypeId: string | null;
  status: string | null;
  closerId?: string | null;
  pcfStatus?: string | null;
  bookingPlatform?: string | null;
  trafficSource?: string | null;
  selectedSources?: string[];
  eventNameKeywords?: string[];
  closeFieldFilters?: Record<string, string | null>;
  onSourceChange: (id: string | null) => void;
  onTrafficTypeChange?: (id: string | null) => void;
  onCallTypeChange: (id: string | null) => void;
  onStatusChange: (status: string | null) => void;
  onCloserChange?: (closerId: string | null) => void;
  onPcfStatusChange?: (status: string | null) => void;
  onBookingPlatformChange?: (platform: string | null) => void;
  onTrafficSourceChange?: (source: string | null) => void;
  onSelectedSourcesChange?: (sources: string[]) => void;
  onEventNameKeywordsChange?: (keywords: string[]) => void;
  onCloseFieldFilterChange?: (fieldSlug: string, value: string | null) => void;
}

const BOOKING_PLATFORM_OPTIONS = [
  { value: 'calendly', label: 'Calendly' },
  { value: 'calcom', label: 'Cal.com' },
];

const STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'canceled', label: 'Canceled' },
];

const PCF_STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'pending', label: 'Pending' },
];

// Component for rendering a single Close field filter dropdown
function CloseFieldFilter({
  field,
  value,
  onChange,
}: {
  field: { local_field_slug: string; close_field_name: string; close_field_type: string; close_field_choices: { value: string; label: string }[] | null };
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  // Skip date-type fields - they don't make sense as dropdowns
  if (field.close_field_type === 'date') {
    return null;
  }

  // For choice fields, use the predefined choices; for text fields, fetch distinct values
  const { data: distinctValues, isLoading } = useCloseFieldDistinctValues(
    field.close_field_type !== 'choices' ? field.local_field_slug : ''
  );

  const options = field.close_field_type === 'choices' && field.close_field_choices
    ? field.close_field_choices
    : (distinctValues || []).map(v => ({ value: v, label: v }));

  // For non-choice fields, only show if we have distinct values (avoid empty clutter)
  if (field.close_field_type !== 'choices' && !isLoading && options.length === 0) {
    return null;
  }

  // Determine display label for current value
  const getDisplayLabel = () => {
    if (!value) return `All ${field.close_field_name}`;
    const option = options.find(o => o.value === value);
    return option?.label || value;
  };

  // Show loading state for text fields while fetching distinct values
  if (isLoading && field.close_field_type !== 'choices') {
    return (
      <Skeleton className="h-10 w-[160px]" />
    );
  }

  return (
    <Select value={value || 'all'} onValueChange={(v) => onChange(v === 'all' ? null : v)}>
      <SelectTrigger className="w-[160px] bg-background">
        <SelectValue placeholder={`All ${field.close_field_name}`}>
          {getDisplayLabel()}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="bg-popover">
        <SelectItem value="all">All {field.close_field_name}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={`opt-${opt.value}`} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function DashboardFilters({
  sourceId,
  trafficTypeId,
  callTypeId,
  status,
  closerId,
  pcfStatus,
  bookingPlatform,
  trafficSource,
  selectedSources = [],
  eventNameKeywords = [],
  closeFieldFilters = {},
  onSourceChange,
  onTrafficTypeChange,
  onCallTypeChange,
  onStatusChange,
  onCloserChange,
  onPcfStatusChange,
  onBookingPlatformChange,
  onTrafficSourceChange,
  onSelectedSourcesChange,
  onEventNameKeywordsChange,
  onCloseFieldFilterChange,
}: DashboardFiltersProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  
  // Fetch Close CRM fields configured to show in filters
  const { data: closeFields } = useFilterableCloseFields();
  
  // Fetch unified traffic source values (merges CRM platform + UTM platform)
  const { data: trafficSourceValues, isLoading: trafficSourceLoading } = useTrafficSourceValues();

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

  const { data: callTypes } = useQuery({
    queryKey: ['call-types', orgId],
    queryFn: async () => {
      let query = supabase.from('call_types').select('*').order('name');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const { data: trafficTypes } = useQuery({
    queryKey: ['traffic-types', orgId],
    queryFn: async () => {
      let query = supabase.from('traffic_types').select('*').order('name');
      if (orgId) query = query.eq('organization_id', orgId);
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

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

  // Check if events have closer_id or call_type_id populated (for conditional filter visibility)
  const { data: eventFieldCounts } = useQuery({
    queryKey: ['event-field-counts', orgId],
    queryFn: async () => {
      // Check for events with closer_id populated
      const { count: closerCount, error: closerError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('closer_id', 'is', null);
      if (closerError) throw closerError;
      
      // Check for events with call_type_id populated
      const { count: callTypeCount, error: callTypeError } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .not('call_type_id', 'is', null);
      if (callTypeError) throw callTypeError;
      
      return {
        hasCloserData: (closerCount || 0) > 0,
        hasCallTypeData: (callTypeCount || 0) > 0,
      };
    },
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Determine filter visibility based on data existence
  const showCloserFilter = onCloserChange && closers && closers.length > 0 && eventFieldCounts?.hasCloserData;
  const showCallTypeFilter = callTypes && callTypes.length > 0 && eventFieldCounts?.hasCallTypeData;

  // Check if any Close field filters are active
  const hasCloseFieldFilters = Object.values(closeFieldFilters).some(v => v !== null);
  const hasFilters = sourceId || trafficTypeId || callTypeId || status || closerId || pcfStatus || bookingPlatform || trafficSource || selectedSources.length > 0 || hasCloseFieldFilters;

  const clearFilters = () => {
    onSourceChange(null);
    onTrafficTypeChange?.(null);
    onCallTypeChange(null);
    onStatusChange(null);
    onCloserChange?.(null);
    onPcfStatusChange?.(null);
    onBookingPlatformChange?.(null);
    onTrafficSourceChange?.(null);
    onSelectedSourcesChange?.([]);
    // Clear all Close field filters
    if (onCloseFieldFilterChange && closeFields) {
      closeFields.forEach(field => {
        onCloseFieldFilterChange(field.local_field_slug, null);
      });
    }
  };

  const toggleSource = (id: string) => {
    if (!onSelectedSourcesChange) return;
    if (selectedSources.includes(id)) {
      onSelectedSourcesChange(selectedSources.filter(s => s !== id));
    } else {
      onSelectedSourcesChange([...selectedSources, id]);
    }
  };

  // Check if using multi-select sources vs single source
  const useMultiSelectSources = onSelectedSourcesChange !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Single Source Select (legacy) */}
      {!useMultiSelectSources && (
        <Select value={sourceId || 'all'} onValueChange={(v) => onSourceChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Sources" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Sources</SelectItem>
            {sources?.map((source) => (
              <SelectItem key={source.id} value={source.id}>
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Multi-Select Sources - Badge/Pill Style */}
      {useMultiSelectSources && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="min-w-[140px]">
              {selectedSources.length > 0 
                ? `${selectedSources.length} Source${selectedSources.length > 1 ? 's' : ''}`
                : 'All Sources'
              }
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-3" align="start">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Select Sources</p>
                {selectedSources.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs text-muted-foreground"
                    onClick={() => onSelectedSourcesChange?.([])}
                  >
                    Clear all
                  </Button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-[250px] overflow-y-auto">
                {sources?.map((source) => {
                  const isSelected = selectedSources.includes(source.id);
                  return (
                    <Badge
                      key={source.id}
                      variant={isSelected ? "default" : "outline"}
                      className={cn(
                        "cursor-pointer transition-colors px-3 py-1.5 text-sm",
                        isSelected 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                          : "hover:bg-muted"
                      )}
                      onClick={() => toggleSource(source.id)}
                    >
                      {source.name}
                      {isSelected && <X className="h-3 w-3 ml-1" />}
                    </Badge>
                  );
                })}
                {sources?.length === 0 && (
                  <p className="text-sm text-muted-foreground">No sources found</p>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      )}

      {/* Traffic Type */}
      {onTrafficTypeChange && (
        <Select value={trafficTypeId || 'all'} onValueChange={(v) => onTrafficTypeChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Traffic Types" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Traffic Types</SelectItem>
            {trafficTypes?.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Call Types - Only show if events have call_type_id data */}
      {showCallTypeFilter && (
        <Select value={callTypeId || 'all'} onValueChange={(v) => onCallTypeChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Call Types" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Call Types</SelectItem>
            {callTypes?.map((type) => (
              <SelectItem key={type.id} value={type.id}>
                {type.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Call Status */}
      <Select value={status || 'all'} onValueChange={(v) => onStatusChange(v === 'all' ? null : v)}>
        <SelectTrigger className="w-[160px] bg-background">
          <SelectValue placeholder="All Statuses" />
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

      {/* Closer Filter - Only show if events have closer_id data */}
      {showCloserFilter && (
        <Select value={closerId || 'all'} onValueChange={(v) => onCloserChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Closers" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Closers</SelectItem>
            {closers?.map((closer) => (
              <SelectItem key={closer.id} value={closer.id}>
                {closer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* PCF Status */}
      {onPcfStatusChange && (
        <Select value={pcfStatus || 'all'} onValueChange={(v) => onPcfStatusChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="PCF Status" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All PCF Status</SelectItem>
            {PCF_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Calendar Filter (Calendly / Cal.com) */}
      {onBookingPlatformChange && (
        <Select value={bookingPlatform || 'all'} onValueChange={(v) => onBookingPlatformChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Calendars" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Calendars</SelectItem>
            {BOOKING_PLATFORM_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Traffic Source Filter (unified: CRM platform + UTM platform) */}
      {onTrafficSourceChange && trafficSourceValues && trafficSourceValues.length > 0 && (
        <Select value={trafficSource || 'all'} onValueChange={(v) => onTrafficSourceChange(v === 'all' ? null : v)}>
          <SelectTrigger className="w-[160px] bg-background">
            <SelectValue placeholder="All Traffic Sources" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">All Traffic Sources</SelectItem>
            {trafficSourceValues.map((source) => (
              <SelectItem key={source} value={source}>
                {source}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      
      {/* Traffic Source Loading */}
      {onTrafficSourceChange && trafficSourceLoading && (
        <Skeleton className="h-10 w-[160px]" />
      )}

      {/* Close CRM Custom Field Filters (exclude 'platform' since it's in Traffic Source) */}
      {closeFields && closeFields.length > 0 && onCloseFieldFilterChange && (
        <>
          {closeFields
            .filter(field => field.local_field_slug !== 'platform') // Exclude platform - handled by Traffic Source
            .map((field) => (
              <CloseFieldFilter
                key={field.id}
                field={field}
                value={closeFieldFilters[field.local_field_slug] || null}
                onChange={(value) => onCloseFieldFilterChange(field.local_field_slug, value)}
              />
            ))}
        </>
      )}

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
          <X className="h-4 w-4 mr-1" />
          Clear
        </Button>
      )}
    </div>
  );
}
