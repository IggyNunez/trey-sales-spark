import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Plus, 
  Settings, 
  ClipboardList, 
  Users, 
  Calendar,
  FileText,
  MoreVertical,
  Pencil,
  Trash2,
  Eye,
  BarChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useFormDefinitions,
  useCreateFormDefinition,
  useDeleteFormDefinition,
  useIsDynamicFormsEnabled,
  generateSlug,
} from '@/hooks/useDynamicForms';
import { 
  ENTITY_TYPE_OPTIONS, 
  RECURRENCE_OPTIONS,
  type EntityType,
  type RecurrencePattern,
} from '@/types/dynamicForms';

const entityTypeIcons: Record<EntityType, React.ReactNode> = {
  closer: <Users className="h-5 w-5" />,
  lead: <FileText className="h-5 w-5" />,
  event: <Calendar className="h-5 w-5" />,
  standalone: <ClipboardList className="h-5 w-5" />,
};

export function DynamicFormsList() {
  const navigate = useNavigate();
  const isEnabled = useIsDynamicFormsEnabled();
  
  const { data: forms = [], isLoading } = useFormDefinitions();
  const createForm = useCreateFormDefinition();
  const deleteForm = useDeleteFormDefinition();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<string | null>(null);
  
  // New form state
  const [newFormName, setNewFormName] = useState('');
  const [newFormDescription, setNewFormDescription] = useState('');
  const [newFormEntityType, setNewFormEntityType] = useState<EntityType>('closer');
  const [newFormIsRecurring, setNewFormIsRecurring] = useState(false);
  const [newFormRecurrence, setNewFormRecurrence] = useState<RecurrencePattern>(null);

  if (!isEnabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Dynamic Forms</h3>
          <p className="text-muted-foreground mb-4">
            This feature is currently in beta and available for select organizations.
          </p>
          <Badge variant="secondary">Coming Soon</Badge>
        </CardContent>
      </Card>
    );
  }

  const handleCreateForm = async () => {
    if (!newFormName.trim()) return;

    await createForm.mutateAsync({
      name: newFormName.trim(),
      slug: generateSlug(newFormName),
      description: newFormDescription.trim() || undefined,
      entity_type: newFormEntityType,
      is_recurring: newFormIsRecurring,
      recurrence_pattern: newFormIsRecurring ? newFormRecurrence : null,
    });

    // Reset form
    setNewFormName('');
    setNewFormDescription('');
    setNewFormEntityType('closer');
    setNewFormIsRecurring(false);
    setNewFormRecurrence(null);
    setIsCreateDialogOpen(false);
  };

  const handleDeleteForm = async () => {
    if (!formToDelete) return;
    await deleteForm.mutateAsync(formToDelete);
    setFormToDelete(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Dynamic Forms</h2>
          <p className="text-sm text-muted-foreground">
            Create custom forms with unlimited fields and automatic metrics
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Form
        </Button>
      </div>

      {/* Forms Grid */}
      {forms.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No forms yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first form to start collecting data from your team.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Form
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {forms.map((form) => (
            <Card 
              key={form.id} 
              className="hover:border-primary/50 transition-colors cursor-pointer group"
              onClick={() => navigate(`/settings/forms/${form.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary">
                      {entityTypeIcons[form.entity_type]}
                    </div>
                    <div>
                      <CardTitle className="text-base">{form.name}</CardTitle>
                      {form.description && (
                        <CardDescription className="text-xs mt-1">
                          {form.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/settings/forms/${form.id}`);
                      }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit Form
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/forms/${form.id}/preview`);
                      }}>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/forms/${form.id}/submissions`);
                      }}>
                        <BarChart className="h-4 w-4 mr-2" />
                        View Submissions
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormToDelete(form.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">
                    {ENTITY_TYPE_OPTIONS.find(e => e.value === form.entity_type)?.label}
                  </Badge>
                  {form.is_recurring && form.recurrence_pattern && (
                    <Badge variant="secondary">
                      {RECURRENCE_OPTIONS.find(r => r.value === form.recurrence_pattern)?.label}
                    </Badge>
                  )}
                  {!form.is_active && (
                    <Badge variant="destructive">Inactive</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Form Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Form</DialogTitle>
            <DialogDescription>
              Create a custom form with unlimited fields. Each field can become a dashboard metric.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Form Name *</Label>
              <Input
                value={newFormName}
                onChange={(e) => setNewFormName(e.target.value)}
                placeholder="e.g., End of Day Report, Lead Intake Form"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={newFormDescription}
                onChange={(e) => setNewFormDescription(e.target.value)}
                placeholder="What is this form used for?"
              />
            </div>

            <div className="space-y-2">
              <Label>Attach To</Label>
              <Select 
                value={newFormEntityType} 
                onValueChange={(v: EntityType) => setNewFormEntityType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPE_OPTIONS.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        {entityTypeIcons[option.value]}
                        <div>
                          <div>{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="is-recurring"
                  checked={newFormIsRecurring}
                  onChange={(e) => setNewFormIsRecurring(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="is-recurring" className="cursor-pointer">
                  This is a recurring form
                </Label>
              </div>

              {newFormIsRecurring && (
                <Select 
                  value={newFormRecurrence || ''} 
                  onValueChange={(v: RecurrencePattern) => setNewFormRecurrence(v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select frequency" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECURRENCE_OPTIONS.filter(r => r.value !== null).map(option => (
                      <SelectItem key={option.value} value={option.value!}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateForm} 
              disabled={!newFormName.trim() || createForm.isPending}
            >
              {createForm.isPending ? 'Creating...' : 'Create Form'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!formToDelete} onOpenChange={() => setFormToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this form and all its submissions. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteForm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
