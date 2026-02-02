import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { 
  CreditCard, 
  BarChart3, 
  LineChart, 
  PieChart, 
  Table2, 
  Hash,
  Plus,
  Trash2,
  Gauge,
} from 'lucide-react';
import { 
  useDatasets, 
  useDatasetFields,
  useCreateDashboardWidget,
  useUpdateDashboardWidget,
  DashboardWidget 
} from '@/hooks/useWebhookDashboard';
import { useCalculatedFields } from '@/hooks/useCalculatedFields';

const WIDGET_TYPES = [
  { id: 'card', label: 'Metric Card', icon: CreditCard, description: 'Single value with optional comparison' },
  { id: 'number', label: 'Big Number', icon: Hash, description: 'Large prominent number display' },
  { id: 'line', label: 'Line Chart', icon: LineChart, description: 'Trend over time' },
  { id: 'bar', label: 'Bar Chart', icon: BarChart3, description: 'Compare values across categories' },
  { id: 'pie', label: 'Pie Chart', icon: PieChart, description: 'Show proportions' },
  { id: 'table', label: 'Data Table', icon: Table2, description: 'Tabular data view' },
  { id: 'gauge', label: 'Gauge', icon: Gauge, description: 'Visual progress indicator' },
  { id: 'multi-bar', label: 'All Metrics Bar', icon: BarChart3, description: 'Compare ALL numeric fields in one chart' },
  { id: 'summary', label: 'Summary Table', icon: Table2, description: 'Aggregated totals for ALL fields' },
  { id: 'notes', label: 'Notes Panel', icon: Table2, description: 'Display text fields in accordion view' },
] as const;

const AGGREGATIONS = [
  { id: 'SUM', label: 'Sum' },
  { id: 'COUNT', label: 'Count' },
  { id: 'AVG', label: 'Average' },
  { id: 'MIN', label: 'Minimum' },
  { id: 'MAX', label: 'Maximum' },
];

const OPERATORS = [
  { id: '=', label: 'equals' },
  { id: '!=', label: 'not equals' },
  { id: '>', label: 'greater than' },
  { id: '<', label: 'less than' },
  { id: '>=', label: 'greater or equal' },
  { id: '<=', label: 'less or equal' },
  { id: 'contains', label: 'contains' },
];

interface WidgetBuilderProps {
  dashboardId: string;
  isOpen: boolean;
  onClose: () => void;
  editingWidget?: DashboardWidget | null;
  nextPosition: { x: number; y: number };
}

interface FilterCondition {
  field: string;
  op: string;
  value: string;
}

