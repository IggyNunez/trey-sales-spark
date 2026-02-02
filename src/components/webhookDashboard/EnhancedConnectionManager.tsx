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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus, Copy, Trash2, Webhook, Settings2, Loader2, 
  Eye, EyeOff, Database, Tag, Shield, Zap, Link2, ExternalLink
} from 'lucide-react';
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
  signature_type: string | null;
  signature_secret: string | null;
  rate_limit_per_minute: number | null;
  tags: string[] | null;
  dataset_id: string | null;
  icon: string | null;
  color: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  last_webhook_at: string | null;
  webhook_count: number;
  organization_id: string | null;
}

interface Dataset {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
}

const CONNECTION_TYPES = [
  { value: 'stripe', label: 'Stripe', icon: '💳', color: '#6366f1' },
  { value: 'whop', label: 'Whop', icon: '🛒', color: '#10b981' },
  { value: 'n8n', label: 'n8n', icon: '⚡', color: '#f59e0b' },
  { value: 'zapier', label: 'Zapier', icon: '🔌', color: '#ff4a00' },
  { value: 'shifi', label: 'Shifi', icon: '💰', color: '#8b5cf6' },
  { value: 'custom', label: 'Custom', icon: '🔧', color: '#6b7280' },
];

const SIGNATURE_TYPES = [
  { value: 'none', label: 'No Signature', description: 'Accept all payloads without verification' },
  { value: 'hmac_sha256', label: 'HMAC-SHA256', description: 'Standard webhook signature (Stripe, Whop)' },
  { value: 'header_token', label: 'Header Token', description: 'Simple token in X-Webhook-Token header' },
];

const TAG_SUGGESTIONS = ['payments', 'crm', 'marketing', 'notifications', 'analytics', 'automation'];

