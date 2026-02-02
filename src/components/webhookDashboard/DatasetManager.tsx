import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Database, Trash2, Settings, Zap, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useDatasets, useCreateDataset, useDeleteDataset, Dataset } from '@/hooks/useWebhookDashboard';
import { useIsWebhookDashboardEnabled } from '@/hooks/useWebhookDashboard';

interface DatasetManagerProps {
  onSelectDataset?: (dataset: Dataset) => void;
}

export function DatasetManager({ onSelectDataset }: DatasetManagerProps) {
  const isEnabled = useIsWebhookDashboardEnabled();
  const { data: datasets, isLoading } = useDatasets();
  const createDataset = useCreateDataset();
  const deleteDataset = useDeleteDataset();
  const queryClient = useQueryClient();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newDataset, setNewDataset] = useState({
    name: '',
    description: '',
    icon: 'database',
    color: '#6366f1',
    retention_days: 90,
    realtime_enabled: true,
  });

  if (!isEnabled) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <Database className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Webhook Dashboard</h3>
          <p className="text-muted-foreground mb-4">
            This feature is currently in beta and available for select organizations.
          </p>
          <Badge variant="secondary">Coming Soon</Badge>
        </CardContent>
      </Card>
    );
  }

  const handleCreate = async () => {
    if (!newDataset.name.trim()) {
      toast.error('Dataset name is required');
      return;
    }

    try {
      await createDataset.mutateAsync(newDataset);
      toast.success('Dataset created successfully');
      setIsDialogOpen(false);
      setNewDataset({
        name: '',
        description: '',
        icon: 'database',
        color: '#6366f1',
        retention_days: 90,
        realtime_enabled: true,
      });
    } catch (error) {
      toast.error('Failed to create dataset');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"? This will also delete all records in this dataset.`)) {
      return;
    }

    try {
      await deleteDataset.mutateAsync(id);
      toast.success('Dataset deleted');
    } catch (error) {
      toast.error('Failed to delete dataset');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Datasets
            </CardTitle>
            <CardDescription>
              Create datasets to receive and organize webhook data from multiple sources
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                New Dataset
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create Dataset</DialogTitle>
                <DialogDescription>
                  A dataset is a container for webhook data with its own schema and fields
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., All Payments, Customer Events"
                    value={newDataset.name}
                    onChange={(e) => setNewDataset({ ...newDataset, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="What data will this dataset contain?"
                    value={newDataset.description}
                    onChange={(e) => setNewDataset({ ...newDataset, description: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="color">Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="color"
                        type="color"
                        value={newDataset.color}
                        onChange={(e) => setNewDataset({ ...newDataset, color: e.target.value })}
                        className="w-12 h-10 p-1"
                      />
                      <Input
                        value={newDataset.color}
                        onChange={(e) => setNewDataset({ ...newDataset, color: e.target.value })}
                        placeholder="#6366f1"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="retention">Retention (days)</Label>
                    <Input
                      id="retention"
                      type="number"
                      min={1}
                      max={365}
                      value={newDataset.retention_days}
                      onChange={(e) => setNewDataset({ ...newDataset, retention_days: parseInt(e.target.value) || 90 })}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Real-time Updates</Label>
                    <p className="text-xs text-muted-foreground">
                      Enable live updates when new data arrives
                    </p>
                  </div>
                  <Switch
                    checked={newDataset.realtime_enabled}
                    onCheckedChange={(checked) => setNewDataset({ ...newDataset, realtime_enabled: checked })}
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={handleCreate}
                  disabled={!newDataset.name.trim() || createDataset.isPending}
                >
                  {createDataset.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Dataset
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : datasets?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No datasets yet. Create one to start receiving webhook data.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Retention</TableHead>
                <TableHead>Real-time</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {datasets?.map((dataset) => (
                <TableRow key={dataset.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: dataset.color || '#6366f1' }}
                      />
                      <span className="font-medium">{dataset.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">
                    {dataset.description || '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{dataset.retention_days} days</Badge>
                  </TableCell>
                  <TableCell>
                    {dataset.realtime_enabled ? (
                      <Badge variant="default" className="bg-success">
                        <Zap className="h-3 w-3 mr-1" />
                        Live
                      </Badge>
                    ) : (
                      <Badge variant="secondary">Off</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(dataset.created_at), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onSelectDataset?.(dataset)}
                        title="View & Configure"
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(dataset.id, dataset.name)}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}
