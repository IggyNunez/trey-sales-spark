import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, Link2, Unlink, ArrowRight, Database, Sparkles, AlertCircle, X, ChevronRight } from 'lucide-react';
import { 
  useDatasetEnrichments, 
  useCreateDatasetEnrichment, 
  useUpdateDatasetEnrichment, 
  useDeleteDatasetEnrichment,
  useToggleDatasetEnrichment,
  TARGET_TABLE_CONFIG,
  TargetTable,
  FieldMapping,
  DatasetEnrichment
} from '@/hooks/useDatasetEnrichments';
import { useDatasetFields, DatasetField } from '@/hooks/useWebhookDashboard';

interface EnrichmentManagerProps {
  datasetId: string;
}

export function EnrichmentManager({ datasetId }: EnrichmentManagerProps) {
  const { data: enrichments, isLoading } = useDatasetEnrichments(datasetId);
  const { data: datasetFields } = useDatasetFields(datasetId);
  const createEnrichment = useCreateDatasetEnrichment();
  const updateEnrichment = useUpdateDatasetEnrichment();
  const deleteEnrichment = useDeleteDatasetEnrichment();
  const toggleEnrichment = useToggleDatasetEnrichment();

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEnrichment, setEditingEnrichment] = useState<DatasetEnrichment | null>(null);

  // Form state
  const [targetTable, setTargetTable] = useState<TargetTable>('leads');
  const [matchField, setMatchField] = useState('');
  const [targetField, setTargetField] = useState('email');
  const [autoCreate, setAutoCreate] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);

  // Reset form
  const resetForm = () => {
    setTargetTable('leads');
    setMatchField('');
    setTargetField('email');
    setAutoCreate(false);
    setFieldMappings([]);
    setEditingEnrichment(null);
  };

  // Open dialog for editing
  const openEditDialog = (enrichment: DatasetEnrichment) => {
    setEditingEnrichment(enrichment);
    setTargetTable(enrichment.target_table as TargetTable);
    setMatchField(enrichment.match_field);
    setTargetField(enrichment.target_field);
    setAutoCreate(enrichment.auto_create_if_missing);
    setFieldMappings(enrichment.field_mappings || []);
    setIsDialogOpen(true);
  };

  // Handle target table change - reset target field to first option
  useEffect(() => {
    const config = TARGET_TABLE_CONFIG[targetTable];
    if (config?.matchFields.length > 0) {
      setTargetField(config.matchFields[0].value);
    }
  }, [targetTable]);

  // Add field mapping
  const addFieldMapping = () => {
    setFieldMappings([...fieldMappings, { source_field: '', target_column: '' }]);
  };

  // Update field mapping
  const updateFieldMapping = (index: number, key: keyof FieldMapping, value: string) => {
    const updated = [...fieldMappings];
    updated[index] = { ...updated[index], [key]: value };
    setFieldMappings(updated);
  };

  // Remove field mapping
  const removeFieldMapping = (index: number) => {
    setFieldMappings(fieldMappings.filter((_, i) => i !== index));
  };

  // Get available source fields (only mapped fields from dataset)
  const availableSourceFields = datasetFields?.filter(f => f.source_type === 'mapped') || [];

  // Save enrichment
  const handleSave = async () => {
    if (!matchField) {
      toast.error('Please select a match field from your dataset');
      return;
    }

    // Validate field mappings
    const validMappings = fieldMappings.filter(m => m.source_field && m.target_column);

    try {
      if (editingEnrichment) {
        await updateEnrichment.mutateAsync({
          id: editingEnrichment.id,
          target_table: targetTable,
          match_field: matchField,
          target_field: targetField,
          auto_create_if_missing: autoCreate,
          field_mappings: validMappings,
        });
        toast.success('Enrichment updated');
      } else {
        await createEnrichment.mutateAsync({
          dataset_id: datasetId,
          target_table: targetTable,
          match_field: matchField,
          target_field: targetField,
          auto_create_if_missing: autoCreate,
          field_mappings: validMappings,
        });
        toast.success('Enrichment created');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving enrichment:', error);
      toast.error('Failed to save enrichment');
    }
  };

  // Delete enrichment
  const handleDelete = async (enrichment: DatasetEnrichment) => {
    if (!confirm('Are you sure you want to delete this enrichment rule?')) return;

    try {
      await deleteEnrichment.mutateAsync({ id: enrichment.id, datasetId });
      toast.success('Enrichment deleted');
    } catch (error) {
      console.error('Error deleting enrichment:', error);
      toast.error('Failed to delete enrichment');
    }
  };

  // Toggle active state
  const handleToggle = async (enrichment: DatasetEnrichment, isActive: boolean) => {
    try {
      await toggleEnrichment.mutateAsync({ id: enrichment.id, isActive, datasetId });
      toast.success(isActive ? 'Enrichment enabled' : 'Enrichment disabled');
    } catch (error) {
      console.error('Error toggling enrichment:', error);
      toast.error('Failed to toggle enrichment');
    }
  };

  const targetConfig = TARGET_TABLE_CONFIG[targetTable];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Data Enrichment Rules
          </CardTitle>
          <CardDescription>
            Auto-link webhook data to existing entities (leads, closers, events)
          </CardDescription>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Enrichment
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingEnrichment ? 'Edit Enrichment Rule' : 'Create Enrichment Rule'}
              </DialogTitle>
              <DialogDescription>
                Configure how webhook data should link to existing records
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="matching" className="mt-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="matching">Matching</TabsTrigger>
                <TabsTrigger value="mappings">Field Mappings</TabsTrigger>
              </TabsList>

              <TabsContent value="matching" className="space-y-4 mt-4">
                {/* Target Table */}
                <div className="space-y-2">
                  <Label>Target Table</Label>
                  <Select value={targetTable} onValueChange={(v) => setTargetTable(v as TargetTable)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TARGET_TABLE_CONFIG).map(([key, config]) => (
                        <SelectItem key={key} value={key}>
                          <div className="flex items-center gap-2">
                            <Database className="h-4 w-4" />
                            {config.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Which table should webhook data be matched against?
                  </p>
                </div>

                {/* Match Flow Visualization */}
                <div className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="secondary">Webhook Data</Badge>
                      <Select value={matchField} onValueChange={setMatchField}>
                        <SelectTrigger className="w-40 mt-2">
                          <SelectValue placeholder="Select field" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSourceFields.map(field => (
                            <SelectItem key={field.id} value={field.field_slug}>
                              {field.field_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <ChevronRight className="h-4 w-4" />
                      <span className="text-xs">matches</span>
                      <ChevronRight className="h-4 w-4" />
                    </div>

                    <div className="flex flex-col items-center gap-1">
                      <Badge variant="outline">{targetConfig?.label}</Badge>
                      <Select value={targetField} onValueChange={setTargetField}>
                        <SelectTrigger className="w-40 mt-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {targetConfig?.matchFields.map(field => (
                            <SelectItem key={field.value} value={field.value}>
                              {field.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Auto Create Option */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="space-y-0.5">
                    <Label className="text-base flex items-center gap-2">
                      <Sparkles className="h-4 w-4" />
                      Auto-create if missing
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Create a new {targetConfig?.label.toLowerCase().slice(0, -1)} record if no match is found
                    </p>
                  </div>
                  <Switch checked={autoCreate} onCheckedChange={setAutoCreate} />
                </div>

                {autoCreate && (
                  <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5" />
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      New records will be created with the matched field value. Configure field mappings to populate additional fields.
                    </p>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="mappings" className="space-y-4 mt-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Field Mappings</Label>
                    <Button variant="outline" size="sm" onClick={addFieldMapping}>
                      <Plus className="h-3 w-3 mr-1" />
                      Add Mapping
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Copy values from webhook data to the matched record (updates existing records)
                  </p>
                </div>

                {fieldMappings.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Unlink className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No field mappings configured</p>
                    <p className="text-xs">Click "Add Mapping" to copy webhook data to target records</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {fieldMappings.map((mapping, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 border rounded-lg">
                        <Select 
                          value={mapping.source_field} 
                          onValueChange={(v) => updateFieldMapping(index, 'source_field', v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Source field" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableSourceFields.map(field => (
                              <SelectItem key={field.id} value={field.field_slug}>
                                {field.field_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />

                        <Select 
                          value={mapping.target_column} 
                          onValueChange={(v) => updateFieldMapping(index, 'target_column', v)}
                        >
                          <SelectTrigger className="flex-1">
                            <SelectValue placeholder="Target column" />
                          </SelectTrigger>
                          <SelectContent>
                            {targetConfig?.updatableFields.map(field => (
                              <SelectItem key={field.value} value={field.value}>
                                {field.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => removeFieldMapping(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>

            <DialogFooter className="mt-6">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={createEnrichment.isPending || updateEnrichment.isPending}
              >
                {editingEnrichment ? 'Update' : 'Create'} Enrichment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : enrichments && enrichments.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead>Match</TableHead>
                <TableHead>Mappings</TableHead>
                <TableHead>Auto-Create</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {enrichments.map(enrichment => {
                const config = TARGET_TABLE_CONFIG[enrichment.target_table as TargetTable];
                return (
                  <TableRow key={enrichment.id}>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {config?.label || enrichment.target_table}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <code className="bg-muted px-1 rounded">{enrichment.match_field}</code>
                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                        <code className="bg-muted px-1 rounded">{enrichment.target_field}</code>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {enrichment.field_mappings?.length || 0} mappings
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {enrichment.auto_create_if_missing ? (
                        <Badge className="bg-green-100 text-green-800">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={enrichment.is_active}
                        onCheckedChange={(checked) => handleToggle(enrichment, checked)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(enrichment)}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(enrichment)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
            <Link2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="font-medium">No enrichment rules configured</p>
            <p className="text-sm">Create rules to auto-link webhook data to existing records</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
