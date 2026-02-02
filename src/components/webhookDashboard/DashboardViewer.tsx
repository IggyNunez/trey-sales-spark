import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ArrowLeft, 
  Plus, 
  Share2, 
  RefreshCw, 
  Grip,
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  WebhookDashboard, 
  useDashboardWidgets, 
  useDeleteDashboardWidget,
  DashboardWidget,
} from '@/hooks/useWebhookDashboard';
import { WidgetBuilder } from './WidgetBuilder';
import { WidgetRenderer } from './WidgetRenderer';
import { useQueryClient } from '@tanstack/react-query';
import { useOrganization } from '@/hooks/useOrganization';

interface DashboardViewerProps {
  dashboard: WebhookDashboard;
  onBack: () => void;
}

export function DashboardViewer({ dashboard, onBack }: DashboardViewerProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  
  const { data: widgets, isLoading, refetch } = useDashboardWidgets(dashboard.id);
  const deleteWidget = useDeleteDashboardWidget();
  
  const [isWidgetBuilderOpen, setIsWidgetBuilderOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);

  // Calculate next widget position
  const nextPosition = useMemo(() => {
    if (!widgets?.length) return { x: 0, y: 0 };
    
    // Find the next available position in a 12-column grid
    const positions = widgets.map(w => ({
      x: w.position.x,
      y: w.position.y,
      w: w.position.w,
      h: w.position.h,
    }));
    
    // Simple algorithm: find the highest y + h, place there
    const maxY = Math.max(...positions.map(p => p.y + p.h), 0);
    return { x: 0, y: maxY };
  }, [widgets]);

  const handleRefreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['dataset-records'] });
    refetch();
    toast.success('Dashboard refreshed');
  };

  const handleDeleteWidget = async (widgetId: string) => {
    if (!confirm('Are you sure you want to delete this widget?')) return;
    
    try {
      await deleteWidget.mutateAsync({ id: widgetId, dashboardId: dashboard.id });
      toast.success('Widget deleted');
    } catch (error) {
      toast.error('Failed to delete widget');
    }
  };

  const handleEditWidget = (widget: DashboardWidget) => {
    setEditingWidget(widget);
    setIsWidgetBuilderOpen(true);
  };

  const handleCloseWidgetBuilder = () => {
    setIsWidgetBuilderOpen(false);
    setEditingWidget(null);
  };

  const copyShareLink = () => {
    if (dashboard.share_token) {
      const url = `${window.location.origin}/shared-dashboard/${dashboard.share_token}`;
      navigator.clipboard.writeText(url);
      toast.success('Share link copied to clipboard');
    }
  };

  // Grid layout based on widget positions
  const renderWidgets = () => {
    if (isLoading) {
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 bg-muted rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }

    if (!widgets?.length) {
      return (
        <div className="border-2 border-dashed rounded-lg p-12 text-center">
          <Grip className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No widgets yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add widgets to visualize your data
          </p>
          <Button onClick={() => setIsWidgetBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        </div>
      );
    }

    // Simple responsive grid layout
    // In a production app, you'd use react-grid-layout or similar
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {widgets.map((widget) => (
          <div 
            key={widget.id}
            className="min-h-[200px]"
            style={{
              gridColumn: widget.position.w > 2 ? 'span 2' : 'span 1',
            }}
          >
            <WidgetRenderer
              widget={widget}
              onEdit={() => handleEditWidget(widget)}
              onDelete={() => handleDeleteWidget(widget.id)}
            />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-sm text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
          {dashboard.is_shared && (
            <Badge variant="secondary" className="cursor-pointer" onClick={copyShareLink}>
              <Share2 className="h-3 w-3 mr-1" />
              Shared
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleRefreshAll}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={() => setIsWidgetBuilderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Widget
          </Button>
        </div>
      </div>

      {/* Widgets Grid */}
      {renderWidgets()}

      {/* Widget Builder Dialog */}
      <WidgetBuilder
        dashboardId={dashboard.id}
        isOpen={isWidgetBuilderOpen}
        onClose={handleCloseWidgetBuilder}
        editingWidget={editingWidget}
        nextPosition={nextPosition}
      />
    </div>
  );
}
