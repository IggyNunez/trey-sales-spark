import { useState } from 'react';
import { 
  DollarSign, 
  TrendingUp, 
  Users, 
  Phone, 
  CheckCircle, 
  XCircle, 
  Calendar, 
  Target,
  Percent,
  BarChart,
  PieChart,
  Activity,
  GripVertical,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { MetricDefinition, MetricValue } from '@/types/customMetrics';

interface CustomMetricCardProps {
  metric: MetricDefinition;
  value?: MetricValue;
  isLoading?: boolean;
  onEdit?: (metric: MetricDefinition) => void;
  onDelete?: (id: string) => void;
  onToggleVisibility?: (id: string, isActive: boolean) => void;
  draggable?: boolean;
  className?: string;
  onClick?: () => void;
}

const ICON_MAP: Record<string, React.ReactNode> = {
  'trending-up': <TrendingUp className="h-5 w-5" />,
  'dollar-sign': <DollarSign className="h-5 w-5" />,
  'users': <Users className="h-5 w-5" />,
  'phone': <Phone className="h-5 w-5" />,
  'check-circle': <CheckCircle className="h-5 w-5" />,
  'x-circle': <XCircle className="h-5 w-5" />,
  'calendar': <Calendar className="h-5 w-5" />,
  'target': <Target className="h-5 w-5" />,
  'percent': <Percent className="h-5 w-5" />,
  'bar-chart': <BarChart className="h-5 w-5" />,
  'pie-chart': <PieChart className="h-5 w-5" />,
  'activity': <Activity className="h-5 w-5" />,
};

function getIconBgClass(formulaType: string): string {
  switch (formulaType) {
    case 'percentage':
      return 'bg-primary/10 text-primary';
    case 'sum':
      return 'bg-success/10 text-success';
    case 'count':
      return 'bg-info/10 text-info';
    case 'average':
      return 'bg-warning/10 text-warning';
    default:
      return 'bg-muted text-muted-foreground';
  }
}

// Helper to format the breakdown label with proper context
function getBreakdownLabel(metric: MetricDefinition): string {
  switch (metric.formula_type) {
    case 'percentage':
      return 'Matched / Total';
    case 'count':
      return 'Count';
    case 'sum':
      return 'Total';
    default:
      return '';
  }
}

export function CustomMetricCard({
  metric,
  value,
  isLoading = false,
  onEdit,
  onDelete,
  onToggleVisibility,
  draggable = false,
  className,
}: CustomMetricCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  const icon = ICON_MAP[metric.icon || 'trending-up'] || <TrendingUp className="h-5 w-5" />;
  const iconBgClass = getIconBgClass(metric.formula_type);

  // Format the display value - handle loading state
  const displayValue = isLoading 
    ? null 
    : value?.formattedValue ?? '0';

  // Format breakdown text with proper number formatting and labels
  const breakdownText = value?.breakdown && value.breakdown.denominator !== undefined
    ? `${value.breakdown.numerator.toLocaleString()} / ${value.breakdown.denominator.toLocaleString()}`
    : value?.breakdown?.numerator !== undefined
    ? `Count: ${value.breakdown.numerator.toLocaleString()}`
    : null;

  const getFormulaDescription = () => {
    switch (metric.formula_type) {
      case 'percentage':
        return 'Numerator ÷ Denominator × 100';
      case 'sum':
        return `Sum of ${metric.numerator_field || 'values'}`;
      case 'count':
        return 'Count of matching records';
      default:
        return metric.formula_type;
    }
  };

  // Loading state skeleton
  if (isLoading) {
    return (
      <Card className={cn('overflow-hidden h-full min-h-[120px]', className)}>
        <CardContent className="p-4 sm:p-6 h-full">
          <div className="flex items-start justify-between gap-2 h-full">
            <div className="space-y-3 flex-1 min-w-0">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
            <Skeleton className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg shrink-0" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card
        className={cn(
          'overflow-hidden transition-all hover:shadow-md group relative cursor-pointer h-full min-h-[120px]',
          !metric.is_active && 'opacity-60',
          className
        )}
        onClick={() => setDetailsOpen(true)}
      >
        <CardContent className="p-4 sm:p-6 h-full">
          <div className="flex items-start justify-between gap-2 h-full">
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {draggable && (
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 cursor-grab shrink-0" />
                )}
                {/* Title with text wrap support - no truncation */}
                <p className="text-sm font-medium text-muted-foreground leading-tight">
                  {metric.display_name}
                </p>
                {metric.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p>{metric.description}</p>
                      {breakdownText && (
                        <p className="text-xs mt-1 text-muted-foreground">
                          {getBreakdownLabel(metric)}: {breakdownText}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <p className="text-2xl sm:text-3xl font-bold tracking-tight">
                {displayValue}
              </p>
              {/* Sub-text with clear labeling */}
              {breakdownText && (
                <p className="text-xs text-muted-foreground">
                  {breakdownText}
                </p>
              )}
            </div>
          
            <div className="flex items-start gap-1">
              <div className={cn('flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-lg shrink-0', iconBgClass)}>
                {icon}
              </div>
              
              {(onEdit || onDelete || onToggleVisibility) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(metric); }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onToggleVisibility && (
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onToggleVisibility(metric.id, !metric.is_active); }}>
                        {metric.is_active ? (
                          <>
                            <EyeOff className="h-4 w-4 mr-2" />
                            Hide
                          </>
                        ) : (
                          <>
                            <Eye className="h-4 w-4 mr-2" />
                            Show
                          </>
                        )}
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={(e) => { e.stopPropagation(); onDelete(metric.id); }}
                          className="text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metric Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className={cn('flex h-8 w-8 items-center justify-center rounded-lg', iconBgClass)}>
                {icon}
              </div>
              {metric.display_name}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Main Value */}
            <div className="text-center py-4 bg-muted/50 rounded-lg">
              <p className="text-4xl font-bold">{displayValue}</p>
              {metric.description && (
                <p className="text-sm text-muted-foreground mt-1">{metric.description}</p>
              )}
            </div>

            {/* Calculation Breakdown */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Calculation Breakdown</h4>
              
              <div className="grid gap-2 text-sm">
                <div className="flex justify-between p-2 bg-muted/30 rounded">
                  <span className="text-muted-foreground">Formula Type</span>
                  <span className="font-medium capitalize">{metric.formula_type}</span>
                </div>
                
                {value?.breakdown?.numerator !== undefined && (
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground">
                      {metric.formula_type === 'percentage' ? 'Numerator (Matched)' : metric.formula_type === 'count' ? 'Count' : 'Sum'}
                    </span>
                    <span className="font-medium">{value.breakdown.numerator.toLocaleString()}</span>
                  </div>
                )}
                
                {value?.breakdown?.denominator !== undefined && (
                  <div className="flex justify-between p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground">Denominator (Total)</span>
                    <span className="font-medium">{value.breakdown.denominator.toLocaleString()}</span>
                  </div>
                )}

                <div className="flex justify-between p-2 bg-primary/10 rounded border border-primary/20">
                  <span className="text-muted-foreground">Formula</span>
                  <span className="font-medium">{getFormulaDescription()}</span>
                </div>
              </div>
            </div>

            {/* Data Source Info */}
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Data Source</h4>
              <div className="text-sm text-muted-foreground">
                <p>Source: <span className="font-medium capitalize">{metric.data_source || 'events'}</span></p>
                {metric.date_field && (
                  <p>Date Field: <span className="font-medium">{metric.date_field}</span></p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
