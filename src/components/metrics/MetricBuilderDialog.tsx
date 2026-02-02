import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  Hash, 
  Percent, 
  Sigma, 
  Sparkles,
  Loader2,
  FileText,
} from 'lucide-react';
import { FilterConditionBuilder } from './FilterConditionBuilder';
import type { MetricDefinition, FormulaType, DataSource, DateField, FilterCondition } from '@/types/customMetrics';
import { DATA_SOURCE_FIELDS, METRIC_TEMPLATES, METRIC_ICONS, METRIC_PRESETS, DATE_FIELD_OPTIONS } from '@/types/customMetrics';
import { useMetricPreviewData } from '@/hooks/useMetricPreviewData';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import type { FormFieldConfig } from '@/components/settings/PCFFormBuilder';

interface MetricBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metric?: MetricDefinition | null;
  onSave: (metric: Partial<MetricDefinition>) => void;
  startDate?: Date;
  endDate?: Date;
}

const FORMULA_TYPES: { value: FormulaType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'count', label: 'Count', icon: <Hash className="h-4 w-4" />, description: 'Count calls/payments' },
  { value: 'sum', label: 'Sum', icon: <Sigma className="h-4 w-4" />, description: 'Total amount' },
  { value: 'percentage', label: 'Rate', icon: <Percent className="h-4 w-4" />, description: 'Calculate a rate' },
];

// Helper to match conditions to preset
function matchConditionsToPreset(conditions: FilterCondition[], presets: typeof METRIC_PRESETS.numerator): string {
  if (!conditions || conditions.length === 0) return 'all_scheduled';
  
  // Normalize conditions for comparison (sort keys, handle arrays)
  const normalizeCondition = (c: FilterCondition) => ({
    field: c.field,
    operator: c.operator,
    value: Array.isArray(c.value) ? [...c.value].sort() : c.value,
  });
  
  const normalizedInput = conditions.map(normalizeCondition);
  
  for (const preset of presets) {
    if (preset.value === 'custom') continue;
    if (preset.conditions.length !== conditions.length) continue;
    
    const normalizedPreset = preset.conditions.map(normalizeCondition);
    
    // Compare each condition
    const matches = normalizedInput.every((inputCond, i) => 
      JSON.stringify(inputCond) === JSON.stringify(normalizedPreset[i])
    );
    
    if (matches) {
      return preset.value;
    }
  }
  return 'custom';
}

