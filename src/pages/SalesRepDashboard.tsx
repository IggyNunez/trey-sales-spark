import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, FileText, TrendingUp, DollarSign, Target, CalendarDays } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { EventsTable } from '@/components/dashboard/EventsTable';
import { useMyEvents, Event } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import { useRepStats } from '@/hooks/useRepStats';
import { usePortalSettings } from '@/hooks/usePortalSettings';
import { useIntegrationConfig } from '@/hooks/useIntegrationConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, isToday, isFuture, isPast, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DateRange } from 'react-day-picker';

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

export default function SalesRepDashboard() {
  const { profile } = useAuth();
  const { data: events, isLoading } = useMyEvents();
  const { data: portalSettings } = usePortalSettings();
  const { primaryCRM } = useIntegrationConfig();
  const navigate = useNavigate();
  
  // Date range filter - default to current month
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  
  const { data: repStats, isLoading: statsLoading } = useRepStats(dateRange?.from);

  // Filter events by date range
  const filteredEvents = events?.filter(e => {
    if (!dateRange?.from) return true;
    const eventDate = new Date(e.scheduled_at);
    if (dateRange.to) {
      return isWithinInterval(eventDate, { start: dateRange.from, end: dateRange.to });
    }
    return eventDate >= dateRange.from;
  }) || [];

  const todayEvents = filteredEvents.filter(e => isToday(new Date(e.scheduled_at)));
  const upcomingEvents = filteredEvents.filter(e => isFuture(new Date(e.scheduled_at)));
  const pastEvents = filteredEvents.filter(e => isPast(new Date(e.scheduled_at)) && !isToday(new Date(e.scheduled_at)));
  // Pending PCFs: past events that haven't had PCF submitted and aren't canceled/rescheduled
  const pendingPCFs = filteredEvents.filter(e => 
    !e.pcf_submitted && 
    isPast(new Date(e.scheduled_at)) && 
    e.call_status !== 'canceled' && 
    e.call_status !== 'rescheduled'
  );

  const handleSubmitPCF = (event: Event) => {
    navigate(`/pcf/${event.id}`);
  };

  // Default to showing everything if settings haven't loaded
  const settings = portalSettings || {
    show_booked_calls: true,
    show_show_rate: true,
    show_close_rate: true,
    show_cash_collected: true,
    show_upcoming_events: true,
    show_overdue_pcfs: true,
    show_past_events: true,
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">
              {format(new Date(), 'EEEE, MMMM d')}
            </p>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1">
              Welcome back, {profile?.name?.split(' ')[0] || 'there'}
            </h1>
          </div>
          
          {/* Date Range Filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                {dateRange?.from ? (
                  dateRange.to ? (
                    <>
                      {format(dateRange.from, 'MMM d')} - {format(dateRange.to, 'MMM d, yyyy')}
                    </>
                  ) : (
                    format(dateRange.from, 'MMM d, yyyy')
                  )
                ) : (
                  'Select dates'
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                defaultMonth={dateRange?.from}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Today's Schedule */}
        {todayEvents.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Today's Calls ({todayEvents.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {todayEvents.map(event => (
                  <div 
                    key={event.id} 
                    className="flex items-center justify-between p-3 rounded-lg bg-card border"
                  >
                    <div>
                      <p className="font-medium">{event.lead_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(event.scheduled_at), 'h:mm a')}
                      </p>
                    </div>
                    {!event.pcf_submitted && event.call_status !== 'scheduled' && (
                      <button 
                        onClick={() => handleSubmitPCF(event)}
                        className="text-xs text-primary hover:underline"
                      >
                        Submit PCF
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pending PCFs Alert */}
        {settings.show_overdue_pcfs && pendingPCFs.length > 0 && (
          <Card className="border-warning/20 bg-warning/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-warning" />
                Pending Post-Call Forms ({pendingPCFs.length})
              </CardTitle>
              <CardDescription>
                Complete these forms to update your sales metrics
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EventsTable 
                events={pendingPCFs.slice(0, 5)} 
                showPCFAction 
                showStatusActions
                crmType={primaryCRM}
                onSubmitPCF={handleSubmitPCF}
              />
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {isLoading || statsLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-6">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              {settings.show_booked_calls && (
                <StatsCard
                  title="Booked Calls"
                  value={repStats?.bookedCalls || 0}
                  icon={<Calendar className="h-5 w-5" />}
                  description="In selected period"
                />
              )}
              {settings.show_show_rate && (
                <StatsCard
                  title="Show Rate"
                  value={`${repStats?.showRate || 0}%`}
                  icon={<Target className="h-5 w-5" />}
                  description={`${repStats?.completedCalls || 0} showed`}
                />
              )}
              {settings.show_close_rate && (
                <StatsCard
                  title="Close Rate"
                  value={`${repStats?.closeRate || 0}%`}
                  icon={<TrendingUp className="h-5 w-5" />}
                  description={`${repStats?.dealsClosed || 0} deals`}
                />
              )}
              {settings.show_cash_collected && (
                <StatsCard
                  title="Cash Collected"
                  value={formatCurrency(repStats?.cashCollected || 0)}
                  icon={<DollarSign className="h-5 w-5" />}
                  description="In selected period"
                />
              )}
            </>
          )}
        </div>

        {/* Events Tabs */}
        <Card>
          <CardHeader>
            <CardTitle>My Events</CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue={settings.show_upcoming_events ? "upcoming" : (settings.show_past_events ? "past" : "all")}>
              <TabsList className="mb-4">
                {settings.show_upcoming_events && (
                  <TabsTrigger value="upcoming">Upcoming ({upcomingEvents.length})</TabsTrigger>
                )}
                {settings.show_past_events && (
                  <TabsTrigger value="past">Past ({pastEvents.length})</TabsTrigger>
                )}
                <TabsTrigger value="all">All ({filteredEvents.length})</TabsTrigger>
              </TabsList>
              
              {settings.show_upcoming_events && (
                <TabsContent value="upcoming">
                  {isLoading ? (
                    <div className="space-y-4">
                      {Array(3).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <EventsTable 
                      events={upcomingEvents} 
                      showPCFAction 
                      showStatusActions
                      crmType={primaryCRM}
                      onSubmitPCF={handleSubmitPCF}
                    />
                  )}
                </TabsContent>
              )}
              
              {settings.show_past_events && (
                <TabsContent value="past">
                  {isLoading ? (
                    <div className="space-y-4">
                      {Array(3).fill(0).map((_, i) => (
                        <Skeleton key={i} className="h-16 w-full" />
                      ))}
                    </div>
                  ) : (
                    <EventsTable 
                      events={pastEvents} 
                      showPCFAction 
                      showStatusActions
                      crmType={primaryCRM}
                      onSubmitPCF={handleSubmitPCF}
                    />
                  )}
                </TabsContent>
              )}
              
              <TabsContent value="all">
                {isLoading ? (
                  <div className="space-y-4">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (
                  <EventsTable 
                    events={filteredEvents} 
                    showPCFAction 
                    showStatusActions
                    crmType={primaryCRM}
                    onSubmitPCF={handleSubmitPCF}
                  />
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
