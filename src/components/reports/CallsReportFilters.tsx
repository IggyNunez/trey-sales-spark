import { CalendarIcon, Filter, X } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { CallsReportFilters as FiltersType } from '@/hooks/useCallsReport';

interface CallsReportFiltersProps {
  filters: FiltersType;
  onFiltersChange: (filters: FiltersType) => void;
  availableSources: string[];
  availableClosers: string[];
  availableSetters: string[];
  availableEventTypes: string[];
}

export function CallsReportFilters({
  filters,
  onFiltersChange,
  availableSources,
  availableClosers,
  availableSetters,
  availableEventTypes,
}: CallsReportFiltersProps) {
  const activeFilterCount = [
    filters.trafficSources?.length,
    filters.closerName,
    filters.setterName,
    filters.eventType,
    filters.outcome && filters.outcome !== 'all',
    filters.bookingPlatform,
  ].filter(Boolean).length;

  const clearFilters = () => {
    onFiltersChange({
      ...filters,
      trafficSources: undefined,
      closerName: undefined,
      setterName: undefined,
      eventType: undefined,
      outcome: 'all',
      bookingPlatform: undefined,
    });
  };

  const toggleSource = (source: string) => {
    const current = filters.trafficSources || [];
    const updated = current.includes(source)
      ? current.filter(s => s !== source)
      : [...current, source];
    onFiltersChange({
      ...filters,
      trafficSources: updated.length > 0 ? updated : undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Date Range Row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal',
                  !filters.startDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.startDate ? format(filters.startDate, 'MMM d, yyyy') : 'Start date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.startDate}
                onSelect={(date) => onFiltersChange({ ...filters, startDate: date || undefined })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          
          <span className="text-muted-foreground">to</span>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  'justify-start text-left font-normal',
                  !filters.endDate && 'text-muted-foreground'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.endDate ? format(filters.endDate, 'MMM d, yyyy') : 'End date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.endDate}
                onSelect={(date) => onFiltersChange({ ...filters, endDate: date || undefined })}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Filters Row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Traffic Sources */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9">
              <Filter className="mr-2 h-4 w-4" />
              Sources
              {filters.trafficSources && filters.trafficSources.length > 0 && (
                <Badge variant="secondary" className="ml-2 px-1.5">
                  {filters.trafficSources.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            <div className="space-y-1">
              {availableSources.length === 0 ? (
                <p className="text-sm text-muted-foreground p-2">No sources found</p>
              ) : (
                availableSources.map(source => (
                  <button
                    key={source}
                    onClick={() => toggleSource(source)}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded text-sm transition-colors',
                      filters.trafficSources?.includes(source)
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    )}
                  >
                    {source}
                  </button>
                ))
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Closer Filter */}
        <Select
          value={filters.closerName || 'all'}
          onValueChange={(value) => onFiltersChange({ 
            ...filters, 
            closerName: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="All Closers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Closers</SelectItem>
            {availableClosers.map(closer => (
              <SelectItem key={closer} value={closer}>{closer}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Setter Filter */}
        <Select
          value={filters.setterName || 'all'}
          onValueChange={(value) => onFiltersChange({ 
            ...filters, 
            setterName: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-[150px] h-9">
            <SelectValue placeholder="All Setters" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Setters</SelectItem>
            {availableSetters.map(setter => (
              <SelectItem key={setter} value={setter}>{setter}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Event Type Filter */}
        <Select
          value={filters.eventType || 'all'}
          onValueChange={(value) => onFiltersChange({ 
            ...filters, 
            eventType: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue placeholder="All Event Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Event Types</SelectItem>
            {availableEventTypes.map(type => (
              <SelectItem key={type} value={type}>{type}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Outcome Filter */}
        <Select
          value={filters.outcome || 'all'}
          onValueChange={(value) => onFiltersChange({ 
            ...filters, 
            outcome: value as FiltersType['outcome']
          })}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="All Outcomes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Outcomes</SelectItem>
            <SelectItem value="showed">Showed</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="no_show">No Show</SelectItem>
          </SelectContent>
        </Select>

        {/* Booking Platform Filter */}
        <Select
          value={filters.bookingPlatform || 'all'}
          onValueChange={(value) => onFiltersChange({ 
            ...filters, 
            bookingPlatform: value === 'all' ? undefined : value 
          })}
        >
          <SelectTrigger className="w-[130px] h-9">
            <SelectValue placeholder="All Calendars" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Calendars</SelectItem>
            <SelectItem value="calendly">Calendly</SelectItem>
            <SelectItem value="calcom">Cal.com</SelectItem>
          </SelectContent>
        </Select>

        {/* Clear Filters */}
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-muted-foreground"
          >
            <X className="mr-1 h-4 w-4" />
            Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Active Source Tags */}
      {filters.trafficSources && filters.trafficSources.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.trafficSources.map(source => (
            <Badge
              key={source}
              variant="secondary"
              className="cursor-pointer"
              onClick={() => toggleSource(source)}
            >
              {source}
              <X className="ml-1 h-3 w-3" />
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
