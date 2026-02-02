import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useMetricDefinitions } from '@/hooks/useMetricDefinitions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Plus, Trash2, GripVertical, Save, Loader2, Settings2, 
  ChevronUp, ChevronDown, EyeOff, TrendingUp, Link2, FileText, GitBranch
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { MetricDefinition } from '@/types/customMetrics';

// Custom Metric Selector Component - allows selecting existing or creating new metric
interface CustomMetricSelectorProps {
  field: FormFieldConfig;
  customMetrics: MetricDefinition[];
  onSelectMetric: (metricId: string) => void;
  organizationId?: string;
  onMetricCreated: (metricId: string) => void;
}

function CustomMetricSelector({ 
  field, 
  customMetrics, 
  onSelectMetric, 
  organizationId, 
  onMetricCreated 
}: CustomMetricSelectorProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newMetricName, setNewMetricName] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Query for custom field definitions that match this form field
  const { data: fieldDefinitions } = useQuery({
    queryKey: ['pcf-field-definitions-for-field', organizationId, field.id],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('id, field_slug')
        .eq('organization_id', organizationId)
        .contains('applies_to', ['post_call_forms'])
        .like('field_slug', `%${field.id}%`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId,
  });

  // Find metrics linked to this field via custom_field_definitions
  const linkedDefinitionIds = new Set(fieldDefinitions?.map(d => d.id) || []);
  const linkedMetric = customMetrics?.find(m => 
    m.data_source === 'pcf_fields' && linkedDefinitionIds.has(m.pcf_field_id || '')
  );

  const createMetricMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');
      if (!newMetricName.trim()) throw new Error('Please enter a metric name');
      
      // First, create a custom_field_definition entry to track this PCF field
      // This is required because custom_field_values references custom_field_definitions
      const fieldSlug = `pcf_${field.id}_${Date.now()}`;
      const { data: cfdData, error: cfdError } = await supabase
        .from('custom_field_definitions')
        .insert({
          organization_id: organizationId,
          field_name: field.label,
          field_slug: fieldSlug,
          field_type: 'boolean',
          applies_to: ['post_call_forms'],
          is_active: true,
          is_required: false,
          show_in_forms: true,
          show_in_dashboard: true,
          show_in_exports: true,
          show_in_filters: false,
          sort_order: 0,
        })
        .select()
        .single();

      if (cfdError) throw cfdError;

      // Create a metric that tracks this PCF field's Yes/No responses
      const metricData = {
        organization_id: organizationId,
        name: newMetricName.toLowerCase().replace(/\s+/g, '_'),
        display_name: newMetricName,
        description: `Tracks "${field.label}" responses from post-call forms (Yes responses ÷ Total responses)`,
        formula_type: 'percentage',
        data_source: 'pcf_fields',
        pcf_field_id: cfdData.id, // Link to the custom_field_definition UUID
        numerator_conditions: [],
        denominator_conditions: [],
        include_no_shows: true,
        include_cancels: true,
        include_reschedules: true,
        is_active: true,
        sort_order: (customMetrics?.length || 0) + 1,
      };

      const { data, error } = await supabase
        .from('metric_definitions')
        .insert(metricData)
        .select()
        .single();

      if (error) throw error;
      return { ...data, _cfdId: cfdData.id, _formFieldId: field.id };
    },
    onSuccess: (data) => {
      toast({ 
        title: 'Metric created!', 
        description: `"${newMetricName}" will now track this field's responses.` 
      });
      setIsCreating(false);
      setNewMetricName('');
      // Invalidate queries to refresh linked metrics and definitions
      queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['pcf-field-definitions-for-field'] });
      onMetricCreated(data.id);
    },
    onError: (error) => {
      toast({ 
        title: 'Error creating metric', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Filter to other metrics not linked to this field
  const otherMetrics = customMetrics?.filter(m => 
    !(m.data_source === 'pcf_fields' && linkedDefinitionIds.has(m.pcf_field_id || ''))
  ) || [];

  if (isCreating) {
    return (
      <div className="space-y-2">
        <Label className="text-sm">Create New Metric</Label>
        <div className="flex gap-2">
          <Input
            value={newMetricName}
            onChange={(e) => setNewMetricName(e.target.value)}
            placeholder={`e.g., ${field.label} Rate`}
            className="flex-1"
          />
          <Button 
            size="sm" 
            onClick={() => createMetricMutation.mutate()}
            disabled={createMetricMutation.isPending || !newMetricName.trim()}
          >
            {createMetricMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Create'
            )}
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => setIsCreating(false)}
          >
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          This will create a metric that calculates: Yes responses ÷ Total responses × 100%
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-sm">Custom Metric</Label>
      <Select
        value={field.customMetricId || ''}
        onValueChange={onSelectMetric}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select custom metric..." />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {/* Show linked metric first if exists */}
          {linkedMetric && (
            <SelectItem key={linkedMetric.id} value={linkedMetric.id}>
              <div className="flex items-center gap-2">
                <span>{linkedMetric.display_name}</span>
                <Badge variant="secondary" className="text-xs">Linked</Badge>
              </div>
            </SelectItem>
          )}
          {/* Show other metrics */}
          {otherMetrics.map((metric) => (
            <SelectItem key={metric.id} value={metric.id}>
              {metric.display_name}
            </SelectItem>
          ))}
          {/* Create new option */}
          <div 
            className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setIsCreating(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2 text-primary" />
            <span className="text-primary font-medium">Create New Metric...</span>
          </div>
        </SelectContent>
      </Select>
      {field.customMetricId && linkedMetric && (
        <p className="text-xs text-muted-foreground">
          ✓ This field's responses will be tracked in "{linkedMetric.display_name}"
        </p>
      )}
    </div>
  );
}

// Metric mapping options for form fields with clear explanations
export const METRIC_MAPPINGS = [
  { 
    value: 'none', 
    label: 'No metric mapping', 
    description: 'This field does not contribute to any metric',
    yesAction: null,
    noAction: null,
    fieldType: 'any' as const,
    formula: null,
  },
  { 
    value: 'show_rate', 
    label: 'Show Rate', 
    description: 'Tracks whether leads show up to scheduled calls',
    yesAction: 'Counts as a SHOW — adds to show rate numerator',
    noAction: 'Counts as a NO-SHOW — does not add to numerator',
    fieldType: 'yes_no' as const,
    formula: 'Show Rate = Leads who showed ÷ Total scheduled calls',
  },
  { 
    value: 'offer_rate', 
    label: 'Offer Rate', 
    description: 'Tracks whether an offer was presented to the lead',
    yesAction: 'Counts as OFFER MADE — adds to offer rate numerator',
    noAction: 'No offer made — does not add to numerator',
    fieldType: 'yes_no' as const,
    formula: 'Offer Rate = Offers made ÷ Leads who showed',
  },
  { 
    value: 'close_rate', 
    label: 'Close Rate', 
    description: 'Tracks whether the deal was closed',
    yesAction: 'Counts as CLOSED — adds to close rate numerator',
    noAction: 'Not closed — does not add to numerator',
    fieldType: 'yes_no' as const,
    formula: 'Close Rate = Deals closed ÷ Offers made',
  },
  { 
    value: 'reschedule_rate', 
    label: 'Reschedule Rate', 
    description: 'Tracks rescheduled calls',
    yesAction: 'Counts as RESCHEDULED — adds to reschedule rate',
    noAction: 'Not rescheduled',
    fieldType: 'yes_no' as const,
    formula: 'Reschedule Rate = Rescheduled ÷ Total scheduled calls',
  },
  { 
    value: 'cancel_rate', 
    label: 'Cancel Rate', 
    description: 'Tracks canceled calls',
    yesAction: 'Counts as CANCELED — adds to cancel rate',
    noAction: 'Not canceled',
    fieldType: 'yes_no' as const,
    formula: 'Cancel Rate = Canceled ÷ Total scheduled calls',
  },
  { 
    value: 'cash_collected', 
    label: 'Cash Collected', 
    description: 'Amount collected from this deal',
    yesAction: null,
    noAction: null,
    fieldType: 'number' as const,
    formula: 'Total Cash = Sum of all cash collected values',
  },
  { 
    value: 'custom', 
    label: 'Custom Metric', 
    description: 'Map to a custom metric you defined',
    yesAction: null,
    noAction: null,
    fieldType: 'any' as const,
    formula: null,
  },
] as const;

export type MetricMapping = typeof METRIC_MAPPINGS[number]['value'];

// Simplified CRM sync options - just Notes and Pipeline Stage
export const CRM_SYNC_OPTIONS = [
  { value: 'none', label: 'Do not sync', description: 'This field will not be sent to the CRM' },
  { value: 'note', label: 'Add to Notes', description: 'Include this field value in the contact notes' },
  { value: 'pipeline_stage', label: 'Pipeline Stage', description: 'Move the contact to a specific pipeline stage based on this field' },
] as const;

export type CRMSyncType = typeof CRM_SYNC_OPTIONS[number]['value'];

export interface CRMSyncConfig {
  syncType: CRMSyncType;
  pipelineId?: string; // GHL pipeline ID
  stageMapping?: Record<string, string>; // field value -> stage ID
  includeInNote?: boolean; // Also include in note summary
}

interface GHLPipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
}

export interface FormFieldConfig {
  id: string;
  type: 'text' | 'number' | 'textarea' | 'select' | 'yes_no' | 'date' | 'checkbox' | 'pipeline_status';
  label: string;
  required: boolean;
  placeholder?: string;
  defaultValue?: string | number | boolean;
  options?: { label: string; value: string }[];
  conditionalOn?: string;
  conditionalValue?: string;
  mapsToMetric?: MetricMapping;
  customMetricId?: string;
  crmSync?: CRMSyncConfig; // NEW: CRM sync configuration
}

const FIELD_TYPES = [
  { value: 'yes_no', label: 'Yes/No Buttons' },
  { value: 'text', label: 'Text Input' },
  { value: 'number', label: 'Number Input' },
  { value: 'textarea', label: 'Text Area' },
  { value: 'select', label: 'Dropdown' },
  { value: 'date', label: 'Date Picker' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'pipeline_status', label: 'Pipeline Status (Dynamic)' },
];

const DEFAULT_FIELDS: FormFieldConfig[] = [
  { id: 'lead_showed', type: 'yes_no', label: 'Did the lead show up?', required: true, mapsToMetric: 'show_rate' },
  { id: 'offer_made', type: 'yes_no', label: 'Was an offer made?', required: true, mapsToMetric: 'offer_rate', conditionalOn: 'lead_showed', conditionalValue: 'yes' },
  { id: 'deal_closed', type: 'yes_no', label: 'Did they close?', required: true, mapsToMetric: 'close_rate', conditionalOn: 'offer_made', conditionalValue: 'yes' },
  { id: 'pipeline_status', type: 'pipeline_status', label: 'Pipeline Status', required: false, mapsToMetric: 'none' },
  { id: 'notes', type: 'textarea', label: 'Notes', required: false, placeholder: 'Add any notes about the call...', mapsToMetric: 'none' },
];

export function PCFFormBuilder() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FormFieldConfig[]>(DEFAULT_FIELDS);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Fetch custom metrics for the "custom" mapping option
  const { data: customMetrics } = useMetricDefinitions();

  // Fetch GHL pipelines for CRM sync configuration
  const { data: ghlPipelines, isLoading: pipelinesLoading } = useQuery({
    queryKey: ['ghl-pipelines', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-ghl-pipelines', {
        body: { organization_id: currentOrganization?.id },
      });
      if (error) throw error;
      return data?.pipelines as GHLPipeline[] || [];
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch existing form config
  const { data: formConfig, isLoading } = useQuery({
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
      if (data && data.fields) {
        setFields(data.fields as unknown as FormFieldConfig[]);
      }
      return data;
    },
    enabled: !!currentOrganization?.id,
  });

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) throw new Error('No organization');
      
      const payload = {
        organization_id: currentOrganization.id,
        form_type: 'post_call_form',
        name: 'Post-Call Form',
        fields: JSON.parse(JSON.stringify(fields)),
        is_active: true,
        is_default: true,
      };

      if (formConfig?.id) {
        const { error } = await supabase
          .from('form_configs')
          .update(payload)
          .eq('id', formConfig.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('form_configs')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-config'] });
      setHasUnsavedChanges(false);
      toast({ title: 'Form saved', description: 'Your PCF configuration has been saved.' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const addField = () => {
    const newField: FormFieldConfig = {
      id: `field_${Date.now()}`,
      type: 'text',
      label: 'New Field',
      required: false,
      mapsToMetric: 'none',
    };
    setFields([...fields, newField]);
    setEditingFieldId(newField.id);
    setHasUnsavedChanges(true);
  };

  const removeField = (id: string) => {
    setFields(fields.filter(f => f.id !== id));
    setHasUnsavedChanges(true);
  };

  const updateField = (id: string, updates: Partial<FormFieldConfig>) => {
    setFields(fields.map(f => f.id === id ? { ...f, ...updates } : f));
    setHasUnsavedChanges(true);
  };

  const moveField = (index: number, direction: 'up' | 'down') => {
    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= fields.length) return;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFields(newFields);
    setHasUnsavedChanges(true);
  };

  const resetToDefault = () => {
    setFields(DEFAULT_FIELDS);
    setHasUnsavedChanges(true);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5" />
              Post-Call Form Builder
            </CardTitle>
            <CardDescription className="mt-1">
              Customize the fields your team sees when submitting post-call forms
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetToDefault}>
              Reset to Default
            </Button>
            <Button 
              size="sm" 
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !hasUnsavedChanges}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Form
            </Button>
          </div>
        </div>
        {hasUnsavedChanges && (
          <Badge variant="outline" className="w-fit mt-2 text-orange-600 border-orange-300">
            Unsaved changes
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.map((field, index) => (
          <div
            key={field.id}
            className={cn(
              "border rounded-lg p-4 transition-all",
              editingFieldId === field.id ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <div className="flex items-start gap-3">
              <div className="flex flex-col gap-1 pt-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveField(index, 'up')}
                  disabled={index === 0}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <GripVertical className="h-4 w-4 text-muted-foreground mx-auto" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => moveField(index, 'down')}
                  disabled={index === fields.length - 1}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
              
              <div className="flex-1 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary">{FIELD_TYPES.find(t => t.value === field.type)?.label}</Badge>
                    {field.required && <Badge variant="destructive" className="text-xs">Required</Badge>}
                    {field.mapsToMetric && field.mapsToMetric !== 'none' && (
                      <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {METRIC_MAPPINGS.find(m => m.value === field.mapsToMetric)?.label || 
                          customMetrics?.find(m => m.id === field.customMetricId)?.display_name || 
                          'Metric'}
                      </Badge>
                    )}
                    {field.conditionalOn && (
                      <Badge variant="outline" className="text-xs">
                        <EyeOff className="h-3 w-3 mr-1" />
                        Conditional
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingFieldId(editingFieldId === field.id ? null : field.id)}
                    >
                      <Settings2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeField(field.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="font-medium">{field.label}</div>

                {editingFieldId === field.id && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t">
                    <div className="space-y-2">
                      <Label>Field Label</Label>
                      <Input
                        value={field.label}
                        onChange={(e) => updateField(field.id, { label: e.target.value })}
                        placeholder="Field label"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Field Type</Label>
                      <Select
                        value={field.type}
                        onValueChange={(val) => updateField(field.id, { type: val as FormFieldConfig['type'] })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          {FIELD_TYPES.map((type) => (
                            <SelectItem key={type.value} value={type.value}>
                              {type.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Placeholder</Label>
                      <Input
                        value={field.placeholder || ''}
                        onChange={(e) => updateField(field.id, { placeholder: e.target.value })}
                        placeholder="Placeholder text..."
                      />
                    </div>
                    <div className="flex items-center gap-4 pt-6">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.required}
                          onCheckedChange={(checked) => updateField(field.id, { required: checked })}
                        />
                        <Label>Required</Label>
                      </div>
                    </div>

                    {/* Metric Mapping Section */}
                    <div className="col-span-2">
                      <Separator className="my-2" />
                      <div className="space-y-3">
                        <Label className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-primary" />
                          Maps to Metric
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Link this field's response to a dashboard metric for automatic calculation
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Metric Type</Label>
                            <Select
                              value={field.mapsToMetric || 'none'}
                              onValueChange={(val) => updateField(field.id, { 
                                mapsToMetric: val as MetricMapping,
                                customMetricId: val !== 'custom' ? undefined : field.customMetricId
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select metric..." />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                {METRIC_MAPPINGS.map((metric) => (
                                  <SelectItem key={metric.value} value={metric.value}>
                                    <div className="flex flex-col">
                                      <span>{metric.label}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {field.mapsToMetric === 'custom' && (
                            <CustomMetricSelector
                              field={field}
                              customMetrics={customMetrics || []}
                              onSelectMetric={(metricId) => updateField(field.id, { customMetricId: metricId })}
                              organizationId={currentOrganization?.id}
                              onMetricCreated={(metricId) => {
                                updateField(field.id, { customMetricId: metricId });
                                queryClient.invalidateQueries({ queryKey: ['metric-definitions'] });
                              }}
                            />
                          )}
                        </div>
                        
                        {/* Detailed metric explanation */}
                        {field.mapsToMetric && field.mapsToMetric !== 'none' && field.mapsToMetric !== 'custom' && (() => {
                          const metricInfo = METRIC_MAPPINGS.find(m => m.value === field.mapsToMetric);
                          if (!metricInfo) return null;
                          return (
                            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                              <p className="text-sm font-medium text-foreground">{metricInfo.description}</p>
                              {metricInfo.formula && (
                                <p className="text-xs text-muted-foreground font-mono bg-background px-2 py-1 rounded">
                                  {metricInfo.formula}
                                </p>
                              )}
                              {(field.type === 'yes_no' || field.type === 'checkbox') && metricInfo.yesAction && (
                                <div className="grid grid-cols-2 gap-2 pt-1">
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5 w-5 h-5 rounded bg-green-500/20 text-green-600 flex items-center justify-center text-xs font-bold">✓</div>
                                    <div className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground">Yes</span> → {metricInfo.yesAction}
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2">
                                    <div className="mt-0.5 w-5 h-5 rounded bg-red-500/20 text-red-600 flex items-center justify-center text-xs font-bold">✗</div>
                                    <div className="text-xs text-muted-foreground">
                                      <span className="font-medium text-foreground">No</span> → {metricInfo.noAction}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {field.type === 'number' && field.mapsToMetric === 'cash_collected' && (
                                <p className="text-xs text-muted-foreground">
                                  The number entered will be added to your total cash collected on the dashboard.
                                </p>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {field.type === 'select' && (
                      <div className="col-span-2 space-y-3">
                        <Label>Dropdown Options</Label>
                        <div className="space-y-2">
                          {/* List of existing options */}
                          <div className="flex flex-wrap gap-2">
                            {field.options?.map((option, idx) => (
                              <Badge 
                                key={idx} 
                                variant="secondary" 
                                className="flex items-center gap-1 py-1.5 px-3"
                              >
                                {option.label}
                                <button
                                  type="button"
                                  className="ml-1 hover:text-destructive"
                                  onClick={() => {
                                    const newOptions = field.options?.filter((_, i) => i !== idx);
                                    updateField(field.id, { options: newOptions });
                                  }}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                          {/* Add new option input */}
                          <div className="flex gap-2">
                            <Input
                              placeholder="Add new option..."
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                  e.preventDefault();
                                  const label = e.currentTarget.value.trim();
                                  const newOption = {
                                    label,
                                    value: label.toLowerCase().replace(/\s+/g, '_'),
                                  };
                                  const currentOptions = field.options || [];
                                  updateField(field.id, { options: [...currentOptions, newOption] });
                                  e.currentTarget.value = '';
                                }
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                                if (input.value.trim()) {
                                  const label = input.value.trim();
                                  const newOption = {
                                    label,
                                    value: label.toLowerCase().replace(/\s+/g, '_'),
                                  };
                                  const currentOptions = field.options || [];
                                  updateField(field.id, { options: [...currentOptions, newOption] });
                                  input.value = '';
                                }
                              }}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Press Enter or click + to add each option
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="col-span-2">
                      <Separator className="my-2" />
                      <div className="space-y-3">
                        <Label className="text-muted-foreground">Conditional Logic (Optional)</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm">Show when field:</Label>
                            <Select
                              value={field.conditionalOn || 'none'}
                              onValueChange={(val) => updateField(field.id, { conditionalOn: val === 'none' ? undefined : val })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="None" />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                <SelectItem value="none">None</SelectItem>
                                {fields.filter(f => f.id !== field.id).map((f) => (
                                  <SelectItem key={f.id} value={f.id}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          {field.conditionalOn && (
                            <div className="space-y-2">
                              <Label className="text-sm">Has value:</Label>
                              <Input
                                value={field.conditionalValue || ''}
                                onChange={(e) => updateField(field.id, { conditionalValue: e.target.value })}
                                placeholder="yes, no, specific value..."
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* CRM Sync Configuration Section */}
                    <div className="col-span-2">
                      <Separator className="my-2" />
                      <Collapsible>
                        <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:text-primary transition-colors">
                          <Link2 className="h-4 w-4" />
                          CRM Sync Settings
                          <Badge variant="outline" className="text-xs ml-2">
                            {field.crmSync?.syncType === 'none' || !field.crmSync ? 'Not synced' : 
                             field.crmSync.syncType === 'note' ? 'Notes' :
                             field.crmSync.syncType === 'pipeline_stage' ? 'Pipeline' : 'Unknown'}
                          </Badge>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="pt-3 space-y-3">
                          <p className="text-xs text-muted-foreground">
                            Configure how this field's data is synced to your CRM when the form is submitted
                          </p>
                          
                          <div className="space-y-2">
                            <Label className="text-sm">Sync Type</Label>
                            <Select
                              value={field.crmSync?.syncType || 'none'}
                              onValueChange={(val) => updateField(field.id, { 
                                crmSync: { 
                                  ...field.crmSync, 
                                  syncType: val as CRMSyncConfig['syncType'] 
                                }
                              })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select sync type..." />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                {CRM_SYNC_OPTIONS.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    <div className="flex items-center gap-2">
                                      {option.value === 'note' && <FileText className="h-3 w-3" />}
                                      {option.value === 'pipeline_stage' && <GitBranch className="h-3 w-3" />}
                                      {option.label}
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                              {CRM_SYNC_OPTIONS.find(o => o.value === (field.crmSync?.syncType || 'none'))?.description}
                            </p>
                          </div>

                          {/* Pipeline Stage configuration */}
                          {field.crmSync?.syncType === 'pipeline_stage' && (
                            <div className="space-y-3">
                              {pipelinesLoading ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                  Loading pipelines from GHL...
                                </div>
                              ) : ghlPipelines && ghlPipelines.length > 0 ? (
                                <>
                                  <div className="space-y-2">
                                    <Label className="text-sm">Select Pipeline</Label>
                                    <Select
                                      value={field.crmSync?.pipelineId || ''}
                                      onValueChange={(pipelineId) => {
                                        const selectedPipeline = ghlPipelines.find(p => p.id === pipelineId);
                                        // Auto-populate field options with the pipeline stages
                                        const stageOptions = selectedPipeline?.stages.map(stage => ({
                                          label: stage.name,
                                          value: stage.id, // Store stage ID as the value
                                        })) || [];
                                        
                                        updateField(field.id, { 
                                          type: 'select', // Ensure it's a select type
                                          options: stageOptions,
                                          crmSync: { 
                                            ...field.crmSync!, 
                                            pipelineId: pipelineId,
                                          }
                                        });
                                      }}
                                    >
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select a pipeline..." />
                                      </SelectTrigger>
                                      <SelectContent className="bg-popover z-50">
                                        {ghlPipelines.map((pipeline) => (
                                          <SelectItem key={pipeline.id} value={pipeline.id}>
                                            {pipeline.name}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  {field.crmSync?.pipelineId && (() => {
                                    const selectedPipeline = ghlPipelines.find(p => p.id === field.crmSync?.pipelineId);
                                    if (!selectedPipeline) return null;

                                    return (
                                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 space-y-2">
                                        <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                          <GitBranch className="h-4 w-4" />
                                          <span className="text-sm font-medium">Pipeline Connected</span>
                                        </div>
                                        <p className="text-xs text-green-600 dark:text-green-500">
                                          This field will show {selectedPipeline.stages.length} stages as options:
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                          {selectedPipeline.stages.map((stage) => (
                                            <Badge key={stage.id} variant="secondary" className="text-xs">
                                              {stage.name}
                                            </Badge>
                                          ))}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-2">
                                          When a user selects a stage, the lead will automatically be moved to that stage in GHL.
                                        </p>
                                      </div>
                                    );
                                  })()}
                                </>
                              ) : (
                                <div className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                                  <p className="font-medium">No pipelines found</p>
                                  <p className="text-xs mt-1">
                                    Make sure GHL is connected in Settings → Integrations and you have pipelines set up in your GHL account.
                                  </p>
                                </div>
                              )}

                              {/* Also include in notes option */}
                              <div className="flex items-center gap-2 pt-2">
                                <Switch
                                  checked={field.crmSync?.includeInNote || false}
                                  onCheckedChange={(checked) => updateField(field.id, { 
                                    crmSync: { ...field.crmSync!, includeInNote: checked }
                                  })}
                                />
                                <Label className="text-sm">Also add to contact notes</Label>
                              </div>
                            </div>
                          )}
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}

        <Button
          variant="outline"
          className="w-full border-dashed"
          onClick={addField}
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Field
        </Button>
      </CardContent>
    </Card>
  );
}