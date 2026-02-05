import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Users, TrendingUp, CalendarDays, UserCheck, Phone } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { useAuth } from '@/hooks/useAuth';
import { useSetterLeads, useSetterLeadStats } from '@/hooks/useSetterLeads';
import { useMyEvents } from '@/hooks/useEvents';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { format, isToday, isFuture, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { DateRange } from 'react-day-picker';

export default function SetterDashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Date range filter - default to current month
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });

  const { data: leads, isLoading: leadsLoading } = useSetterLeads({
    startDate: dateRange?.from,
    endDate: dateRange?.to,
    limit: 100,
  });

  const { data: leadStats, isLoading: statsLoading } = useSetterLeadStats();
  const { data: events, isLoading: eventsLoading } = useMyEvents();

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

  // Calculate show rate from events
  const totalScheduled = filteredEvents.length;
  const showed = filteredEvents.filter(e =>
    e.call_status === 'completed' || e.call_status === 'showed'
  ).length;
  const showRate = totalScheduled > 0 ? Math.round((showed / totalScheduled) * 100) : 0;

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
            <p className="text-muted-foreground mt-1">
              Here's an overview of your leads and scheduled calls
            </p>
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

        {/* Today's Calls */}
        {todayEvents.length > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Today's Scheduled Calls ({todayEvents.length})
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
                    <Badge variant={event.call_status === 'scheduled' ? 'default' : 'secondary'}>
                      {event.call_status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {leadsLoading || statsLoading ? (
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
              <StatsCard
                title="Total Leads"
                value={leadStats?.totalLeads || 0}
                icon={<Users className="h-5 w-5" />}
                description="All time"
              />
              <StatsCard
                title="Leads This Month"
                value={leadStats?.leadsThisMonth || 0}
                icon={<UserCheck className="h-5 w-5" />}
                description="Current month"
              />
              <StatsCard
                title="Calls Scheduled"
                value={totalScheduled}
                icon={<Phone className="h-5 w-5" />}
                description="In selected period"
              />
              <StatsCard
                title="Show Rate"
                value={`${showRate}%`}
                icon={<TrendingUp className="h-5 w-5" />}
                description={`${showed} showed of ${totalScheduled}`}
              />
            </>
          )}
        </div>

        {/* Leads Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>My Leads</CardTitle>
                <CardDescription>Leads you've set appointments for</CardDescription>
              </div>
              <Button variant="outline" onClick={() => navigate('/my-leads')}>
                View All Leads
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {leadsLoading ? (
              <div className="space-y-4">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : leads && leads.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.slice(0, 10).map((lead) => (
                    <TableRow key={lead.id}>
                      <TableCell className="font-medium">{lead.full_name}</TableCell>
                      <TableCell>{lead.email}</TableCell>
                      <TableCell>{lead.phone || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {lead.source?.name || 'Unknown'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(lead.created_at), 'MMM d, yyyy')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No leads found for the selected period</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Events */}
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Calls</CardTitle>
            <CardDescription>Scheduled calls for your leads</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="upcoming">
              <TabsList className="mb-4">
                <TabsTrigger value="upcoming">Upcoming ({upcomingEvents.length})</TabsTrigger>
                <TabsTrigger value="all">All ({filteredEvents.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="upcoming">
                {eventsLoading ? (
                  <div className="space-y-4">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : upcomingEvents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Closer</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {upcomingEvents.slice(0, 10).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">{event.lead_name}</TableCell>
                          <TableCell>
                            {format(new Date(event.scheduled_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>{event.closer_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={event.call_status === 'scheduled' ? 'default' : 'secondary'}>
                              {event.call_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No upcoming calls scheduled</p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="all">
                {eventsLoading ? (
                  <div className="space-y-4">
                    {Array(3).fill(0).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : filteredEvents.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Lead</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Closer</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEvents.slice(0, 20).map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="font-medium">{event.lead_name}</TableCell>
                          <TableCell>
                            {format(new Date(event.scheduled_at), 'MMM d, h:mm a')}
                          </TableCell>
                          <TableCell>{event.closer_name || '-'}</TableCell>
                          <TableCell>
                            <Badge variant={event.call_status === 'scheduled' ? 'default' : 'secondary'}>
                              {event.call_status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No events found for the selected period</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
