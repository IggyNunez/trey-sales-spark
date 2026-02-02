import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Plus, 
  GripVertical, 
  Trash2, 
  Settings, 
  ChevronDown,
  ChevronUp,
  Save,
  ArrowLeft,
  ToggleLeft,
  Hash,
  DollarSign,
  Type,
  AlignLeft,
  ChevronDownIcon,
  CheckSquare,
  Calendar,
  BarChart,
  Database,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  useFormDefinition,
  useFormFields,
  useCreateFormField,
  useUpdateFormField,
  useDeleteFormField,
  useUpdateFormDefinition,
  generateSlug,
} from '@/hooks/useDynamicForms';
import { useDatasets } from '@/hooks/useWebhookDashboard';
import { 
  FIELD_TYPE_OPTIONS, 
  FORMULA_TYPE_OPTIONS,
  type FormField,
  type FieldType,
  type FieldOption,
  type ConditionalLogic,
  type MetricConfig,
} from '@/types/dynamicForms';

const fieldTypeIcons: Record<FieldType, React.ReactNode> = {
  boolean: <ToggleLeft className="h-4 w-4" />,
  number: <Hash className="h-4 w-4" />,
  currency: <DollarSign className="h-4 w-4" />,
  text: <Type className="h-4 w-4" />,
  textarea: <AlignLeft className="h-4 w-4" />,
  select: <ChevronDownIcon className="h-4 w-4" />,
  multi_select: <CheckSquare className="h-4 w-4" />,
  date: <Calendar className="h-4 w-4" />,
};

interface FieldEditorProps {
  field: FormField;
  allFields: FormField[];
  onUpdate: (updates: Partial<FormField>) => void;
  onDelete: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
}

