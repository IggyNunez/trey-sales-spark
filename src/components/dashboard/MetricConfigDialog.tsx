import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Settings2, GripVertical } from 'lucide-react';
import { MetricConfig } from '@/hooks/useConfigurableMetrics';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';

export interface DashboardMetricVisibility {
  scheduledCalls: boolean;
  callsBooked: boolean;
  showRate: boolean;
  totalRevenue: boolean;
  closeRate: boolean;
  offerRate: boolean;
  dealsClosed: boolean;
  completedCalls: boolean;
  offersMade: boolean;
  noShows: boolean;
  canceledRescheduled: boolean;
  pendingPCFs: boolean;
  cancelRate: boolean;
  rescheduleRate: boolean;
}

const defaultMetricVisibility: DashboardMetricVisibility = {
  scheduledCalls: true,
  callsBooked: true,
  showRate: true,
  totalRevenue: true,
  closeRate: true,
  offerRate: true,
  dealsClosed: true,
  completedCalls: true,
  offersMade: true,
  noShows: true,
  canceledRescheduled: true,
  pendingPCFs: true,
  cancelRate: true,
  rescheduleRate: true,
};

const metricLabels: Record<keyof DashboardMetricVisibility, string> = {
  scheduledCalls: 'Scheduled Calls',
  callsBooked: 'Calls Booked',
  showRate: 'Show Rate',
  totalRevenue: 'Total Revenue',
  closeRate: 'Close Rate',
  offerRate: 'Offer Rate',
  dealsClosed: 'Deals Closed',
  completedCalls: 'Completed Calls',
  offersMade: 'Offers Made',
  noShows: 'No Shows',
  canceledRescheduled: 'Canceled/Rescheduled Count',
  pendingPCFs: 'Pending PCFs',
  cancelRate: 'Cancel Rate',
  rescheduleRate: 'Reschedule Rate',
};

interface MetricConfigDialogProps {
  config: MetricConfig;
  onConfigChange: (config: MetricConfig) => void;
  visibility?: DashboardMetricVisibility;
  onVisibilityChange?: (visibility: DashboardMetricVisibility) => void;
}

export function MetricConfigDialog({ 
  config, 
  onConfigChange, 
  visibility = defaultMetricVisibility,
  onVisibilityChange 
}: MetricConfigDialogProps) {
  const [open, setOpen] = useState(false);
  const [localConfig, setLocalConfig] = useState(config);
  const [localVisibility, setLocalVisibility] = useState(visibility);

  useEffect(() => {
    if (open) {
      setLocalConfig(config);
      setLocalVisibility(visibility);
    }
  }, [open, config, visibility]);

  const handleSave = () => {
    onConfigChange(localConfig);
    onVisibilityChange?.(localVisibility);
    setOpen(false);
  };

  const toggleMetric = (key: keyof DashboardMetricVisibility) => {
    setLocalVisibility(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          Configure Metrics
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="font-display">Metric Configuration</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* Rate Calculation Settings */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Rate Calculations</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Choose which call statuses to include in rate calculations.
              </p>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="include-no-shows">Include No Shows</Label>
                    <p className="text-xs text-muted-foreground">Count no-shows in rate calculations</p>
                  </div>
                  <Switch
                    id="include-no-shows"
                    checked={localConfig.includeNoShows}
                    onCheckedChange={(checked) => 
                      setLocalConfig(prev => ({ ...prev, includeNoShows: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="include-cancels">Include Cancels</Label>
                    <p className="text-xs text-muted-foreground">Count canceled calls in rate calculations</p>
                  </div>
                  <Switch
                    id="include-cancels"
                    checked={localConfig.includeCancels}
                    onCheckedChange={(checked) => 
                      setLocalConfig(prev => ({ ...prev, includeCancels: checked }))
                    }
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="include-reschedules">Include Reschedules</Label>
                    <p className="text-xs text-muted-foreground">Count rescheduled calls in rate calculations</p>
                  </div>
                  <Switch
                    id="include-reschedules"
                    checked={localConfig.includeReschedules}
                    onCheckedChange={(checked) => 
                      setLocalConfig(prev => ({ ...prev, includeReschedules: checked }))
                    }
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Metric Visibility */}
            <div>
              <h4 className="text-sm font-semibold mb-3">Visible Metrics</h4>
              <p className="text-xs text-muted-foreground mb-4">
                Toggle which metrics appear on the dashboard.
              </p>
              
              <div className="space-y-3">
                {(Object.keys(metricLabels) as Array<keyof DashboardMetricVisibility>).map((key) => (
                  <div key={key} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50" />
                      <Label htmlFor={`metric-${key}`} className="cursor-pointer">
                        {metricLabels[key]}
                      </Label>
                    </div>
                    <Switch
                      id={`metric-${key}`}
                      checked={localVisibility[key]}
                      onCheckedChange={() => toggleMetric(key)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save Changes</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { defaultMetricVisibility };
