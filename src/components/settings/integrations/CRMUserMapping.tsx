import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Headphones, Save, X, Edit2, Loader2, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { CRMConfig } from '@/hooks/useIntegrationConfig';

interface Setter {
  id: string;
  name: string;
  email: string | null;
  close_user_id: string | null;
  is_active: boolean;
}

interface CloseUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface CRMUserMappingProps {
  crmConfig: CRMConfig;
}

export function CRMUserMapping({ crmConfig }: CRMUserMappingProps) {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Fetch setters from our database
  const { data: setters, isLoading } = useQuery({
    queryKey: ['setters-with-crm-id', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters')
        .select('id, name, email, close_user_id, is_active')
        .eq('organization_id', currentOrganization!.id)
        .order('name');
      if (error) throw error;
      return data as Setter[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch Close CRM users
  const { data: closeUsers, isLoading: closeUsersLoading, refetch: refetchCloseUsers } = useQuery({
    queryKey: ['close-crm-users', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-close-users', {
        body: { organization_id: currentOrganization!.id },
      });
      if (error) throw error;
      return (data?.users || []) as CloseUser[];
    },
    enabled: !!currentOrganization?.id && crmConfig.id === 'close',
  });

  const updateMutation = useMutation({
    mutationFn: async ({ setterId, crmUserId }: { setterId: string; crmUserId: string | null }) => {
      const { error } = await supabase.from('setters').update({ close_user_id: crmUserId || null }).eq('id', setterId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setters-with-crm-id'] });
      toast.success(`${crmConfig.userIdLabel} updated`);
      setEditingId(null);
      setEditValue('');
    },
    onError: () => toast.error(`Failed to update`),
  });

  const mappedCount = setters?.filter(s => s.close_user_id).length || 0;

  // Helper to get Close user display name
  const getCloseUserName = (userId: string) => {
    const user = closeUsers?.find(u => u.id === userId);
    if (user) {
      return `${user.first_name} ${user.last_name}`.trim() || user.email;
    }
    return userId;
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between cursor-pointer hover:bg-muted/50 p-2 rounded-lg transition-colors">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            <Headphones className="h-5 w-5 text-muted-foreground" />
            <h4 className="font-medium">{crmConfig.shortName} User Mapping</h4>
          </div>
          <Badge variant="outline">{mappedCount}/{setters?.length || 0} mapped</Badge>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="pt-2">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-muted-foreground">Sync users to your CRM.</p>
          {crmConfig.id === 'close' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetchCloseUsers()}
              disabled={closeUsersLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${closeUsersLoading ? 'animate-spin' : ''}`} />
              Refresh Users
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : !setters?.length ? (
          <div className="text-center py-6 text-muted-foreground">
            <Headphones className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p>No setters found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {setters.map((setter) => (
              <div key={setter.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${setter.close_user_id ? 'bg-success' : 'bg-muted-foreground/30'}`} />
                  <p className="font-medium text-sm">{setter.name}</p>
                </div>
                <div className="flex items-center gap-2">
                  {editingId === setter.id ? (
                    <>
                      {crmConfig.id === 'close' && closeUsers && closeUsers.length > 0 ? (
                        <Select value={editValue || '__none__'} onValueChange={(v) => setEditValue(v === '__none__' ? '' : v)}>
                          <SelectTrigger className="w-[220px]">
                            <SelectValue placeholder="Select a Close user..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">None</SelectItem>
                            {closeUsers.map((user) => (
                              <SelectItem key={user.id} value={user.id}>
                                {user.first_name} {user.last_name} ({user.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">Loading users...</span>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => updateMutation.mutate({ setterId: setter.id, crmUserId: editValue.trim() || null })} disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-success" />}
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      {setter.close_user_id ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                          {closeUsers?.length ? getCloseUserName(setter.close_user_id) : setter.close_user_id}
                        </code>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not mapped</span>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => { setEditingId(setter.id); setEditValue(setter.close_user_id || ''); }}><Edit2 className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