export function EnhancedConnectionManager() {
  const queryClient = useQueryClient();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<WebhookConnection | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [tagInput, setTagInput] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    connection_type: 'custom',
    description: '',
    signature_type: 'none',
    signature_secret: '',
    rate_limit_per_minute: 60,
    tags: [] as string[],
    dataset_id: '',
  });

  // Fetch connections
  const { data: connections, isLoading } = useQuery({
    queryKey: ['webhook-connections-enhanced', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('webhook_connections')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WebhookConnection[];
    },
    enabled: !!orgId,
  });

  // Fetch datasets for linking
  const { data: datasets } = useQuery({
    queryKey: ['datasets-for-connections', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('datasets')
        .select('id, name, icon, color')
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return data as Dataset[];
    },
    enabled: !!orgId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const connectionType = CONNECTION_TYPES.find(t => t.value === data.connection_type);
      const { data: result, error } = await supabase
        .from('webhook_connections')
        .insert({
          name: data.name,
          connection_type: data.connection_type,
          description: data.description || null,
          signature_type: data.signature_type,
          signature_secret_encrypted: data.signature_secret || null,
          rate_limit_per_minute: data.rate_limit_per_minute,
          tags: data.tags.length > 0 ? data.tags : null,
          dataset_id: data.dataset_id || null,
          icon: connectionType?.icon || null,
          color: connectionType?.color || null,
          organization_id: orgId,
        })
        .select()
        .single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections-enhanced', orgId] });
      setIsDialogOpen(false);
      resetForm();
      toast.success('Webhook connection created');
    },
    onError: (error) => {
      toast.error('Failed to create connection: ' + getSafeErrorMessage(error));
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<typeof formData>) => {
      const { error } = await supabase
        .from('webhook_connections')
        .update({
          name: data.name,
          description: data.description || null,
          signature_type: data.signature_type,
          signature_secret_encrypted: data.signature_secret || null,
          rate_limit_per_minute: data.rate_limit_per_minute,
          tags: data.tags && data.tags.length > 0 ? data.tags : null,
          dataset_id: data.dataset_id || null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['webhook-connections-enhanced', orgId] });
      setEditingConnection(null);
      resetForm();
      toast.success('Connection updated');
    },
    onError: (error) => {
      toast.error('Failed to update: ' + getSafeErrorMessage(error));
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
      queryClient.invalidateQueries({ queryKey: ['webhook-connections-enhanced', orgId] });
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
      queryClient.invalidateQueries({ queryKey: ['webhook-connections-enhanced', orgId] });
      toast.success('Connection deleted');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      connection_type: 'custom',
      description: '',
      signature_type: 'none',
      signature_secret: '',
      rate_limit_per_minute: 60,
      tags: [],
      dataset_id: '',
    });
    setActiveTab('basic');
    setShowSecret(false);
    setTagInput('');
  };

  const openEditDialog = (conn: WebhookConnection) => {
    setEditingConnection(conn);
    setFormData({
      name: conn.name,
      connection_type: conn.connection_type,
      description: conn.description || '',
      signature_type: conn.signature_type || 'none',
      signature_secret: '', // Don't show existing secret
      rate_limit_per_minute: conn.rate_limit_per_minute || 60,
      tags: conn.tags || [],
      dataset_id: conn.dataset_id || '',
    });
    setActiveTab('basic');
  };

  const getWebhookUrl = (connectionId: string, withForce = false) => {
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const baseUrl = `https://${projectId}.supabase.co/functions/v1/generic-webhook?connection_id=${connectionId}`;
    return withForce ? `${baseUrl}&force=true` : baseUrl;
  };

  const copyWebhookUrl = (connectionId: string) => {
    navigator.clipboard.writeText(getWebhookUrl(connectionId));
    toast.success('Webhook URL copied. Tip: Add &force=true for testing duplicate payloads.');
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !formData.tags.includes(trimmed)) {
      setFormData({ ...formData, tags: [...formData.tags, trimmed] });
    }
    setTagInput('');
  };

  const removeTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const getConnectionTypeInfo = (type: string) => {
    return CONNECTION_TYPES.find(t => t.value === type) || CONNECTION_TYPES[CONNECTION_TYPES.length - 1];
  };

  const getLinkedDataset = (datasetId: string | null) => {
    return datasets?.find(d => d.id === datasetId);
  };

  // Form content (shared between create and edit)
  const renderFormContent = () => (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="basic">Basic</TabsTrigger>
        <TabsTrigger value="security">Security</TabsTrigger>
        <TabsTrigger value="data">Data</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label htmlFor="name">Connection Name *</Label>
          <Input
            id="name"
            placeholder="e.g., Stripe Production"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="type">Source Type</Label>
          <Select
            value={formData.connection_type}
            onValueChange={(value) => setFormData({ ...formData, connection_type: value })}
            disabled={!!editingConnection}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONNECTION_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <span className="flex items-center gap-2">
                    <span>{type.icon}</span>
                    {type.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="What does this webhook receive?"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <div className="flex flex-wrap gap-1 mb-2">
            {formData.tags.map(tag => (
              <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                {tag} ×
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag(tagInput))}
            />
            <Button type="button" variant="outline" size="sm" onClick={() => addTag(tagInput)}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex flex-wrap gap-1 mt-2">
            {TAG_SUGGESTIONS.filter(t => !formData.tags.includes(t)).slice(0, 4).map(tag => (
              <Badge 
                key={tag} 
                variant="outline" 
                className="cursor-pointer hover:bg-muted" 
                onClick={() => addTag(tag)}
              >
                + {tag}
              </Badge>
            ))}
          </div>
        </div>
      </TabsContent>
      
      <TabsContent value="security" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>Signature Verification</Label>
          <Select
            value={formData.signature_type}
            onValueChange={(value) => setFormData({ ...formData, signature_type: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGNATURE_TYPES.map((type) => (
                <SelectItem key={type.value} value={type.value}>
                  <div className="flex flex-col">
                    <span>{type.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {SIGNATURE_TYPES.find(t => t.value === formData.signature_type)?.description}
          </p>
        </div>

        {formData.signature_type !== 'none' && (
          <div className="space-y-2">
            <Label htmlFor="secret">
              {formData.signature_type === 'hmac_sha256' ? 'Webhook Signing Secret' : 'Token'}
            </Label>
            <div className="relative">
              <Input
                id="secret"
                type={showSecret ? 'text' : 'password'}
                placeholder={editingConnection ? 'Leave empty to keep existing' : 'Enter secret...'}
                value={formData.signature_secret}
                onChange={(e) => setFormData({ ...formData, signature_secret: e.target.value })}
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3"
                onClick={() => setShowSecret(!showSecret)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {formData.connection_type === 'stripe' 
                ? 'Found in Stripe Dashboard → Webhooks → Signing secret'
                : formData.connection_type === 'whop'
                ? 'Found in Whop Dashboard → Webhooks → Secret'
                : 'The secret used by the source to sign payloads'}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="rate_limit">Rate Limit (requests/minute)</Label>
          <Input
            id="rate_limit"
            type="number"
            min={1}
            max={1000}
            value={formData.rate_limit_per_minute}
            onChange={(e) => setFormData({ ...formData, rate_limit_per_minute: parseInt(e.target.value) || 60 })}
          />
          <p className="text-xs text-muted-foreground">
            Limit incoming webhooks to prevent abuse. Default: 60/min
          </p>
        </div>
      </TabsContent>
      
      <TabsContent value="data" className="space-y-4 mt-4">
        <div className="space-y-2">
          <Label>Feed into Dataset</Label>
          <Select
            value={formData.dataset_id || '__none__'}
            onValueChange={(value) => setFormData({ ...formData, dataset_id: value === '__none__' ? '' : value })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select a dataset (optional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No dataset (process manually)</SelectItem>
              {datasets?.map((dataset) => (
                <SelectItem key={dataset.id} value={dataset.id}>
                  <span className="flex items-center gap-2">
                    <span>{dataset.icon || '📊'}</span>
                    {dataset.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Link this webhook to a dataset for automatic field extraction and real-time dashboards.
          </p>
        </div>

        {!datasets?.length && (
          <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            <Database className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No datasets created yet.</p>
            <p>Create a dataset first in the Datasets tab.</p>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Webhook Sources
            </CardTitle>
            <CardDescription>
              Connect multiple data sources - each gets a unique URL for receiving webhooks
            </CardDescription>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Source
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Webhook Source</DialogTitle>
                <DialogDescription>
                  Create a new webhook endpoint to receive data from external services
                </DialogDescription>
              </DialogHeader>
              {renderFormContent()}
              <DialogFooter>
                <Button 
                  onClick={() => createMutation.mutate(formData)}
                  disabled={!formData.name || createMutation.isPending}
                >
                  {createMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Create Connection
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            Loading...
          </div>
        ) : connections?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No webhook sources yet</h3>
            <p className="mb-4">Add a source to start receiving data from external services.</p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add First Source
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dataset</TableHead>
                <TableHead>Security</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections?.map((conn) => {
                const typeInfo = getConnectionTypeInfo(conn.connection_type);
                const linkedDataset = getLinkedDataset(conn.dataset_id);
                
                return (
                  <TableRow key={conn.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium flex items-center gap-2">
                          <span>{conn.icon || typeInfo.icon}</span>
                          {conn.name}
                        </span>
                        {conn.tags && conn.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {conn.tags.slice(0, 2).map(tag => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {conn.tags.length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{conn.tags.length - 2}
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" style={{ backgroundColor: `${typeInfo.color}20`, color: typeInfo.color }}>
                        {typeInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {linkedDataset ? (
                        <Badge variant="outline" className="flex items-center gap-1 w-fit">
                          <Database className="h-3 w-3" />
                          {linkedDataset.name}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {conn.signature_type === 'hmac_sha256' ? (
                          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                            <Shield className="h-3 w-3 mr-1" />
                            HMAC
                          </Badge>
                        ) : conn.signature_type === 'header_token' ? (
                          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                            <Shield className="h-3 w-3 mr-1" />
                            Token
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            None
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col text-sm">
                        <span>{conn.webhook_count} received</span>
                        {conn.last_webhook_at && (
                          <span className="text-muted-foreground text-xs">
                            {format(new Date(conn.last_webhook_at), 'MMM d, h:mm a')}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={conn.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: conn.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
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
                          onClick={() => openEditDialog(conn)}
                          title="Settings"
                        >
                          <Settings2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (confirm('Delete this connection? This cannot be undone.')) {
                              deleteMutation.mutate(conn.id);
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Edit Dialog */}
      <Dialog open={!!editingConnection} onOpenChange={(open) => { if (!open) { setEditingConnection(null); resetForm(); }}}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Connection - {editingConnection?.name}</DialogTitle>
            <DialogDescription>
              Update settings for this webhook source
            </DialogDescription>
          </DialogHeader>
          
          {editingConnection && (
            <div className="rounded-lg bg-muted p-3 mb-4">
              <Label className="text-xs text-muted-foreground">Webhook URL</Label>
              <div className="flex items-center gap-2 mt-1">
                <code className="text-xs break-all flex-1">{getWebhookUrl(editingConnection.id)}</code>
                <Button size="icon" variant="ghost" onClick={() => copyWebhookUrl(editingConnection.id)}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
          
          {renderFormContent()}
          
          <DialogFooter>
            <Button 
              onClick={() => editingConnection && updateMutation.mutate({ id: editingConnection.id, ...formData })}
              disabled={!formData.name || updateMutation.isPending}
            >
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
