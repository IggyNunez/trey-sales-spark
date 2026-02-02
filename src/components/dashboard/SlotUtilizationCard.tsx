import { useMemo, useState } from 'react';
import { format, startOfHour, getHours, getDay, differenceInDays, addDays } from 'date-fns';
import {
  Gauge,
  Calendar,
  Users,
  Clock,
  TrendingUp,
  XCircle,
  Search,
  ChevronDown,
  BarChart3,
  UserCheck,
  CalendarX,
  ArrowLeft,
  RefreshCw,
  Download,
  Zap,
  Target,
  AlertCircle,
  CheckCircle2,
  MinusCircle,
  Lightbulb,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useCalendlyUtilization, useCalendlyEventTypes, CalendlyUtilization } from '@/hooks/useCalendlyUtilization';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';

interface Event {
  id: string;
  scheduled_at: string;
  call_status: string;
  event_outcome?: string;
  closer_name?: string;
  event_name?: string;
}

interface SlotUtilizationCardProps {
  events: Event[];
  eventsLoading: boolean;
  utilizationStartDate: Date;
  utilizationEndDate: Date;
  setUtilizationStartDate: (date: Date) => void;
  setUtilizationEndDate: (date: Date) => void;
  selectedEventTypes: string[];
  setSelectedEventTypes: (types: string[]) => void;
  onBack?: () => void;
  /** When set, shows utilization only for this booking platform. Calendly API used for 'calendly', Cal.com for 'calcom' */
  bookingPlatform?: string | null;
}

// Utility function to get utilization color class
function getUtilizationColor(percent: number): { bg: string; text: string; label: string } {
  if (percent >= 70) return { bg: 'bg-green-500/10', text: 'text-green-600', label: 'High' };
  if (percent >= 30) return { bg: 'bg-amber-500/10', text: 'text-amber-600', label: 'Moderate' };
  return { bg: 'bg-red-500/10', text: 'text-red-500', label: 'Low' };
}

// Utility function to get status indicator
function getStatusIndicator(percent: number, bookedSlots: number) {
  if (bookedSlots === 0) return { icon: MinusCircle, color: 'text-red-500', label: 'No Bookings' };
  if (percent >= 70) return { icon: CheckCircle2, color: 'text-green-600', label: 'Active' };
  if (percent >= 30) return { icon: AlertCircle, color: 'text-amber-500', label: 'Low Utilization' };
  return { icon: AlertCircle, color: 'text-red-500', label: 'Very Low' };
}

// Progress bar with labels
function UtilizationProgressBar({ booked, total, className }: { booked: number; total: number; className?: string }) {
  const percent = total > 0 ? (booked / total) * 100 : 0;
  const available = total - booked;
  const { text } = getUtilizationColor(percent);
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn("h-full transition-all rounded-full", 
              percent >= 70 ? 'bg-green-500' : 
              percent >= 30 ? 'bg-amber-500' : 
              'bg-red-500'
            )}
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
        <span className={cn("text-sm font-medium", text)}>
          {booked}/{total}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        {available} available slots remaining
      </p>
    </div>
  );
}

