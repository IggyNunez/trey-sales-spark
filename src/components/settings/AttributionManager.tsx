import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Plus, Pencil, Trash2, Loader2, Users, Globe, Radio, BarChart3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AttributionStats } from './AttributionStats';

interface AttributionItem {
  id: string;
  name: string;
  is_active?: boolean;
  created_at: string;
}

function AttributionTable({ 
  items, 
  isLoading, 
  onEdit, 
  onDelete,
  onToggleActive,
  showActiveToggle = true
}: { 
  items: AttributionItem[];
  isLoading: boolean;
  onEdit: (item: AttributionItem) => void;
  onDelete: (id: string) => void;
  onToggleActive?: (id: string, isActive: boolean) => void;
  showActiveToggle?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No items yet. Add one to get started.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          {showActiveToggle && <TableHead>Status</TableHead>}
          <TableHead className="w-[100px]">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-medium">{item.name}</TableCell>
            {showActiveToggle && (
              <TableCell>
                <Badge variant={item.is_active !== false ? "default" : "secondary"}>
                  {item.is_active !== false ? "Active" : "Inactive"}
                </Badge>
              </TableCell>
            )}
            <TableCell>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onDelete(item.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AddEditDialog({
  open,
  onOpenChange,
  title,
  item,
  onSave,
  saving
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  item: AttributionItem | null;
  onSave: (name: string, isActive: boolean) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(item?.name || '');
  const [isActive, setIsActive] = useState(item?.is_active !== false);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), isActive);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? `Edit ${title}` : `Add ${title}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`Enter ${title.toLowerCase()} name`}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="active">Active</Label>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {item ? 'Update' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AttributionManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<AttributionItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<'setters' | 'closers' | 'sources' | 'traffic_types'>('setters');
  const [saving, setSaving] = useState(false);

  // Fetch setters
  const { data: setters = [], isLoading: loadingSetters } = useQuery({
    queryKey: ['setters'],
    queryFn: async () => {
      const { data, error } = await supabase.from('setters').select('*').order('name');
      if (error) throw error;
      return data as AttributionItem[];
    }
  });

  // Fetch closers
  const { data: closers = [], isLoading: loadingClosers } = useQuery({
    queryKey: ['closers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('closers').select('*').order('name');
      if (error) throw error;
      return data as AttributionItem[];
    }
  });

  // Fetch sources (platforms)
  const { data: sources = [], isLoading: loadingSources } = useQuery({
    queryKey: ['sources'],
    queryFn: async () => {
      const { data, error } = await supabase.from('sources').select('*').order('name');
      if (error) throw error;
      return data as AttributionItem[];
    }
  });

  // Fetch traffic types
  const { data: trafficTypes = [], isLoading: loadingTrafficTypes } = useQuery({
    queryKey: ['traffic_types'],
    queryFn: async () => {
      const { data, error } = await supabase.from('traffic_types').select('*').order('name');
      if (error) throw error;
      return data as AttributionItem[];
    }
  });

  const getTableAndItems = () => {
    switch (activeCategory) {
      case 'setters':
        return { table: 'setters', items: setters, loading: loadingSetters, label: 'Setter' };
      case 'closers':
        return { table: 'closers', items: closers, loading: loadingClosers, label: 'Closer' };
      case 'sources':
        return { table: 'sources', items: sources, loading: loadingSources, label: 'Platform' };
      case 'traffic_types':
        return { table: 'traffic_types', items: trafficTypes, loading: loadingTrafficTypes, label: 'Traffic Type' };
    }
  };

  const { table, items, loading, label } = getTableAndItems();
  const hasActiveToggle = activeCategory === 'setters' || activeCategory === 'closers';

  const handleAdd = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: AttributionItem) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase.from(table as 'setters' | 'closers' | 'sources' | 'traffic_types').delete().eq('id', id);
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: [activeCategory] });
      toast({ title: 'Deleted', description: `${label} deleted successfully` });
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to delete', 
        variant: 'destructive' 
      });
    }
  };

  const handleSave = async (name: string, isActive: boolean) => {
    setSaving(true);
    try {
      if (editingItem) {
        // Update
        const updateData = hasActiveToggle ? { name, is_active: isActive } : { name };
        const { error } = await supabase
          .from(table as 'setters' | 'closers' | 'sources' | 'traffic_types')
          .update(updateData)
          .eq('id', editingItem.id);
        if (error) throw error;
        toast({ title: 'Updated', description: `${label} updated successfully` });
      } else {
        // Insert
        const insertData = hasActiveToggle ? { name, is_active: isActive } : { name };
        const { error } = await supabase
          .from(table as 'setters' | 'closers' | 'sources' | 'traffic_types')
          .insert(insertData);
        if (error) throw error;
        toast({ title: 'Added', description: `${label} added successfully` });
      }
      
      queryClient.invalidateQueries({ queryKey: [activeCategory] });
      setDialogOpen(false);
      setEditingItem(null);
    } catch (err) {
      toast({ 
        title: 'Error', 
        description: err instanceof Error ? err.message : 'Failed to save', 
        variant: 'destructive' 
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Manage Attribution</CardTitle>
          <CardDescription>
            Add and manage setters, closers, platforms, and traffic types for attribution tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeCategory} onValueChange={(v) => setActiveCategory(v as typeof activeCategory)}>
            <div className="flex items-center justify-between mb-4">
              <TabsList>
                <TabsTrigger value="setters" className="gap-2">
                  <Users className="h-4 w-4" />
                  Setters
                </TabsTrigger>
                <TabsTrigger value="closers" className="gap-2">
                  <Users className="h-4 w-4" />
                  Closers
                </TabsTrigger>
                <TabsTrigger value="sources" className="gap-2">
                  <Globe className="h-4 w-4" />
                  Platforms
                </TabsTrigger>
                <TabsTrigger value="traffic_types" className="gap-2">
                  <Radio className="h-4 w-4" />
                  Traffic Types
                </TabsTrigger>
              </TabsList>
              <Button onClick={handleAdd} size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add {label}
              </Button>
            </div>

            <TabsContent value="setters">
              <AttributionTable 
                items={setters} 
                isLoading={loadingSetters}
                onEdit={handleEdit}
                onDelete={handleDelete}
                showActiveToggle={true}
              />
            </TabsContent>

            <TabsContent value="closers">
              <AttributionTable 
                items={closers} 
                isLoading={loadingClosers}
                onEdit={handleEdit}
                onDelete={handleDelete}
                showActiveToggle={true}
              />
            </TabsContent>

            <TabsContent value="sources">
              <AttributionTable 
                items={sources} 
                isLoading={loadingSources}
                onEdit={handleEdit}
                onDelete={handleDelete}
                showActiveToggle={false}
              />
            </TabsContent>

            <TabsContent value="traffic_types">
              <AttributionTable 
                items={trafficTypes} 
                isLoading={loadingTrafficTypes}
                onEdit={handleEdit}
                onDelete={handleDelete}
                showActiveToggle={false}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Attribution Stats */}
      <AttributionStats />

      <AddEditDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={label}
        item={editingItem}
        onSave={handleSave}
        saving={saving}
      />
    </div>
  );
}
