import { Link } from 'react-router-dom';
import { Activity, HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTrafficSourceMetrics } from '@/hooks/useTrafficSourceMetrics';
import { cn } from '@/lib/utils';

interface UTMHealthIndicatorProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  // NEW: All global filter props for full propagation
  sourceIds?: string[];
  trafficTypeId?: string;
  closerId?: string;
  callTypeId?: string;
  closeFieldFilters?: Record<string, string | null>;
}

export function UTMHealthIndicator({
  startDate,
  endDate,
  bookingPlatform,
  sourceIds,
  trafficTypeId,
  closerId,
  callTypeId,
  closeFieldFilters,
}: UTMHealthIndicatorProps) {
  const { data, isLoading } = useTrafficSourceMetrics({
    startDate,
    endDate,
    bookingPlatform,
    sourceIds,
    trafficTypeId,
    closerId,
    callTypeId,
    closeFieldFilters,
  });

  const summary = data?.summary;
  const coverage = summary?.utmCoverage || 0;

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-6 w-24" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const getStatusColor = (pct: number) => {
    if (pct >= 50) return 'green';
    if (pct >= 25) return 'amber';
    return 'red';
  };

  const statusColor = getStatusColor(coverage);

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-full",
              statusColor === 'green' && "bg-green-100 dark:bg-green-900/30",
              statusColor === 'amber' && "bg-amber-100 dark:bg-amber-900/30",
              statusColor === 'red' && "bg-red-100 dark:bg-red-900/30"
            )}>
              <Activity className={cn(
                "h-4 w-4",
                statusColor === 'green' && "text-green-600",
                statusColor === 'amber' && "text-amber-600",
                statusColor === 'red' && "text-red-600"
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
                {summary?.eventsWithUtm || 0} of {summary?.totalEvents || 0} events have attribution data
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Progress value={coverage} className="w-24 h-2" />
            <span className={cn(
              "text-lg font-bold",
              statusColor === 'green' && "text-green-600",
              statusColor === 'amber' && "text-amber-600",
              statusColor === 'red' && "text-red-600"
            )}>
              {coverage}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
