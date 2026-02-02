import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Copy, Trash2, Webhook, RefreshCw, Loader2, CheckCircle, Pencil, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useOrganization } from '@/hooks/useOrganization';
import { getSafeErrorMessage } from '@/lib/errorUtils';

interface WebhookConnection {
  id: string;
  name: string;
  connection_type: string;
  api_key: string | null;
  webhook_secret: string | null;
  is_active: boolean;
  created_at: string;
  last_webhook_at: string | null;
  webhook_count: number;
  organization_id: string | null;
}

const CONNECTION_TYPES = [
  { value: 'whop', label: 'Whop' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'generic', label: 'Generic Webhook' },
];

export function WebhookConnectionsManager() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<WebhookConnection | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [newConnection, setNewConnection] = useState({
    name: '',
    connection_type: 'whop',
    api_key: '',
  });
  const [editApiKey, setEditApiKey] = useState('');
  const [showNewApiKey, setShowNewApiKey] = useState(false);
  const [showEditApiKey, setShowEditApiKey] = useState(false);

  const { data: connections, isLoading } = useQuery({
    queryKey: ['webhook-connections', orgId],
    queryFn: async () => {
      let query = supabase
        .from('webhook_connections')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as WebhookConnection[];
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (connection: typeof newConnection) => {
      const { data, error } = await supabase
        .from('webhook_connections')
        .insert({
          name: connection.name,
          connection_type: connection.connection_type,
          api_key: connection.api_key || null,
          organization_id: orgId || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections', orgId] });
      setIsDialogOpen(false);
      setNewConnection({ name: '', connection_type: 'whop', api_key: '' });
      toast.success('Connection created');
    },
    onError: (error) => {
      toast.error('Failed to create connection: ' + getSafeErrorMessage(error, 'Please try again.'));
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('webhook_connections')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections', orgId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('webhook_connections')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections', orgId] });
      toast.success('Connection deleted');
    },
  });

  const updateApiKeyMutation = useMutation({
    mutationFn: async ({ id, api_key }: { id: string; api_key: string }) => {
      const { error } = await supabase
        .from('webhook_connections')
        .update({ api_key: api_key || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections', orgId] });
      setEditingConnection(null);
      setEditApiKey('');
      toast.success('API key updated');
    },
    onError: (error) => {
      toast.error('Failed to update API key: ' + getSafeErrorMessage(error, 'Please try again.'));
    },
  });

  const getWebhookUrl = (connectionId: string) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    return `https://${projectId}.supabase.co/functions/v1/generic-webhook?connection_id=${connectionId}`;
  };

  const copyWebhookUrl = (connectionId: string) => {
    navigator.clipboard.writeText(getWebhookUrl(connectionId));
    toast.success('Webhook URL copied to clipboard');
  };

  const testConnection = async (connection: WebhookConnection) => {
    if (!connection.api_key) {
      toast.error('No API key configured for this connection');
      return;
    }

    setTestingId(connection.id);
    try {
      const { data, error } = await supabase.functions.invoke('sync-whop-connection', {
        body: { action: 'test', connectionId: connection.id }
      });

      if (error) throw error;

      toast.success(`Connection "${connection.name}" is working!`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const syncConnection = async (connection: WebhookConnection) => {
    if (!connection.api_key) {
      toast.error('No API key configured. Add an API key to sync via API.');
      return;
    }

    setSyncingId(connection.id);
    try {
      const { data, error } = await supabase.functions.invoke('sync-whop-connection', {
        body: { action: 'sync', connectionId: connection.id }
      });

      if (error) throw error;

      toast.success(
        `Synced ${connection.name}: ${data.created} created, ${data.matched} matched, ${data.updated} updated`
      );
      queryClient.invalidateQueries({ queryKey: ['webhook-connections', orgId] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Connections
            </CardTitle>
            <CardDescription>
              Connect multiple Whop accounts and payment processors via API + webhooks
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Connection
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Webhook Connection</DialogTitle>
                <DialogDescription>
                  Create a new connection for a Whop account or payment processor
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Connection Name</Label>
                  <Input
                    id="name"
                    placeholder="e.g., Whop - Main Account"
                    value={newConnection.name}
                    onChange={(e) => setNewConnection({ ...newConnection, name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Connection Type</Label>
                  <Select
                    value={newConnection.connection_type}
                    onValueChange={(value) => setNewConnection({ ...newConnection, connection_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONNECTION_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api_key">API Key {newConnection.connection_type === 'whop' || newConnection.connection_type === 'stripe' ? '(Required for API sync)' : '(Optional)'}</Label>
                  <div className="relative">
                    <Input
                      id="api_key"
                      type={showNewApiKey ? 'text' : 'password'}
                      placeholder={newConnection.connection_type === 'whop' ? 'Whop API Key for syncing payments' : newConnection.connection_type === 'stripe' ? 'Stripe Secret Key (sk_...)' : 'API key for syncing (optional)'}
                      value={newConnection.api_key}
                      onChange={(e) => setNewConnection({ ...newConnection, api_key: e.target.value })}
                      className="pr-10"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowNewApiKey(!showNewApiKey)}
                    >
                      {showNewApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  {newConnection.connection_type === 'whop' && (
                    <p className="text-xs text-muted-foreground">
                      Get your API key from Whop Dashboard → Developer → API Keys
                    </p>
                  )}
                  {newConnection.connection_type === 'stripe' && (
                    <p className="text-xs text-muted-foreground">
                      Get your secret key from Stripe Dashboard → Developers → API Keys
                    </p>
                  )}
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => createMutation.mutate(newConnection)}
                  disabled={!newConnection.name || createMutation.isPending}
                >
                  Create Connection
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-muted-foreground text-sm">Loading...</div>
        ) : connections?.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No webhook connections yet. Add one to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>API</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Synced</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections?.map((conn) => (
                <TableRow key={conn.id}>
                  <TableCell className="font-medium">{conn.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {CONNECTION_TYPES.find((t) => t.value === conn.connection_type)?.label || conn.connection_type}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {conn.api_key ? (
                      <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                        Configured
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Webhook Only
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={conn.is_active}
                      onCheckedChange={(checked) => toggleMutation.mutate({ id: conn.id, is_active: checked })}
                    />
                  </TableCell>
                  <TableCell>{conn.webhook_count}</TableCell>
                  <TableCell>
                    {conn.last_webhook_at 
                      ? format(new Date(conn.last_webhook_at), 'MMM d, h:mm a')
                      : 'Never'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {conn.connection_type === 'whop' && conn.api_key && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => testConnection(conn)}
                            disabled={testingId === conn.id}
                            title="Test API connection"
                          >
                            {testingId === conn.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => syncConnection(conn)}
                            disabled={syncingId === conn.id}
                            title="Sync payments via API"
                          >
                            {syncingId === conn.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingConnection(conn);
                          setEditApiKey('');
                        }}
                        title="Edit API key"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => copyWebhookUrl(conn.id)}
                        title="Copy webhook URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm('Delete this connection?')) {
                            deleteMutation.mutate(conn.id);
                          }
                        }}
                        title="Delete connection"
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

      {/* Edit API Key Dialog */}
      <Dialog open={!!editingConnection} onOpenChange={(open) => !open && setEditingConnection(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit API Key - {editingConnection?.name}</DialogTitle>
            <DialogDescription>
              Update the API key for this Whop connection
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Current Status</Label>
              <div>
                {editingConnection?.api_key ? (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    API Key Configured
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    No API Key
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit_api_key">New API Key</Label>
              <div className="relative">
                <Input
                  id="edit_api_key"
                  type={showEditApiKey ? 'text' : 'password'}
                  placeholder={editingConnection?.connection_type === 'stripe' ? 'Enter Stripe secret key (sk_...)' : 'Enter new API key'}
                  value={editApiKey}
                  onChange={(e) => setEditApiKey(e.target.value)}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowEditApiKey(!showEditApiKey)}
                >
                  {showEditApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {editingConnection?.connection_type === 'stripe' 
                  ? 'Get your secret key from Stripe Dashboard → Developers → API Keys'
                  : 'Get your API key from the provider dashboard'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setEditingConnection(null)}
              >
                Cancel
              </Button>
              <Button 
                className="flex-1" 
                onClick={() => editingConnection && updateApiKeyMutation.mutate({ 
                  id: editingConnection.id, 
                  api_key: editApiKey 
                })}
                disabled={!editApiKey || updateApiKeyMutation.isPending}
              >
                {updateApiKeyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Save API Key
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
