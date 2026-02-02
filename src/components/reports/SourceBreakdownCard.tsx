import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SourceBreakdownItem } from '@/hooks/useCallsReport';

interface SourceBreakdownCardProps {
  data: SourceBreakdownItem[];
  onSourceClick?: (source: string) => void;
}

function getRateColor(rate: number, type: 'show' | 'close'): string {
  if (type === 'show') {
    if (rate >= 80) return 'text-success';
    if (rate >= 60) return 'text-warning';
    return 'text-destructive';
  }
  // close rate
  if (rate >= 30) return 'text-success';
  if (rate >= 15) return 'text-warning';
  return 'text-destructive';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function SourceBreakdownCard({ data, onSourceClick }: SourceBreakdownCardProps) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Source Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No source data available for the selected filters.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Performance by Source</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Showed</TableHead>
                <TableHead className="text-right">No Shows</TableHead>
                <TableHead className="text-right">Show Rate</TableHead>
                <TableHead className="text-right">Deals</TableHead>
                <TableHead className="text-right">Close Rate</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((item) => (
                <TableRow
                  key={item.source}
                  className={cn(
                    onSourceClick && 'cursor-pointer hover:bg-muted/50'
                  )}
                  onClick={() => onSourceClick?.(item.source)}
                >
                  <TableCell>
                    <Badge variant="outline" className="font-medium">
                      {item.source}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {item.scheduledCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {item.showed.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {item.noShows.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn('font-medium', getRateColor(item.showRate, 'show'))}>
                      {item.showRate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="flex items-center justify-end gap-1">
                      {item.dealsClosed > 0 && (
                        <TrendingUp className="h-3 w-3 text-success" />
                      )}
                      {item.dealsClosed.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={cn('font-medium', getRateColor(item.closeRate, 'close'))}>
                      {item.closeRate.toFixed(1)}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.revenue)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
