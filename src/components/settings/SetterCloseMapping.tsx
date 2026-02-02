import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Headphones, Check, X, Edit2, Save, Loader2 } from 'lucide-react';

interface Setter {
  id: string;
  name: string;
  email: string | null;
  close_user_id: string | null;
  is_active: boolean;
}

export function SetterCloseMapping() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const { data: setters, isLoading } = useQuery({
    queryKey: ['setters-with-close-id', currentOrganization?.id],
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

  const updateMutation = useMutation({
    mutationFn: async ({ setterId, closeUserId }: { setterId: string; closeUserId: string | null }) => {
      const { error } = await supabase
        .from('setters')
        .update({ close_user_id: closeUserId || null })
        .eq('id', setterId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setters-with-close-id'] });
      toast.success('Close user ID updated');
      setEditingId(null);
      setEditValue('');
    },
    onError: (error) => {
      console.error('Failed to update Close user ID:', error);
      toast.error('Failed to update Close user ID');
    },
  });

  const handleEdit = (setter: Setter) => {
    setEditingId(setter.id);
    setEditValue(setter.close_user_id || '');
  };

  const handleSave = (setterId: string) => {
    updateMutation.mutate({ setterId, closeUserId: editValue.trim() || null });
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditValue('');
  };

  const mappedCount = setters?.filter(s => s.close_user_id).length || 0;
  const totalCount = setters?.length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Headphones className="h-5 w-5" />
          Close CRM User Mapping
        </CardTitle>
        <CardDescription>
          Link setters to their Close CRM user IDs to track dial metrics.
          {' '}
          <Badge variant="outline" className="ml-1">
            {mappedCount}/{totalCount} mapped
          </Badge>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !setters || setters.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Headphones className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No setters found</p>
            <p className="text-sm mt-1">Add setters in Settings to map them to Close</p>
          </div>
        ) : (
          <div className="space-y-3">
            {setters.map((setter) => (
              <div
                key={setter.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`h-2 w-2 rounded-full ${setter.close_user_id ? 'bg-green-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className="font-medium">{setter.name}</p>
                    {setter.email && (
                      <p className="text-xs text-muted-foreground">{setter.email}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {editingId === setter.id ? (
                    <>
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        placeholder="user_xxxxx..."
                        className="w-[280px] font-mono text-sm"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleSave(setter.id)}
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 text-green-600" />
                        )}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleCancel}
                        disabled={updateMutation.isPending}
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </>
                  ) : (
                    <>
                      {setter.close_user_id ? (
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono max-w-[200px] truncate">
                          {setter.close_user_id}
                        </code>
                      ) : (
                        <span className="text-sm text-muted-foreground">Not mapped</span>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleEdit(setter)}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
          <p className="font-medium mb-1">How to find Close user IDs:</p>
          <ol className="list-decimal list-inside space-y-1 text-xs">
            <li>Go to Close CRM → Settings → Users</li>
            <li>Click on a user's name</li>
            <li>The user ID is in the URL: <code className="bg-background px-1 rounded">close.com/user/user_xxxxxx</code></li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
