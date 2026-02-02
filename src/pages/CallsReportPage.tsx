import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { Phone, Users, Target, DollarSign, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CallsReportFilters } from '@/components/reports/CallsReportFilters';
import { SourceBreakdownCard } from '@/components/reports/SourceBreakdownCard';
import { CallsEventTable } from '@/components/reports/CallsEventTable';
import { useCallsReport, type CallsReportFilters as FiltersType } from '@/hooks/useCallsReport';
import { cn } from '@/lib/utils';

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function SummaryCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconBgClass,
  isLoading,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: React.ElementType;
  iconBgClass: string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-12 w-12 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            <p className="text-3xl font-bold">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          <div className={cn('flex h-12 w-12 items-center justify-center rounded-lg', iconBgClass)}>
            <Icon className="h-6 w-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CallsReportPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Parse initial filters from URL
  const initialFilters = useMemo((): FiltersType => {
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');
    const sourceParam = searchParams.get('source');
    const outcomeParam = searchParams.get('outcome');
    
    return {
      startDate: startParam ? parseISO(startParam) : startOfMonth(new Date()),
      endDate: endParam ? parseISO(endParam) : endOfMonth(new Date()),
      trafficSources: sourceParam ? [sourceParam] : undefined,
      outcome: (outcomeParam as FiltersType['outcome']) || 'all',
    };
  }, []);

  const [filters, setFilters] = useState<FiltersType>(initialFilters);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.startDate) {
      params.set('start', filters.startDate.toISOString().split('T')[0]);
    }
    if (filters.endDate) {
      params.set('end', filters.endDate.toISOString().split('T')[0]);
    }
    if (filters.trafficSources?.length === 1) {
      params.set('source', filters.trafficSources[0]);
    }
    if (filters.outcome && filters.outcome !== 'all') {
      params.set('outcome', filters.outcome);
    }
    setSearchParams(params, { replace: true });
  }, [filters, setSearchParams]);

  const { data, isLoading, error } = useCallsReport(filters);

  const handleSourceClick = (source: string) => {
    if (source === 'Unknown') return;
    setFilters(prev => ({
      ...prev,
      trafficSources: [source],
    }));
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Call Journey Report</h1>
          <p className="text-muted-foreground">
            Comprehensive view of call performance with full attribution tracking
          </p>
        </div>

        {/* Filters */}
        <CallsReportFilters
          filters={filters}
          onFiltersChange={setFilters}
          availableSources={data?.availableSources || []}
          availableClosers={data?.availableClosers || []}
          availableSetters={data?.availableSetters || []}
          availableEventTypes={data?.availableEventTypes || []}
        />

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="Total Calls"
            value={data?.summary.totalCalls.toLocaleString() || '0'}
            subtitle={`${data?.summary.showed || 0} showed, ${data?.summary.noShows || 0} no shows`}
            icon={Phone}
            iconBgClass="bg-info/10 text-info"
            isLoading={isLoading}
          />
          <SummaryCard
            title="Show Rate"
            value={`${data?.summary.showRate.toFixed(1) || '0'}%`}
            subtitle={`${data?.summary.showed || 0} of ${(data?.summary.showed || 0) + (data?.summary.noShows || 0)} confirmed`}
            icon={Users}
            iconBgClass="bg-primary/10 text-primary"
            isLoading={isLoading}
          />
          <SummaryCard
            title="Close Rate"
            value={`${data?.summary.closeRate.toFixed(1) || '0'}%`}
            subtitle={`${data?.summary.dealsClosed || 0} deals from ${data?.summary.showed || 0} shows`}
            icon={Target}
            iconBgClass="bg-warning/10 text-warning"
            isLoading={isLoading}
          />
          <SummaryCard
            title="Revenue"
            value={formatCurrency(data?.summary.totalRevenue || 0)}
            subtitle={data?.summary.dealsClosed ? `Avg ${formatCurrency((data.summary.totalRevenue || 0) / data.summary.dealsClosed)}/deal` : undefined}
            icon={DollarSign}
            iconBgClass="bg-success/10 text-success"
            isLoading={isLoading}
          />
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="p-6">
              <p className="text-destructive">Error loading report data: {error.message}</p>
            </CardContent>
          </Card>
        )}

        {/* Source Breakdown */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <SourceBreakdownCard
            data={data?.sourceBreakdown || []}
            onSourceClick={handleSourceClick}
          />
        )}

        {/* Events Table */}
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
        ) : (
          <CallsEventTable events={data?.events || []} />
        )}
      </div>
    </AppLayout>
  );
}
