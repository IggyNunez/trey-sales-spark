import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useClosersByPlatform, CloserByPlatformMetrics } from '@/hooks/useClosersByPlatform';
import { ArrowUpDown, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DraggableTableWrapper } from '@/components/ui/DraggableTableWrapper';

interface ClosersByPlatformTableProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  onRowClick?: (closerName: string, closerEmail: string | null, platform: string | null) => void;
}

type SortField = keyof CloserByPlatformMetrics;

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getRateColor(rate: number): string {
  if (rate >= 70) return 'text-green-600 dark:text-green-400';
  if (rate >= 50) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function ClosersByPlatformTable({ startDate, endDate, bookingPlatform, onRowClick }: ClosersByPlatformTableProps) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('cashCollected');
  const [sortAsc, setSortAsc] = useState(false);

  const { data: closers, platforms, isLoading } = useClosersByPlatform({
    startDate,
    endDate,
    platform: selectedPlatform === 'all' ? null : selectedPlatform,
    bookingPlatform,
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const sortedClosers = [...(closers || [])].sort((a, b) => {
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (typeof aVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Closer Performance by Platform
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Closer Performance by Platform
          </CardTitle>
          <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select Platform" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map(platform => (
                <SelectItem key={platform} value={platform}>
                  {platform}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {sortedClosers.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 px-6">
            No closer data available for the selected platform.
          </p>
        ) : (
          <DraggableTableWrapper dependencies={[sortedClosers]}>
            <table className="w-full min-w-max caption-bottom text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead><SortButton field="closerName">Closer</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="totalCalls">Calls</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="showed">Showed</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="noShows">No Shows</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="showRate">Show %</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="offersMade">Offers</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="dealsClosed">Deals</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="closeRate">Close %</SortButton></TableHead>
                  <TableHead className="text-right"><SortButton field="cashCollected">Cash</SortButton></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedClosers.map((closer) => (
                  <TableRow 
                    key={closer.closerEmail || closer.closerName}
                    className={onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                    onClick={() => onRowClick?.(closer.closerName, closer.closerEmail, selectedPlatform === 'all' ? null : selectedPlatform)}
                  >
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {getInitials(closer.closerName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{closer.closerName}</div>
                          {closer.closerEmail && (
                            <div className="text-xs text-muted-foreground">{closer.closerEmail}</div>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{closer.totalCalls}</TableCell>
                    <TableCell className="text-right">{closer.showed}</TableCell>
                    <TableCell className="text-right">{closer.noShows}</TableCell>
                    <TableCell className={cn('text-right font-medium', getRateColor(closer.showRate))}>
                      {closer.showRate}%
                    </TableCell>
                    <TableCell className="text-right">{closer.offersMade}</TableCell>
                    <TableCell className="text-right">{closer.dealsClosed}</TableCell>
                    <TableCell className={cn('text-right font-medium', getRateColor(closer.closeRate))}>
                      {closer.closeRate}%
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-600 dark:text-green-400">
                      {formatCurrency(closer.cashCollected)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </DraggableTableWrapper>
        )}
      </CardContent>
    </Card>
  );
}
