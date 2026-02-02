import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus, LayoutDashboard, MoreVertical, Pencil, Trash2, Share2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { 
  useWebhookDashboards, 
  useCreateWebhookDashboard, 
  useDeleteWebhookDashboard,
  useUpdateWebhookDashboard,
  WebhookDashboard 
} from '@/hooks/useWebhookDashboard';
import { formatDistanceToNow } from 'date-fns';

interface DashboardListProps {
  onSelectDashboard: (dashboard: WebhookDashboard) => void;
}

export function DashboardList({ onSelectDashboard }: DashboardListProps) {
  const { data: dashboards, isLoading } = useWebhookDashboards();
  const createDashboard = useCreateWebhookDashboard();
  const deleteDashboard = useDeleteWebhookDashboard();
  const updateDashboard = useUpdateWebhookDashboard();
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newDashboard, setNewDashboard] = useState({ name: '', description: '' });
  const [editingDashboard, setEditingDashboard] = useState<WebhookDashboard | null>(null);

  const handleCreate = async () => {
    if (!newDashboard.name.trim()) {
      toast.error('Dashboard name is required');
      return;
    }

    try {
      await createDashboard.mutateAsync({
        name: newDashboard.name,
        description: newDashboard.description || null,
        layout_config: { columns: 12, rowHeight: 80 },
      });
      toast.success('Dashboard created');
      setIsCreateOpen(false);
      setNewDashboard({ name: '', description: '' });
    } catch (error) {
      toast.error('Failed to create dashboard');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this dashboard? All widgets will be removed.')) {
      return;
    }

    try {
      await deleteDashboard.mutateAsync(id);
      toast.success('Dashboard deleted');
    } catch (error) {
      toast.error('Failed to delete dashboard');
    }
  };

  const handleToggleShare = async (dashboard: WebhookDashboard) => {
    try {
      await updateDashboard.mutateAsync({
        id: dashboard.id,
        is_shared: !dashboard.is_shared,
        share_token: !dashboard.is_shared ? crypto.randomUUID() : null,
      });
      toast.success(dashboard.is_shared ? 'Dashboard is now private' : 'Dashboard is now shared');
    } catch (error) {
      toast.error('Failed to update sharing');
    }
  };

  const handleUpdateDashboard = async () => {
    if (!editingDashboard) return;
    
    try {
      await updateDashboard.mutateAsync({
        id: editingDashboard.id,
        name: editingDashboard.name,
        description: editingDashboard.description,
      });
      toast.success('Dashboard updated');
      setEditingDashboard(null);
    } catch (error) {
      toast.error('Failed to update dashboard');
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader>
              <div className="h-5 w-32 bg-muted rounded" />
              <div className="h-4 w-48 bg-muted rounded mt-2" />
            </CardHeader>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your Dashboards</h2>
          <p className="text-sm text-muted-foreground">
            Create custom dashboards with widgets powered by your datasets
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New Dashboard
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Dashboard</DialogTitle>
              <DialogDescription>
                Create a new dashboard to visualize your webhook data
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Sales Dashboard"
                  value={newDashboard.name}
                  onChange={(e) => setNewDashboard({ ...newDashboard, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Track sales metrics and revenue..."
                  value={newDashboard.description}
                  onChange={(e) => setNewDashboard({ ...newDashboard, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={createDashboard.isPending}>
                {createDashboard.isPending ? 'Creating...' : 'Create Dashboard'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {dashboards?.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <LayoutDashboard className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium">No dashboards yet</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Create your first dashboard to start visualizing data
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Dashboard
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dashboards?.map((dashboard) => (
            <Card 
              key={dashboard.id} 
              className="cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => onSelectDashboard(dashboard)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{dashboard.name}</CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSelectDashboard(dashboard); }}>
                        <Eye className="h-4 w-4 mr-2" />
                        Open
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setEditingDashboard(dashboard); }}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggleShare(dashboard); }}>
                        <Share2 className="h-4 w-4 mr-2" />
                        {dashboard.is_shared ? 'Make Private' : 'Share'}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={(e) => { e.stopPropagation(); handleDelete(dashboard.id); }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <CardDescription className="line-clamp-2">
                  {dashboard.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {dashboard.is_shared && (
                    <Badge variant="secondary" className="text-xs">
                      <Share2 className="h-3 w-3 mr-1" />
                      Shared
                    </Badge>
                  )}
                  <span>Created {formatDistanceToNow(new Date(dashboard.created_at))} ago</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dashboard Dialog */}
      <Dialog open={!!editingDashboard} onOpenChange={(open) => !open && setEditingDashboard(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Dashboard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={editingDashboard?.name || ''}
                onChange={(e) => setEditingDashboard(prev => prev ? { ...prev, name: e.target.value } : null)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editingDashboard?.description || ''}
                onChange={(e) => setEditingDashboard(prev => prev ? { ...prev, description: e.target.value } : null)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingDashboard(null)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateDashboard} disabled={updateDashboard.isPending}>
              {updateDashboard.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
