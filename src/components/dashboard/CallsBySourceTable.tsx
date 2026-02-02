import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCallsBySourcePerDay, CallsBySourceResult } from '@/hooks/useCallsBySourcePerDay';
import { LayoutGrid, CalendarRange } from 'lucide-react';

interface CallsBySourceTableProps {
  startDate?: Date;
  endDate?: Date;
}

export function CallsBySourceTable({ startDate, endDate }: CallsBySourceTableProps) {
  const { data, isLoading } = useCallsBySourcePerDay({ startDate, endDate });

  // Get sources that have at least one call
  const activeSources = useMemo(() => {
    if (!data) return [];
    return data.sources.filter(s => (data.totals[s.id] || 0) > 0);
  }, [data]);

  // Filter days that have at least one call
  const activeDays = useMemo(() => {
    if (!data) return [];
    return data.days.filter(d => d.total > 0);
  }, [data]);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Calls by Source
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || activeDays.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Calls by Source
          </CardTitle>
          <CardDescription>Scheduled calls breakdown by source for each day</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No calls scheduled in this period.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-5 w-5" />
          Upcoming Calls by Source
        </CardTitle>
        <CardDescription>
          {data.grandTotal} calls scheduled (next 3 days)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-3 font-medium sticky left-0 bg-muted/50">Date</th>
                <th className="text-center p-3 font-medium bg-muted/70">Total</th>
              </tr>
            </thead>
            <tbody>
              {activeDays.map((day, idx) => (
                <tr key={day.date} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/20'}>
                  <td className="p-3 font-medium sticky left-0 bg-inherit whitespace-nowrap">
                    {day.dateLabel}
                  </td>
                  <td className="p-3 text-center font-bold bg-muted/30">
                    {day.total}
                  </td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-muted/50 font-medium border-t-2">
                <td className="p-3 sticky left-0 bg-muted/50">Total</td>
                <td className="p-3 text-center font-bold text-primary bg-muted/70">
                  {data.grandTotal}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}