// Insights and recommendations component
function InsightsSection({ utilization, events, dateRange }: { 
  utilization: CalendlyUtilization; 
  events: Event[];
  dateRange: { start: Date; end: Date };
}) {
  const insights = useMemo(() => {
    const results: { type: 'success' | 'warning' | 'info'; message: string }[] = [];
    const percent = utilization.overall.utilizationPercent || 0;
    const bookedSlots = utilization.overall.bookedSlots;
    const totalSlots = utilization.overall.totalSlotsAvailable || utilization.overall.totalSlots;
    
    // Utilization-based insights
    if (percent < 30 && totalSlots > 0) {
      results.push({
        type: 'warning',
        message: `Low utilization at ${Math.round(percent)}%. Consider reducing available slots or increasing marketing efforts.`
      });
    } else if (percent > 80) {
      results.push({
        type: 'success',
        message: `High demand at ${Math.round(percent)}%! Consider adding more slots or closers.`
      });
    } else if (percent >= 30 && percent <= 80) {
      results.push({
        type: 'info',
        message: `Healthy utilization at ${Math.round(percent)}%. Capacity is well balanced.`
      });
    }

    // Check for event types with zero bookings
    const zeroBookingTypes = utilization.byEventType.filter(et => et.bookedSlots === 0 && et.totalSlotsAvailable > 0);
    if (zeroBookingTypes.length > 0) {
      results.push({
        type: 'warning',
        message: `${zeroBookingTypes.length} event type(s) have no bookings. Review their availability or visibility.`
      });
    }

    // Check for highly utilized event types
    const highUtilTypes = utilization.byEventType.filter(et => (et.utilizationPercent || 0) > 80);
    if (highUtilTypes.length > 0) {
      results.push({
        type: 'success',
        message: `${highUtilTypes.length} event type(s) are at >80% capacity. These are performing well!`
      });
    }

    return results;
  }, [utilization]);

  if (insights.length === 0) return null;

  return (
    <div className="p-4 rounded-lg border bg-muted/20 space-y-3">
      <div className="flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Recommendations</p>
      </div>
      <div className="space-y-2">
        {insights.map((insight, idx) => (
          <div 
            key={idx} 
            className={cn(
              "flex items-start gap-2 text-sm p-2 rounded",
              insight.type === 'success' && 'bg-green-500/10 text-green-700',
              insight.type === 'warning' && 'bg-amber-500/10 text-amber-700',
              insight.type === 'info' && 'bg-blue-500/10 text-blue-700'
            )}
          >
            {insight.type === 'success' && <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {insight.type === 'warning' && <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            {insight.type === 'info' && <Zap className="h-4 w-4 mt-0.5 flex-shrink-0" />}
            <span>{insight.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Key metrics row component
function KeyMetricsRow({ utilization, events, dateRange }: { 
  utilization: CalendlyUtilization; 
  events: Event[];
  dateRange: { start: Date; end: Date };
}) {
  const metrics = useMemo(() => {
    const days = Math.max(1, differenceInDays(dateRange.end, dateRange.start) + 1);
    const bookedSlots = utilization.overall.bookedSlots;
    const totalSlots = utilization.overall.totalSlotsAvailable || utilization.overall.totalSlots;
    const availableSlots = totalSlots - bookedSlots;
    const bookingsPerDay = bookedSlots / days;
    
    // Calculate projected full booking date
    let projectedFullDate: Date | null = null;
    if (bookingsPerDay > 0 && availableSlots > 0) {
      const daysToFull = Math.ceil(availableSlots / bookingsPerDay);
      projectedFullDate = addDays(new Date(), daysToFull);
    }

    // Find peak booking hour from events
    const hourCounts: Record<number, number> = {};
    events.forEach(event => {
      if (!event.scheduled_at) return;
      const hour = getHours(new Date(event.scheduled_at));
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
    const peakHourLabel = peakHour ? `${peakHour[0]}:00 (${peakHour[1]} bookings)` : 'N/A';

    // Calculate slots per closer (from byEventType hostCount)
    const totalHosts = utilization.byEventType.reduce((sum, et) => sum + (et.hostCount || 0), 0) || 1;
    const uniqueHosts = new Set(utilization.byEventType.map(et => et.hostCount).filter(Boolean)).size || 
                        utilization.byEventType.filter(et => et.hostCount).length || 1;
    const avgSlotsPerCloser = Math.round(totalSlots / Math.max(uniqueHosts, 1));

    // Conversion rate (booked / unique times)
    const uniqueTimes = utilization.overall.uniqueTimesAvailable || 0;
    const conversionRate = uniqueTimes > 0 ? (bookedSlots / uniqueTimes) * 100 : 0;

    return {
      bookingsPerDay: bookingsPerDay.toFixed(1),
      projectedFullDate,
      peakHourLabel,
      avgSlotsPerCloser,
      conversionRate: Math.round(conversionRate),
      availableSlots,
      totalHosts: uniqueHosts,
    };
  }, [utilization, events, dateRange]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="p-3 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-xs text-muted-foreground">Booking Rate</p>
        </div>
        <p className="text-lg font-bold">{metrics.bookingsPerDay}/day</p>
        <p className="text-[10px] text-muted-foreground">average during period</p>
      </div>

      <div className="p-3 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2 mb-1">
          <Target className="h-4 w-4 text-amber-500" />
          <p className="text-xs text-muted-foreground">Conversion Rate</p>
        </div>
        <p className="text-lg font-bold">{metrics.conversionRate}%</p>
        <p className="text-[10px] text-muted-foreground">booked / unique times</p>
      </div>

      <div className="p-3 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2 mb-1">
          <Clock className="h-4 w-4 text-green-600" />
          <p className="text-xs text-muted-foreground">Peak Time</p>
        </div>
        <p className="text-lg font-bold truncate" title={metrics.peakHourLabel}>
          {metrics.peakHourLabel.split(' ')[0] || 'N/A'}
        </p>
        <p className="text-[10px] text-muted-foreground">most popular hour</p>
      </div>

      <div className="p-3 rounded-lg border bg-card/50">
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-4 w-4 text-blue-500" />
          <p className="text-xs text-muted-foreground">Avg Slots/Closer</p>
        </div>
        <p className="text-lg font-bold">{metrics.avgSlotsPerCloser}</p>
        <p className="text-[10px] text-muted-foreground">across {metrics.totalHosts} closer(s)</p>
      </div>

      {metrics.projectedFullDate && (
        <div className="p-3 rounded-lg border bg-primary/5 col-span-2 sm:col-span-4">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <p className="text-sm">
              <span className="text-muted-foreground">At current rate, fully booked by </span>
              <span className="font-bold text-primary">{format(metrics.projectedFullDate, 'MMM d, yyyy')}</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Peak hours heatmap component
function PeakHoursHeatmap({ events }: { events: Event[] }) {
  const heatmapData = useMemo(() => {
    // Create 7x24 grid (days x hours)
    const grid: number[][] = Array(7).fill(null).map(() => Array(24).fill(0));
    const maxCount = { value: 0 };

    events.forEach(event => {
      if (!event.scheduled_at) return;
      const date = new Date(event.scheduled_at);
      const day = getDay(date); // 0 = Sunday
      const hour = getHours(date);
      grid[day][hour]++;
      if (grid[day][hour] > maxCount.value) {
        maxCount.value = grid[day][hour];
      }
    });

    return { grid, maxCount: maxCount.value };
  }, [events]);

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const hours = Array.from({ length: 24 }, (_, i) => i);

  // Only show business hours (6am - 10pm)
  const businessHours = hours.filter(h => h >= 6 && h <= 22);

  const getIntensity = (count: number) => {
    if (count === 0) return 'bg-muted/30';
    const ratio = count / Math.max(heatmapData.maxCount, 1);
    if (ratio < 0.25) return 'bg-primary/20';
    if (ratio < 0.5) return 'bg-primary/40';
    if (ratio < 0.75) return 'bg-primary/60';
    return 'bg-primary/90';
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">Peak Booking Hours</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Less</span>
          <div className="flex gap-0.5">
            <div className="w-3 h-3 rounded-sm bg-muted/30" />
            <div className="w-3 h-3 rounded-sm bg-primary/20" />
            <div className="w-3 h-3 rounded-sm bg-primary/40" />
            <div className="w-3 h-3 rounded-sm bg-primary/60" />
            <div className="w-3 h-3 rounded-sm bg-primary/90" />
          </div>
          <span>More</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[500px]">
          {/* Hour labels */}
          <div className="flex mb-1 ml-10">
            {businessHours.map(hour => (
              <div key={hour} className="flex-1 text-center text-[10px] text-muted-foreground">
                {hour === 6 ? '6am' : hour === 12 ? '12pm' : hour === 18 ? '6pm' : ''}
              </div>
            ))}
          </div>

          {/* Grid */}
          {days.map((day, dayIndex) => (
            <div key={day} className="flex items-center gap-1 mb-0.5">
              <span className="w-8 text-xs text-muted-foreground">{day}</span>
              <div className="flex flex-1 gap-0.5">
                {businessHours.map(hour => (
                  <div
                    key={`${dayIndex}-${hour}`}
                    className={cn(
                      "flex-1 h-4 rounded-sm transition-colors",
                      getIntensity(heatmapData.grid[dayIndex][hour])
                    )}
                    title={`${day} ${hour}:00 - ${heatmapData.grid[dayIndex][hour]} bookings`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Per-closer breakdown component
function CloserBreakdown({ events }: { events: Event[] }) {
  const closerStats = useMemo(() => {
    const stats = new Map<string, {
      total: number;
      showed: number;
      noShows: number;
      canceled: number;
      rescheduled: number;
    }>();

    events.forEach(event => {
      const closer = event.closer_name || 'Unassigned';
      if (!stats.has(closer)) {
        stats.set(closer, { total: 0, showed: 0, noShows: 0, canceled: 0, rescheduled: 0 });
      }
      const s = stats.get(closer)!;
      s.total++;

      if (event.call_status === 'canceled') s.canceled++;
      else if (event.call_status === 'rescheduled') s.rescheduled++;
      else if (event.event_outcome === 'no_show') s.noShows++;
      else if (event.event_outcome && event.event_outcome !== 'no_show') s.showed++;
    });

    return Array.from(stats.entries())
      .map(([name, data]) => ({
        name,
        ...data,
        showRate: data.total > 0 ? Math.round(((data.total - data.noShows - data.canceled - data.rescheduled) / data.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  }, [events]);

  if (closerStats.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        No closer data available
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-muted-foreground">Performance by Closer</p>
      <div className="space-y-2">
        {closerStats.slice(0, 10).map(closer => (
          <div key={closer.name} className="p-3 rounded-lg border bg-card/50">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{closer.name}</span>
              </div>
              <Badge variant="outline" className="font-mono">
                {closer.total} calls
              </Badge>
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="text-center p-2 rounded bg-muted/30">
                <p className="font-bold text-green-600">{closer.showed}</p>
                <p className="text-muted-foreground">Showed</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/30">
                <p className="font-bold text-red-500">{closer.noShows}</p>
                <p className="text-muted-foreground">No Shows</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/30">
                <p className="font-bold text-amber-500">{closer.canceled}</p>
                <p className="text-muted-foreground">Canceled</p>
              </div>
              <div className="text-center p-2 rounded bg-muted/30">
                <p className="font-bold text-primary">{closer.showRate}%</p>
                <p className="text-muted-foreground">Show Rate</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Historical stats component
function HistoricalStats({ events }: { events: Event[] }) {
  const stats = useMemo(() => {
    let total = 0;
    let showed = 0;
    let noShows = 0;
    let canceled = 0;
    let rescheduled = 0;

    events.forEach(event => {
      total++;
      if (event.call_status === 'canceled') canceled++;
      else if (event.call_status === 'rescheduled') rescheduled++;
      else if (event.event_outcome === 'no_show') noShows++;
      else if (event.event_outcome && event.event_outcome !== 'no_show') showed++;
    });

    return {
      total,
      showed,
      noShows,
      canceled,
      rescheduled,
      showRate: total > 0 ? Math.round((showed / total) * 100) : 0,
      noShowRate: total > 0 ? Math.round((noShows / total) * 100) : 0,
      cancelRate: total > 0 ? Math.round((canceled / total) * 100) : 0,
    };
  }, [events]);

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium text-muted-foreground">Historical Performance</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-lg border bg-card/50 text-center">
          <CalendarX className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
          <p className="text-2xl font-bold">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Calls</p>
        </div>
        <div className="p-4 rounded-lg border bg-green-500/10 text-center">
          <TrendingUp className="h-5 w-5 mx-auto mb-2 text-green-600" />
          <p className="text-2xl font-bold text-green-600">{stats.showRate}%</p>
          <p className="text-xs text-muted-foreground">Show Rate</p>
        </div>
        <div className="p-4 rounded-lg border bg-red-500/10 text-center">
          <XCircle className="h-5 w-5 mx-auto mb-2 text-red-500" />
          <p className="text-2xl font-bold text-red-500">{stats.noShowRate}%</p>
          <p className="text-xs text-muted-foreground">No Show Rate</p>
        </div>
        <div className="p-4 rounded-lg border bg-amber-500/10 text-center">
          <CalendarX className="h-5 w-5 mx-auto mb-2 text-amber-500" />
          <p className="text-2xl font-bold text-amber-500">{stats.cancelRate}%</p>
          <p className="text-xs text-muted-foreground">Cancel Rate</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Showed</span>
          <span className="font-medium">{stats.showed}</span>
        </div>
        <Progress value={stats.total > 0 ? (stats.showed / stats.total) * 100 : 0} className="h-2 bg-muted" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">No Shows</span>
          <span className="font-medium text-red-500">{stats.noShows}</span>
        </div>
        <Progress value={stats.total > 0 ? (stats.noShows / stats.total) * 100 : 0} className="h-2 bg-muted [&>div]:bg-red-500" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Canceled</span>
          <span className="font-medium text-amber-500">{stats.canceled}</span>
        </div>
        <Progress value={stats.total > 0 ? (stats.canceled / stats.total) * 100 : 0} className="h-2 bg-muted [&>div]:bg-amber-500" />

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Rescheduled</span>
          <span className="font-medium">{stats.rescheduled}</span>
        </div>
        <Progress value={stats.total > 0 ? (stats.rescheduled / stats.total) * 100 : 0} className="h-2 bg-muted [&>div]:bg-blue-500" />
      </div>
    </div>
  );
}

export function SlotUtilizationCard({
  events,
  eventsLoading,
  utilizationStartDate,
  utilizationEndDate,
  setUtilizationStartDate,
  setUtilizationEndDate,
  selectedEventTypes,
  setSelectedEventTypes,
  onBack,
  bookingPlatform,
}: SlotUtilizationCardProps) {
  const [activeTab, setActiveTab] = useState('overview');
  const [eventTypeSearch, setEventTypeSearch] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const queryClient = useQueryClient();

  const { data: calendlyEventTypes, isLoading: eventTypesLoading } = useCalendlyEventTypes();

  const utilizationMinDate = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, []);

  const utilizationMaxDate = useMemo(() => {
    const max = new Date();
    max.setHours(0, 0, 0, 0);
    max.setDate(max.getDate() + 7);
    return max;
  }, []);

  const { data: utilization, isLoading: utilizationLoading, refetch: refetchUtilization } = useCalendlyUtilization(
    utilizationStartDate,
    utilizationEndDate,
    selectedEventTypes.length > 0 ? selectedEventTypes : undefined
  );

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetchUtilization();
      await queryClient.invalidateQueries({ queryKey: ['calendly-event-types'] });
      toast({
        title: "Data refreshed",
        description: "Calendly utilization data has been updated.",
      });
    } catch (error) {
      toast({
        title: "Refresh failed",
        description: "Unable to refresh data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Handle export
  const handleExport = () => {
    if (!utilization) return;

    const rows: string[][] = [
      ['Event Type', 'Type', 'Unique Times', 'Total Slots', 'Available Slots', 'Booked', 'Utilization %', 'Status'],
    ];

    utilization.byEventType.forEach(et => {
      const available = et.totalSlotsAvailable - et.bookedSlots;
      const status = getStatusIndicator(et.utilizationPercent || 0, et.bookedSlots);
      rows.push([
        et.name,
        et.kind || 'Solo',
        String(et.uniqueTimesAvailable || 0),
        String(et.totalSlotsAvailable || 0),
        String(available),
        String(et.bookedSlots),
        `${Math.round(et.utilizationPercent || 0)}%`,
        status.label,
      ]);
    });

    // Add overall summary
    const overallAvailable = (utilization.overall.totalSlotsAvailable || utilization.overall.totalSlots) - utilization.overall.bookedSlots;
    rows.push([]);
    rows.push(['OVERALL', '', String(utilization.overall.uniqueTimesAvailable || 0), String(utilization.overall.totalSlotsAvailable || utilization.overall.totalSlots), String(overallAvailable), String(utilization.overall.bookedSlots), `${Math.round(utilization.overall.utilizationPercent || 0)}%`, '']);

    const csvContent = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `slot-utilization-${format(utilizationStartDate, 'yyyy-MM-dd')}-to-${format(utilizationEndDate, 'yyyy-MM-dd')}.csv`;
    link.click();

    toast({
      title: "Report exported",
      description: "CSV file has been downloaded.",
    });
  };

  // If Cal.com filter is selected, show message that utilization is Calendly-specific
  if (bookingPlatform === 'calcom') {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-primary" />
            <CardTitle>Slot Utilization</CardTitle>
          </div>
          <CardDescription>
            Slot utilization data is currently available for Calendly bookings only.
            Cal.com utilization support coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Switch to Calendly or All Calendars to view slot utilization</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {/* Back button */}
            {onBack && (
              <Button variant="ghost" size="sm" onClick={onBack} className="h-8 w-8 p-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Gauge className="h-5 w-5 text-primary" />
            <CardTitle>Slot Utilization</CardTitle>
          </div>

          {/* Action buttons and selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Refresh button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefresh}
              disabled={isRefreshing || utilizationLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>

            {/* Export button */}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              disabled={!utilization || utilizationLoading}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
            </Button>

            {/* Event Type Selector */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {selectedEventTypes.length > 0
                    ? `${selectedEventTypes.length} selected`
                    : 'All Event Types'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">Select Event Types</p>
                    <div className="flex gap-1">
                      {selectedEventTypes.length < (calendlyEventTypes?.length || 0) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEventTypes(calendlyEventTypes?.map(et => et.uri) || [])}
                          className="h-auto py-1 px-2 text-xs"
                        >
                          Select all
                        </Button>
                      )}
                      {selectedEventTypes.length > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedEventTypes([])}
                          className="h-auto py-1 px-2 text-xs text-destructive hover:text-destructive"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search event types..."
                      value={eventTypeSearch}
                      onChange={(e) => setEventTypeSearch(e.target.value)}
                      className="pl-8 h-9"
                    />
                  </div>
                  {eventTypesLoading ? (
                    <div className="space-y-2">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </div>
                  ) : calendlyEventTypes && calendlyEventTypes.length > 0 ? (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {calendlyEventTypes
                        .filter(et => et.name.toLowerCase().includes(eventTypeSearch.toLowerCase()))
                        .map((et) => (
                        <label
                          key={et.uri}
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            checked={selectedEventTypes.includes(et.uri)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedEventTypes([...selectedEventTypes, et.uri]);
                              } else {
                                setSelectedEventTypes(selectedEventTypes.filter(u => u !== et.uri));
                              }
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{et.name}</p>
                            <p className="text-xs text-muted-foreground">{et.duration} min</p>
                          </div>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      No event types found.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Date range selector */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Calendar className="h-4 w-4" />
                  {format(utilizationStartDate, 'MMM d')} - {format(utilizationEndDate, 'MMM d')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-4" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Select Date Range</p>
                    <p className="text-xs text-muted-foreground">Today to max 7 days ahead</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        setUtilizationStartDate(today);
                        setUtilizationEndDate(today);
                      }}
                    >
                      Today
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const end = new Date(today);
                        end.setDate(end.getDate() + 3);
                        setUtilizationStartDate(today);
                        setUtilizationEndDate(end);
                      }}
                    >
                      3 days
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        const end = new Date(today);
                        end.setDate(end.getDate() + 7);
                        setUtilizationStartDate(today);
                        setUtilizationEndDate(end);
                      }}
                    >
                      7 days
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        <CardDescription>
          Calendar availability vs booked slots from Calendly
        </CardDescription>

        {/* Selected event types chips */}
        {selectedEventTypes.length > 0 && calendlyEventTypes && (
          <div className="flex flex-wrap gap-2 mt-3">
            {selectedEventTypes.map(uri => {
              const et = calendlyEventTypes.find(e => e.uri === uri);
              if (!et) return null;
              return (
                <button
                  key={uri}
                  onClick={() => setSelectedEventTypes(selectedEventTypes.filter(u => u !== uri))}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {et.name}
                  <XCircle className="h-3 w-3" />
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>

      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="overview" className="text-xs sm:text-sm">
              <Gauge className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="closers" className="text-xs sm:text-sm">
              <Users className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">By Closer</span>
            </TabsTrigger>
            <TabsTrigger value="hours" className="text-xs sm:text-sm">
              <Clock className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Peak Hours</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4 mr-1 sm:mr-2" />
              <span className="hidden sm:inline">Stats</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            {utilizationLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ) : utilization?.success ? (
              <div className="space-y-6">
                {/* Overall summary with color-coded metrics */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Overall Utilization</span>
                    <div className="flex items-center gap-2">
                      {utilization.overall.totalSlots > 0 && (
                        <Badge className={cn(
                          getUtilizationColor(utilization.overall.utilizationPercent || 0).bg,
                          getUtilizationColor(utilization.overall.utilizationPercent || 0).text,
                          "border-0"
                        )}>
                          {getUtilizationColor(utilization.overall.utilizationPercent || 0).label}
                        </Badge>
                      )}
                      <span className={cn(
                        "text-2xl font-bold",
                        getUtilizationColor(utilization.overall.utilizationPercent || 0).text
                      )}>
                        {utilization.overall.totalSlots > 0
                          ? `${Math.round(utilization.overall.utilizationPercent || 0)}%`
                          : `${utilization.overall.bookedSlots} booked`
                        }
                      </span>
                    </div>
                  </div>

                  {selectedEventTypes.length > 0 && (
                    <div className="grid grid-cols-3 gap-4 mb-3 p-3 bg-muted/30 rounded-lg">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-primary">{utilization.overall.uniqueTimesAvailable ?? 0}</p>
                        <p className="text-xs text-muted-foreground">Unique Times</p>
                        <p className="text-[10px] text-muted-foreground/70">distinct time slots</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-green-600">
                          {(utilization.overall.totalSlotsAvailable ?? utilization.overall.totalSlots) - utilization.overall.bookedSlots}
                        </p>
                        <p className="text-xs text-muted-foreground">Available Slots</p>
                        <p className="text-[10px] text-muted-foreground/70">remaining capacity</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold text-amber-600">{utilization.overall.bookedSlots}</p>
                        <p className="text-xs text-muted-foreground">Booked</p>
                        <p className="text-[10px] text-muted-foreground/70">confirmed bookings</p>
                      </div>
                    </div>
                  )}

                  {utilization.overall.totalSlots > 0 ? (
                    <UtilizationProgressBar 
                      booked={utilization.overall.bookedSlots} 
                      total={utilization.overall.totalSlotsAvailable || utilization.overall.totalSlots}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Availability data only available for future dates
                    </p>
                  )}
                </div>

                {/* Key metrics row */}
                {selectedEventTypes.length > 0 && (
                  <KeyMetricsRow 
                    utilization={utilization} 
                    events={events}
                    dateRange={{ start: utilizationStartDate, end: utilizationEndDate }}
                  />
                )}

                {/* Insights section */}
                {selectedEventTypes.length > 0 && (
                  <InsightsSection 
                    utilization={utilization}
                    events={events}
                    dateRange={{ start: utilizationStartDate, end: utilizationEndDate }}
                  />
                )}

                {/* Per event type breakdown */}
                {selectedEventTypes.length > 0 && utilization.byEventType.length > 0 && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">By Event Type</p>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left p-3 font-medium">Event Type</th>
                            <th className="text-center p-3 font-medium">Type</th>
                            <th className="text-center p-3 font-medium hidden sm:table-cell">Unique</th>
                            <th className="text-center p-3 font-medium hidden sm:table-cell">Available</th>
                            <th className="text-center p-3 font-medium">Booked</th>
                            <th className="text-center p-3 font-medium hidden md:table-cell">Status</th>
                            <th className="text-right p-3 font-medium">%</th>
                          </tr>
                        </thead>
                        <tbody>
                          {utilization.byEventType.map((eventType, idx) => {
                            const available = (eventType.totalSlotsAvailable || 0) - eventType.bookedSlots;
                            const status = getStatusIndicator(eventType.utilizationPercent || 0, eventType.bookedSlots);
                            const StatusIcon = status.icon;
                            const colorClass = getUtilizationColor(eventType.utilizationPercent || 0);
                            
                            return (
                              <tr key={eventType.uri || eventType.name} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                                <td className="p-3 font-medium truncate max-w-[150px]" title={eventType.name}>
                                  {eventType.name}
                                </td>
                                <td className="p-3 text-center">
                                  <span className={`text-xs px-2 py-1 rounded-full ${
                                    eventType.isTeamEvent
                                      ? 'bg-primary/10 text-primary'
                                      : 'bg-muted text-muted-foreground'
                                  }`}>
                                    {eventType.kind || 'Solo'}
                                  </span>
                                </td>
                                <td className="p-3 text-center hidden sm:table-cell">{eventType.uniqueTimesAvailable ?? '-'}</td>
                                <td className="p-3 text-center hidden sm:table-cell font-medium text-green-600">
                                  {available >= 0 ? available : '-'}
                                </td>
                                <td className="p-3 text-center font-medium">{eventType.bookedSlots}</td>
                                <td className="p-3 text-center hidden md:table-cell">
                                  <div className="flex items-center justify-center gap-1">
                                    <StatusIcon className={cn("h-4 w-4", status.color)} />
                                    <span className={cn("text-xs", status.color)}>{status.label}</span>
                                  </div>
                                </td>
                                <td className="p-3 text-right">
                                  {eventType.totalSlots > 0 ? (
                                    <div className="flex items-center justify-end gap-2">
                                      <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                                        <div 
                                          className={cn(
                                            "h-full transition-all rounded-full",
                                            (eventType.utilizationPercent || 0) >= 70 ? 'bg-green-500' :
                                            (eventType.utilizationPercent || 0) >= 30 ? 'bg-amber-500' :
                                            'bg-red-500'
                                          )}
                                          style={{ width: `${Math.min(100, eventType.utilizationPercent || 0)}%` }}
                                        />
                                      </div>
                                      <span className={cn("font-bold w-8", colorClass.text)}>
                                        {Math.round(eventType.utilizationPercent || 0)}%
                                      </span>
                                    </div>
                                  ) : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {selectedEventTypes.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Select event types above to see detailed breakdown
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Unable to fetch utilization data. Make sure Calendly is connected.
              </p>
            )}
          </TabsContent>

          <TabsContent value="closers">
            {eventsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <CloserBreakdown events={events} />
            )}
          </TabsContent>

          <TabsContent value="hours">
            {eventsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <PeakHoursHeatmap events={events} />
            )}
          </TabsContent>

          <TabsContent value="stats">
            {eventsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-32 w-full" />
              </div>
            ) : (
              <HistoricalStats events={events} />
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
