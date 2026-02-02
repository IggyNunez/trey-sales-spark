import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Badge } from '@/components/ui/badge';
import { useCustomFields, CustomFieldCategory, CustomField } from '@/hooks/useCustomFields';
import { Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const CATEGORY_LABELS: Record<CustomFieldCategory, string> = {
  call_outcome: 'Call Outcomes',
  call_status: 'Call Statuses',
  source: 'Lead Sources',
  call_type: 'Call Types',
  traffic_type: 'Traffic Types',
  opportunity_status: 'Opportunity Statuses',
};

const CATEGORY_DESCRIPTIONS: Record<CustomFieldCategory, string> = {
  call_outcome: 'Define the possible outcomes of a call (e.g., Sold, No Show, Follow-up)',
  call_status: 'Define the status of calls in your system (e.g., Scheduled, Completed, Cancelled)',
  source: 'Define where your leads come from (e.g., Facebook Ads, Referrals, Organic)',
  call_type: 'Define the types of calls your team makes (e.g., Discovery, Close, Follow-up)',
  traffic_type: 'Define how you categorize your traffic (e.g., Warm, Cold, Hot)',
  opportunity_status: 'Define the stages of your sales pipeline (e.g., New, Qualified, Closed Won)',
};

const COLOR_OPTIONS = [
  { value: '#ef4444', label: 'Red' },
  { value: '#f59e0b', label: 'Orange' },
  { value: '#10b981', label: 'Green' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#6b7280', label: 'Gray' },
];

interface CustomFieldFormData {
  field_label: string;
  field_value: string;
  color?: string;
}

export function CustomFieldsManager() {
  const [selectedCategory, setSelectedCategory] = useState<CustomFieldCategory>('call_outcome');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomField | null>(null);
  const [formData, setFormData] = useState<CustomFieldFormData>({
    field_label: '',
    field_value: '',
    color: undefined,
  });

  const {
    customFields,
    isLoading,
    createCustomField,
    isCreating,
    updateCustomField,
    isUpdating,
    deleteCustomField,
    isDeleting,
  } = useCustomFields(selectedCategory);

  const handleOpenAddDialog = () => {
    setFormData({ field_label: '', field_value: '', color: undefined });
    setIsAddDialogOpen(true);
  };

  const handleOpenEditDialog = (field: CustomField) => {
    setEditingField(field);
    setFormData({
      field_label: field.field_label,
      field_value: field.field_value,
      color: field.color,
    });
    setIsEditDialogOpen(true);
  };

  const handleCloseDialogs = () => {
    setIsAddDialogOpen(false);
    setIsEditDialogOpen(false);
    setEditingField(null);
    setFormData({ field_label: '', field_value: '', color: undefined });
  };

  const handleCreate = () => {
    if (!formData.field_label || !formData.field_value) {
      return;
    }

    createCustomField({
      field_category: selectedCategory,
      field_label: formData.field_label,
      field_value: formData.field_value,
      color: formData.color,
    });

    handleCloseDialogs();
  };

  const handleUpdate = () => {
    if (!editingField || !formData.field_label || !formData.field_value) {
      return;
    }

    updateCustomField({
      id: editingField.id,
      field_label: formData.field_label,
      field_value: formData.field_value,
      color: formData.color,
    });

    handleCloseDialogs();
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Are you sure you want to delete this field?')) {
      deleteCustomField(id);
    }
  };

  // Auto-generate field_value from field_label
  const handleLabelChange = (label: string) => {
    setFormData(prev => ({
      ...prev,
      field_label: label,
      field_value: label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Custom Fields</h2>
        <p className="text-muted-foreground">
          Customize dropdown options across your application to match your business needs.
        </p>
      </div>

      {/* Category Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select Category</CardTitle>
          <CardDescription>Choose which type of custom fields to manage</CardDescription>
        </CardHeader>
        <CardContent>
          <Select
            value={selectedCategory}
            onValueChange={(value) => setSelectedCategory(value as CustomFieldCategory)}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-2">
            {CATEGORY_DESCRIPTIONS[selectedCategory]}
          </p>
        </CardContent>
      </Card>

      {/* Fields List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>{CATEGORY_LABELS[selectedCategory]}</CardTitle>
            <CardDescription>
              {customFields?.length || 0} field{customFields?.length !== 1 ? 's' : ''} configured
            </CardDescription>
          </div>
          <Button onClick={handleOpenAddDialog} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Field
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading fields...</div>
          ) : customFields && customFields.length > 0 ? (
            <div className="space-y-2">
              {customFields.map((field) => (
                <div
                  key={field.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    {field.color && (
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: field.color }}
                      />
                    )}
                    <div className="flex-1">
                      <div className="font-medium">{field.field_label}</div>
                      <div className="text-sm text-muted-foreground">{field.field_value}</div>
                    </div>
                    {field.is_default && (
                      <Badge variant="secondary" className="text-xs">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleOpenEditDialog(field)}
                      disabled={isUpdating}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(field.id)}
                      disabled={isDeleting || field.is_default}
                      className={cn(field.is_default && 'opacity-50 cursor-not-allowed')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">No custom fields configured yet.</p>
              <Button onClick={handleOpenAddDialog} variant="outline">
                <Plus className="h-4 w-4 mr-2" />
                Add Your First Field
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Field Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Custom Field</DialogTitle>
            <DialogDescription>
              Create a new {CATEGORY_LABELS[selectedCategory].toLowerCase().slice(0, -1)} option
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="field_label">Field Label</Label>
              <Input
                id="field_label"
                placeholder="e.g., Sold"
                value={formData.field_label}
                onChange={(e) => handleLabelChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is what users will see in dropdowns
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="field_value">Field Value</Label>
              <Input
                id="field_value"
                placeholder="e.g., sold"
                value={formData.field_value}
                onChange={(e) => setFormData(prev => ({ ...prev, field_value: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Internal value (auto-generated from label)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Color (Optional)</Label>
              <Select
                value={formData.color}
                onValueChange={(value) => setFormData(prev => ({ ...prev, color: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: option.value }}
                        />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialogs}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={isCreating || !formData.field_label || !formData.field_value}
            >
              {isCreating ? 'Creating...' : 'Create Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Field Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Custom Field</DialogTitle>
            <DialogDescription>
              Update the {CATEGORY_LABELS[selectedCategory].toLowerCase().slice(0, -1)} option
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit_field_label">Field Label</Label>
              <Input
                id="edit_field_label"
                value={formData.field_label}
                onChange={(e) => setFormData(prev => ({ ...prev, field_label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_field_value">Field Value</Label>
              <Input
                id="edit_field_value"
                value={formData.field_value}
                onChange={(e) => setFormData(prev => ({ ...prev, field_value: e.target.value }))}
                disabled={editingField?.is_default}
              />
              {editingField?.is_default && (
                <p className="text-xs text-muted-foreground">
                  Default field values cannot be changed
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_color">Color (Optional)</Label>
              <Select
                value={formData.color}
                onValueChange={(value) => setFormData(prev => ({ ...prev, color: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a color" />
                </SelectTrigger>
                <SelectContent>
                  {COLOR_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: option.value }}
                        />
                        {option.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialogs}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={isUpdating || !formData.field_label || !formData.field_value}
            >
              {isUpdating ? 'Updating...' : 'Update Field'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
