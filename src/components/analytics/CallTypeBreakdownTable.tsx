import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePlatformAggregates } from '@/hooks/usePlatformAggregates';

interface CallTypeBreakdownTableProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  onRowClick?: (callType: string, dateType: 'completed' | 'created') => void;
}

const PAGE_SIZE = 5;

function PaginatedTable({
  title,
  columnLabel,
  data,
  isLoading,
  dateType,
  onRowClick,
}: {
  title: string;
  columnLabel: string;
  data: Array<{ name: string; count: number }>;
  isLoading: boolean;
  dateType: 'completed' | 'created';
  onRowClick?: (name: string, dateType: 'completed' | 'created') => void;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(data.length / PAGE_SIZE);
  const startIndex = page * PAGE_SIZE;
  const endIndex = Math.min(startIndex + PAGE_SIZE, data.length);
  const pageData = data.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <Card className="flex-1">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
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
    <Card className="flex-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Call Type</TableHead>
              <TableHead className="text-right">{columnLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="text-center text-muted-foreground">
                  No data
                </TableCell>
              </TableRow>
            ) : (
              pageData.map((item) => (
                <TableRow 
                  key={item.name}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : ""}
                  onClick={() => onRowClick?.(item.name, dateType)}
                >
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right">{item.count}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {data.length > 0 && (
          <div className="flex items-center justify-end gap-2 pt-3 text-sm text-muted-foreground">
            <span>
              {startIndex + 1} - {endIndex} / {data.length}
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

export function CallTypeBreakdownTable({ startDate, endDate, bookingPlatform, onRowClick }: CallTypeBreakdownTableProps) {
  const { callTypeCompleted, callTypeCreated, isLoading } = usePlatformAggregates({
    startDate,
    endDate,
    bookingPlatform,
  });

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PaginatedTable
        title="Call Type"
        columnLabel="Completed"
        data={callTypeCompleted}
        isLoading={isLoading}
        dateType="completed"
        onRowClick={onRowClick}
      />
      <PaginatedTable
        title="Call Type"
        columnLabel="Created"
        data={callTypeCreated}
        isLoading={isLoading}
        dateType="created"
        onRowClick={onRowClick}
      />
    </div>
  );
}