export function WidgetBuilder({ 
  dashboardId, 
  isOpen, 
  onClose, 
  editingWidget,
  nextPosition 
}: WidgetBuilderProps) {
  const { data: datasets } = useDatasets();
  const createWidget = useCreateDashboardWidget();
  const updateWidget = useUpdateDashboardWidget();

  const [widgetType, setWidgetType] = useState<string>('card');
  const [title, setTitle] = useState('');
  const [datasetId, setDatasetId] = useState<string>('');
  const [field, setField] = useState<string>('');
  const [aggregation, setAggregation] = useState<string>('SUM');
  const [groupBy, setGroupBy] = useState<string>('');
  const [filters, setFilters] = useState<FilterCondition[]>([]);
  const [comparisonEnabled, setComparisonEnabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);

  // Fetch fields for selected dataset
  const { data: datasetFields } = useDatasetFields(datasetId || undefined);
  const { data: calculatedFields } = useCalculatedFields(datasetId || undefined);

  // All available fields (mapped + calculated)
  const allFields = [
    ...(datasetFields || []).map(f => ({ id: f.field_slug, name: f.field_name, type: f.field_type })),
    ...(calculatedFields || []).filter(f => f.is_active).map(f => ({ id: f.field_slug, name: f.display_name, type: 'number' })),
  ];

  // Reset form when editing widget changes
  useEffect(() => {
    if (editingWidget) {
      setWidgetType(editingWidget.widget_type);
      setTitle(editingWidget.title || '');
      setDatasetId(editingWidget.dataset_id);
      setField(editingWidget.metric_config?.field || '');
      setAggregation(editingWidget.metric_config?.aggregation || 'SUM');
      setGroupBy(editingWidget.metric_config?.groupBy || '');
      setFilters(editingWidget.metric_config?.filters || []);
      setComparisonEnabled(editingWidget.comparison_enabled);
      setRefreshInterval(editingWidget.refresh_interval_seconds);
    } else {
      resetForm();
    }
  }, [editingWidget]);

  const resetForm = () => {
    setWidgetType('card');
    setTitle('');
    setDatasetId('');
    setField('');
    setAggregation('SUM');
    setGroupBy('');
    setFilters([]);
    setComparisonEnabled(false);
    setRefreshInterval(30);
  };

  const addFilter = () => {
    setFilters([...filters, { field: '', op: '=', value: '' }]);
  };

  const updateFilter = (index: number, updates: Partial<FilterCondition>) => {
    const newFilters = [...filters];
    newFilters[index] = { ...newFilters[index], ...updates };
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!datasetId) {
      toast.error('Please select a dataset');
      return;
    }

    // multi-bar, summary, and notes don't need a specific field - they use all fields
    if (!field && !['table', 'multi-bar', 'summary', 'notes'].includes(widgetType)) {
      toast.error('Please select a field to measure');
      return;
    }

    const metricConfig = {
      field,
      aggregation: aggregation as 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX',
      groupBy: groupBy || undefined,
      filters: filters.filter(f => f.field && f.op && f.value),
    };

    const widgetFilters = filters.filter(f => f.field && f.op && f.value);

    try {
      if (editingWidget) {
        // For updates, only send editable fields (not dashboard_id, organization_id)
        await updateWidget.mutateAsync({
          id: editingWidget.id,
          dashboardId,
          dataset_id: datasetId,
          widget_type: widgetType as DashboardWidget['widget_type'],
          title: title || `${aggregation} of ${field}`,
          metric_config: metricConfig,
          chart_config: {},
          filters: widgetFilters,
          comparison_enabled: comparisonEnabled,
          position: editingWidget.position,
          refresh_interval_seconds: refreshInterval,
        });
        toast.success('Widget updated');
      } else {
        // For creates, include all required fields
        await createWidget.mutateAsync({
          dashboard_id: dashboardId,
          dataset_id: datasetId,
          widget_type: widgetType as DashboardWidget['widget_type'],
          title: title || `${aggregation} of ${field}`,
          metric_config: metricConfig,
          chart_config: {},
          filters: widgetFilters,
          comparison_enabled: comparisonEnabled,
          position: { x: nextPosition.x, y: nextPosition.y, w: 3, h: 2 },
          refresh_interval_seconds: refreshInterval,
        });
        toast.success('Widget created');
      }
      onClose();
      resetForm();
    } catch (error) {
      toast.error('Failed to save widget');
      console.error('Widget save error:', error);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingWidget ? 'Edit Widget' : 'Add Widget'}</DialogTitle>
          <DialogDescription>
            Configure your widget to visualize data from your datasets
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="type" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="type">Widget Type</TabsTrigger>
            <TabsTrigger value="data">Data</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="type" className="space-y-4 mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {WIDGET_TYPES.map((type) => {
                const Icon = type.icon;
                return (
                  <Card 
                    key={type.id}
                    className={`cursor-pointer transition-all ${widgetType === type.id ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
                    onClick={() => setWidgetType(type.id)}
                  >
                    <CardContent className="p-4 text-center">
                      <Icon className={`h-8 w-8 mx-auto mb-2 ${widgetType === type.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      <h4 className="font-medium text-sm">{type.label}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </TabsContent>

          <TabsContent value="data" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Dataset</Label>
              <Select value={datasetId} onValueChange={setDatasetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a dataset" />
                </SelectTrigger>
                <SelectContent>
                  {datasets?.map((ds) => (
                    <SelectItem key={ds.id} value={ds.id}>
                      {ds.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {datasetId && widgetType !== 'table' && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Measure Field</Label>
                    <Select value={field} onValueChange={setField}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent>
                        {allFields.map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name} ({f.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Aggregation</Label>
                    <Select value={aggregation} onValueChange={setAggregation}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AGGREGATIONS.map((agg) => (
                          <SelectItem key={agg.id} value={agg.id}>
                            {agg.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {['line', 'bar', 'pie'].includes(widgetType) && (
                  <div className="space-y-2">
                    <Label>Group By (Optional)</Label>
                    <Select value={groupBy || '__none__'} onValueChange={(v) => setGroupBy(v === '__none__' ? '' : v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="No grouping" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No grouping</SelectItem>
                        <SelectItem value="date">Date (daily)</SelectItem>
                        <SelectItem value="week">Week</SelectItem>
                        <SelectItem value="month">Month</SelectItem>
                        {allFields.filter(f => f.type === 'text').map((f) => (
                          <SelectItem key={f.id} value={f.id}>
                            {f.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            {/* Filters */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Filters</Label>
                <Button variant="outline" size="sm" onClick={addFilter}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Filter
                </Button>
              </div>
              {filters.length === 0 ? (
                <p className="text-sm text-muted-foreground">No filters applied</p>
              ) : (
                <div className="space-y-2">
                  {filters.map((filter, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-center gap-2">
                        <Select value={filter.field} onValueChange={(v) => updateFilter(index, { field: v })}>
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Field" />
                          </SelectTrigger>
                          <SelectContent>
                            {allFields.map((f) => (
                              <SelectItem key={f.id} value={f.id}>
                                {f.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={filter.op} onValueChange={(v) => updateFilter(index, { op: v })}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map((op) => (
                              <SelectItem key={op.id} value={op.id}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          value={filter.value}
                          onChange={(e) => updateFilter(index, { value: e.target.value })}
                          placeholder="Value"
                          className="flex-1"
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeFilter(index)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="title">Widget Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={`${aggregation} of ${field || 'field'}`}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Enable Comparison</Label>
                <p className="text-sm text-muted-foreground">Show comparison with previous period</p>
              </div>
              <Switch checked={comparisonEnabled} onCheckedChange={setComparisonEnabled} />
            </div>

            <div className="space-y-2">
              <Label>Refresh Interval (seconds)</Label>
              <Select value={String(refreshInterval)} onValueChange={(v) => setRefreshInterval(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 seconds</SelectItem>
                  <SelectItem value="30">30 seconds</SelectItem>
                  <SelectItem value="60">1 minute</SelectItem>
                  <SelectItem value="300">5 minutes</SelectItem>
                  <SelectItem value="600">10 minutes</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={createWidget.isPending || updateWidget.isPending}
          >
            {(createWidget.isPending || updateWidget.isPending) ? 'Saving...' : editingWidget ? 'Update Widget' : 'Add Widget'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
