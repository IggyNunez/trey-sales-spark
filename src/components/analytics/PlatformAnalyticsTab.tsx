import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useMetricsByPlatform } from '@/hooks/useMetricsByPlatform';
import { MetricsByPlatformTable } from '@/components/dashboard/MetricsByPlatformTable';
import { ClosersByPlatformTable } from './ClosersByPlatformTable';
import { CallTypeBreakdownTable } from './CallTypeBreakdownTable';
import { SourceBreakdownTable } from './SourceBreakdownTable';
import { PlatformCashTable } from './PlatformCashTable';
import { SourceAttributionDrillDown } from './SourceAttributionDrillDown';
import { MetricDetailSheet } from './MetricDetailSheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Phone, Users, Target, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MetricFilter } from '@/types/metricFilter';

interface PlatformAnalyticsTabProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

function MetricCard({ 
  title, 
  value, 
  icon: Icon, 
  isLoading,
  onClick,
}: { 
  title: string; 
  value: string | number; 
  icon: React.ElementType;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-24" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      className={cn(onClick && "cursor-pointer hover:bg-muted/50 transition-colors")}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

export function PlatformAnalyticsTab({ startDate, endDate, bookingPlatform }: PlatformAnalyticsTabProps) {
  const { data: platformMetrics, isLoading } = useMetricsByPlatform({
    startDate,
    endDate,
    bookingPlatform,
  });

  const [detailFilter, setDetailFilter] = useState<MetricFilter | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const openDetail = (filter: MetricFilter) => {
    setDetailFilter(filter);
    setIsDetailOpen(true);
  };

  // Aggregate totals across all platforms
  const totals = useMemo(() => {
    if (!platformMetrics || platformMetrics.length === 0) {
      return { totalCalls: 0, showed: 0, dealsClosed: 0, avgCloseRate: 0 };
    }

    const totalCalls = platformMetrics.reduce((sum, p) => sum + p.totalCalls, 0);
    const showed = platformMetrics.reduce((sum, p) => sum + p.showed, 0);
    const dealsClosed = platformMetrics.reduce((sum, p) => sum + p.dealsClosed, 0);
    const avgCloseRate = showed > 0 ? Math.round((dealsClosed / showed) * 100) : 0;

    return { totalCalls, showed, dealsClosed, avgCloseRate };
  }, [platformMetrics]);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Calls"
          value={totals.totalCalls}
          icon={Phone}
          isLoading={isLoading}
          onClick={() => openDetail({ type: 'total', label: 'All Calls' })}
        />
        <MetricCard
          title="Showed"
          value={totals.showed}
          icon={Users}
          isLoading={isLoading}
          onClick={() => openDetail({ type: 'showed', label: 'Showed Calls' })}
        />
        <MetricCard
          title="Close Rate"
          value={`${totals.avgCloseRate}%`}
          icon={TrendingUp}
          isLoading={isLoading}
        />
        <MetricCard
          title="Deals Closed"
          value={totals.dealsClosed}
          icon={Target}
          isLoading={isLoading}
          onClick={() => openDetail({ type: 'deals', label: 'Closed Deals' })}
        />
      </div>

      {/* Source Attribution Drill-Down - First major component */}
      <SourceAttributionDrillDown
        startDate={startDate}
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onNodeClick={(filter) => {
          setDetailFilter(filter);
          setIsDetailOpen(true);
        }}
      />

      {/* Call Type Breakdown */}
      <CallTypeBreakdownTable
        startDate={startDate} 
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onRowClick={(callType, dateType) => openDetail({
          type: 'callType',
          value: callType,
          dateType: dateType === 'completed' ? 'scheduled' : 'booked',
          label: `${callType} - ${dateType === 'completed' ? 'Completed' : 'Created'}`,
        })}
      />

      {/* Source Breakdown */}
      <SourceBreakdownTable 
        startDate={startDate} 
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onRowClick={(source, dateType) => openDetail({
          type: 'source',
          value: source,
          dateType: dateType === 'completed' ? 'scheduled' : 'booked',
          label: `${source} - ${dateType === 'completed' ? 'Completed' : 'Created'}`,
        })}
      />

      {/* Platform Cash Table */}
      <PlatformCashTable 
        startDate={startDate} 
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onRowClick={(platform) => openDetail({
          type: 'platform',
          value: platform,
          label: `${platform} - Cash Events`,
        })}
      />

      {/* Performance by Platform Table */}
      <MetricsByPlatformTable 
        startDate={startDate} 
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onRowClick={(platform) => openDetail({
          type: 'platform',
          value: platform,
          label: `${platform} - All Events`,
        })}
      />

      {/* Closer Performance by Platform */}
      <ClosersByPlatformTable 
        startDate={startDate} 
        endDate={endDate}
        bookingPlatform={bookingPlatform}
        onRowClick={(closerName, closerEmail, platform) => openDetail({
          type: 'closer',
          value: closerName,
          closerEmail: closerEmail || undefined,
          selectedPlatform: platform,
          label: `${closerName}${platform ? ` - ${platform}` : ''}`,
        })}
      />

      {/* Detail Sheet */}
      <MetricDetailSheet
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        filter={detailFilter}
        startDate={startDate}
        endDate={endDate}
      />
    </div>
  );
}
