import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { BarChart3, TrendingUp, Users, ChevronRight, ChevronLeft, UserCheck, Activity, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTrafficSourceMetrics } from '@/hooks/useTrafficSourceMetrics';
import { useUtmSetterMetrics } from '@/hooks/useUtmSetterMetrics';
import { useUtmCloserMetrics } from '@/hooks/useUtmCloserMetrics';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { MetricDetailSheet } from '@/components/analytics/MetricDetailSheet';
import { MetricFilter } from '@/types/metricFilter';
import { cn } from '@/lib/utils';

interface AttributionTabProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

function getRateColor(rate: number): string {
  if (rate >= 70) return 'text-green-600 dark:text-green-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

const PAGE_SIZE = 5;

export function AttributionTab({ startDate, endDate, bookingPlatform }: AttributionTabProps) {
  const { data: trafficData, isLoading: trafficLoading } = useTrafficSourceMetrics({
    startDate,
    endDate,
    bookingPlatform,
  });

  const { data: utmSetters, isLoading: setterLoading } = useUtmSetterMetrics({
    startDate,
    endDate,
    bookingPlatform,
  });

  const { data: utmClosers, isLoading: closerLoading } = useUtmCloserMetrics({
    startDate,
    endDate,
    bookingPlatform,
  });

  const [trafficPage, setTrafficPage] = useState(0);
  const [setterPage, setSetterPage] = useState(0);
  const [closerPage, setCloserPage] = useState(0);

  // Drill-down state
  const [selectedFilter, setSelectedFilter] = useState<MetricFilter | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const metrics = trafficData?.metrics || [];
  const summary = trafficData?.summary;

  const trafficTotalPages = Math.ceil(metrics.length / PAGE_SIZE);
  const trafficPageData = metrics.slice(trafficPage * PAGE_SIZE, (trafficPage + 1) * PAGE_SIZE);

  const setterList = utmSetters || [];
  const setterTotalPages = Math.ceil(setterList.length / PAGE_SIZE);
  const setterPageData = setterList.slice(setterPage * PAGE_SIZE, (setterPage + 1) * PAGE_SIZE);

  const closerList = utmClosers || [];
  const closerTotalPages = Math.ceil(closerList.length / PAGE_SIZE);
  const closerPageData = closerList.slice(closerPage * PAGE_SIZE, (closerPage + 1) * PAGE_SIZE);

  const handleSourceClick = (source: string) => {
    setSelectedFilter({
      type: 'trafficSource',
      value: source,
      label: `Traffic Source: ${source}`,
      dateType: 'scheduled',
    });
    setIsDetailOpen(true);
  };

  const handleSetterClick = (setterName: string) => {
    setSelectedFilter({
      type: 'setter',
      value: setterName,
      label: `Setter: ${setterName}`,
      dateType: 'scheduled',
    });
    setIsDetailOpen(true);
  };

  const handleCloserClick = (closerName: string) => {
    setSelectedFilter({
      type: 'closer',
      value: closerName,
      label: `Closer: ${closerName}`,
      dateType: 'scheduled',
    });
    setIsDetailOpen(true);
  };

  if (trafficLoading || setterLoading || closerLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Data Health Indicator */}
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                (summary?.utmCoverage || 0) >= 50 ? "bg-green-100 dark:bg-green-900/30" : 
                (summary?.utmCoverage || 0) >= 25 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-red-100 dark:bg-red-900/30"
              )}>
                <Activity className={cn(
                  "h-4 w-4",
                  (summary?.utmCoverage || 0) >= 50 ? "text-green-600" : 
                  (summary?.utmCoverage || 0) >= 25 ? "text-amber-600" : "text-red-600"
                )} />
              </div>
              <div>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-medium">UTM Data Health</p>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link 
                          to="/utm-setup"
                          className="text-muted-foreground hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <HelpCircle className="h-3.5 w-3.5" />
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Learn how to add UTM parameters to booking links</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary?.eventsWithUtm || 0} of {summary?.totalEvents || 0} events have UTM data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Progress value={summary?.utmCoverage || 0} className="w-24 h-2" />
              <span className={cn(
                "text-lg font-bold",
                (summary?.utmCoverage || 0) >= 50 ? "text-green-600" : 
                (summary?.utmCoverage || 0) >= 25 ? "text-amber-600" : "text-red-600"
              )}>
                {summary?.utmCoverage || 0}%
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary?.eventsWithUtm || 0}</p>
                <p className="text-sm text-muted-foreground">UTM Events</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                {summary?.topSource ? (
                  <UtmPlatformBadge platform={summary.topSource} />
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">Top Traffic Source</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <Users className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{setterList.length}</p>
                <p className="text-sm text-muted-foreground">UTM Setters</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <UserCheck className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{closerList.length}</p>
                <p className="text-sm text-muted-foreground">Closers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Source Breakdown Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Traffic Source Breakdown
          </CardTitle>
          <CardDescription>Performance metrics by UTM platform</CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No UTM data available. Traffic sources will appear after events with UTM parameters are synced.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Traffic Source</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Booked</TableHead>
                    <TableHead className="text-right">Showed</TableHead>
                    <TableHead className="text-right">Show Rate</TableHead>
                    <TableHead className="text-right">Deals</TableHead>
                    <TableHead className="text-right">Close Rate</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trafficPageData.map((row) => (
                    <TableRow 
                      key={row.source}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleSourceClick(row.source)}
                    >
                      <TableCell>
                        <UtmPlatformBadge platform={row.source} />
                      </TableCell>
                      <TableCell className="text-right">{row.scheduledCount}</TableCell>
                      <TableCell className="text-right">{row.bookedCount}</TableCell>
                      <TableCell className="text-right">{row.showed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(row.showRate))}>
                        {row.showRate}%
                      </TableCell>
                      <TableCell className="text-right font-semibold">{row.dealsClosed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(row.closeRate))}>
                        {row.closeRate}%
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {trafficTotalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-4 text-sm text-muted-foreground">
                  <span>
                    {trafficPage * PAGE_SIZE + 1} - {Math.min((trafficPage + 1) * PAGE_SIZE, metrics.length)} / {metrics.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setTrafficPage(p => Math.max(0, p - 1))}
                    disabled={trafficPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setTrafficPage(p => Math.min(trafficTotalPages - 1, p + 1))}
                    disabled={trafficPage >= trafficTotalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* UTM Setter Attribution Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Setter Attribution (UTM)
          </CardTitle>
          <CardDescription>Setters attributed via Cal.com UTM parameters</CardDescription>
        </CardHeader>
        <CardContent>
          {setterList.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No UTM-attributed setters found. Setters will appear when events include utm_setter data.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setter</TableHead>
                    <TableHead className="text-right">Calls Set</TableHead>
                    <TableHead className="text-right">Showed</TableHead>
                    <TableHead className="text-right">Show Rate</TableHead>
                    <TableHead className="text-right">Closed</TableHead>
                    <TableHead className="text-right">Close Rate</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {setterPageData.map((setter) => (
                    <TableRow 
                      key={setter.setterName}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleSetterClick(setter.setterName)}
                    >
                      <TableCell className="font-medium">{setter.setterName}</TableCell>
                      <TableCell className="text-right">{setter.callsSet}</TableCell>
                      <TableCell className="text-right">{setter.showed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(setter.showRate))}>
                        {setter.showRate}%
                      </TableCell>
                      <TableCell className="text-right font-semibold">{setter.closed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(setter.closeRate))}>
                        {setter.closeRate}%
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {setterTotalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-4 text-sm text-muted-foreground">
                  <span>
                    {setterPage * PAGE_SIZE + 1} - {Math.min((setterPage + 1) * PAGE_SIZE, setterList.length)} / {setterList.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSetterPage(p => Math.max(0, p - 1))}
                    disabled={setterPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setSetterPage(p => Math.min(setterTotalPages - 1, p + 1))}
                    disabled={setterPage >= setterTotalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Closer Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserCheck className="h-5 w-5" />
            Closer Performance
          </CardTitle>
          <CardDescription>Performance metrics by closer</CardDescription>
        </CardHeader>
        <CardContent>
          {closerList.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No closer data available. Closers will appear when events have assigned closers.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Closer</TableHead>
                    <TableHead className="text-right">Calls Taken</TableHead>
                    <TableHead className="text-right">Showed</TableHead>
                    <TableHead className="text-right">Show Rate</TableHead>
                    <TableHead className="text-right">Closed</TableHead>
                    <TableHead className="text-right">Close Rate</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closerPageData.map((closer) => (
                    <TableRow 
                      key={closer.closerName}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleCloserClick(closer.closerName)}
                    >
                      <TableCell className="font-medium">{closer.closerName}</TableCell>
                      <TableCell className="text-right">{closer.callsTaken}</TableCell>
                      <TableCell className="text-right">{closer.showed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(closer.showRate))}>
                        {closer.showRate}%
                      </TableCell>
                      <TableCell className="text-right font-semibold">{closer.closed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(closer.closeRate))}>
                        {closer.closeRate}%
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              {closerTotalPages > 1 && (
                <div className="flex items-center justify-end gap-2 pt-4 text-sm text-muted-foreground">
                  <span>
                    {closerPage * PAGE_SIZE + 1} - {Math.min((closerPage + 1) * PAGE_SIZE, closerList.length)} / {closerList.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCloserPage(p => Math.max(0, p - 1))}
                    disabled={closerPage === 0}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => setCloserPage(p => Math.min(closerTotalPages - 1, p + 1))}
                    disabled={closerPage >= closerTotalPages - 1}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Drill-down Sheet */}
      <MetricDetailSheet
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        filter={selectedFilter}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
