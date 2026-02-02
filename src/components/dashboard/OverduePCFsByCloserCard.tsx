import { AlertTriangle, User, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useOverduePCFCount } from '@/hooks/useOverduePCFs';

interface OverduePCFsByCloserCardProps {
  startDate?: Date;
  endDate?: Date;
  closeFieldFilters?: Record<string, string | null>;
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  bookingPlatform?: string;
}

export function OverduePCFsByCloserCard({ startDate, endDate, closeFieldFilters, sourceId, sourceIds, trafficTypeId, bookingPlatform }: OverduePCFsByCloserCardProps) {
  const { count: totalOverdue, overdueByCloser, isLoading } = useOverduePCFCount({
    startDate,
    endDate,
    closeFieldFilters,
    sourceId,
    sourceIds,
    trafficTypeId,
    bookingPlatform,
  });
  
  const maxCount = overdueByCloser.length > 0 ? overdueByCloser[0].count : 0;

  if (isLoading) {
    return (
      <Card className="border bg-card">
        <CardHeader className="pb-3">
          <div className="h-5 w-48 bg-muted animate-pulse rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="flex-1 h-2 bg-muted animate-pulse rounded" />
              <div className="h-5 w-6 bg-muted animate-pulse rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  // Don't show if no overdue PCFs
  if (totalOverdue === 0) {
    return (
      <Card className="border bg-card border-green-200 dark:border-green-800">
        <CardContent className="py-6">
          <div className="flex items-center justify-center gap-3 text-green-600 dark:text-green-400">
            <CheckCircle className="h-5 w-5" />
            <span className="font-medium">All Post-Call Forms submitted for selected period</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border border-destructive/30 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <CardTitle className="text-base whitespace-nowrap">Overdue Post-Call Forms</CardTitle>
          </div>
          <Badge variant="destructive" className="font-mono shrink-0">
            {totalOverdue} total
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {overdueByCloser.map(({ name, count }) => {
          const percentage = maxCount > 0 ? (count / maxCount) * 100 : 0;
          
          return (
            <div key={name} className="flex items-center gap-3">
              <div className="flex items-center gap-2 min-w-[140px]">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium truncate">{name}</span>
              </div>
              <div className="flex-1">
                <Progress 
                  value={percentage} 
                  className="h-2 bg-muted [&>div]:bg-destructive" 
                />
              </div>
              <Badge variant="outline" className="font-mono text-destructive border-destructive/50 min-w-[32px] justify-center">
                {count}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