function FieldEditor({ field, allFields, onUpdate, onDelete, isExpanded, onToggleExpand }: FieldEditorProps) {
  const [options, setOptions] = useState<FieldOption[]>(field.options || []);
  const [newOptionLabel, setNewOptionLabel] = useState('');

  const handleAddOption = () => {
    if (!newOptionLabel.trim()) return;
    const newOption: FieldOption = {
      value: generateSlug(newOptionLabel),
      label: newOptionLabel.trim(),
    };
    const updatedOptions = [...options, newOption];
    setOptions(updatedOptions);
    onUpdate({ options: updatedOptions });
    setNewOptionLabel('');
  };

  const handleRemoveOption = (index: number) => {
    const updatedOptions = options.filter((_, i) => i !== index);
    setOptions(updatedOptions);
    onUpdate({ options: updatedOptions });
  };

  const otherFields = allFields.filter(f => f.id !== field.id);

  return (
    <Card className="border-l-4 border-l-primary/50">
      <Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <div className="flex items-center gap-2">
                  {fieldTypeIcons[field.field_type]}
                  <span className="font-medium">{field.label}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  {FIELD_TYPE_OPTIONS.find(t => t.value === field.field_type)?.label}
                </Badge>
                {field.is_required && (
                  <Badge variant="secondary" className="text-xs">Required</Badge>
                )}
                {field.creates_metric && (
                  <Badge className="text-xs bg-primary/20 text-primary">
                    <BarChart className="h-3 w-3 mr-1" />
                    Metric
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="space-y-4 pt-0">
            {/* Basic Settings */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Label</Label>
                <Input
                  value={field.label}
                  onChange={(e) => onUpdate({ label: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={field.field_type}
                  onValueChange={(value: FieldType) => onUpdate({ field_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_OPTIONS.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div className="flex items-center gap-2">
                          {fieldTypeIcons[type.value]}
                          {type.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Placeholder</Label>
                <Input
                  value={field.placeholder || ''}
                  onChange={(e) => onUpdate({ placeholder: e.target.value })}
                  placeholder="Enter placeholder text..."
                />
              </div>
              <div className="space-y-2">
                <Label>Help Text</Label>
                <Input
                  value={field.help_text || ''}
                  onChange={(e) => onUpdate({ help_text: e.target.value })}
                  placeholder="Additional instructions..."
                />
              </div>
            </div>

            {/* Options for select/multi_select */}
            {(field.field_type === 'select' || field.field_type === 'multi_select') && (
              <div className="space-y-2">
                <Label>Options</Label>
                <div className="space-y-2">
                  {options.map((option, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input value={option.label} readOnly className="flex-1" />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Input
                      value={newOptionLabel}
                      onChange={(e) => setNewOptionLabel(e.target.value)}
                      placeholder="Add option..."
                      onKeyDown={(e) => e.key === 'Enter' && handleAddOption()}
                    />
                    <Button variant="outline" size="icon" onClick={handleAddOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Toggles */}
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.is_required}
                  onCheckedChange={(checked) => onUpdate({ is_required: checked })}
                />
                <Label>Required</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.show_in_summary}
                  onCheckedChange={(checked) => onUpdate({ show_in_summary: checked })}
                />
                <Label>Show in Summary</Label>
              </div>
            </div>

            {/* Conditional Logic */}
            {otherFields.length > 0 && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <Settings className="h-4 w-4" />
                    Conditional Logic
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Show this field only when:
                      </p>
                      <div className="grid grid-cols-3 gap-2">
                        <Select
                          value={field.conditional_logic?.conditions?.[0]?.field_slug || '__none__'}
                          onValueChange={(value) => {
                            if (value === '__none__') {
                              onUpdate({ conditional_logic: undefined });
                              return;
                            }
                            const newLogic: ConditionalLogic = {
                              conditions: [{
                                field_slug: value,
                                operator: 'equals',
                                value: true,
                              }],
                              logic: 'AND',
                            };
                            onUpdate({ conditional_logic: newLogic });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select field..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No condition</SelectItem>
                            {otherFields.map(f => (
                              <SelectItem key={f.id} value={f.field_slug}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {field.conditional_logic?.conditions?.[0]?.field_slug && (
                          <>
                            <Select
                              value={field.conditional_logic?.conditions?.[0]?.operator || 'equals'}
                              onValueChange={(value: any) => {
                                if (field.conditional_logic) {
                                  const newLogic = { ...field.conditional_logic };
                                  newLogic.conditions[0].operator = value;
                                  onUpdate({ conditional_logic: newLogic });
                                }
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="equals">Equals</SelectItem>
                                <SelectItem value="not_equals">Not Equals</SelectItem>
                                <SelectItem value="greater_than">Greater Than</SelectItem>
                                <SelectItem value="less_than">Less Than</SelectItem>
                              </SelectContent>
                            </Select>
                            <Input
                              value={String(field.conditional_logic?.conditions?.[0]?.value || '')}
                              onChange={(e) => {
                                if (field.conditional_logic) {
                                  const newLogic = { ...field.conditional_logic };
                                  newLogic.conditions[0].value = e.target.value;
                                  onUpdate({ conditional_logic: newLogic });
                                }
                              }}
                              placeholder="Value..."
                            />
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Metric Configuration */}
            {(field.field_type === 'number' || field.field_type === 'currency' || field.field_type === 'boolean') && (
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <BarChart className="h-4 w-4" />
                    Metric Configuration
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <Card className="bg-muted/50">
                    <CardContent className="pt-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={field.creates_metric}
                          onCheckedChange={(checked) => {
                            onUpdate({ 
                              creates_metric: checked,
                              metric_config: checked ? {
                                metric_type: field.field_type === 'boolean' ? 'count' : 'sum',
                                display_name: field.label,
                                format: field.field_type === 'currency' ? 'currency' : 'number',
                              } : undefined,
                            });
                          }}
                        />
                        <Label>Create Dashboard Metric</Label>
                      </div>

                      {field.creates_metric && field.metric_config && (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-xs">Display Name</Label>
                              <Input
                                value={field.metric_config.display_name || ''}
                                onChange={(e) => onUpdate({ 
                                  metric_config: { ...field.metric_config, display_name: e.target.value } 
                                })}
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Formula Type</Label>
                              <Select
                                value={field.metric_config.metric_type || 'sum'}
                                onValueChange={(value: any) => onUpdate({ 
                                  metric_config: { ...field.metric_config, metric_type: value } 
                                })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FORMULA_TYPE_OPTIONS.map(f => (
                                    <SelectItem key={f.value} value={f.value}>
                                      {f.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Delete Button */}
            <div className="flex justify-end pt-2">
              <Button variant="destructive" size="sm" onClick={onDelete}>
                <Trash2 className="h-4 w-4 mr-2" />
                Remove Field
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

export function DynamicFormBuilder() {
  const { formId } = useParams<{ formId: string }>();
  const navigate = useNavigate();
  
  const { data: formDefinition, isLoading: isLoadingForm } = useFormDefinition(formId);
  const { data: fields = [], isLoading: isLoadingFields } = useFormFields(formId);
  const { data: datasets = [] } = useDatasets();
  
  const createField = useCreateFormField();
  const updateField = useUpdateFormField();
  const deleteField = useDeleteFormField();
  const updateFormDef = useUpdateFormDefinition();

  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [isAddFieldDialogOpen, setIsAddFieldDialogOpen] = useState(false);
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

  const handleAddField = async () => {
    if (!formId || !newFieldLabel.trim()) return;

    await createField.mutateAsync({
      form_definition_id: formId,
      field_name: generateSlug(newFieldLabel),
      field_slug: generateSlug(newFieldLabel),
      label: newFieldLabel.trim(),
      field_type: newFieldType,
      sort_order: fields.length,
    });

    setNewFieldLabel('');
    setNewFieldType('text');
    setIsAddFieldDialogOpen(false);
  };

  const handleUpdateField = (fieldId: string, updates: Partial<FormField>) => {
    updateField.mutate({ id: fieldId, ...updates });
  };

  const handleDeleteField = (fieldId: string) => {
    if (!formId) return;
    deleteField.mutate({ fieldId, formDefinitionId: formId });
  };

  if (isLoadingForm || isLoadingFields) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!formDefinition) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Form not found</p>
        <Button variant="link" onClick={() => navigate('/settings')}>
          Go back to settings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{formDefinition.name}</h1>
            <p className="text-muted-foreground">{formDefinition.description || 'Configure form fields'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">{formDefinition.entity_type}</Badge>
          {formDefinition.is_recurring && (
            <Badge variant="secondary">{formDefinition.recurrence_pattern}</Badge>
          )}
        </div>
      </div>

      {/* Form Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Form Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Form Name</Label>
              <Input
                value={formDefinition.name}
                onChange={(e) => updateFormDef.mutate({ id: formDefinition.id, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formDefinition.description || ''}
                onChange={(e) => updateFormDef.mutate({ id: formDefinition.id, description: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Sync */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Dashboard Sync
          </CardTitle>
          <CardDescription>
            Link this form to a Dataset to automatically sync submissions to dashboard widgets
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Sync to Dataset</Label>
            <div className="flex gap-2">
              <Select
                value={formDefinition.dataset_id || 'none'}
                onValueChange={(value) => 
                  updateFormDef.mutate({ 
                    id: formDefinition.id, 
                    dataset_id: value === 'none' ? null : value 
                  } as any)
                }
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select a dataset..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">No sync (disabled)</span>
                  </SelectItem>
                  {datasets.map(ds => (
                    <SelectItem key={ds.id} value={ds.id}>
                      <div className="flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {ds.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formDefinition.dataset_id && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    // Re-trigger the update to sync fields
                    updateFormDef.mutate({ 
                      id: formDefinition.id, 
                      dataset_id: formDefinition.dataset_id 
                    } as any);
                  }}
                  disabled={updateFormDef.isPending}
                >
                  Sync Fields
                </Button>
              )}
            </div>
            {formDefinition.dataset_id && (
              <p className="text-xs text-muted-foreground">
                Form submissions will automatically create records in this dataset. 
                Click "Sync Fields" after adding new form fields to make them available in widgets.
              </p>
            )}
            {datasets.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No datasets found. Create a dataset first in Settings → Webhook Dashboard → Datasets.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Fields List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Form Fields</CardTitle>
          <Button onClick={() => setIsAddFieldDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </CardHeader>
        <CardContent>
          {fields.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No fields yet. Add your first field to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {fields.map((field) => (
                <FieldEditor
                  key={field.id}
                  field={field}
                  allFields={fields}
                  onUpdate={(updates) => handleUpdateField(field.id, updates)}
                  onDelete={() => handleDeleteField(field.id)}
                  isExpanded={expandedFieldId === field.id}
                  onToggleExpand={() => setExpandedFieldId(
                    expandedFieldId === field.id ? null : field.id
                  )}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Field Dialog */}
      <Dialog open={isAddFieldDialogOpen} onOpenChange={setIsAddFieldDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Field</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Field Label</Label>
              <Input
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
                placeholder="e.g., Deals Closed, Notes, Qualification Score"
              />
            </div>
            <div className="space-y-2">
              <Label>Field Type</Label>
              <Select value={newFieldType} onValueChange={(v: FieldType) => setNewFieldType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPE_OPTIONS.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        {fieldTypeIcons[type.value]}
                        {type.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddFieldDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddField} disabled={!newFieldLabel.trim()}>
              Add Field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
