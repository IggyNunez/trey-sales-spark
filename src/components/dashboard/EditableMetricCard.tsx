import { ReactNode, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricFormula {
  numerator: 'showed' | 'closed' | 'offers' | 'all_events' | 'booked' | 'completed' | 'no_shows' | 'canceled';
  denominator: 'showed' | 'all_events' | 'booked' | 'scheduled' | 'completed' | 'attendedOrNoShow';
  includeNoShows: boolean;
  includeCancels: boolean;
  includeReschedules: boolean;
  displayAs: 'percentage' | 'count' | 'currency';
}

export const defaultFormulas: Record<string, MetricFormula> = {
  showRate: {
    numerator: 'showed',
    denominator: 'attendedOrNoShow', // Show Rate = showed / (showed + no-shows)
    includeNoShows: true,
    includeCancels: false,
    includeReschedules: false,
    displayAs: 'percentage',
  },
  closeRate: {
    numerator: 'closed',
    denominator: 'showed',
    includeNoShows: false,
    includeCancels: false,
    includeReschedules: false,
    displayAs: 'percentage',
  },
  offerRate: {
    numerator: 'offers',
    denominator: 'showed',
    includeNoShows: false,
    includeCancels: false,
    includeReschedules: false,
    displayAs: 'percentage',
  },
};

interface EditableMetricCardProps {
  metricKey: string;
  title: string;
  value: string | number;
  icon: ReactNode;
  description?: string;
  subtext?: string;
  formula?: MetricFormula;
  onFormulaChange?: (key: string, formula: MetricFormula) => void;
  editable?: boolean;
  className?: string;
  iconBgClass?: string;
}

export function EditableMetricCard({ 
  metricKey,
  title, 
  value, 
  icon, 
  description,
  subtext,
  formula,
  onFormulaChange,
  editable = true,
  className,
  iconBgClass = "bg-primary/10 text-primary"
}: EditableMetricCardProps) {
  const [open, setOpen] = useState(false);
  const [localFormula, setLocalFormula] = useState<MetricFormula>(
    formula || defaultFormulas[metricKey] || defaultFormulas.showRate
  );

  const handleSave = () => {
    onFormulaChange?.(metricKey, localFormula);
    setOpen(false);
  };

  const numeratorOptions = [
    { value: 'showed', label: 'Leads Who Showed' },
    { value: 'closed', label: 'Deals Closed' },
    { value: 'offers', label: 'Offers Made' },
    { value: 'completed', label: 'Completed Calls' },
    { value: 'no_shows', label: 'No Shows' },
    { value: 'booked', label: 'Calls Booked' },
  ];

  const denominatorOptions = [
    { value: 'scheduled', label: 'All Scheduled Calls' },
    { value: 'showed', label: 'Leads Who Showed' },
    { value: 'booked', label: 'Calls Booked' },
    { value: 'completed', label: 'Completed Calls' },
  ];

  const CardWrapper = ({ children }: { children: ReactNode }) => {
    if (!editable) {
      return <>{children}</>;
    }
    
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <div className="cursor-pointer group">
            {children}
          </div>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Edit: {title}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 text-sm">
              <Info className="h-4 w-4 mt-0.5 text-info" />
              <p className="text-muted-foreground">
                Configure how this metric is calculated. Changes are saved locally.
              </p>
            </div>

            {localFormula.displayAs === 'percentage' && (
              <>
                <div className="space-y-3">
                  <Label>Numerator (Top of Calculation)</Label>
                  <Select 
                    value={localFormula.numerator} 
                    onValueChange={(v) => setLocalFormula(prev => ({ ...prev, numerator: v as MetricFormula['numerator'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {numeratorOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  <Label>Denominator (Bottom of Calculation)</Label>
                  <Select 
                    value={localFormula.denominator} 
                    onValueChange={(v) => setLocalFormula(prev => ({ ...prev, denominator: v as MetricFormula['denominator'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {denominatorOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />
              </>
            )}

            <div className="space-y-4">
              <Label className="text-base">Include in Calculations</Label>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">No Shows</p>
                  <p className="text-xs text-muted-foreground">Count no-shows in the denominator</p>
                </div>
                <Switch
                  checked={localFormula.includeNoShows}
                  onCheckedChange={(checked) => 
                    setLocalFormula(prev => ({ ...prev, includeNoShows: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Cancellations</p>
                  <p className="text-xs text-muted-foreground">Count canceled calls</p>
                </div>
                <Switch
                  checked={localFormula.includeCancels}
                  onCheckedChange={(checked) => 
                    setLocalFormula(prev => ({ ...prev, includeCancels: checked }))
                  }
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Reschedules</p>
                  <p className="text-xs text-muted-foreground">Count rescheduled calls</p>
                </div>
                <Switch
                  checked={localFormula.includeReschedules}
                  onCheckedChange={(checked) => 
                    setLocalFormula(prev => ({ ...prev, includeReschedules: checked }))
                  }
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <CardWrapper>
      <Card className={cn(
        "overflow-hidden transition-all",
        editable && "hover:ring-2 hover:ring-primary/20 hover:shadow-md",
        className
      )}>
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-muted-foreground">{title}</p>
                {editable && (
                  <Settings2 className="h-3 w-3 text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </div>
              <p className="text-3xl font-bold tracking-tight">{value}</p>
              {description && (
                <p className="text-xs text-muted-foreground">{description}</p>
              )}
              {subtext && (
                <p className="text-xs text-muted-foreground">{subtext}</p>
              )}
            </div>
            <div className={cn("flex h-12 w-12 items-center justify-center rounded-lg", iconBgClass)}>
              {icon}
            </div>
          </div>
        </CardContent>
      </Card>
    </CardWrapper>
  );
}
