import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Wand2, ArrowLeft, Loader2, Code, GripVertical, Eye, EyeOff, Calculator, Bell, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { 
  Dataset, 
  DatasetField,
  useDatasetFields, 
  useCreateDatasetField, 
  useUpdateDatasetField,
  useDeleteDatasetField 
} from '@/hooks/useWebhookDashboard';
import { CalculatedFieldsBuilder } from './CalculatedFieldsBuilder';
import { AlertsManager } from './AlertsManager';
import { EnrichmentManager } from './EnrichmentManager';

interface DatasetSchemaBuilderProps {
  dataset: Dataset;
  onBack: () => void;
}

const FIELD_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'Date & Time' },
  { value: 'json', label: 'JSON Object' },
  { value: 'array', label: 'Array' },
];

const SOURCE_TYPES = [
  { value: 'mapped', label: 'Mapped from JSON' },
  { value: 'calculated', label: 'Calculated' },
  { value: 'enriched', label: 'Enriched from DB' },
];

export function DatasetSchemaBuilder({ dataset, onBack }: DatasetSchemaBuilderProps) {
  const { data: fields, isLoading } = useDatasetFields(dataset.id);
  const createField = useCreateDatasetField();
  const updateField = useUpdateDatasetField();
  const deleteField = useDeleteDatasetField();

  const [isAddFieldOpen, setIsAddFieldOpen] = useState(false);
  const [sampleJson, setSampleJson] = useState('');
  const [detectedFields, setDetectedFields] = useState<Array<{ path: string; type: string; sample: any }>>([]);
  
  const [newField, setNewField] = useState({
    field_slug: '',
    field_name: '',
    field_type: 'text' as 'text' | 'number' | 'currency' | 'boolean' | 'date' | 'datetime' | 'json' | 'array',
    source_type: 'mapped' as 'mapped' | 'calculated' | 'enriched',
    source_config: {
      json_path: '',
      fallback_paths: [] as string[],
      default_value: null as any,
    },
    formula: '',
    format: '',
    is_visible: true,
    sort_order: 0,
  });

  const resetNewField = () => {
    setNewField({
      field_slug: '',
      field_name: '',
      field_type: 'text',
      source_type: 'mapped',
      source_config: {
        json_path: '',
        fallback_paths: [],
        default_value: null,
      },
      formula: '',
      format: '',
      is_visible: true,
      sort_order: 0,
    });
  };

  const handleAddFieldOpenChange = (open: boolean) => {
    setIsAddFieldOpen(open);
    if (!open) resetNewField();
  };

  const openBlankAddField = () => {
    resetNewField();
    setIsAddFieldOpen(true);
  };

  // Auto-detect fields from JSON
  const detectFieldsFromJson = () => {
    try {
      const parsed = JSON.parse(sampleJson);
      const detected = extractJsonPaths(parsed, '$');
      setDetectedFields(detected);
      toast.success(`Detected ${detected.length} fields`);
    } catch (e) {
      toast.error('Invalid JSON');
    }
  };

  const extractJsonPaths = (obj: any, prefix: string): Array<{ path: string; type: string; sample: any }> => {
    const paths: Array<{ path: string; type: string; sample: any }> = [];
    
    if (obj === null || obj === undefined) return paths;
    
    if (typeof obj !== 'object') {
      return [{ path: prefix, type: inferType(obj), sample: obj }];
    }
    
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        paths.push(...extractJsonPaths(obj[0], `${prefix}[0]`));
      }
      return paths;
    }
    
    for (const [key, value] of Object.entries(obj)) {
      const newPath = `${prefix}.${key}`;
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        paths.push(...extractJsonPaths(value, newPath));
      } else {
        paths.push({ path: newPath, type: inferType(value), sample: value });
      }
    }
    
    return paths;
  };

  const inferType = (value: any): string => {
    if (value === null || value === undefined) return 'text';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') {
      // Check if it looks like currency (has 2 decimal places or is cents)
      if (Number.isInteger(value) && value > 100) return 'currency';
      return 'number';
    }
    if (typeof value === 'string') {
      // Try to detect dates
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) return 'datetime';
      if (/^\d{10,13}$/.test(value)) return 'datetime'; // Unix timestamp
      return 'text';
    }
    if (Array.isArray(value)) return 'array';
    return 'json';
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const addFieldFromDetected = (detected: { path: string; type: string; sample: any }) => {
    const fieldName = detected.path.split('.').pop() || detected.path;
    setNewField({
      field_slug: slugify(fieldName),
      field_name: fieldName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      field_type: detected.type as any,
      source_type: 'mapped',
      source_config: {
        json_path: detected.path,
        fallback_paths: [],
        default_value: null,
      },
      formula: '',
      format: '',
      is_visible: true,
      sort_order: (fields?.length || 0) + 1,
    });
    setIsAddFieldOpen(true);
  };

  const handleCreateField = async () => {
    if (!newField.field_slug || !newField.field_name) {
      toast.error('Field slug and name are required');
      return;
    }

    try {
      await createField.mutateAsync({
        ...newField,
        dataset_id: dataset.id,
      });
      toast.success('Field added');
      setIsAddFieldOpen(false);
      resetNewField();
    } catch (error) {
      toast.error('Failed to add field');
    }
  };

  const handleDeleteField = async (fieldId: string, fieldSlug: string) => {
    if (!confirm('Delete this field?')) return;
    
    try {
      await deleteField.mutateAsync({ id: fieldId, datasetId: dataset.id, fieldSlug });
      toast.success('Field deleted');
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Failed to delete field';
      toast.error(errMsg);
    }
  };

  const toggleVisibility = async (field: DatasetField) => {
    try {
      await updateField.mutateAsync({
        id: field.id,
        is_visible: !field.is_visible,
      });
    } catch (error) {
      toast.error('Failed to update field');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: dataset.color || '#6366f1' }}
            />
            {dataset.name}
          </h2>
          <p className="text-sm text-muted-foreground">{dataset.description}</p>
        </div>
      </div>

      {/* Keep this dialog mounted so it can be opened from any tab (including Auto-Detect) */}
      <Dialog open={isAddFieldOpen} onOpenChange={handleAddFieldOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Field</DialogTitle>
            <DialogDescription>
              Configure how a field is extracted from webhook payloads
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field Slug</Label>
                <Input
                  placeholder="customer_email"
                  value={newField.field_slug}
                  onChange={(e) => setNewField({ ...newField, field_slug: slugify(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Display Name</Label>
                <Input
                  placeholder="Customer Email"
                  value={newField.field_name}
                  onChange={(e) => setNewField({ ...newField, field_name: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Field Type</Label>
                <Select
                  value={newField.field_type}
                  onValueChange={(value: any) => setNewField({ ...newField, field_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Source Type</Label>
                <Select
                  value={newField.source_type}
                  onValueChange={(value: any) => setNewField({ ...newField, source_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCE_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {newField.source_type === 'mapped' && (
              <div className="space-y-2">
                <Label>JSON Path</Label>
                <Input
                  placeholder="$.data.customer.email"
                  value={newField.source_config.json_path}
                  onChange={(e) =>
                    setNewField({
                      ...newField,
                      source_config: { ...newField.source_config, json_path: e.target.value },
                    })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Use JSONPath syntax (e.g., $.data.amount, $.payment[0].total)
                </p>
              </div>
            )}

            {newField.source_type === 'calculated' && (
              <div className="space-y-2">
                <Label>Formula</Label>
                <Input
                  placeholder="amount / 100"
                  value={newField.formula}
                  onChange={(e) => setNewField({ ...newField, formula: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Reference other fields by their slug</p>
              </div>
            )}

            <Button className="w-full" onClick={handleCreateField} disabled={createField.isPending}>
              {createField.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Add Field
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="fields">
        <TabsList>
          <TabsTrigger value="fields">Field Definitions</TabsTrigger>
          <TabsTrigger value="calculated" className="flex items-center gap-1">
            <Calculator className="h-3 w-3" />
            Calculated Fields
          </TabsTrigger>
          <TabsTrigger value="alerts" className="flex items-center gap-1">
            <Bell className="h-3 w-3" />
            Alerts
          </TabsTrigger>
          <TabsTrigger value="enrichment" className="flex items-center gap-1">
            <Link2 className="h-3 w-3" />
            Enrichment
          </TabsTrigger>
          <TabsTrigger value="detect">Auto-Detect from JSON</TabsTrigger>
        </TabsList>

        <TabsContent value="fields" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Schema Fields</CardTitle>
                  <CardDescription>
                    Define how incoming webhook data is mapped and stored
                  </CardDescription>
                </div>
                <Button size="sm" onClick={openBlankAddField}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Field
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : fields?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No fields defined. Add fields manually or auto-detect from sample JSON.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[40px]"></TableHead>
                      <TableHead>Field</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>JSON Path / Formula</TableHead>
                      <TableHead>Visible</TableHead>
                      <TableHead className="w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields?.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        </TableCell>
                        <TableCell>
                          <div>
                            <span className="font-medium">{field.field_name}</span>
                            <span className="text-xs text-muted-foreground ml-2">{field.field_slug}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{field.field_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={field.source_type === 'calculated' ? 'default' : 'secondary'}>
                            {field.source_type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs max-w-[200px] truncate">
                          {field.source_type === 'mapped'
                            ? (field.source_config as any)?.json_path 
                            : field.source_type === 'calculated' 
                              ? field.formula 
                              : '-'}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => toggleVisibility(field)}
                          >
                            {field.is_visible ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4 text-muted-foreground" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteField(field.id, field.field_slug)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="calculated" className="space-y-4">
          <CalculatedFieldsBuilder datasetId={dataset.id} />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <AlertsManager datasetId={dataset.id} datasetName={dataset.name} />
        </TabsContent>

        <TabsContent value="enrichment" className="space-y-4">
          <EnrichmentManager datasetId={dataset.id} />
        </TabsContent>

        <TabsContent value="detect" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wand2 className="h-5 w-5" />
                Auto-Detect Fields
              </CardTitle>
              <CardDescription>
                Paste a sample webhook JSON payload to automatically detect fields
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Sample JSON Payload</Label>
                <Textarea
                  placeholder='{"event": "payment.success", "data": {"amount": 9900, "email": "customer@example.com"}}'
                  className="font-mono text-sm min-h-[200px]"
                  value={sampleJson}
                  onChange={(e) => setSampleJson(e.target.value)}
                />
              </div>
              <Button onClick={detectFieldsFromJson} disabled={!sampleJson.trim()}>
                <Wand2 className="h-4 w-4 mr-2" />
                Detect Fields
              </Button>

              {detectedFields.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-medium mb-2">Detected Fields ({detectedFields.length})</h4>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>JSON Path</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Sample Value</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detectedFields.map((detected, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{detected.path}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{detected.type}</Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-[200px] truncate">
                            {JSON.stringify(detected.sample)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => addFieldFromDetected(detected)}
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              Add
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
