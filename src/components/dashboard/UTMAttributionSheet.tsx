import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { cn } from '@/lib/utils';
import { useMetricsByPlatform, PlatformMetrics } from '@/hooks/useMetricsByPlatform';
import { useUtmSetterMetrics } from '@/hooks/useUtmSetterMetrics';
import { useUtmCloserMetrics } from '@/hooks/useUtmCloserMetrics';
import { Users, UserCheck, BarChart3 } from 'lucide-react';

interface UTMAttributionSheetProps {
  platform: string | null;
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  closeFieldFilters?: Record<string, string | null>;
  onClose: () => void;
}

function getRateColor(rate: number): string {
  if (rate >= 70) return 'text-green-600 dark:text-green-400';
  if (rate >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-red-600 dark:text-red-400';
}

function UTMBreakdownSection({ 
  label, 
  items 
}: { 
  label: string; 
  items: { value: string; calls: number; showed: number; showRate: number; dealsClosed: number; closeRate: number }[] 
}) {
  const hasRealData = items.some(item => item.value !== '(none)');
  if (!hasRealData && items.length <= 1) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</h5>
      <div className="space-y-1">
        {items.slice(0, 5).map((item) => (
          <div 
            key={item.value} 
            className={cn(
              "flex items-center justify-between py-1.5 px-2 rounded-md bg-muted/50 text-sm",
              item.value === '(none)' && "opacity-60"
            )}
          >
            <span className={cn(item.value === '(none)' && "text-muted-foreground italic")}>
              {item.value}
            </span>
            <div className="flex items-center gap-3 text-xs">
              <span className="tabular-nums">{item.calls} calls</span>
              <span className={cn("tabular-nums font-medium", getRateColor(item.showRate))}>
                {item.showRate}% show
              </span>
              <span className={cn("tabular-nums font-medium", getRateColor(item.closeRate))}>
                {item.closeRate}% close
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function UTMAttributionSheet({
  platform,
  startDate,
  endDate,
  bookingPlatform,
  closeFieldFilters,
  onClose,
}: UTMAttributionSheetProps) {
  const isOpen = !!platform;

  // Get platform metrics to extract UTM breakdowns
  const { data: allMetrics, isLoading: metricsLoading } = useMetricsByPlatform({
    startDate,
    endDate,
    bookingPlatform,
    closeFieldFilters,
  });

  // Get setter metrics filtered by platform
  const { data: setterMetrics, isLoading: setterLoading } = useUtmSetterMetrics({
    startDate,
    endDate,
    bookingPlatform,
  });

  // Get closer metrics
  const { data: closerMetrics, isLoading: closerLoading } = useUtmCloserMetrics({
    startDate,
    endDate,
    bookingPlatform,
  });

  // Find the specific platform data
  const platformData = allMetrics?.find(m => m.platform === platform);
  const isLoading = metricsLoading || setterLoading || closerLoading;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {platform && <UtmPlatformBadge platform={platform} />}
            <span>Attribution Details</span>
          </SheetTitle>
          <SheetDescription>
            {platformData ? (
              <span>{platformData.totalCalls} calls • {platformData.showed} showed • {platformData.dealsClosed} closed</span>
            ) : (
              <span>UTM parameters and performance breakdown</span>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : platformData ? (
            <div className="space-y-6 pb-6">
              {/* Summary metrics */}
              <div className="grid grid-cols-4 gap-3 py-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{platformData.totalCalls}</div>
                  <div className="text-xs text-muted-foreground">Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{platformData.showed}</div>
                  <div className="text-xs text-muted-foreground">Showed</div>
                </div>
                <div className="text-center">
                  <div className={cn("text-2xl font-bold", getRateColor(platformData.showRate))}>
                    {platformData.showRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">Show Rate</div>
                </div>
                <div className="text-center">
                  <div className={cn("text-2xl font-bold", getRateColor(platformData.closeRate))}>
                    {platformData.closeRate}%
                  </div>
                  <div className="text-xs text-muted-foreground">Close Rate</div>
                </div>
              </div>

              <Separator />

              {/* UTM Parameter Breakdowns */}
              <div>
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  UTM Parameters
                </h4>
                <div className="space-y-4">
                  <UTMBreakdownSection 
                    label="Source" 
                    items={platformData.utmBreakdowns.utm_source} 
                  />
                  <UTMBreakdownSection 
                    label="Medium" 
                    items={platformData.utmBreakdowns.utm_medium} 
                  />
                  <UTMBreakdownSection 
                    label="Campaign" 
                    items={platformData.utmBreakdowns.utm_campaign} 
                  />
                </div>
              </div>

              <Separator />

              {/* Setter Performance */}
              {setterMetrics && setterMetrics.length > 0 && (
                <>
                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Setter Performance
                    </h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Setter</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Showed</TableHead>
                          <TableHead className="text-right">Close %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {setterMetrics.slice(0, 5).map((setter) => (
                          <TableRow key={setter.setterName}>
                            <TableCell className="font-medium">{setter.setterName}</TableCell>
                            <TableCell className="text-right">{setter.callsSet}</TableCell>
                            <TableCell className="text-right">{setter.showed}</TableCell>
                            <TableCell className={cn("text-right font-medium", getRateColor(setter.closeRate))}>
                              {setter.closeRate}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <Separator />
                </>
              )}

              {/* Closer Performance */}
              {closerMetrics && closerMetrics.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Closer Performance
                  </h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Closer</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Showed</TableHead>
                        <TableHead className="text-right">Close %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closerMetrics.slice(0, 5).map((closer) => (
                        <TableRow key={closer.closerName}>
                          <TableCell className="font-medium">{closer.closerName}</TableCell>
                          <TableCell className="text-right">{closer.callsTaken}</TableCell>
                          <TableCell className="text-right">{closer.showed}</TableCell>
                          <TableCell className={cn("text-right font-medium", getRateColor(closer.closeRate))}>
                            {closer.closeRate}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              No data available for this platform.
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
