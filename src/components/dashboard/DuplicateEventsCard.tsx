import { Copy, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface DuplicateEventsCardProps {
  duplicateCount: number;
  isLoading: boolean;
}

export function DuplicateEventsCard({ duplicateCount, isLoading }: DuplicateEventsCardProps) {
  if (isLoading) {
    return (
      <Card className="border bg-card">
        <CardContent className="p-4 sm:p-6">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="h-4 w-24 bg-muted animate-pulse rounded" />
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            </div>
            <div className="h-10 w-10 bg-muted animate-pulse rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasDuplicates = duplicateCount > 0;
  const iconBgClass = hasDuplicates ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-green-100 dark:bg-green-900/20';
  const iconClass = hasDuplicates ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400';
  const valueClass = hasDuplicates ? 'text-amber-600 dark:text-amber-400' : 'text-foreground';

  return (
    <Card className={`border ${hasDuplicates ? 'border-amber-300 dark:border-amber-700' : ''} bg-card`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
              Duplicate Events
            </p>
            <p className={`text-2xl sm:text-3xl font-bold mt-1 ${valueClass}`}>
              {duplicateCount}
            </p>
          </div>
          <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-lg ${iconBgClass} flex items-center justify-center`}>
            {hasDuplicates ? (
              <Copy className={`h-5 w-5 sm:h-6 sm:w-6 ${iconClass}`} />
            ) : (
              <CheckCircle className={`h-5 w-5 sm:h-6 sm:w-6 ${iconClass}`} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
