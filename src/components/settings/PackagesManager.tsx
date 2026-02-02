import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Pencil, Trash2, Loader2, Package } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';

interface PackageItem {
  id: string;
  name: string;
  default_price: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function PackagesManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<PackageItem | null>(null);
  const [formData, setFormData] = useState({ name: '', default_price: 0, is_active: true });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Fetch packages
  const { data: packages = [], isLoading } = useQuery({
    queryKey: ['packages', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('packages')
        .select('*')
        .eq('organization_id', orgId)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as PackageItem[];
    },
    enabled: !!orgId,
  });

  const handleOpenDialog = (pkg?: PackageItem) => {
    if (pkg) {
      setEditingPackage(pkg);
      setFormData({
        name: pkg.name,
        default_price: pkg.default_price,
        is_active: pkg.is_active,
      });
    } else {
      setEditingPackage(null);
      setFormData({ name: '', default_price: 0, is_active: true });
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !orgId) return;
    
    setSaving(true);
    try {
      if (editingPackage) {
        const { error } = await supabase
          .from('packages')
          .update({
            name: formData.name.trim(),
            default_price: formData.default_price,
            is_active: formData.is_active,
          })
          .eq('id', editingPackage.id);
        
        if (error) throw error;
        toast({ title: 'Package updated', description: `"${formData.name}" has been updated` });
      } else {
        const { error } = await supabase
          .from('packages')
          .insert({
            organization_id: orgId,
            name: formData.name.trim(),
            default_price: formData.default_price,
            is_active: formData.is_active,
            sort_order: packages.length,
          });
        
        if (error) throw error;
        toast({ title: 'Package created', description: `"${formData.name}" has been added` });
      }
      
      queryClient.invalidateQueries({ queryKey: ['packages', orgId] });
      setDialogOpen(false);
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save package',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (pkg: PackageItem) => {
    if (!confirm(`Are you sure you want to delete "${pkg.name}"?`)) return;
    
    setDeleting(pkg.id);
    try {
      const { error } = await supabase
        .from('packages')
        .delete()
        .eq('id', pkg.id);
      
      if (error) throw error;
      
      toast({ title: 'Package deleted', description: `"${pkg.name}" has been removed` });
      queryClient.invalidateQueries({ queryKey: ['packages', orgId] });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete package',
        variant: 'destructive',
      });
    } finally {
      setDeleting(null);
    }
  };

  const handleToggleActive = async (pkg: PackageItem) => {
    try {
      const { error } = await supabase
        .from('packages')
        .update({ is_active: !pkg.is_active })
        .eq('id', pkg.id);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['packages', orgId] });
      toast({
        title: pkg.is_active ? 'Package deactivated' : 'Package activated',
        description: `"${pkg.name}" is now ${pkg.is_active ? 'inactive' : 'active'}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update package',
        variant: 'destructive',
      });
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Packages</CardTitle>
                <CardDescription>
                  Manage your product packages for deal tracking
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => handleOpenDialog()} size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Package
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No packages configured yet</p>
              <p className="text-sm mt-1">Add packages to track what products are sold with each deal</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Default Price</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {packages.map((pkg) => (
                  <TableRow key={pkg.id}>
                    <TableCell className="font-medium">{pkg.name}</TableCell>
                    <TableCell>{formatCurrency(pkg.default_price)}</TableCell>
                    <TableCell>
                      <Badge variant={pkg.is_active ? 'default' : 'secondary'}>
                        {pkg.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Switch
                          checked={pkg.is_active}
                          onCheckedChange={() => handleToggleActive(pkg)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleOpenDialog(pkg)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(pkg)}
                          disabled={deleting === pkg.id}
                        >
                          {deleting === pkg.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingPackage ? 'Edit Package' : 'Add Package'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Package Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Pro Package, Enterprise, Starter"
              />
            </div>
            <div className="space-y-2">
              <Label>Default Price ($)</Label>
              <Input
                type="number"
                value={formData.default_price}
                onChange={(e) => setFormData({ ...formData, default_price: parseFloat(e.target.value) || 0 })}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                This will pre-fill the contract value when this package is selected
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !formData.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingPackage ? 'Save Changes' : 'Add Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
