import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Loader2, Type, Hash, Calendar, List, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';

type FieldType = 'select' | 'text' | 'number' | 'date' | 'user';

interface FieldTypeConfig {
  value: FieldType;
  label: string;
  description: string;
  icon: typeof List;
}

const FIELD_TYPES: FieldTypeConfig[] = [
  {
    value: 'select',
    label: 'Choices (Dropdown)',
    description: 'A dropdown of predefined options. Best for categories, statuses, etc.',
    icon: List,
  },
  {
    value: 'user',
    label: 'User Reference',
    description: 'Reference a team member (setter or closer). Great for assigning ownership.',
    icon: Users,
  },
  {
    value: 'text',
    label: 'Text',
    description: 'Free-form text field. Good for notes, IDs, or custom data.',
    icon: Type,
  },
  {
    value: 'number',
    label: 'Number',
    description: 'Numeric values only. Use for quantities, percentages, or scores.',
    icon: Hash,
  },
  {
    value: 'date',
    label: 'Date',
    description: 'A date picker. Useful for deadlines, follow-ups, or milestones.',
    icon: Calendar,
  },
];

interface AddColumnDialogProps {
  trigger?: React.ReactNode;
}

export function AddColumnDialog({ trigger }: AddColumnDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<'type' | 'details'>('type');
  const [selectedType, setSelectedType] = useState<FieldType | null>(null);
  const [columnName, setColumnName] = useState('');
  const [userRefType, setUserRefType] = useState<'all' | 'setters' | 'closers'>('all');

  const resetForm = () => {
    setStep('type');
    setSelectedType(null);
    setColumnName('');
    setUserRefType('all');
  };

  const createColumnMutation = useMutation({
    mutationFn: async ({ name, type }: { name: string; type: FieldType }) => {
      if (!orgId) throw new Error('No organization');
      const slug = name.toLowerCase().replace(/\s+/g, '_');
      
      // For user type, store which user table to reference in the applies_to field
      const appliesTo = type === 'user' 
        ? ['payments', `user_ref:${userRefType}`] 
        : ['payments'];
      
      const { error } = await supabase
        .from('custom_field_definitions')
        .insert({
          organization_id: orgId,
          field_name: name,
          field_slug: slug,
          field_type: type,
          applies_to: appliesTo,
          show_in_dashboard: true,
          show_in_forms: true,
          show_in_filters: true,
          show_in_exports: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_columns', orgId] });
      resetForm();
      setOpen(false);
      toast({ 
        title: 'Column created!',
        description: selectedType === 'select' 
          ? 'Click on the new column button to add dropdown options.' 
          : 'Your new column is ready to use.',
      });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleCreate = () => {
    if (!columnName.trim() || !selectedType) return;
    createColumnMutation.mutate({ name: columnName.trim(), type: selectedType });
  };

  const handleSelectType = (type: FieldType) => {
    setSelectedType(type);
    setStep('details');
  };

  const selectedConfig = FIELD_TYPES.find(t => t.value === selectedType);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetForm(); }}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="outline" size="sm" className="gap-2 border-dashed">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Add Column</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 'type' ? 'Create New Column' : `New ${selectedConfig?.label} Column`}
          </DialogTitle>
          <DialogDescription>
            {step === 'type' 
              ? 'Choose the type of data you want to track. This determines how the field behaves.'
              : selectedConfig?.description
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'type' ? (
          <div className="grid gap-2 py-4">
            {FIELD_TYPES.map((fieldType) => {
              const Icon = fieldType.icon;
              return (
                <button
                  key={fieldType.value}
                  onClick={() => handleSelectType(fieldType.value)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-lg border text-left transition-colors",
                    "hover:bg-muted/50 hover:border-primary/50",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  )}
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium leading-none">{fieldType.label}</p>
                    <p className="text-sm text-muted-foreground">{fieldType.description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="column-name">Column Name</Label>
              <Input
                id="column-name"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                placeholder={
                  selectedType === 'select' ? 'e.g., Campaign, Product Tier, Status...' :
                  selectedType === 'user' ? 'e.g., Account Manager, Sales Rep...' :
                  selectedType === 'text' ? 'e.g., Notes, External ID, Tag...' :
                  selectedType === 'number' ? 'e.g., Score, Quantity, Percentage...' :
                  'e.g., Follow-up Date, Close Date...'
                }
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                autoFocus
              />
            </div>

            {selectedType === 'user' && (
              <div className="space-y-2">
                <Label>Who can be selected?</Label>
                <Select value={userRefType} onValueChange={(v) => setUserRefType(v as 'all' | 'setters' | 'closers')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Team Members</SelectItem>
                    <SelectItem value="setters">Setters Only</SelectItem>
                    <SelectItem value="closers">Closers Only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which team members can be assigned to this field.
                </p>
              </div>
            )}

            {selectedType === 'select' && (
              <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                💡 After creating the column, click on it in the toolbar to add dropdown options.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === 'details' && (
            <Button variant="ghost" onClick={() => setStep('type')} className="mr-auto">
              Back
            </Button>
          )}
          <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>
            Cancel
          </Button>
          {step === 'details' && (
            <Button 
              onClick={handleCreate}
              disabled={!columnName.trim() || createColumnMutation.isPending}
            >
              {createColumnMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              Create Column
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
