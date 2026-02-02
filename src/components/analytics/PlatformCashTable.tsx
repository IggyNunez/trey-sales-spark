import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, DollarSign } from 'lucide-react';
import { usePlatformAggregates } from '@/hooks/usePlatformAggregates';

interface PlatformCashTableProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  onRowClick?: (platform: string) => void;
}

const PAGE_SIZE = 5;

export function PlatformCashTable({ startDate, endDate, bookingPlatform, onRowClick }: PlatformCashTableProps) {
  const { platformCash, isLoading } = usePlatformAggregates({ startDate, endDate, bookingPlatform });
  const [page, setPage] = useState(0);

  const totalPages = Math.ceil(platformCash.length / PAGE_SIZE);
  const startIndex = page * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, platformCash.length);
  const pageData = platformCash.slice(startIndex, endIndex);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Lead Source by Cash
        </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <DollarSign className="h-4 w-4" />
          Lead Source by Cash
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Lead Source</TableHead>
              <TableHead className="text-right">Cash Collected</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">
                  No payment data
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((item, index) => (
                <TableRow 
                  key={item.platform}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                  onClick={() => onRowClick?.(item.platform)}
                >
                  <TableCell className="text-muted-foreground">
                    {startIndex + index + 1}.
                  </TableCell>
                  <TableCell className="font-medium">{item.platform}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(item.cashCollected)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {platformCash.length > 0 && (
          <div className="flex items-center justify-end gap-2 pt-3 text-sm text-muted-foreground">
            <span>
              {startIndex + 1} - {endIndex} / {platformCash.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
