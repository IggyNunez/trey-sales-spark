import { useState } from 'react';
import { format, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { Phone, PhoneCall, Voicemail, Clock, Mail, MessageSquare, RefreshCw, TrendingUp } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useSetterActivityAggregates, useSyncSetterActivities } from '@/hooks/useSetterActivities';
import { cn } from '@/lib/utils';

type DatePreset = 'today' | 'yesterday' | 'last7' | 'last30' | 'thisMonth' | 'custom';

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

export default function SetterMetricsPage() {
  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [customStart, setCustomStart] = useState<Date>();
  const [customEnd, setCustomEnd] = useState<Date>();

  const getDateRange = () => {
    const today = new Date();
    switch (datePreset) {
      case 'today':
        return { start: today, end: today };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { start: yesterday, end: yesterday };
      case 'last7':
        return { start: subDays(today, 6), end: today };
      case 'last30':
        return { start: subDays(today, 29), end: today };
      case 'thisMonth':
        return { start: startOfMonth(today), end: endOfMonth(today) };
      case 'custom':
        return { start: customStart, end: customEnd };
      default:
        return { start: startOfMonth(today), end: endOfMonth(today) };
    }
  };

  const { start: startDate, end: endDate } = getDateRange();

  const { data: aggregates, isLoading } = useSetterActivityAggregates({
    startDate,
    endDate,
  });

  const syncMutation = useSyncSetterActivities();

  const handleSync = () => {
    syncMutation.mutate({
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
    });
  };

  // Calculate totals
  const totals = aggregates?.reduce(
    (acc, row) => ({
      total_dials: acc.total_dials + row.total_dials,
      connected_calls: acc.connected_calls + row.connected_calls,
      voicemails_left: acc.voicemails_left + row.voicemails_left,
      total_talk_time_seconds: acc.total_talk_time_seconds + row.total_talk_time_seconds,
      emails_sent: acc.emails_sent + row.emails_sent,
      sms_sent: acc.sms_sent + row.sms_sent,
    }),
    {
      total_dials: 0,
      connected_calls: 0,
      voicemails_left: 0,
      total_talk_time_seconds: 0,
      emails_sent: 0,
      sms_sent: 0,
    }
  );

  const overallConnectionRate = totals?.total_dials 
    ? Math.round((totals.connected_calls / totals.total_dials) * 100) 
    : 0;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Setter Metrics</h1>
            <p className="text-muted-foreground">
              Track dials, connections, and outreach from Close CRM
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="last7">Last 7 Days</SelectItem>
                <SelectItem value="last30">Last 30 Days</SelectItem>
                <SelectItem value="thisMonth">This Month</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {datePreset === 'custom' && (
              <div className="flex gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      {customStart ? format(customStart, 'MMM d') : 'Start'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customStart}
                      onSelect={setCustomStart}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      {customEnd ? format(customEnd, 'MMM d') : 'End'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customEnd}
                      onSelect={setCustomEnd}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <Button 
              onClick={handleSync} 
              disabled={syncMutation.isPending}
              variant="outline"
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", syncMutation.isPending && "animate-spin")} />
              Sync from Close
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Dials</CardTitle>
              <Phone className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{totals?.total_dials || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connected</CardTitle>
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{totals?.connected_calls || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Connection Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{overallConnectionRate}%</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Talk Time</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">
                  {formatDuration(totals?.total_talk_time_seconds || 0)}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{totals?.emails_sent || 0}</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">SMS Sent</CardTitle>
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-2xl font-bold">{totals?.sms_sent || 0}</div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Setter Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Setter Activity Breakdown</CardTitle>
            <CardDescription>
              Individual performance metrics for each setter
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !aggregates || aggregates.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="mx-auto h-12 w-12 opacity-50 mb-4" />
                <p>No activity data found for this period.</p>
                <p className="text-sm mt-2">
                  Click "Sync from Close" to pull the latest data.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setter</TableHead>
                    <TableHead className="text-right">Dials</TableHead>
                    <TableHead className="text-right">Connected</TableHead>
                    <TableHead className="text-right">Connection %</TableHead>
                    <TableHead className="text-right">VMs Left</TableHead>
                    <TableHead className="text-right">Talk Time</TableHead>
                    <TableHead className="text-right">Emails</TableHead>
                    <TableHead className="text-right">SMS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregates.map((row) => (
                    <TableRow key={row.close_user_id}>
                      <TableCell className="font-medium">{row.setter_name}</TableCell>
                      <TableCell className="text-right">{row.total_dials}</TableCell>
                      <TableCell className="text-right">{row.connected_calls}</TableCell>
                      <TableCell className="text-right">
                        <Badge 
                          variant={row.connection_rate >= 30 ? 'default' : row.connection_rate >= 15 ? 'secondary' : 'outline'}
                        >
                          {row.connection_rate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{row.voicemails_left}</TableCell>
                      <TableCell className="text-right">
                        {formatDuration(row.total_talk_time_seconds)}
                      </TableCell>
                      <TableCell className="text-right">{row.emails_sent}</TableCell>
                      <TableCell className="text-right">{row.sms_sent}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
