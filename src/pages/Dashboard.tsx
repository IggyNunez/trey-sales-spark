import { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Search,
  Filter,
  LayoutDashboard,
  GitBranch,
  Download,
  AlertTriangle,
  CalendarDays,
} from 'lucide-react';
import { exportToCSV, formatDateForExport } from '@/lib/exportUtils';
import { CustomMetricsGrid } from '@/components/metrics/CustomMetricsGrid';
import { format, startOfDay, endOfDay, addHours, addDays } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { AppLayout } from '@/components/layout/AppLayout';
import { EventsTable } from '@/components/dashboard/EventsTable';
import { DashboardFilters } from '@/components/dashboard/DashboardFilters';
import { useEvents } from '@/hooks/useEvents';
import { EventFilters } from '@/components/dashboard/EventFilters';
import { OverduePCFsCard } from '@/components/dashboard/OverduePCFsCard';
import { OverduePCFsByCloserCard } from '@/components/dashboard/OverduePCFsByCloserCard';
import { DuplicateEventsCard } from '@/components/dashboard/DuplicateEventsCard';
import { SlotUtilizationCard } from '@/components/dashboard/SlotUtilizationCard';
import { ColumnToggleBar } from '@/components/dashboard/ColumnToggleBar';
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection';

import { DashboardsTab } from '@/components/dashboard/DashboardsTab';
import { MetricsByPlatformTable } from '@/components/dashboard/MetricsByPlatformTable';
import { CallsPipelineByPlatform } from '@/components/dashboard/CallsPipelineByPlatform';
import { AttributionTab } from '@/components/dashboard/AttributionTab';
import { LeadJourneySheet } from '@/components/dashboard/LeadJourneySheet';
import { useIsWebhookDashboardEnabled } from '@/hooks/useWebhookDashboard';
import { useDuplicateEvents } from '@/hooks/useDuplicateEvents';
import { useIntegrationConfig } from '@/hooks/useIntegrationConfig';
import { useEventDisplayColumns } from '@/hooks/useEventDisplayColumns';
import { useAuth } from '@/hooks/useAuth';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { Event as EventType } from '@/hooks/useEvents';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

