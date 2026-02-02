import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Loader2, Settings, Users, Globe, Radio, Columns3, Type, Hash, Calendar, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';
import { AddColumnDialog } from './AddColumnDialog';

interface CategoryItem {
  id: string;
  name: string;
  is_active?: boolean;
}

interface CustomColumn {
  id: string;
  field_name: string;
  field_slug: string;
  field_type: string;
  applies_to: string[];
}

const FIELD_TYPE_ICONS: Record<string, typeof List> = {
  select: List,
  text: Type,
  number: Hash,
  date: Calendar,
  user: Users,
};

const FIELD_TYPE_LABELS: Record<string, string> = {
  select: 'Dropdown',
  text: 'Text',
  number: 'Number',
  date: 'Date',
  user: 'User',
};

type CategoryType = 'sources' | 'traffic_types' | 'setters' | 'closers';

const CATEGORY_CONFIG: Record<CategoryType, { label: string; icon: typeof Globe; placeholder: string }> = {
  sources: { label: 'Platforms', icon: Globe, placeholder: 'Add platform...' },
  traffic_types: { label: 'Traffic', icon: Radio, placeholder: 'Add traffic type...' },
  setters: { label: 'Setters', icon: Users, placeholder: 'Add setter...' },
  closers: { label: 'Closers', icon: Users, placeholder: 'Add closer...' },
};

