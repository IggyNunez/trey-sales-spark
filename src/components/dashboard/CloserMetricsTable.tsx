import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DraggableTableWrapper } from '@/components/ui/DraggableTableWrapper';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  Users, Calendar as CalendarIcon, ArrowUpDown, X, Download,
  TrendingUp, Target, DollarSign, Phone, Percent, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { exportToCSV, formatPercentForExport, formatCurrencyForExport } from '@/lib/exportUtils';
import { MetricDetailSheet } from '@/components/analytics/MetricDetailSheet';
import { MetricFilter } from '@/types/metricFilter';

interface CloserMetricsTableProps {
  defaultStartDate?: Date;
  defaultEndDate?: Date;
  bookingPlatform?: string;
}

interface CloserMetrics {
  userId: string;
  name: string;
  email: string;
  callsBooked: number;
  callsShowed: number;
  noShows: number;
  offersMade: number;
  dealsClosed: number;
  showRate: number;
  offerRate: number;
  closeRate: number;
  cashCollected: number;
  cashPerBookedCall: number;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 10) / 10}%`;
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function CloserMetricsTable({ defaultStartDate, defaultEndDate, bookingPlatform }: CloserMetricsTableProps) {
  const { currentOrganization } = useOrganization();
  const { user, isAdmin } = useAuth();
  const orgId = currentOrganization?.id;
  
  const [startDate, setStartDate] = useState<Date | undefined>(defaultStartDate);
  const [endDate, setEndDate] = useState<Date | undefined>(defaultEndDate);
  const [sortBy, setSortBy] = useState<keyof CloserMetrics>('cashCollected');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenClosers, setHiddenClosers] = useState<Set<string>>(new Set());
  
  // New filters
  const [pcfStatus, setPcfStatus] = useState<string>('all');
  const [callStatus, setCallStatus] = useState<string>('all');
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [eventNameKeywords, setEventNameKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  
  // Drill-down state
  const [detailFilter, setDetailFilter] = useState<MetricFilter | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const handleCloserClick = (closer: CloserMetrics) => {
    setDetailFilter({
      type: 'closer',
      value: closer.name,
      closerEmail: closer.email || undefined,
      label: `${closer.name} - All Events`,
    });
    setIsDetailOpen(true);
  };

  // Fetch sources for the org
  const { data: sources } = useQuery({
    queryKey: ['sources', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch unique closers directly from events (source of truth for who has calls)
  const { data: eventClosers } = useQuery({
    queryKey: ['event-closers', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('closer_name, closer_email')
        .eq('organization_id', orgId!)
        .not('closer_name', 'is', null);
      
      if (startDate) query = query.gte('scheduled_at', startDate.toISOString());
      if (endDate) query = query.lte('scheduled_at', endDate.toISOString());
      if (bookingPlatform) query = query.eq('booking_platform', bookingPlatform);
      
      const { data, error } = await query;
      if (error) throw error;
      
      // Deduplicate by closer_email (preferred) or closer_name
      const closerMap = new Map<string, { name: string; email: string | null }>();
      data?.forEach(e => {
        if (!e.closer_name) return;
        const key = e.closer_email?.toLowerCase() || e.closer_name.toLowerCase();
        if (!closerMap.has(key)) {
          closerMap.set(key, { name: e.closer_name, email: e.closer_email });
        }
      });
      
      return Array.from(closerMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!orgId,
  });

  const { data: closerMetrics, isLoading } = useQuery({
    queryKey: ['closer-metrics', orgId, startDate?.toISOString(), endDate?.toISOString(), pcfStatus, callStatus, selectedSources, eventNameKeywords, bookingPlatform, eventClosers?.map(c => c.name).join(',')],
    queryFn: async () => {
      if (!eventClosers || eventClosers.length === 0) {
        return [];
      }

      // Get all events for the org (to calculate booked calls)
      let eventsQuery = supabase.from('events').select('*').eq('organization_id', orgId!);
      if (startDate) eventsQuery = eventsQuery.gte('scheduled_at', startDate.toISOString());
      if (endDate) eventsQuery = eventsQuery.lte('scheduled_at', endDate.toISOString());
      if (bookingPlatform) eventsQuery = eventsQuery.eq('booking_platform', bookingPlatform);
      
      // Apply call status filter
      if (callStatus !== 'all') {
        eventsQuery = eventsQuery.eq('call_status', callStatus);
      }
      
      // Apply source filter
      if (selectedSources.length > 0) {
        eventsQuery = eventsQuery.in('source_id', selectedSources);
      }

      const { data: events, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;

      // Filter events by event name keywords (contains matching)
      let filteredEvents = events || [];
      if (eventNameKeywords.length > 0) {
        filteredEvents = filteredEvents.filter(event => {
          if (!event.event_name) return false;
          const eventNameLower = event.event_name.toLowerCase().replace(/[-_\s]/g, '');
          return eventNameKeywords.some(keyword => 
            eventNameLower.includes(keyword.toLowerCase().replace(/[-_\s]/g, ''))
          );
        });
      }

      // Get post call forms
      let pcfQuery = supabase
        .from('post_call_forms')
        .select('*')
        .eq('organization_id', orgId!);

      if (startDate) pcfQuery = pcfQuery.gte('submitted_at', startDate.toISOString());
      if (endDate) pcfQuery = pcfQuery.lte('submitted_at', endDate.toISOString());

      const { data: pcfs, error: pcfError } = await pcfQuery;
      if (pcfError) throw pcfError;

      // Get payments
      let paymentsQuery = supabase.from('payments').select('*').eq('organization_id', orgId!);
      if (startDate) paymentsQuery = paymentsQuery.gte('payment_date', startDate.toISOString());
      if (endDate) paymentsQuery = paymentsQuery.lte('payment_date', endDate.toISOString());

      const { data: payments, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;

      // Get event IDs that match our filtered events
      const filteredEventIds = new Set(filteredEvents.map(e => e.id));

      // Filter PCFs based on PCF status and event filters
      let filteredPcfs = pcfs || [];
      
      // Only include PCFs for events that match our event filters
      if (eventNameKeywords.length > 0 || selectedSources.length > 0 || callStatus !== 'all') {
        filteredPcfs = filteredPcfs.filter(pcf => filteredEventIds.has(pcf.event_id));
      }

      // Build lookup maps for matching events/PCFs to closers from events
      // Match by email first (most reliable), then by normalized name
      const closerEmailMap = new Map<string, typeof eventClosers[0]>();
      const closerNameMap = new Map<string, typeof eventClosers[0]>();
      
      eventClosers.forEach(closer => {
        if (closer.email) {
          closerEmailMap.set(closer.email.toLowerCase().trim(), closer);
        }
        closerNameMap.set(closer.name.toLowerCase().trim(), closer);
      });

      // Helper function to find closer for an event/PCF
      const findCloser = (closerEmail?: string | null, closerName?: string | null) => {
        // Try email match first (most reliable)
        if (closerEmail) {
          const emailKey = closerEmail.toLowerCase().trim();
          if (closerEmailMap.has(emailKey)) {
            return closerEmailMap.get(emailKey)!;
          }
        }
        // Fallback to name match
        if (closerName) {
          const nameKey = closerName.toLowerCase().trim();
          if (closerNameMap.has(nameKey)) {
            return closerNameMap.get(nameKey)!;
          }
        }
        return null;
      };

      // Group events and PCFs by closer (using event data as source of truth)
      const closerDataMap = new Map<string, {
        closer: typeof eventClosers[0];
        events: typeof filteredEvents;
        pcfs: typeof filteredPcfs;
      }>();

      // Initialize map with all closers from events
      eventClosers.forEach(closer => {
        const key = closer.email?.toLowerCase() || closer.name.toLowerCase();
        closerDataMap.set(key, {
          closer,
          events: [],
          pcfs: [],
        });
      });

      // Assign events to closers
      filteredEvents.forEach(event => {
        const key = event.closer_email?.toLowerCase() || event.closer_name?.toLowerCase();
        if (key && closerDataMap.has(key)) {
          closerDataMap.get(key)!.events.push(event);
        }
      });

      // Assign PCFs to closers
      filteredPcfs.forEach(pcf => {
        // For PCFs, try to match via the event's closer_email if available
        const relatedEvent = filteredEvents.find(e => e.id === pcf.event_id);
        const key = relatedEvent?.closer_email?.toLowerCase() || pcf.closer_name?.toLowerCase();
        if (key && closerDataMap.has(key)) {
          closerDataMap.get(key)!.pcfs.push(pcf);
        }
      });

      // Calculate metrics for each closer
      const metrics: CloserMetrics[] = [];
      
      closerDataMap.forEach((data) => {
        const closerPcfs = data.pcfs;
        const closerEvents = data.events;
        
        // Apply PCF status filter for metrics calculation
        let pcfsForMetrics = closerPcfs;
        if (pcfStatus === 'submitted') {
          // PCFs exist = submitted
          pcfsForMetrics = closerPcfs;
        } else if (pcfStatus === 'pending') {
          // Events without PCFs = pending
          const eventsWithPcf = new Set(closerPcfs.map(p => p.event_id));
          const pendingEventCount = closerEvents.filter(e => !eventsWithPcf.has(e.id) && new Date(e.scheduled_at) < new Date()).length;
          // For pending, we can't really calculate show/offer rates, so we skip
        }
        
        // Count scheduled calls (only past events should count for show rate)
        // Exclude canceled/rescheduled from booked calls (aligns with CRM logic)
        const now = new Date();
        const activeEvents = closerEvents.filter(e => 
          e.call_status !== 'canceled' && e.call_status !== 'rescheduled'
        );
        const pastEvents = activeEvents.filter(e => new Date(e.scheduled_at) < now);
        const callsBooked = activeEvents.length;
        
        // Use events.event_outcome as single source of truth (aligned with Rep Portal)
        // Shows = events with outcome that isn't 'no_show'
        const callsShowed = pastEvents.filter(e => 
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

        // Calculate rates using Rep Portal formula: showed / (showed + no_shows)
        // This is industry-standard and doesn't penalize pending outcomes
        const attendedOrNoShow = callsShowed + noShows;
        const showRate = attendedOrNoShow > 0 ? (callsShowed / attendedOrNoShow) * 100 : 0;
        // Offer Rate = offered / showed
        const offerRate = callsShowed > 0 ? (offersMade / callsShowed) * 100 : 0;
        // Close Rate = closed / showed
        const closeRate = callsShowed > 0 ? (dealsClosed / callsShowed) * 100 : 0;

        // Calculate cash from payments linked to closer's events or directly from PCF cash_collected
        const eventIds = closerEvents.map(e => e.id);
        const repPayments = payments?.filter(p => eventIds.includes(p.event_id || '')) || [];
        const cashFromPayments = repPayments.reduce((sum, p) => {
          const amount = typeof p.amount === 'string' ? parseFloat(p.amount) : p.amount;
          const refund = typeof p.refund_amount === 'string' ? parseFloat(p.refund_amount) : (p.refund_amount || 0);
          return sum + (amount - refund);
        }, 0);

        // Also sum cash_collected from PCFs
        const cashFromPcfs = pcfsForMetrics.reduce((sum, p) => sum + (p.cash_collected || 0), 0);
        
        // Use the larger value (payments or PCF cash)
        const cashCollected = Math.max(cashFromPayments, cashFromPcfs);

        const cashPerBookedCall = callsBooked > 0 ? cashCollected / callsBooked : 0;

        // Use closer name from events (source of truth), generate a unique ID
        const closerKey = data.closer.email?.toLowerCase() || data.closer.name.toLowerCase();
        metrics.push({
          userId: closerKey,
          name: data.closer.name,
          email: data.closer.email || '',
          callsBooked,
          callsShowed,
          noShows,
          offersMade,
          dealsClosed,
          showRate,
          offerRate,
          closeRate,
          cashCollected,
          cashPerBookedCall,
        });
      });

      return metrics;
    },
    enabled: !!orgId && !!user && isAdmin && !!eventClosers,
  });

  // Sort and filter metrics
  const displayMetrics = useMemo(() => {
    if (!closerMetrics) return [];

    let filtered = closerMetrics;

    // Filter out hidden closers
    filtered = filtered.filter(m => !hiddenClosers.has(m.userId));

    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.name.toLowerCase().includes(query) || 
        m.email.toLowerCase().includes(query)
      );
    }

    // Sort
    return [...filtered].sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const diff = typeof aVal === 'number' && typeof bVal === 'number' 
        ? aVal - bVal 
        : String(aVal).localeCompare(String(bVal));
      return sortOrder === 'asc' ? diff : -diff;
    });
  }, [closerMetrics, searchQuery, sortBy, sortOrder, hiddenClosers]);

  const handleHideCloser = (userId: string) => {
    setHiddenClosers(prev => new Set([...prev, userId]));
  };

  const handleShowAllClosers = () => {
    setHiddenClosers(new Set());
  };

  const handleSort = (column: keyof CloserMetrics) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleAddKeyword = () => {
    if (keywordInput.trim() && !eventNameKeywords.includes(keywordInput.trim())) {
      setEventNameKeywords([...eventNameKeywords, keywordInput.trim()]);
      setKeywordInput('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setEventNameKeywords(eventNameKeywords.filter(k => k !== keyword));
  };

  const toggleSource = (sourceId: string) => {
    if (selectedSources.includes(sourceId)) {
      setSelectedSources(selectedSources.filter(s => s !== sourceId));
    } else {
      setSelectedSources([...selectedSources, sourceId]);
    }
  };

  const hasFilters = pcfStatus !== 'all' || callStatus !== 'all' || selectedSources.length > 0 || eventNameKeywords.length > 0;

  const clearFilters = () => {
    setPcfStatus('all');
    setCallStatus('all');
    setSelectedSources([]);
    setEventNameKeywords([]);
  };

  const handleExport = () => {
    exportToCSV(
      displayMetrics,
      [
        { key: 'name', label: 'Closer' },
        { key: 'email', label: 'Email' },
        { key: 'callsBooked', label: 'Scheduled' },
        { key: 'callsShowed', label: 'Showed' },
        { key: 'noShows', label: 'No Shows' },
        { key: 'offersMade', label: 'Offers Made' },
        { key: 'dealsClosed', label: 'Deals Closed' },
        { key: 'showRate', label: 'Show Rate', format: (v) => formatPercentForExport(v as number) },
        { key: 'offerRate', label: 'Offer Rate', format: (v) => formatPercentForExport(v as number) },
        { key: 'closeRate', label: 'Close Rate', format: (v) => formatPercentForExport(v as number) },
        { key: 'cashCollected', label: 'Cash Collected', format: (v) => formatCurrencyForExport(v as number) },
        { key: 'cashPerBookedCall', label: 'Cash/Booked Call', format: (v) => formatCurrencyForExport(v as number) },
      ],
      `closer-metrics-${new Date().toISOString().split('T')[0]}`
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Closer Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show message if no closers found in events
  if (!eventClosers || eventClosers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Closer Performance Metrics</CardTitle>
              <CardDescription>
                Comprehensive view of all closer stats
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No Events Found</p>
            <p className="text-sm mt-1">
              No events with closer data found in the selected date range.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Closer Performance Metrics</CardTitle>
              <CardDescription>
                Comprehensive view of all closer stats
              </CardDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[130px]">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {startDate ? format(startDate, 'MMM d') : 'Start'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-[130px]">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {endDate ? format(endDate, 'MMM d') : 'End'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Hidden Closers Indicator */}
        {hiddenClosers.size > 0 && (
          <div className="mt-4">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleShowAllClosers}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              Show {hiddenClosers.size} hidden
            </Button>
          </div>
        )}
        
        {/* Export button */}
        <div className="mt-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0">
        <DraggableTableWrapper dependencies={[displayMetrics]}>
          <table className="w-full min-w-max caption-bottom text-sm">
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="sticky left-0 bg-muted/50">Closer</TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('callsBooked')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Scheduled
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('callsShowed')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Showed
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('noShows')}
                >
                  <div className="flex items-center justify-center gap-1">
                    No Shows
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('offersMade')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Offers
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('showRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Show %
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('offerRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Offer %
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('closeRate')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Close %
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-center cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('dealsClosed')}
                >
                  <div className="flex items-center justify-center gap-1">
                    Deals
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('cashCollected')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Cash Collected
                    <ArrowUpDown className="h-3 w-3" />
                  </div>
                </TableHead>
                <TableHead 
                  className="text-right cursor-pointer hover:bg-muted"
                  onClick={() => handleSort('cashPerBookedCall')}
                >
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="flex items-center gap-1">
                      $/Booked
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </div>
                </TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayMetrics.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                    {hiddenClosers.size > 0 
                      ? `No visible closers. ${hiddenClosers.size} hidden.` 
                      : 'No closer data available for this period'}
                  </TableCell>
                </TableRow>
              ) : (
                displayMetrics.map((m, index) => (
                  <TableRow 
                    key={m.userId} 
                    className={cn(
                      index === 0 && "bg-primary/5",
                      "cursor-pointer hover:bg-muted/50 transition-colors"
                    )}
                    onClick={() => handleCloserClick(m)}
                  >
                    <TableCell className="sticky left-0 bg-background">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={cn(
                            "text-xs font-medium",
                            index === 0 && "bg-primary/20 text-primary"
                          )}>
                            {getInitials(m.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">{m.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono">
                        {m.callsBooked}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono">
                        {m.callsShowed}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={m.noShows > 0 ? "destructive" : "outline"} className="font-mono">
                        {m.noShows}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono">
                        {m.offersMade}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        m.showRate >= 70 && "text-green-600",
                        m.showRate < 50 && "text-red-600"
                      )}>
                        {formatPercent(m.showRate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        m.offerRate >= 70 && "text-green-600",
                        m.offerRate < 50 && "text-red-600"
                      )}>
                        {formatPercent(m.offerRate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-medium",
                        m.closeRate >= 50 && "text-green-600",
                        m.closeRate < 30 && "text-red-600"
                      )}>
                        {formatPercent(m.closeRate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-semibold">{m.dealsClosed}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold">{formatCurrency(m.cashCollected)}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium text-muted-foreground">
                        {formatCurrency(m.cashPerBookedCall)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleHideCloser(m.userId);
                        }}
                        title="Hide closer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </table>
        </DraggableTableWrapper>
      </CardContent>

      {/* Detail Sheet */}
      <MetricDetailSheet
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        filter={detailFilter}
        startDate={startDate}
        endDate={endDate}
      />
    </Card>
  );
}
