import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Calculator, Plus, Trash2, Edit2, BarChart3, Calendar, GitBranch, Check, X, Lightbulb } from 'lucide-react';
import {
  useCalculatedFields,
  useCreateCalculatedField,
  useUpdateCalculatedField,
  useDeleteCalculatedField,
  CalculatedField,
  FormulaType,
  FORMULA_TYPE_OPTIONS,
  TIME_SCOPE_OPTIONS,
  REFRESH_MODE_OPTIONS,
  FORMULA_EXAMPLES,
} from '@/hooks/useCalculatedFields';
import { useDatasetFields, DatasetField } from '@/hooks/useWebhookDashboard';
import { validateFormula, detectCircularDependency } from '@/lib/calculationEngine';

interface CalculatedFieldsBuilderProps {
  datasetId: string;
}

export function CalculatedFieldsBuilder({ datasetId }: CalculatedFieldsBuilderProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CalculatedField | null>(null);
  const [formulaError, setFormulaError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    field_slug: '',
    display_name: '',
    formula_type: 'expression' as FormulaType,
    formula: '',
    time_scope: 'all' as const,
    refresh_mode: 'realtime' as const,
  });

  const { data: calculatedFields = [], isLoading } = useCalculatedFields(datasetId);
  const { data: datasetFields = [] } = useDatasetFields(datasetId);
  const createField = useCreateCalculatedField();
  const updateField = useUpdateCalculatedField();
  const deleteField = useDeleteCalculatedField();

  const resetForm = () => {
    setFormData({
      field_slug: '',
      display_name: '',
      formula_type: 'expression',
      formula: '',
      time_scope: 'all',
      refresh_mode: 'realtime',
    });
    setEditingField(null);
    setFormulaError(null);
  };

  const handleOpenDialog = (field?: CalculatedField) => {
    if (field) {
      setEditingField(field);
      setFormData({
        field_slug: field.field_slug,
        display_name: field.display_name,
        formula_type: field.formula_type,
        formula: field.formula,
        time_scope: field.time_scope as typeof formData.time_scope,
        refresh_mode: field.refresh_mode as typeof formData.refresh_mode,
      });
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleFormulaChange = (value: string) => {
    setFormData(prev => ({ ...prev, formula: value }));
    
    // Validate on change with circular dependency detection
    if (value.trim()) {
      const validation = validateFormula(
        value, 
        formData.formula_type,
        calculatedFields,
        formData.field_slug || editingField?.field_slug
      );
      setFormulaError(validation.valid ? null : validation.error || null);
    } else {
      setFormulaError(null);
    }
  };

  const handleSave = async () => {
    if (!formData.field_slug || !formData.display_name || !formData.formula) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate with circular dependency detection
    const validation = validateFormula(
      formData.formula, 
      formData.formula_type,
      calculatedFields,
      formData.field_slug
    );
    if (!validation.valid) {
      toast.error(validation.error || 'Invalid formula');
      return;
    }

    try {
      if (editingField) {
        await updateField.mutateAsync({
          id: editingField.id,
          ...formData,
        });
        toast.success('Calculated field updated');
      } else {
        await createField.mutateAsync({
          dataset_id: datasetId,
          ...formData,
        });
        toast.success('Calculated field created');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (err) {
      toast.error('Failed to save calculated field');
    }
  };

  const handleDelete = async (field: CalculatedField) => {
    if (!confirm(`Delete calculated field "${field.display_name}"?`)) return;

    try {
      await deleteField.mutateAsync({ id: field.id, datasetId });
      toast.success('Calculated field deleted');
    } catch (err) {
      toast.error('Failed to delete calculated field');
    }
  };

  const handleToggleActive = async (field: CalculatedField) => {
    try {
      await updateField.mutateAsync({
        id: field.id,
        is_active: !field.is_active,
      });
      toast.success(field.is_active ? 'Field disabled' : 'Field enabled');
    } catch (err) {
      toast.error('Failed to update field');
    }
  };

  const getFormulaIcon = (type: FormulaType) => {
    switch (type) {
      case 'expression': return <Calculator className="h-4 w-4" />;
      case 'aggregation': return <BarChart3 className="h-4 w-4" />;
      case 'date_diff': return <Calendar className="h-4 w-4" />;
      case 'conditional': return <GitBranch className="h-4 w-4" />;
    }
  };

  const insertFieldReference = (fieldSlug: string) => {
    setFormData(prev => ({
      ...prev,
      formula: prev.formula ? `${prev.formula} ${fieldSlug}` : fieldSlug,
    }));
  };

  const insertExample = (formula: string) => {
    setFormData(prev => ({ ...prev, formula }));
    // Re-validate with current formula type
    setTimeout(() => {
      const validation = validateFormula(formula, formData.formula_type);
      setFormulaError(validation.valid ? null : validation.error || null);
    }, 0);
  };

  if (isLoading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Calculated Fields
          </CardTitle>
          <CardDescription>
            Create computed fields using math, aggregations, and date calculations
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Add Field
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingField ? 'Edit Calculated Field' : 'Create Calculated Field'}
              </DialogTitle>
              <DialogDescription>
                Define a formula to compute values from your dataset fields
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="field_slug">Field Slug</Label>
                  <Input
                    id="field_slug"
                    placeholder="e.g., commission_amount"
                    value={formData.field_slug}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      field_slug: e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
                    }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="display_name">Display Name</Label>
                  <Input
                    id="display_name"
                    placeholder="e.g., Commission Amount"
                    value={formData.display_name}
                    onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Formula Type */}
              <div className="space-y-2">
                <Label>Formula Type</Label>
                <div className="grid grid-cols-2 gap-2">
                  {FORMULA_TYPE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`p-3 rounded-lg border text-left transition-colors ${
                        formData.formula_type === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                      }`}
                      onClick={() => {
                        setFormData(prev => ({ ...prev, formula_type: option.value as FormulaType }));
                        setFormulaError(null);
                      }}
                    >
                      <div className="flex items-center gap-2 font-medium">
                        {getFormulaIcon(option.value as FormulaType)}
                        {option.label}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Formula Editor */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="formula">Formula</Label>
                  {formulaError ? (
                    <span className="text-xs text-destructive flex items-center gap-1">
                      <X className="h-3 w-3" /> {formulaError}
                    </span>
                  ) : formData.formula && (
                    <span className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" /> Valid syntax
                    </span>
                  )}
                </div>
                <Textarea
                  id="formula"
                  placeholder="e.g., amount * 0.1"
                  value={formData.formula}
                  onChange={(e) => handleFormulaChange(e.target.value)}
                  className="font-mono text-sm"
                  rows={3}
                />
              </div>

              {/* Formula Examples & Field References */}
              <Tabs defaultValue="examples" className="w-full">
                <TabsList className="w-full">
                  <TabsTrigger value="examples" className="flex-1">
                    <Lightbulb className="h-3 w-3 mr-1" />
                    Examples
                  </TabsTrigger>
                  <TabsTrigger value="fields" className="flex-1">
                    Available Fields
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="examples" className="mt-2">
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {FORMULA_EXAMPLES[formData.formula_type]?.map((example) => (
                      <button
                        key={example.formula}
                        type="button"
                        className="text-left p-2 rounded border border-border hover:bg-muted/50 transition-colors"
                        onClick={() => insertExample(example.formula)}
                      >
                        <div className="font-mono text-xs text-primary">{example.formula}</div>
                        <div className="text-xs text-muted-foreground">{example.description}</div>
                      </button>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="fields" className="mt-2">
                  <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                    {datasetFields.map((field) => (
                      <button
                        key={field.id}
                        type="button"
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors border-border cursor-pointer hover:bg-primary hover:text-primary-foreground"
                        onClick={() => insertFieldReference(field.field_slug)}
                      >
                        {field.field_slug}
                        <span className="ml-1 opacity-70">({field.field_type})</span>
                      </button>
                    ))}
                    {datasetFields.length === 0 && (
                      <p className="text-sm text-muted-foreground">No fields defined yet</p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {/* Settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Time Scope</Label>
                  <Select
                    value={formData.time_scope}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, time_scope: value as typeof formData.time_scope }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SCOPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Refresh Mode</Label>
                  <Select
                    value={formData.refresh_mode}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, refresh_mode: value as typeof formData.refresh_mode }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFRESH_MODE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          <div>
                            <div>{option.label}</div>
                            <div className="text-xs text-muted-foreground">{option.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={createField.isPending || updateField.isPending || !!formulaError}
              >
                {editingField ? 'Update' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {calculatedFields.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Calculator className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No calculated fields yet</p>
            <p className="text-sm">Add formulas to compute values automatically</p>
          </div>
        ) : (
          <div className="space-y-2">
            {calculatedFields.map((field) => (
              <div
                key={field.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  field.is_active ? 'bg-card' : 'bg-muted/50 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getFormulaIcon(field.formula_type)}
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {field.display_name}
                      <Badge variant="outline" className="text-xs">
                        {field.field_slug}
                      </Badge>
                    </div>
                    <code className="text-xs text-muted-foreground font-mono">
                      {field.formula}
                    </code>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-xs">
                    {field.refresh_mode}
                  </Badge>
                  <Switch
                    checked={field.is_active}
                    onCheckedChange={() => handleToggleActive(field)}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenDialog(field)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDelete(field)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
