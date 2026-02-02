import React, { useState } from 'react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMetricsByPlatform, PlatformMetrics, UTMBreakdown } from '@/hooks/useMetricsByPlatform';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpDown, TrendingUp, Download, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { exportToCSV, formatPercentForExport } from '@/lib/exportUtils';
import { DraggableTableWrapper } from '@/components/ui/DraggableTableWrapper';

interface MetricsByPlatformTableProps {
  startDate?: Date;
  endDate?: Date;
  closerId?: string | null;
  sourceIds?: string[];
  bookingPlatform?: string;
  closeFieldFilters?: Record<string, string | null>;
  onRowClick?: (platform: string) => void;
}

type SortField = 'platform' | 'totalCalls' | 'showed' | 'noShows' | 'showRate' | 'offersMade' | 'dealsClosed' | 'closeRate';

function getRateColor(rate: number): string {
  if (rate >= 70) return 'text-green-600 dark:text-green-400';
  if (rate >= 50) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function UTMBreakdownRows({ breakdowns, utmField }: { breakdowns: UTMBreakdown[]; utmField: string }) {
  // Filter out rows with only (none) or no data
  const hasData = breakdowns.some(b => b.value !== '(none)' || b.calls > 0);
  if (!hasData) return null;

  return (
    <>
      {/* UTM field header row */}
      <TableRow className="bg-muted/20 hover:bg-muted/30">
        <TableCell colSpan={8} className="pl-10 py-1.5">
          <Badge variant="outline" className="text-xs font-normal">
            {utmField}
          </Badge>
        </TableCell>
      </TableRow>
      {/* UTM value rows */}
      {breakdowns.map((breakdown) => (
        <TableRow key={`${utmField}-${breakdown.value}`} className="bg-muted/10 hover:bg-muted/20">
          <TableCell className="pl-14 text-muted-foreground text-sm">
            {breakdown.value}
          </TableCell>
          <TableCell className="text-right text-sm">{breakdown.calls}</TableCell>
          <TableCell className="text-right text-sm">{breakdown.showed}</TableCell>
          <TableCell className="text-right text-sm">{breakdown.noShows}</TableCell>
          <TableCell className={cn('text-right text-sm font-medium', getRateColor(breakdown.showRate))}>
            {breakdown.showRate}%
          </TableCell>
          <TableCell className="text-right text-sm text-muted-foreground">—</TableCell>
          <TableCell className="text-right text-sm">{breakdown.dealsClosed}</TableCell>
          <TableCell className={cn('text-right text-sm font-medium', getRateColor(breakdown.closeRate))}>
            {breakdown.closeRate}%
          </TableCell>
        </TableRow>
      ))}
    </>
  );
}

export function MetricsByPlatformTable({
  startDate,
  endDate,
  closerId,
  sourceIds,
  bookingPlatform,
  closeFieldFilters,
  onRowClick,
}: MetricsByPlatformTableProps) {
  const { data: metrics, isLoading } = useMetricsByPlatform({
    startDate,
    endDate,
    closerId,
    sourceIds,
    bookingPlatform,
    closeFieldFilters,
  });

  const [sortField, setSortField] = useState<SortField>('totalCalls');
  const [sortAsc, setSortAsc] = useState(false);
  const [expandedPlatforms, setExpandedPlatforms] = useState<Set<string>>(new Set());

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const togglePlatformExpand = (platform: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedPlatforms(prev => {
      const next = new Set(prev);
      if (next.has(platform)) {
        next.delete(platform);
      } else {
        next.add(platform);
      }
      return next;
    });
  };

  const sortedMetrics = [...(metrics || [])].sort((a, b) => {
    // Keep Unknown at the end regardless of sort
    if (a.platform === 'Unknown' && b.platform !== 'Unknown') return 1;
    if (b.platform === 'Unknown' && a.platform !== 'Unknown') return -1;
    
    const aVal = a[sortField];
    const bVal = b[sortField];
    
    if (typeof aVal === 'string') {
      return sortAsc ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
    }
    return sortAsc ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
  });

  // Check if a platform has any UTM data worth showing
  const hasUTMData = (row: PlatformMetrics) => {
    const { utmBreakdowns } = row;
    return (
      utmBreakdowns.utm_source.some(b => b.value !== '(none)') ||
      utmBreakdowns.utm_medium.some(b => b.value !== '(none)') ||
      utmBreakdowns.utm_campaign.some(b => b.value !== '(none)')
    );
  };

  if (isLoading) {
    return (
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Performance by Lead Source
        </CardTitle>
      </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.length === 0) {
    return (
      <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Performance by Lead Source
        </CardTitle>
      </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No lead source data available for the selected period.</p>
        </CardContent>
      </Card>
    );
  }

  const SortButton = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => handleSort(field)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  );

  const handleExport = () => {
    exportToCSV(
      sortedMetrics,
      [
        { key: 'platform', label: 'Lead Source' },
        { key: 'totalCalls', label: 'Total Calls' },
        { key: 'showed', label: 'Showed' },
        { key: 'noShows', label: 'No Shows' },
        { key: 'showRate', label: 'Show Rate', format: (v) => formatPercentForExport(v as number) },
        { key: 'offersMade', label: 'Offers Made' },
        { key: 'dealsClosed', label: 'Deals Closed' },
        { key: 'closeRate', label: 'Close Rate', format: (v) => formatPercentForExport(v as number) },
      ],
      `lead-source-metrics-${new Date().toISOString().split('T')[0]}`
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          Performance by Lead Source
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} className="gap-1.5">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        <DraggableTableWrapper dependencies={[sortedMetrics, expandedPlatforms]}>
          <table className="w-full min-w-max caption-bottom text-sm">
            <TableHeader>
              <TableRow>
                <TableHead><SortButton field="platform">Lead Source</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="totalCalls">Calls</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="showed">Showed</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="noShows">No Shows</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="showRate">Show Rate</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="offersMade">Offers</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="dealsClosed">Deals</SortButton></TableHead>
                <TableHead className="text-right"><SortButton field="closeRate">Close Rate</SortButton></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMetrics.map((row) => {
                const isExpanded = expandedPlatforms.has(row.platform);
                const canExpand = hasUTMData(row);
                const rowKey = row.platform.replace(/\s+/g, '-').toLowerCase();
                
                return (
                  <React.Fragment key={rowKey}>
                    <TableRow 
                      className={cn(
                        onRowClick ? "cursor-pointer hover:bg-muted/50 transition-colors" : "",
                        canExpand && "cursor-pointer"
                      )}
                      onClick={(e) => {
                        if (canExpand) {
                          togglePlatformExpand(row.platform, e);
                        } else if (onRowClick) {
                          onRowClick(row.platform);
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {canExpand && (
                            <button 
                              onClick={(e) => togglePlatformExpand(row.platform, e)}
                              className="p-0.5 hover:bg-muted rounded"
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </button>
                          )}
                          {!canExpand && <span className="w-5" />}
                          {row.platform}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{row.totalCalls}</TableCell>
                      <TableCell className="text-right">{row.showed}</TableCell>
                      <TableCell className="text-right">{row.noShows}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(row.showRate))}>
                        {row.showRate}%
                      </TableCell>
                      <TableCell className="text-right">{row.offersMade}</TableCell>
                      <TableCell className="text-right">{row.dealsClosed}</TableCell>
                      <TableCell className={cn('text-right font-medium', getRateColor(row.closeRate))}>
                        {row.closeRate}%
                      </TableCell>
                    </TableRow>
                    
                    {/* UTM Breakdown rows when expanded */}
                    {isExpanded && (
                      <>
                        <UTMBreakdownRows 
                          breakdowns={row.utmBreakdowns.utm_source} 
                          utmField="utm_source" 
                        />
                        <UTMBreakdownRows 
                          breakdowns={row.utmBreakdowns.utm_medium} 
                          utmField="utm_medium" 
                        />
                        <UTMBreakdownRows 
                          breakdowns={row.utmBreakdowns.utm_campaign} 
                          utmField="utm_campaign" 
                        />
                      </>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </table>
        </DraggableTableWrapper>
      </CardContent>
    </Card>
  );
}
