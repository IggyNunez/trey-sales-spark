import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useDashboardConfig, MetricType, WidgetType } from '@/hooks/useDashboardConfig';
import {
  LayoutDashboard,
  BarChart3,
  TrendingUp,
  DollarSign,
  Calendar,
  Users,
  Target,
  Percent,
  Eye,
  CheckCircle2,
  RefreshCw,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Available metrics with metadata
const AVAILABLE_METRICS: Record<string, { label: string; icon: any; description: string }> = {
  scheduled_calls: {
    label: 'Scheduled Calls',
    icon: Calendar,
    description: 'Total calls scheduled in date range',
  },
  calls_booked: {
    label: 'Calls Booked',
    icon: CheckCircle2,
    description: 'New calls booked in date range',
  },
  slot_utilization: {
    label: 'Slot Utilization',
    icon: Percent,
    description: 'Percentage of available slots filled',
  },
  cash_collected: {
    label: 'Cash Collected',
    icon: DollarSign,
    description: 'Total revenue from closed deals',
  },
  conversion_rate: {
    label: 'Conversion Rate',
    icon: TrendingUp,
    description: 'Percentage of calls that close',
  },
  show_rate: {
    label: 'Show Rate',
    icon: Eye,
    description: 'Percentage of scheduled calls attended',
  },
  close_rate: {
    label: 'Close Rate',
    icon: Target,
    description: 'Percentage of attended calls that close',
  },
  avg_deal_size: {
    label: 'Avg Deal Size',
    icon: DollarSign,
    description: 'Average revenue per closed deal',
  },
};

// Available widgets with metadata
const AVAILABLE_WIDGETS: Record<string, { label: string; icon: any; description: string }> = {
  recent_events: {
    label: 'Recent Events',
    icon: Calendar,
    description: 'List of recent calls and bookings',
  },
  calls_by_source: {
    label: 'Calls by Source',
    icon: BarChart3,
    description: 'Breakdown of calls by lead source',
  },
  performance_chart: {
    label: 'Performance Chart',
    icon: TrendingUp,
    description: 'Visual chart of key metrics over time',
  },
  top_performers: {
    label: 'Top Performers',
    icon: Users,
    description: 'Leaderboard of top closers',
  },
  upcoming_calls: {
    label: 'Upcoming Calls',
    icon: Calendar,
    description: 'Next scheduled calls',
  },
};

export function DashboardCustomizer() {
  const {
    dashboardConfig,
    isLoading,
    updateDashboardConfig,
    isUpdating,
    resetToOrgDefault,
    isResetting,
  } = useDashboardConfig();

  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Initialize from dashboard config
  useEffect(() => {
    if (dashboardConfig) {
      setSelectedMetrics(dashboardConfig.enabled_metrics || []);
      setSelectedWidgets(dashboardConfig.enabled_widgets || []);
    }
  }, [dashboardConfig]);

  // Track changes
  useEffect(() => {
    if (dashboardConfig) {
      const metricsChanged = JSON.stringify(selectedMetrics) !== JSON.stringify(dashboardConfig.enabled_metrics);
      const widgetsChanged = JSON.stringify(selectedWidgets) !== JSON.stringify(dashboardConfig.enabled_widgets);
      setHasChanges(metricsChanged || widgetsChanged);
    }
  }, [selectedMetrics, selectedWidgets, dashboardConfig]);

  const toggleMetric = (metricId: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metricId)
        ? prev.filter(id => id !== metricId)
        : [...prev, metricId]
    );
  };

  const toggleWidget = (widgetId: string) => {
    setSelectedWidgets(prev =>
      prev.includes(widgetId)
        ? prev.filter(id => id !== widgetId)
        : [...prev, widgetId]
    );
  };

  const handleSave = () => {
    updateDashboardConfig({
      enabled_metrics: selectedMetrics,
      metric_order: selectedMetrics, // Use same order as selection
      enabled_widgets: selectedWidgets,
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    if (window.confirm('Reset to organization defaults? Your personal customizations will be lost.')) {
      resetToOrgDefault();
      setHasChanges(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Dashboard Customization</h2>
          <p className="text-muted-foreground">
            Choose which metrics and widgets to display on your dashboard.
          </p>
        </div>
        {dashboardConfig?.user_id && (
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            Personalized
          </Badge>
        )}
      </div>

      {/* Metric Cards Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-primary" />
            <CardTitle>Metric Cards</CardTitle>
          </div>
          <CardDescription>
            Select which metrics to display as cards at the top of your dashboard
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(AVAILABLE_METRICS).map(([id, metric]) => {
              const Icon = metric.icon;
              const isEnabled = selectedMetrics.includes(id);

              return (
                <div
                  key={id}
                  onClick={() => toggleMetric(id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    isEnabled
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  )}
                >
                  <div className={cn(
                    "rounded-lg p-2 shrink-0",
                    isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{metric.label}</span>
                      {isEnabled && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {metric.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedMetrics.length === 0 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Select at least one metric to display on your dashboard
            </p>
          )}
        </CardContent>
      </Card>

      {/* Widgets Selection */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            <CardTitle>Dashboard Widgets</CardTitle>
          </div>
          <CardDescription>
            Select which widgets to show in the main dashboard area
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {Object.entries(AVAILABLE_WIDGETS).map(([id, widget]) => {
              const Icon = widget.icon;
              const isEnabled = selectedWidgets.includes(id);

              return (
                <div
                  key={id}
                  onClick={() => toggleWidget(id)}
                  className={cn(
                    "flex items-start gap-3 p-4 rounded-lg border-2 cursor-pointer transition-all",
                    isEnabled
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50 hover:bg-accent/50"
                  )}
                >
                  <div className={cn(
                    "rounded-lg p-2 shrink-0",
                    isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
                  )}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{widget.label}</span>
                      {isEnabled && (
                        <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {widget.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          {selectedWidgets.length === 0 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Select at least one widget to display on your dashboard
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
        <div className="text-sm text-muted-foreground">
          {hasChanges && (
            <span className="flex items-center gap-2 text-amber-600">
              <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
              You have unsaved changes
            </span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {dashboardConfig?.user_id && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting || isUpdating}
              className="w-full sm:w-auto"
            >
              {isResetting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Resetting...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reset to Defaults
                </>
              )}
            </Button>
          )}
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isUpdating || selectedMetrics.length === 0}
            className="w-full sm:w-auto"
          >
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Info Box */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="rounded-lg bg-primary/10 p-2 h-fit">
              <LayoutDashboard className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="font-medium text-sm">Dashboard Personalization</h4>
              <p className="text-sm text-muted-foreground">
                These settings are personal to you. Other team members see their own customized dashboards.
                Admins can set organization defaults that apply to new team members.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