function CategoryPopover({ 
  category, 
  items,
  count
}: { 
  category: CategoryType;
  items: CategoryItem[];
  count: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState(false);

  const config = CATEGORY_CONFIG[category];
  const Icon = config.icon;

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      if (!orgId) throw new Error('No organization');
      const { error } = await supabase
        .from(category)
        .insert({ name, organization_id: orgId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [category, orgId] });
      setNewName('');
      toast({ title: 'Added' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from(category)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [category, orgId] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    addMutation.mutate(newName.trim());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 group">
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{config.label}</span>
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded-md">{count}</span>
          <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Add new {config.label.toLowerCase().slice(0, -1)}</label>
            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={config.placeholder}
                className="h-9"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <Button 
                size="sm" 
                className="h-9 px-3 shrink-0"
                onClick={handleAdd}
                disabled={!newName.trim() || addMutation.isPending}
              >
                {addMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
          
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Current {config.label.toLowerCase()} ({items.length})
            </label>
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  No {config.label.toLowerCase()} yet. Add one above!
                </p>
              ) : (
                items.map((item) => (
                  <div 
                    key={item.id} 
                    className={cn(
                      "flex items-center justify-between gap-2 p-2 rounded-md text-sm group hover:bg-muted/50",
                      item.is_active === false && "opacity-50"
                    )}
                  >
                    <span className="truncate flex-1">{item.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        if (confirm(`Delete "${item.name}"?`)) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CustomColumnPopover({
  column,
  options,
  count
}: {
  column: CustomColumn;
  options: CategoryItem[];
  count: number;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [newName, setNewName] = useState('');
  const [open, setOpen] = useState(false);

  const addOptionMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('custom_field_options')
        .insert({
          field_definition_id: column.id,
          option_label: name,
          option_value: name.toLowerCase().replace(/\s+/g, '_'),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_field_options', column.id] });
      setNewName('');
      toast({ title: 'Added' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteOptionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_field_options')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_field_options', column.id] });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const deleteColumnMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('custom_field_definitions')
        .delete()
        .eq('id', column.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom_columns', orgId] });
      setOpen(false);
      toast({ title: 'Column deleted' });
    },
    onError: (error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleAdd = () => {
    if (!newName.trim()) return;
    addOptionMutation.mutate(newName.trim());
  };

  const Icon = FIELD_TYPE_ICONS[column.field_type] || Columns3;
  const typeLabel = FIELD_TYPE_LABELS[column.field_type] || column.field_type;

  // Only show add options for 'select' type columns
  const isSelectType = column.field_type === 'select';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 group">
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{column.field_name}</span>
          {isSelectType && (
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded-md">{count}</span>
          )}
          {isSelectType && (
            <Plus className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-4" align="start">
        <div className="space-y-4">
          {/* Header with type badge */}
          <div className="flex items-center justify-between">
            <h4 className="font-medium">{column.field_name}</h4>
            <Badge variant="secondary" className="text-xs">
              {typeLabel}
            </Badge>
          </div>

          {/* Only show options management for select type */}
          {isSelectType ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Add option</label>
                <div className="flex items-center gap-2">
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`Add ${column.field_name.toLowerCase()}...`}
                    className="h-9"
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                  />
                  <Button 
                    size="sm" 
                    className="h-9 px-3 shrink-0"
                    onClick={handleAdd}
                    disabled={!newName.trim() || addOptionMutation.isPending}
                  >
                    {addOptionMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Options ({options.length})
                </label>
                <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
                  {options.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      No options yet. Add one above!
                    </p>
                  ) : (
                    options.map((option) => (
                      <div 
                        key={option.id} 
                        className="flex items-center justify-between gap-2 p-2 rounded-md text-sm group hover:bg-muted/50"
                      >
                        <span className="truncate flex-1">{option.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            if (confirm(`Delete "${option.name}"?`)) {
                              deleteOptionMutation.mutate(option.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {column.field_type === 'text' && 'This field accepts free-form text input.'}
              {column.field_type === 'number' && 'This field accepts numeric values.'}
              {column.field_type === 'date' && 'This field accepts date values.'}
              {column.field_type === 'user' && `This field references ${column.applies_to.includes('user_ref:closers') ? 'Closers' : 'Setters'}.`}
            </p>
          )}

          <div className="pt-2 border-t">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => {
                if (confirm(`Delete the "${column.field_name}" column entirely? This cannot be undone.`)) {
                  deleteColumnMutation.mutate();
                }
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Column
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// AddColumnDialog is now imported from ./AddColumnDialog.tsx

function CustomColumnWithOptions({ column }: { column: CustomColumn }) {
  // Only fetch options for select type columns
  const { data: options = [] } = useQuery({
    queryKey: ['custom_field_options', column.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('custom_field_options')
        .select('id, option_label')
        .eq('field_definition_id', column.id)
        .eq('is_active', true)
        .order('sort_order');
      return (data || []).map(o => ({ id: o.id, name: o.option_label }));
    },
    enabled: column.field_type === 'select',
  });

  return (
    <CustomColumnPopover 
      column={column} 
      options={options} 
      count={options.length} 
    />
  );
}

export function CategoryManagerRow() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const { data: sources = [] } = useQuery({
    queryKey: ['sources', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('sources')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name');
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: trafficTypes = [] } = useQuery({
    queryKey: ['traffic_types', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('traffic_types')
        .select('id, name')
        .eq('organization_id', orgId)
        .order('name');
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: setters = [] } = useQuery({
    queryKey: ['setters', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('setters')
        .select('id, name, is_active')
        .eq('organization_id', orgId)
        .order('name');
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: closers = [] } = useQuery({
    queryKey: ['closers', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('closers')
        .select('id, name, is_active')
        .eq('organization_id', orgId)
        .order('name');
      return data || [];
    },
    enabled: !!orgId,
  });

  const { data: customColumns = [] } = useQuery({
    queryKey: ['custom_columns', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data } = await supabase
        .from('custom_field_definitions')
        .select('id, field_name, field_slug, field_type, applies_to')
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .contains('applies_to', ['payments'])
        .order('sort_order');
      return (data || []) as CustomColumn[];
    },
    enabled: !!orgId,
  });

  if (!orgId) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground mr-2">
        <Settings className="h-4 w-4" />
        <span className="hidden sm:inline">Columns:</span>
      </div>
      <CategoryPopover category="closers" items={closers} count={closers.length} />
      <CategoryPopover category="setters" items={setters} count={setters.length} />
      <CategoryPopover category="sources" items={sources} count={sources.length} />
      <CategoryPopover category="traffic_types" items={trafficTypes} count={trafficTypes.length} />
      
      {customColumns.map((column) => (
        <CustomColumnWithOptions key={column.id} column={column} />
      ))}
      
      <AddColumnDialog />
    </div>
  );
}
