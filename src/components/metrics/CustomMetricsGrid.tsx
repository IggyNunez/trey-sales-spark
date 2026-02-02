import { useEffect, useState, ReactNode } from 'react';
import { Plus, Settings2, LayoutGrid, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CustomMetricCard } from './CustomMetricCard';
import { MetricBuilderDialog } from './MetricBuilderDialog';
import { 
  useMetricDefinitions, 
  useCreateMetricDefinition, 
  useUpdateMetricDefinition, 
  useDeleteMetricDefinition 
} from '@/hooks/useMetricDefinitions';
import { useCalculateCustomMetrics } from '@/hooks/useCalculateCustomMetrics';
import type { MetricDefinition } from '@/types/customMetrics';

interface CustomMetricsGridProps {
  startDate?: Date;
  endDate?: Date;
  dateType?: 'scheduled' | 'booked';
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  callTypeId?: string;
  closerId?: string;
  bookingPlatform?: string;
  closeFieldFilters?: Record<string, string | null>;
  showManageButton?: boolean;
  leadingCard?: ReactNode;
}

export function CustomMetricsGrid({
  startDate,
  endDate,
  dateType = 'scheduled',
  sourceId,
  sourceIds,
  trafficTypeId,
  callTypeId,
  closerId,
  bookingPlatform,
  closeFieldFilters,
  showManageButton = true,
  leadingCard,
}: CustomMetricsGridProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMetric, setEditingMetric] = useState<MetricDefinition | null>(null);

  const { data: metrics, isLoading: metricsLoading } = useMetricDefinitions();
  const activeMetrics = metrics?.filter(m => m.is_active) || [];
  const hiddenMetrics = metrics?.filter(m => !m.is_active) || [];
  
  // Debug log to verify this component receives filter updates
  useEffect(() => {
    console.log('Current Filters:', {
      selectedPlatform: (sourceIds && sourceIds.length > 0) ? sourceIds : (sourceId ?? null),
      selectedTrafficType: trafficTypeId ?? null,
    });
  }, [sourceId, trafficTypeId, sourceIds?.join('|')]);

  const { data: metricValues, isLoading: valuesLoading, isFetching } = useCalculateCustomMetrics(
    activeMetrics,
    { startDate, endDate, dateType, sourceId, sourceIds, trafficTypeId, callTypeId, closerId, bookingPlatform, closeFieldFilters }
  );

  const createMutation = useCreateMetricDefinition();
  const updateMutation = useUpdateMetricDefinition();
  const deleteMutation = useDeleteMetricDefinition();

  const handleSave = (metricData: Partial<MetricDefinition>) => {
    if (editingMetric) {
      updateMutation.mutate({ id: editingMetric.id, ...metricData });
    } else {
      createMutation.mutate(metricData);
    }
    setEditingMetric(null);
  };

  const handleEdit = (metric: MetricDefinition) => {
    setEditingMetric(metric);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this metric?')) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleVisibility = (id: string, isActive: boolean) => {
    updateMutation.mutate({ id, is_active: isActive });
  };

  // Show loading when metrics definitions are loading OR when values are being calculated/refetched
  const isDataLoading = valuesLoading || isFetching;

  // Show skeleton grid when metric definitions are loading
  if (metricsLoading) {
    return (
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        {Array(4).fill(0).map((_, i) => (
          <Card key={i} className="min-h-[120px]">
            <CardContent className="p-4 sm:p-6 h-full">
              <div className="flex items-start justify-between gap-2 h-full">
                <div className="space-y-3 flex-1">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg shrink-0" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {showManageButton && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LayoutGrid className="h-4 w-4" />
              <span>{activeMetrics.length} metrics</span>
              {hiddenMetrics.length > 0 && (
                <span className="text-xs">({hiddenMetrics.length} hidden)</span>
              )}
              {/* Show loading indicator when refetching */}
              {isFetching && !valuesLoading && (
                <span className="text-xs text-primary animate-pulse">Updating...</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {hiddenMetrics.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="gap-2">
                      <EyeOff className="h-4 w-4" />
                      Hidden
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Hidden Metrics</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {hiddenMetrics.map((metric) => (
                      <DropdownMenuItem 
                        key={metric.id}
                        onClick={() => handleToggleVisibility(metric.id, true)}
                        className="flex items-center gap-2"
                      >
                        <Eye className="h-4 w-4" />
                        <span>Show {metric.display_name}</span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => { setEditingMetric(null); setDialogOpen(true); }}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Metric
              </Button>
            </div>
          </div>
        )}

        {activeMetrics.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center">
              <Settings2 className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-muted-foreground mb-3">No custom metrics configured</p>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => { setEditingMetric(null); setDialogOpen(true); }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Metric
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
            {leadingCard}
            {activeMetrics.map((metric) => (
              <CustomMetricCard
                key={metric.id}
                metric={metric}
                value={metricValues?.[metric.id]}
                isLoading={isDataLoading}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleVisibility}
              />
            ))}
          </div>
        )}
      </div>

      <MetricBuilderDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        metric={editingMetric}
        onSave={handleSave}
        startDate={startDate}
        endDate={endDate}
      />
    </>
  );
}
