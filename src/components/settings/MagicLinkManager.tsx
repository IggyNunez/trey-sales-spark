import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  useCloserAccessTokens, 
  useCreateCloserAccessToken, 
  useDeleteCloserAccessToken,
  useRegenerateCloserAccessToken 
} from '@/hooks/useCloserAccessTokens';
import { useOrganization } from '@/hooks/useOrganization';
import { 
  Link2, 
  Copy, 
  Trash2, 
  RefreshCw, 
  Plus,
  ExternalLink,
  Clock,
  Users
} from 'lucide-react';
import { format } from 'date-fns';

export function MagicLinkManager() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  
  const [selectedCloser, setSelectedCloser] = useState('');
  const [customCloserName, setCustomCloserName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: tokens, isLoading: tokensLoading } = useCloserAccessTokens();
  const createToken = useCreateCloserAccessToken();
  const deleteToken = useDeleteCloserAccessToken();
  const regenerateToken = useRegenerateCloserAccessToken();

  // Fetch closers for dropdown - filtered by organization
  const { data: closers } = useQuery({
    queryKey: ['closers-for-magic-links', orgId],
    queryFn: async () => {
      let query = supabase
        .from('closers')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Get closers that don't have a token yet
  const availableClosers = closers?.filter(
    closer => !tokens?.some(token => token.closer_name === closer.name)
  );

  const closerNameToUse = useCustomName ? customCloserName.trim() : selectedCloser;

  const handleCreateToken = async () => {
    if (!closerNameToUse) return;

    try {
      await createToken.mutateAsync({ closerName: closerNameToUse });
      toast({
        title: 'Magic Link Created',
        description: `Created access link for ${closerNameToUse}`,
      });
      setSelectedCloser('');
      setCustomCloserName('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create magic link',
        variant: 'destructive',
      });
    }
  };

  const handleCreateUniversalToken = async () => {
    try {
      await createToken.mutateAsync({ closerName: '__UNIVERSAL__' });
      toast({
        title: 'Universal Link Created',
        description: 'Created a universal access link that any closer can use',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create universal link',
        variant: 'destructive',
      });
    }
  };

  const handleCopyLink = (token: string, closerName: string) => {
    const link = `${window.location.origin}/rep?token=${token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(token);
    setTimeout(() => setCopiedId(null), 2000);
    const displayName = closerName === '__UNIVERSAL__' ? 'Universal' : closerName;
    toast({
      title: 'Link Copied!',
      description: `Magic link for ${displayName} copied to clipboard`,
    });
  };

  const handleDelete = async (id: string, closerName: string) => {
    try {
      await deleteToken.mutateAsync(id);
      toast({
        title: 'Link Deleted',
        description: `Removed access link for ${closerName}`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete link',
        variant: 'destructive',
      });
    }
  };

  const handleRegenerate = async (id: string, closerName: string) => {
    try {
      await regenerateToken.mutateAsync(id);
      toast({
        title: 'Link Regenerated',
        description: `New access link created for ${closerName}. Old link no longer works.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to regenerate link',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Magic Links for Closers
        </CardTitle>
        <CardDescription>
          Generate unique URLs for closers to access their PCFs without logging in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 sm:space-y-6">
        {/* Universal Link Section */}
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 sm:p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm sm:text-base">Universal Link</p>
                <p className="text-xs sm:text-sm text-muted-foreground">One link for all closers</p>
              </div>
            </div>
            <Button 
              onClick={handleCreateUniversalToken}
              disabled={createToken.isPending || tokens?.some(t => t.closer_name === '__UNIVERSAL__')}
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              {tokens?.some(t => t.closer_name === '__UNIVERSAL__') ? 'Created' : 'Generate'}
            </Button>
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or create individual links</span>
          </div>
        </div>
        {/* Create New Token */}
        <div className="space-y-3">
          <div className="flex gap-2">
            <Button
              variant={!useCustomName ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseCustomName(false)}
            >
              Select Closer
            </Button>
            <Button
              variant={useCustomName ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseCustomName(true)}
            >
              Enter Name
            </Button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 sm:items-end">
            <div className="flex-1">
              <Label className="mb-2 block text-sm">{useCustomName ? 'Closer Name' : 'Select Closer'}</Label>
              {useCustomName ? (
                <Input
                  placeholder="Enter closer name..."
                  value={customCloserName}
                  onChange={(e) => setCustomCloserName(e.target.value)}
                />
              ) : (
                <Select value={selectedCloser} onValueChange={setSelectedCloser}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a closer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableClosers?.map(closer => (
                      <SelectItem key={closer.id} value={closer.name}>
                        {closer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button 
              onClick={handleCreateToken} 
              disabled={!closerNameToUse || createToken.isPending}
              className="w-full sm:w-auto"
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate Link
            </Button>
          </div>
        </div>

        {/* Tokens List - Mobile Cards / Desktop Table */}
        {tokensLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : tokens && tokens.length > 0 ? (
          <>
            {/* Mobile Card View */}
            <div className="space-y-3 sm:hidden">
              {tokens.map(token => (
                <Card key={token.id} className="p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      {token.closer_name === '__UNIVERSAL__' ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary text-xs">
                          <Users className="h-3 w-3 mr-1" />
                          Universal
                        </Badge>
                      ) : (
                        <p className="font-medium truncate">{token.closer_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Created {format(new Date(token.created_at), 'MMM d')}
                      </p>
                    </div>
                    <Badge variant={token.is_active ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {token.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleCopyLink(token.token, token.closer_name)}
                    >
                      {copiedId === token.token ? (
                        <span className="text-xs text-primary">Copied!</span>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copy Link
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRegenerate(token.id, token.closer_name)}
                      disabled={regenerateToken.isPending}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(token.id, token.closer_name)}
                      disabled={deleteToken.isPending}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>

            {/* Desktop Table View */}
            <div className="border rounded-lg hidden sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closer</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tokens.map(token => (
                  <TableRow key={token.id}>
                    <TableCell className="font-medium">
                      {token.closer_name === '__UNIVERSAL__' ? (
                        <Badge variant="secondary" className="bg-primary/10 text-primary">
                          <Users className="h-3 w-3 mr-1" />
                          Universal (All Closers)
                        </Badge>
                      ) : (
                        token.closer_name
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {format(new Date(token.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {token.last_used_at ? (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(token.last_used_at), 'MMM d, h:mm a')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={token.is_active ? 'default' : 'secondary'}>
                        {token.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyLink(token.token, token.closer_name)}
                          title="Copy link"
                        >
                          {copiedId === token.token ? (
                            <span className="text-xs text-primary">Copied!</span>
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(`/rep?token=${token.token}`, '_blank')}
                          title="Open in new tab"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRegenerate(token.id, token.closer_name)}
                          disabled={regenerateToken.isPending}
                          title="Regenerate link (invalidates old link)"
                        >
                          <RefreshCw className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(token.id, token.closer_name)}
                          disabled={deleteToken.isPending}
                          className="text-destructive hover:text-destructive"
                          title="Delete link"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Link2 className="h-12 w-12 mx-auto mb-4 opacity-20" />
            <p>No magic links created yet</p>
            <p className="text-sm">Select a closer above to generate their unique access link</p>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-muted/50 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium">How it works:</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Each closer gets a unique URL they can bookmark</li>
            <li>No login required - the link grants access to their PCFs only</li>
            <li>You can regenerate a link if it needs to be changed (old link stops working)</li>
            <li>Delete a link to revoke access completely</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
