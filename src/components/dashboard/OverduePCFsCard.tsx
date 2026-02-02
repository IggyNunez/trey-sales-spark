import { AlertTriangle, TrendingDown, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOverduePCFCount } from '@/hooks/useOverduePCFs';

interface OverduePCFsCardProps {
  startDate?: Date;
  endDate?: Date;
  closeFieldFilters?: Record<string, string | null>;
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  bookingPlatform?: string;
}

export function OverduePCFsCard({ startDate, endDate, closeFieldFilters, sourceId, sourceIds, trafficTypeId, bookingPlatform }: OverduePCFsCardProps) {
  const { count: overdueCount, isLoading } = useOverduePCFCount({
    startDate,
    endDate,
    closeFieldFilters,
    sourceId,
    sourceIds,
    trafficTypeId,
    bookingPlatform,
  });

  // Loading state with skeleton - consistent with CustomMetricCard
  if (isLoading) {
    return (
      <Card className="border bg-card h-full min-h-[120px]">
        <CardContent className="p-4 sm:p-6 h-full">
          <div className="flex items-start justify-between gap-2 h-full">
            <div className="space-y-3 flex-1 min-w-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Determine styling based on count - red error styling for overdue
  const hasOverdue = overdueCount > 0;
  const iconBgClass = hasOverdue ? 'bg-destructive/10' : 'bg-success/10';
  const iconClass = hasOverdue ? 'text-destructive' : 'text-success';
  const valueClass = hasOverdue ? 'text-destructive' : 'text-foreground';
  const borderClass = hasOverdue ? 'border-destructive/30' : '';

  return (
    <Card className={`border ${borderClass} bg-card h-full min-h-[120px]`}>
      <CardContent className="p-4 sm:p-6 h-full">
        <div className="flex items-start justify-between gap-2 h-full">
          <div className="min-w-0 flex-1 space-y-2">
            {/* Title with text wrap support - no truncation */}
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5 leading-tight">
              <span>Overdue PCFs</span>
              {hasOverdue && <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />}
            </p>
            <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${valueClass}`}>
              {overdueCount.toLocaleString()}
            </p>
            {/* Sub-text label */}
            <p className="text-xs text-muted-foreground">
              {hasOverdue ? 'Needs attention' : 'All caught up'}
            </p>
          </div>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-lg ${iconBgClass} flex items-center justify-center shrink-0`}>
            {hasOverdue ? (
              <TrendingDown className={`h-5 w-5 ${iconClass}`} />
            ) : (
              <CheckCircle className={`h-5 w-5 ${iconClass}`} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