type DateRangePreset = 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'next_month' | 'custom';

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const { primaryCRM, hasCalcom } = useIntegrationConfig();
  const { visibleColumns } = useEventDisplayColumns();
  const { data: duplicateData, isLoading: duplicatesLoading } = useDuplicateEvents();
  const isDashboardsEnabled = useIsWebhookDashboardEnabled();
  const [datePreset, setDatePreset] = useState<DateRangePreset>('this_month');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // Filters for metrics
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [trafficTypeId, setTrafficTypeId] = useState<string | null>(null);
  const [callTypeId, setCallTypeId] = useState<string | null>(null);
  const [metricsCloserId, setMetricsCloserId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [pcfStatusFilter, setPcfStatusFilter] = useState<string | null>(null);
  const [bookingPlatformFilter, setBookingPlatformFilter] = useState<string | null>(null);
  
  // Set Cal.com as default when integration config confirms it's connected
  useEffect(() => {
    if (hasCalcom && bookingPlatformFilter === null) {
      setBookingPlatformFilter('calcom');
    }
  }, [hasCalcom]);
  const [trafficSourceFilter, setTrafficSourceFilter] = useState<string | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [eventNameKeywords, setEventNameKeywords] = useState<string[]>([]);
  const [closeFieldFilters, setCloseFieldFilters] = useState<Record<string, string | null>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventTypes, setSelectedEventTypes] = useState<string[]>([]);
  const [eventTypeSearch, setEventTypeSearch] = useState('');
  
  // Handler for Close CRM field filter changes
  const handleCloseFieldFilterChange = (fieldSlug: string, value: string | null) => {
    setCloseFieldFilters(prev => ({
      ...prev,
      [fieldSlug]: value
    }));
  };
  
  // Utilization date range (today to max 7 days ahead)
  const [utilizationStartDate, setUtilizationStartDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [utilizationEndDate, setUtilizationEndDate] = useState<Date>(() => {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() + 3); // Default to 3 days
    return end;
  });
  
  // Event table filters
  const [eventCloserId, setEventCloserId] = useState<string | null>(null);
  const [eventSetterId, setEventSetterId] = useState<string | null>(null);
  const [eventSourceId, setEventSourceId] = useState<string | null>(null);
  const [eventNameFilter, setEventNameFilter] = useState<string | null>(null);
  const [eventNameFilterMode, setEventNameFilterMode] = useState<'exact' | 'contains' | 'starts' | 'ends'>('contains');
  const [eventStatus, setEventStatus] = useState<string | null>(null);
  const [eventOutcome, setEventOutcome] = useState<string | null>(null);
  const [eventPcfStatus, setEventPcfStatus] = useState<string | null>(null);
  const [eventScheduledDateStart, setEventScheduledDateStart] = useState<Date | null>(null);
  const [eventScheduledDateEnd, setEventScheduledDateEnd] = useState<Date | null>(null);
  const [eventUtmFilters, setEventUtmFilters] = useState<{
    utm_source?: string | null;
    utm_medium?: string | null;
    utm_channel?: string | null;
    utm_campaign?: string | null;
    utm_setter?: string | null;
  }>({});
  

  // Timezone constant for all date operations
  const EST_TIMEZONE = 'America/New_York';

  // Helper to get EST/EDT offset based on month
  const getESTOffsetForDate = (year: number, month: number) => {
    // EDT (UTC-4) is roughly March-November, EST (UTC-5) is November-March
    // Simplified check - for accurate DST, use proper library
    if (month >= 2 && month <= 10) {
      return 4; // EDT offset (UTC-4)
    }
    return 5; // EST offset (UTC-5)
  };

  // Helper to create start of day in EST and convert to UTC
  const startOfDayInEST = (date: Date) => {
    const estDate = toZonedTime(date, EST_TIMEZONE);
    const year = estDate.getFullYear();
    const month = estDate.getMonth();
    const day = estDate.getDate();
    const offset = getESTOffsetForDate(year, month);
    return new Date(Date.UTC(year, month, day, offset, 0, 0, 0));
  };

  // Helper to create end of day in EST and convert to UTC
  const endOfDayInEST = (date: Date) => {
    const estDate = toZonedTime(date, EST_TIMEZONE);
    const year = estDate.getFullYear();
    const month = estDate.getMonth();
    const day = estDate.getDate();
    const offset = getESTOffsetForDate(year, month);
    return new Date(Date.UTC(year, month, day, 23 + offset, 59, 59, 999));
  };

  const getDateRange = () => {
    // Get current date in EST
    const now = new Date();
    const estNow = toZonedTime(now, EST_TIMEZONE);
    const estYear = estNow.getFullYear();
    const estMonth = estNow.getMonth();
    const estDay = estNow.getDate();

    // Helper to create start/end from year/month/day in EST
    // EST = UTC-5, EDT = UTC-4. In January, we're in EST (UTC-5)
    // To get midnight EST in UTC, we add 5 hours
    // Helper to get EST/EDT offset for a specific month
    // This ensures future/past dates use the correct offset for THAT date
    const getESTOffsetForMonth = (month: number) => {
      // For America/New_York: EST = UTC-5 (Nov-Mar), EDT = UTC-4 (Mar-Nov)
      // Simplified check: March (2) through October (10) is generally EDT
      if (month >= 2 && month <= 10) {
        return 4; // EDT offset (UTC-4)
      }
      return 5; // EST offset (UTC-5)
    };
    
    const startOfDayEST = (year: number, month: number, day: number) => {
      // Midnight EST/EDT = 05:00 or 04:00 UTC (use target date's month for offset)
      const offset = getESTOffsetForMonth(month);
      return new Date(Date.UTC(year, month, day, offset, 0, 0, 0));
    };

    const endOfDayEST = (year: number, month: number, day: number) => {
      // 23:59:59 EST/EDT = next day 04:59:59 or 03:59:59 UTC (use target date's month for offset)
      const offset = getESTOffsetForMonth(month);
      return new Date(Date.UTC(year, month, day, 23 + offset, 59, 59, 999));
    };

    const startOfMonthInEST = (year: number, month: number) => {
      return startOfDayEST(year, month, 1);
    };

    const endOfMonthInEST = (year: number, month: number) => {
      const lastDay = new Date(year, month + 1, 0).getDate();
      return endOfDayEST(year, month, lastDay);
    };

    const startOfWeekInEST = (year: number, month: number, day: number) => {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      const diff = day - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); // Monday as first day
      const mondayDate = new Date(year, month, diff);
      return startOfDayEST(mondayDate.getFullYear(), mondayDate.getMonth(), mondayDate.getDate());
    };

    const endOfWeekInEST = (year: number, month: number, day: number) => {
      const date = new Date(year, month, day);
      const dayOfWeek = date.getDay();
      const diff = day - dayOfWeek + (dayOfWeek === 0 ? 0 : 7); // Sunday as last day
      const sundayDate = new Date(year, month, diff);
      return endOfDayEST(sundayDate.getFullYear(), sundayDate.getMonth(), sundayDate.getDate());
    };

    switch (datePreset) {
      case 'today':
        return { startDate: startOfDayEST(estYear, estMonth, estDay), endDate: endOfDayEST(estYear, estMonth, estDay) };
      case 'yesterday':
        const yesterday = new Date(estYear, estMonth, estDay - 1);
        return { startDate: startOfDayEST(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()), endDate: endOfDayEST(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()) };
      case 'this_week':
        return { startDate: startOfWeekInEST(estYear, estMonth, estDay), endDate: endOfWeekInEST(estYear, estMonth, estDay) };
      case 'last_week':
        const lastWeekDate = new Date(estYear, estMonth, estDay - 7);
        return { startDate: startOfWeekInEST(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate()), endDate: endOfWeekInEST(lastWeekDate.getFullYear(), lastWeekDate.getMonth(), lastWeekDate.getDate()) };
      case 'this_month':
        // From start of month to today (not future events)
        return { startDate: startOfMonthInEST(estYear, estMonth), endDate: endOfDayEST(estYear, estMonth, estDay) };
      case 'last_month':
        const lastMonthDate = new Date(estYear, estMonth - 1, 1);
        return { startDate: startOfMonthInEST(lastMonthDate.getFullYear(), lastMonthDate.getMonth()), endDate: endOfMonthInEST(lastMonthDate.getFullYear(), lastMonthDate.getMonth()) };
      case 'next_month':
        // From today to 30 days from today (true "Next 30 Days")
        const thirtyDaysFromNow = new Date(estYear, estMonth, estDay + 30);
        return { startDate: startOfDayEST(estYear, estMonth, estDay), endDate: endOfDayEST(thirtyDaysFromNow.getFullYear(), thirtyDaysFromNow.getMonth(), thirtyDaysFromNow.getDate()) };
      case 'custom':
        // Convert custom dates to EST timezone boundaries
        if (!customStartDate || !customEndDate) return { startDate: undefined, endDate: undefined };
        return {
          startDate: startOfDayInEST(customStartDate),
          endDate: endOfDayInEST(customEndDate)
        };
      default:
        return { startDate: undefined, endDate: undefined };
    }
  };

  const dateRange = getDateRange();
  
  const { data: events, isLoading: eventsLoading } = useEvents({
    // Global date preset controls the data fetched; table filters apply client-side.
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    status: statusFilter || undefined,
    sourceId: sourceId || undefined,
    sourceIds: selectedSources.length > 0 ? selectedSources : undefined,
    trafficTypeId: trafficTypeId || undefined,
    callTypeId: callTypeId || undefined,
    closerId: metricsCloserId || undefined,
    bookingPlatform: bookingPlatformFilter || undefined,
    trafficSource: trafficSourceFilter || undefined,
    closeFieldFilters: closeFieldFilters,
    // Apply UTM filters at the database level for better performance
    utmFilters: Object.fromEntries(
      Object.entries(eventUtmFilters).filter(([_, v]) => v != null)
    ) as Record<string, string>,
    // Fetch all events (no limit) to ensure table counts match metric cards
    // The table uses pagination so this won't affect UI performance
  });
  
  // Filter to only past events for Overdue PCFs calculation
  const pastEventsForOverdue = useMemo(() => {
    if (!events) return [];
    const now = new Date();
    return events.filter(event => new Date(event.scheduled_at) < now);
  }, [events, dateRange.startDate, dateRange.endDate]);

  // Apply all filters to events (but don't limit for metrics calculation)
  const allFilteredEvents = useMemo(() => {
    if (!events) return [];

    let filtered = events;

    // Apply search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(event =>
        event.lead_email?.toLowerCase().includes(query) ||
        event.lead_name?.toLowerCase().includes(query)
      );
    }

    // Apply closer filter (by name since we use names)
    if (eventCloserId) {
      filtered = filtered.filter(event => event.closer_name === eventCloserId);
    }

    // Apply setter filter (by name)
    if (eventSetterId) {
      filtered = filtered.filter(event => event.setter_name === eventSetterId);
    }

    // Apply source filter
    if (eventSourceId) {
      filtered = filtered.filter(event => event.source_id === eventSourceId);
    }

    // Apply event name filter with flexible matching
    if (eventNameFilter) {
      filtered = filtered.filter(event => {
        if (!event.event_name) return false;

        const eventNameLower = event.event_name.toLowerCase().replace(/[-_\s]/g, '');
        const filterLower = eventNameFilter.toLowerCase().replace(/[-_\s]/g, '');

        switch (eventNameFilterMode) {
          case 'exact':
            return event.event_name.toLowerCase() === eventNameFilter.toLowerCase();
          case 'contains':
            return eventNameLower.includes(filterLower);
          case 'starts':
            return eventNameLower.startsWith(filterLower);
          case 'ends':
            return eventNameLower.endsWith(filterLower);
          default:
            return eventNameLower.includes(filterLower);
        }
      });
    }

    // Apply status filter
    if (eventStatus) {
      filtered = filtered.filter(event => event.call_status === eventStatus);
    }

    // Apply outcome filter
    if (eventOutcome) {
      filtered = filtered.filter(event => event.event_outcome === eventOutcome);
    }

    // Apply PCF status filter
    if (eventPcfStatus) {
      if (eventPcfStatus === 'pending') {
        filtered = filtered.filter(event => !event.pcf_submitted);
      } else if (eventPcfStatus === 'submitted') {
        filtered = filtered.filter(event => event.pcf_submitted);
      }
    }

    // Apply scheduled date range filter (using EST timezone)
    if (eventScheduledDateStart) {
      filtered = filtered.filter(event => {
        if (!event.scheduled_at) return false;
        const scheduledDate = new Date(event.scheduled_at);
        const startFilter = startOfDayInEST(eventScheduledDateStart);
        return scheduledDate >= startFilter;
      });
    }
    if (eventScheduledDateEnd) {
      filtered = filtered.filter(event => {
        if (!event.scheduled_at) return false;
        const scheduledDate = new Date(event.scheduled_at);
        const endFilter = endOfDayInEST(eventScheduledDateEnd);
        return scheduledDate <= endFilter;
      });
    }

    return filtered;
  }, [events, searchQuery, eventCloserId, eventSetterId, eventSourceId, eventNameFilter, eventStatus, eventOutcome, eventPcfStatus, eventScheduledDateStart, eventScheduledDateEnd]);


  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const eventsPerPage = 20;
  
  // Sort and paginate events
  const sortedAndPaginatedEvents = useMemo(() => {
    // Sort by scheduled_at chronologically (earliest first)
    const sorted = [...allFilteredEvents].sort((a, b) => {
      const dateA = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const dateB = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      return dateA - dateB;
    });
    
    return sorted;
  }, [allFilteredEvents]);

  // Compute column data coverage for auto-hiding empty columns
  const columnDataCoverage = useMemo(() => {
    if (!sortedAndPaginatedEvents.length) return {};
    
    return visibleColumns.reduce((acc, col) => {
      const eventsWithData = sortedAndPaginatedEvents.filter(event => {
        const source = col.field_source === 'booking_metadata' 
          ? event.booking_metadata 
          : event.booking_responses;
        const val = (source as Record<string, unknown>)?.[col.field_key];
        return val != null && String(val).trim() !== '';
      });
      
      acc[col.field_key] = {
        hasData: eventsWithData.length > 0,
        count: eventsWithData.length,
        total: sortedAndPaginatedEvents.length,
      };
      return acc;
    }, {} as Record<string, { hasData: boolean; count: number; total: number }>);
  }, [sortedAndPaginatedEvents, visibleColumns]);
  
  // Calculate total pages
  const totalPages = Math.ceil(sortedAndPaginatedEvents.length / eventsPerPage);
  
  // Get current page events
  const paginatedEvents = useMemo(() => {
    const startIndex = (currentPage - 1) * eventsPerPage;
    return sortedAndPaginatedEvents.slice(startIndex, startIndex + eventsPerPage);
  }, [sortedAndPaginatedEvents, currentPage, eventsPerPage]);

  const recentEvents = paginatedEvents;

  // Export events handler
  const handleExportEvents = () => {
    exportToCSV(
      sortedAndPaginatedEvents,
      [
        { key: 'lead_name', label: 'Lead Name' },
        { key: 'lead_email', label: 'Lead Email' },
        { key: 'lead_phone', label: 'Phone' },
        { key: 'scheduled_at', label: 'Scheduled At', format: (v) => formatDateForExport(v as string) },
        { key: 'booked_at', label: 'Booked At', format: (v) => formatDateForExport(v as string) },
        { key: 'call_status', label: 'Status' },
        { key: 'event_outcome', label: 'Outcome' },
        { key: 'closer_name', label: 'Closer' },
        { key: 'setter_name', label: 'Setter' },
        { key: 'event_name', label: 'Event Type' },
        { key: 'pcf_submitted', label: 'PCF Submitted', format: (v) => v ? 'Yes' : 'No' },
        { key: 'booking_platform', label: 'Booking Platform' },
        { key: 'source.name', label: 'Lead Source' },
        { key: 'traffic_type.name', label: 'Traffic Type' },
      ],
      `events-${new Date().toISOString().split('T')[0]}`
    );
  };
  
  // Reset to page 1 when filters change
  const filterDeps = [eventCloserId, eventSetterId, eventSourceId, eventNameFilter, eventStatus, eventOutcome, eventPcfStatus, searchQuery, eventScheduledDateStart, eventScheduledDateEnd];
  useMemo(() => {
    setCurrentPage(1);
  }, filterDeps);


  const handleViewEvent = (event: { id: string }) => {
    navigate(`/pcf/${event.id}`);
  };

  const [activeTab, setActiveTab] = useState('performance');
  
  // Lead Journey Sheet state
  const [selectedLeadEvent, setSelectedLeadEvent] = useState<EventType | null>(null);
  const [isJourneyOpen, setIsJourneyOpen] = useState(false);
  
  const handleLeadClick = (event: EventType) => {
    setSelectedLeadEvent(event);
    setIsJourneyOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider font-medium">
              Admin Dashboard
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight mt-1">
              Team Performance
            </h1>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <TabsList>
              <TabsTrigger value="performance">Performance</TabsTrigger>
        <TabsTrigger value="attribution" className="flex items-center gap-2">
          <GitBranch className="h-4 w-4" />
          UTM & Sources
          <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-semibold bg-primary/20 text-primary">New</Badge>
        </TabsTrigger>
              {isDashboardsEnabled && (
                <TabsTrigger value="dashboards" className="flex items-center gap-2">
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboards
                  <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-[10px] font-semibold bg-primary/20 text-primary">New</Badge>
                </TabsTrigger>
              )}
            </TabsList>

            {/* Date Range Picker - visible on all tabs */}
            <div className="flex flex-wrap items-center gap-2">
              <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
                <SelectTrigger className="w-[140px] sm:w-[160px] bg-background">
                  <SelectValue placeholder="Select date range" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="this_week">This Week</SelectItem>
                  <SelectItem value="last_week">Last Week</SelectItem>
                  <SelectItem value="this_month">This Month</SelectItem>
                  <SelectItem value="last_month">Last Month</SelectItem>
                  <SelectItem value="next_month">Next 30 Days</SelectItem>
                  <SelectItem value="custom">Custom Range</SelectItem>
                </SelectContent>
              </Select>
              
              {datePreset === 'custom' && (
                <div className="flex items-center gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customStartDate ? format(customStartDate, 'MMM d') : 'Start'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customEndDate ? format(customEndDate, 'MMM d') : 'End'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </div>

          <TabsContent value="performance" className="space-y-6 mt-6">
            
            
            {/* Source & Call Type Filters */}
            <DashboardFilters
              sourceId={sourceId}
              trafficTypeId={trafficTypeId}
              callTypeId={callTypeId}
              status={statusFilter}
              closerId={metricsCloserId}
              pcfStatus={pcfStatusFilter}
              bookingPlatform={hasCalcom ? bookingPlatformFilter : undefined}
              trafficSource={trafficSourceFilter}
              selectedSources={selectedSources}
              eventNameKeywords={eventNameKeywords}
              closeFieldFilters={closeFieldFilters}
              onSourceChange={setSourceId}
              onTrafficTypeChange={setTrafficTypeId}
              onCallTypeChange={setCallTypeId}
              onStatusChange={setStatusFilter}
              onCloserChange={setMetricsCloserId}
              onPcfStatusChange={setPcfStatusFilter}
              onBookingPlatformChange={hasCalcom ? setBookingPlatformFilter : undefined}
              onTrafficSourceChange={setTrafficSourceFilter}
              onSelectedSourcesChange={setSelectedSources}
              onEventNameKeywordsChange={setEventNameKeywords}
              onCloseFieldFilterChange={handleCloseFieldFilterChange}
            />

        {/* Custom Metrics Grid */}
        <CustomMetricsGrid
          startDate={dateRange.startDate}
          endDate={dateRange.endDate}
          dateType="scheduled"
          sourceId={sourceId || undefined}
          sourceIds={selectedSources}
          trafficTypeId={trafficTypeId || undefined}
          callTypeId={callTypeId || undefined}
          closerId={metricsCloserId || undefined}
          bookingPlatform={bookingPlatformFilter || undefined}
          closeFieldFilters={closeFieldFilters}
          leadingCard={
            <OverduePCFsCard
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              closeFieldFilters={closeFieldFilters}
              sourceId={sourceId || undefined}
              sourceIds={selectedSources}
              trafficTypeId={trafficTypeId || undefined}
              bookingPlatform={bookingPlatformFilter || undefined}
            />
          }
        />

        {/* Overdue PCFs by Closer - Collapsible */}
        <CollapsibleSection
          id="overdue-pcfs"
          title="Overdue Post-Call Forms"
          icon={AlertTriangle}
          defaultOpen={true}
        >
          <OverduePCFsByCloserCard
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            closeFieldFilters={closeFieldFilters}
            sourceId={sourceId || undefined}
            sourceIds={selectedSources}
            trafficTypeId={trafficTypeId || undefined}
            bookingPlatform={bookingPlatformFilter || undefined}
          />
        </CollapsibleSection>

        {/* Platform Performance Section */}
        <div className="space-y-6">
          <MetricsByPlatformTable
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            closerId={metricsCloserId}
            sourceIds={selectedSources}
            bookingPlatform={bookingPlatformFilter || undefined}
            closeFieldFilters={closeFieldFilters}
          />
          
          {/* Calls by Platform - Collapsible */}
          <CollapsibleSection
            id="calls-by-platform"
            title="Calls by Platform (Daily)"
            icon={CalendarDays}
            defaultOpen={true}
          >
            <CallsPipelineByPlatform
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              bookingPlatform={bookingPlatformFilter || undefined}
            />
          </CollapsibleSection>
        </div>

        {/* Calendly Slot Utilization */}
        {isAdmin && (
          <SlotUtilizationCard
            events={events || []}
            eventsLoading={eventsLoading}
            utilizationStartDate={utilizationStartDate}
            utilizationEndDate={utilizationEndDate}
            setUtilizationStartDate={setUtilizationStartDate}
            setUtilizationEndDate={setUtilizationEndDate}
            selectedEventTypes={selectedEventTypes}
            setSelectedEventTypes={setSelectedEventTypes}
            bookingPlatform={bookingPlatformFilter}
          />
        )}

        {/* Recent Events */}
        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Recent Events
                  <span className="text-sm font-normal text-muted-foreground">
                    ({sortedAndPaginatedEvents.length} total)
                  </span>
                </CardTitle>
                <CardDescription>Latest scheduled and completed calls</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by email or name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={handleExportEvents} className="gap-1.5 whitespace-nowrap">
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </div>
            </div>
            
            {/* Event Filters */}
            <div className="pt-2 border-t">
              <div className="flex items-center gap-2 mb-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">Filter events</span>
              </div>
              <EventFilters
                closerId={eventCloserId}
                setterId={eventSetterId}
                sourceId={eventSourceId}
                eventNameFilter={eventNameFilter}
                eventNameFilterMode={eventNameFilterMode}
                status={eventStatus}
                outcome={eventOutcome}
                pcfStatus={eventPcfStatus}
                scheduledDateStart={eventScheduledDateStart}
                scheduledDateEnd={eventScheduledDateEnd}
                utmFilters={eventUtmFilters}
                onCloserChange={setEventCloserId}
                onSetterChange={setEventSetterId}
                onSourceChange={setEventSourceId}
                onEventNameFilterChange={setEventNameFilter}
                onEventNameFilterModeChange={setEventNameFilterMode}
                onStatusChange={setEventStatus}
                onOutcomeChange={setEventOutcome}
                onPcfStatusChange={setEventPcfStatus}
                onScheduledDateStartChange={setEventScheduledDateStart}
                onScheduledDateEndChange={setEventScheduledDateEnd}
                onUtmFiltersChange={setEventUtmFilters}
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Inline column toggle toolbar */}
            <ColumnToggleBar columnCoverage={columnDataCoverage} />
            
            {eventsLoading ? (
              <div className="space-y-4">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <>
                <EventsTable 
                  events={recentEvents} 
                  showCloser={isAdmin}
                  showBookingDate={true}
                  showSource={true}
                  showTrafficType={true}
                  showEventName={true}
                  showStatusActions={true}
                  crmType={primaryCRM}
                  onViewEvent={handleViewEvent}
                  onLeadClick={handleLeadClick}
                  dynamicColumns={visibleColumns
                    .filter(col => !['utm_platform', 'utm_setter'].includes(col.field_key)) // These are handled by hardcoded columns
                    .map(col => ({
                      field_key: col.field_key,
                      display_label: col.display_label,
                      field_source: col.field_source as 'booking_metadata' | 'booking_responses',
                    }))
                  }
                />
                
                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Showing {((currentPage - 1) * eventsPerPage) + 1} - {Math.min(currentPage * eventsPerPage, sortedAndPaginatedEvents.length)} of {sortedAndPaginatedEvents.length} events
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {/* Show page numbers */}
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="attribution" className="space-y-6 mt-6">
            <AttributionTab 
              startDate={dateRange.startDate}
              endDate={dateRange.endDate}
              bookingPlatform={bookingPlatformFilter || undefined}
            />
          </TabsContent>

          <TabsContent value="dashboards" className="mt-6">
            <DashboardsTab />
          </TabsContent>
        </Tabs>
      </div>
      
      {/* Lead Journey Sheet */}
      <LeadJourneySheet
        open={isJourneyOpen}
        onOpenChange={setIsJourneyOpen}
        event={selectedLeadEvent}
      />
    </AppLayout>
  );
}