export function MetricBuilderDialog({
  open,
  onOpenChange,
  metric,
  onSave,
  startDate,
  endDate,
}: MetricBuilderDialogProps) {
  const { currentOrganization } = useOrganization();
  const [activeTab, setActiveTab] = useState<'templates' | 'builder'>('templates');
  const [formData, setFormData] = useState<Partial<MetricDefinition>>({
    name: '',
    display_name: '',
    description: '',
    formula_type: 'count',
    data_source: 'events',
    date_field: 'scheduled_at',
    numerator_field: null,
    denominator_field: null,
    numerator_conditions: [],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: false,
    include_reschedules: false,
    exclude_overdue_pcf: false,
    pcf_field_id: undefined,
    icon: 'trending-up',
    is_active: true,
  });
  
  const [numeratorPreset, setNumeratorPreset] = useState('all_scheduled');
  const [denominatorPreset, setDenominatorPreset] = useState('all_scheduled');

  // Fetch PCF form config to get available yes/no fields
  const { data: pcfFormConfig } = useQuery({
    queryKey: ['form-config', currentOrganization?.id, 'post_call_form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_configs')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .eq('form_type', 'post_call_form')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!currentOrganization?.id && open,
  });

  // Get yes/no fields from PCF form config
  const yesNoFields = useMemo(() => {
    if (!pcfFormConfig?.fields) return [];
    const fields = pcfFormConfig.fields as unknown as FormFieldConfig[];
    return fields.filter(f => f.type === 'yes_no');
  }, [pcfFormConfig]);

  // Get live preview data - pass toggle values and date filters for real-time updates
  const previewData = useMetricPreviewData({
    startDate,
    endDate,
    includeCancels: formData.include_cancels,
    includeReschedules: formData.include_reschedules,
    includeNoShows: formData.include_no_shows,
    excludeOverduePcf: formData.exclude_overdue_pcf,
  });

  // Map preset values to actual counts - memoized to ensure reactivity
  const presetCounts = useMemo(() => ({
    all_scheduled: previewData.allScheduled,
    showed_calls: previewData.showedCalls,
    offers_made: previewData.offersMade,
    closed_deals: previewData.closedDeals,
    no_shows: previewData.noShows,
  }), [previewData.allScheduled, previewData.showedCalls, previewData.offersMade, previewData.closedDeals, previewData.noShows]);

  const getPresetCount = (presetValue: string): number => {
    return presetCounts[presetValue as keyof typeof presetCounts] ?? 0;
  };

  // Calculate live preview result - memoized with all dependencies for reactivity
  const livePreviewResult = useMemo(() => {
    const numCount = presetCounts[numeratorPreset as keyof typeof presetCounts] ?? 0;
    const denCount = presetCounts[denominatorPreset as keyof typeof presetCounts] ?? 0;
    
    if (formData.formula_type === 'count') {
      return { value: numCount.toLocaleString(), numerator: numCount };
    }
    if (formData.formula_type === 'percentage') {
      const rate = denCount > 0 ? (numCount / denCount) * 100 : 0;
      return { 
        value: `${Math.round(rate)}%`, 
        numerator: numCount, 
        denominator: denCount 
      };
    }
    return { value: '0', numerator: 0 };
  }, [presetCounts, numeratorPreset, denominatorPreset, formData.formula_type]);

  useEffect(() => {
    if (metric) {
      setFormData({
        ...metric,
        data_source: inferDataSource(metric),
        date_field: metric.date_field || (inferDataSource(metric) === 'payments' ? 'payment_date' : 'scheduled_at'),
      });
      setNumeratorPreset(matchConditionsToPreset(metric.numerator_conditions || [], METRIC_PRESETS.numerator));
      setDenominatorPreset(matchConditionsToPreset(metric.denominator_conditions || [], METRIC_PRESETS.denominator));
      setActiveTab('builder');
    } else {
      setFormData({
        name: '',
        display_name: '',
        description: '',
        formula_type: 'count',
        data_source: 'events',
        date_field: 'scheduled_at',
        numerator_field: null,
        denominator_field: null,
        numerator_conditions: [],
        denominator_conditions: [],
        include_no_shows: true,
        include_cancels: false,
        include_reschedules: false,
        exclude_overdue_pcf: false,
        pcf_field_id: undefined,
        icon: 'trending-up',
        is_active: true,
      });
      setNumeratorPreset('all_scheduled');
      setDenominatorPreset('all_scheduled');
      setActiveTab('templates');
    }
  }, [metric, open]);

  function inferDataSource(m: MetricDefinition): DataSource {
    if (m.pcf_field_id) {
      return 'pcf_fields';
    }
    if (m.numerator_field && ['amount', 'net_revenue'].includes(m.numerator_field)) {
      return 'payments';
    }
    return m.data_source || 'events';
  }

  const handleSelectTemplate = (template: Partial<MetricDefinition>) => {
    // Determine default date_field based on template's data_source
    const defaultDateField = template.data_source === 'payments' ? 'payment_date' : 
      (template.date_field || 'scheduled_at');
    
    setFormData({
      ...formData,
      ...template,
      name: '',
      date_field: template.date_field || defaultDateField,
    });
    setNumeratorPreset(matchConditionsToPreset(template.numerator_conditions || [], METRIC_PRESETS.numerator));
    setDenominatorPreset(matchConditionsToPreset(template.denominator_conditions || [], METRIC_PRESETS.denominator));
    setActiveTab('builder');
  };

  const handleNumeratorPresetChange = (presetValue: string) => {
    setNumeratorPreset(presetValue);
    const preset = METRIC_PRESETS.numerator.find(p => p.value === presetValue);
    if (preset && presetValue !== 'custom') {
      setFormData({ ...formData, numerator_conditions: preset.conditions });
    }
  };

  const handleDenominatorPresetChange = (presetValue: string) => {
    setDenominatorPreset(presetValue);
    const preset = METRIC_PRESETS.denominator.find(p => p.value === presetValue);
    if (preset && presetValue !== 'custom') {
      setFormData({ ...formData, denominator_conditions: preset.conditions });
    }
  };

  const handleSave = () => {
    const name = formData.name || formData.display_name?.toLowerCase().replace(/\s+/g, '_') || '';
    
    // For pcf_fields data source, handle differently
    if (formData.data_source === 'pcf_fields') {
      // Auto-generate description for form field metrics
      const selectedField = yesNoFields.find(f => f.id === formData.pcf_field_id);
      const description = formData.description || 
        (selectedField ? `"Yes" responses for "${selectedField.label}" ÷ Total responses` : 'Form field response rate');
      
      onSave({
        ...formData,
        name,
        description,
        formula_type: 'percentage',
        data_source: 'pcf_fields',
        pcf_field_id: formData.pcf_field_id,
        numerator_conditions: [],
        denominator_conditions: [],
        include_no_shows: true,
        include_cancels: true,
        include_reschedules: true,
        exclude_overdue_pcf: false,
        date_field: 'scheduled_at',
      });
      onOpenChange(false);
      return;
    }
    
    // Get the actual conditions from presets - ALWAYS use preset conditions when a preset is selected
    const numPreset = METRIC_PRESETS.numerator.find(p => p.value === numeratorPreset);
    const denPreset = METRIC_PRESETS.denominator.find(p => p.value === denominatorPreset);
    
    // Build conditions - use preset conditions for non-custom, or formData for custom
    let numerator_conditions: FilterCondition[];
    let denominator_conditions: FilterCondition[];
    
    if (numeratorPreset === 'custom') {
      numerator_conditions = formData.numerator_conditions || [];
    } else if (numPreset) {
      // Clone the conditions to avoid any reference issues
      numerator_conditions = JSON.parse(JSON.stringify(numPreset.conditions));
    } else {
      numerator_conditions = [];
    }
    
    if (denominatorPreset === 'custom') {
      denominator_conditions = formData.denominator_conditions || [];
    } else if (denPreset) {
      // Clone the conditions to avoid any reference issues
      denominator_conditions = JSON.parse(JSON.stringify(denPreset.conditions));
    } else {
      denominator_conditions = [];
    }
    
    // Auto-generate description based on presets
    const numLabel = numPreset?.label || 'Filtered';
    const denLabel = denPreset?.label || 'Total';
    let description = formData.description;
    if (!description && formData.formula_type === 'percentage') {
      description = `${numLabel} ÷ ${denLabel}`;
    }
    
    console.log('Saving metric:', {
      numeratorPreset,
      denominatorPreset,
      numerator_conditions,
      denominator_conditions,
      include_no_shows: formData.include_no_shows,
      include_cancels: formData.include_cancels,
      include_reschedules: formData.include_reschedules,
    });
    
    onSave({
      ...formData,
      name,
      description,
      numerator_conditions,
      denominator_conditions,
      // Explicitly include toggle values to ensure they're saved
      include_no_shows: formData.include_no_shows ?? true,
      include_cancels: formData.include_cancels ?? false,
      include_reschedules: formData.include_reschedules ?? false,
      exclude_overdue_pcf: formData.exclude_overdue_pcf ?? false,
      date_field: formData.date_field || (formData.data_source === 'payments' ? 'payment_date' : 'scheduled_at'),
    });
    onOpenChange(false);
  };

  const numericFields = DATA_SOURCE_FIELDS[formData.data_source || 'events']?.fields.filter(f => f.type === 'number') || [];

  // Generate formula preview
  const getFormulaPreview = () => {
    if (formData.formula_type === 'count') {
      const numPreset = METRIC_PRESETS.numerator.find(p => p.value === numeratorPreset);
      return numPreset?.label || 'Count';
    }
    if (formData.formula_type === 'percentage') {
      const numLabel = METRIC_PRESETS.numerator.find(p => p.value === numeratorPreset)?.label || '?';
      const denLabel = METRIC_PRESETS.denominator.find(p => p.value === denominatorPreset)?.label || '?';
      return `${numLabel} ÷ ${denLabel}`;
    }
    return 'Sum of amount';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            {metric ? 'Edit Metric' : 'Add Metric'}
          </DialogTitle>
          <DialogDescription>
            Choose a template or build your own custom metric.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'templates' | 'builder')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="templates">
              <Sparkles className="h-4 w-4 mr-2" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="builder">
              <Calculator className="h-4 w-4 mr-2" />
              Custom
            </TabsTrigger>
          </TabsList>

          <div className="mt-4 max-h-[50vh] overflow-y-auto pr-2">
            <TabsContent value="templates" className="mt-0 space-y-2">
              <p className="text-sm text-muted-foreground mb-3">
                Start with a ready-to-use metric:
              </p>
              <div className="grid gap-2">
                {METRIC_TEMPLATES.map((template, i) => (
                  <button
                    key={i}
                    type="button"
                    className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/50 hover:border-primary/50 transition-colors text-left"
                    onClick={() => handleSelectTemplate(template)}
                  >
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {FORMULA_TYPES.find(f => f.value === template.formula_type)?.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{template.display_name}</p>
                        <Badge variant="secondary" className="text-xs">
                          {template.data_source}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="builder" className="mt-0 space-y-5">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="display_name">Name *</Label>
                  <Input
                    id="display_name"
                    value={formData.display_name || ''}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="e.g., Show Rate"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icon">Icon</Label>
                  <Select
                    value={formData.icon || 'trending-up'}
                    onValueChange={(v) => setFormData({ ...formData, icon: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {METRIC_ICONS.map((icon) => (
                        <SelectItem key={icon.value} value={icon.value}>
                          {icon.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Formula Type */}
              <div className="space-y-2">
                <Label>What to calculate</Label>
                <div className="grid grid-cols-3 gap-2">
                  {FORMULA_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      className={`flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors ${
                        formData.formula_type === type.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent/50'
                      }`}
                      onClick={() => setFormData({ ...formData, formula_type: type.value })}
                    >
                      <div className={`p-1.5 rounded ${
                        formData.formula_type === type.value 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {type.icon}
                      </div>
                      <span className="text-xs font-medium">{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Data Source */}
              <div className="space-y-2">
                <Label>Data source</Label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(DATA_SOURCE_FIELDS).map(([key, val]) => (
                    <button
                      key={key}
                      type="button"
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors ${
                        formData.data_source === key
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-accent/50'
                      }`}
                      onClick={() => setFormData({ 
                        ...formData, 
                        data_source: key as DataSource,
                        date_field: key === 'payments' ? 'payment_date' : 'scheduled_at',
                        numerator_field: null,
                        numerator_conditions: [],
                        denominator_conditions: [],
                        pcf_field_id: undefined,
                        // For pcf_fields, force formula to percentage (Yes Rate)
                        formula_type: key === 'pcf_fields' ? 'percentage' : formData.formula_type,
                      })}
                    >
                      {val.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* PCF Field Selector - for Form Responses data source */}
              {formData.data_source === 'pcf_fields' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Select Form Field
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Choose a Yes/No field from your Post-Call Form to track
                    </p>
                    {yesNoFields.length > 0 ? (
                      <Select
                        value={formData.pcf_field_id || ''}
                        onValueChange={(v) => setFormData({ ...formData, pcf_field_id: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a Yes/No field..." />
                        </SelectTrigger>
                        <SelectContent>
                          {yesNoFields.map((field) => (
                            <SelectItem key={field.id} value={field.id}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                        No Yes/No fields found in your form. Add a Yes/No field in Settings → Forms first.
                      </div>
                    )}
                  </div>
                  <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 space-y-1">
                    <p className="text-sm font-medium">How this works</p>
                    <p className="text-xs text-muted-foreground">
                      The metric will calculate: <strong>"Yes" responses ÷ Total responses × 100</strong>
                    </p>
                  </div>
                </div>
              )}

              {/* Date Field Selector - only for events */}
              {formData.data_source === 'events' && (
                <div className="space-y-2">
                  <Label>Date filter applies to</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {DATE_FIELD_OPTIONS
                      .filter(opt => opt.dataSource === 'events')
                      .map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`p-3 rounded-lg border text-left transition-colors ${
                            formData.date_field === option.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-accent/50'
                          }`}
                          onClick={() => setFormData({ ...formData, date_field: option.value })}
                        >
                          <p className="text-sm font-medium">{option.label}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{option.description}</p>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Sum: Field to aggregate */}
              {formData.formula_type === 'sum' && formData.data_source === 'payments' && (
                <div className="space-y-2">
                  <Label>Field to sum</Label>
                  <Select
                    value={formData.numerator_field || ''}
                    onValueChange={(v) => setFormData({ ...formData, numerator_field: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select field..." />
                    </SelectTrigger>
                    <SelectContent>
                      {numericFields.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <Separator />

              {/* Simplified Preset Selection for Events */}
              {formData.data_source === 'events' && (
                <>
                  {/* Count: What to count */}
                  {formData.formula_type === 'count' && (
                    <div className="space-y-3">
                      <Label>What to count</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {METRIC_PRESETS.numerator.filter(p => p.value !== 'custom').map((preset) => (
                          <button
                            key={preset.value}
                            type="button"
                            className={`p-3 rounded-lg border text-left transition-colors ${
                              numeratorPreset === preset.value
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:bg-accent/50'
                            }`}
                            onClick={() => handleNumeratorPresetChange(preset.value)}
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium">{preset.label}</p>
                              <Badge variant="secondary" className="text-xs font-mono">
                                {previewData.isLoading ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  getPresetCount(preset.value)
                                )}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                          </button>
                        ))}
                      </div>

                      {/* Live Result Preview */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-xs text-muted-foreground mb-1">Live Preview</p>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-primary">
                            {previewData.isLoading ? '...' : livePreviewResult.value}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {METRIC_PRESETS.numerator.find(p => p.value === numeratorPreset)?.label}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Rate: Numerator and Denominator */}
                  {formData.formula_type === 'percentage' && (
                    <>
                      {/* Numerator */}
                      <div className="space-y-3">
                        <Label>Numerator (top number)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {METRIC_PRESETS.numerator.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              className={`p-3 rounded-lg border text-left transition-colors ${
                                numeratorPreset === preset.value
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:bg-accent/50'
                              }`}
                              onClick={() => handleNumeratorPresetChange(preset.value)}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">{preset.label}</p>
                                {preset.value !== 'custom' && (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {previewData.isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      getPresetCount(preset.value)
                                    )}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                            </button>
                          ))}
                        </div>
                        
                        {/* Show custom filter builder when custom is selected */}
                        {numeratorPreset === 'custom' && (
                          <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                            <FilterConditionBuilder
                              conditions={formData.numerator_conditions || []}
                              onChange={(c) => {
                                setFormData({ ...formData, numerator_conditions: c });
                              }}
                              dataSource={formData.data_source}
                              label="Count events where..."
                              description="All conditions must match (AND logic)"
                            />
                          </div>
                        )}
                      </div>

                      {/* Denominator */}
                      <div className="space-y-3">
                        <Label>Denominator (bottom number)</Label>
                        <div className="grid grid-cols-2 gap-2">
                          {METRIC_PRESETS.denominator.map((preset) => (
                            <button
                              key={preset.value}
                              type="button"
                              className={`p-3 rounded-lg border text-left transition-colors ${
                                denominatorPreset === preset.value
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border hover:bg-accent/50'
                              }`}
                              onClick={() => handleDenominatorPresetChange(preset.value)}
                            >
                              <div className="flex items-center justify-between">
                                <p className="text-sm font-medium">{preset.label}</p>
                                {preset.value !== 'custom' && (
                                  <Badge variant="secondary" className="text-xs font-mono">
                                    {previewData.isLoading ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      getPresetCount(preset.value)
                                    )}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{preset.description}</p>
                            </button>
                          ))}
                        </div>
                        
                        {/* Show custom filter builder when custom is selected */}
                        {denominatorPreset === 'custom' && (
                          <div className="mt-3 p-3 border rounded-lg bg-muted/30">
                            <FilterConditionBuilder
                              conditions={formData.denominator_conditions || []}
                              onChange={(c) => {
                                setFormData({ ...formData, denominator_conditions: c });
                              }}
                              dataSource={formData.data_source}
                              label="Divide by events where..."
                              description="All conditions must match (AND logic)"
                            />
                          </div>
                        )}
                      </div>

                      {/* Live Result Preview with Formula */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-muted-foreground">Live Preview</p>
                          <p className="text-xs text-muted-foreground">
                            {startDate && endDate 
                              ? `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : 'All Time'
                            }
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <p className="text-3xl font-bold text-primary">
                            {previewData.isLoading ? '...' : livePreviewResult.value}
                          </p>
                          <div className="flex-1">
                            <div className="text-sm font-medium">
                              {previewData.isLoading ? '...' : livePreviewResult.numerator}{' '}
                              <span className="text-muted-foreground font-normal">
                                {numeratorPreset === 'custom' 
                                  ? `(${(formData.numerator_conditions || []).length} filters)`
                                  : METRIC_PRESETS.numerator.find(p => p.value === numeratorPreset)?.label
                                }
                              </span>
                            </div>
                            <div className="border-t border-foreground/30 my-1" />
                            <div className="text-sm font-medium">
                              {previewData.isLoading ? '...' : livePreviewResult.denominator}{' '}
                              <span className="text-muted-foreground font-normal">
                                {denominatorPreset === 'custom'
                                  ? `(${(formData.denominator_conditions || []).length} filters)`
                                  : METRIC_PRESETS.denominator.find(p => p.value === denominatorPreset)?.label
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Include Toggles */}
                  <div className="space-y-3">
                    <Label>Include in calculation</Label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm">No Shows</span>
                        <Switch
                          checked={formData.include_no_shows ?? true}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, include_no_shows: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm">Cancels</span>
                        <Switch
                          checked={formData.include_cancels ?? false}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, include_cancels: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between p-2 rounded border">
                        <span className="text-sm">Reschedules</span>
                        <Switch
                          checked={formData.include_reschedules ?? false}
                          onCheckedChange={(checked) => 
                            setFormData({ ...formData, include_reschedules: checked })
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* Exclude Overdue PCF Toggle */}
                  <div className="space-y-3">
                    <Label>Data Quality Filters</Label>
                    <div className="flex items-center justify-between p-2 rounded border bg-muted/30">
                      <div>
                        <span className="text-sm">Exclude Overdue PCF Data</span>
                        <p className="text-xs text-muted-foreground">
                          Exclude calls past scheduled time with no PCF submitted
                        </p>
                      </div>
                      <Switch
                        checked={formData.exclude_overdue_pcf ?? false}
                        onCheckedChange={(checked) => 
                          setFormData({ ...formData, exclude_overdue_pcf: checked })
                        }
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                <div>
                  <p className="font-medium text-sm">Show on Dashboard</p>
                </div>
                <Switch
                  checked={formData.is_active ?? true}
                  onCheckedChange={(checked) => 
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="mt-4 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!formData.display_name}
          >
            {metric ? 'Save' : 'Add Metric'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
