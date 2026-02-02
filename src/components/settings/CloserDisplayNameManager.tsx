import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, AlertCircle, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface CloserWithDisplayName {
  id: string;
  name: string;
  email: string | null;
  display_name: string | null;
  is_active: boolean;
}

export function CloserDisplayNameManager() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // Fetch closers
  const { data: closers, isLoading } = useQuery({
    queryKey: ['closers-display-names-admin', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('id, name, email, display_name, is_active')
        .eq('organization_id', orgId!)
        .order('name');
      if (error) throw error;
      return data as CloserWithDisplayName[];
    },
    enabled: !!orgId,
  });

  // Fetch unique closer names/emails from events that aren't in closers table
  const { data: missingClosers } = useQuery({
    queryKey: ['missing-closers', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('closer_name, closer_email')
        .eq('organization_id', orgId!)
        .not('closer_email', 'is', null);
      if (error) throw error;
      
      // Get unique closer emails
      const emailMap = new Map<string, { name: string; email: string; count: number }>();
      data?.forEach(event => {
        if (event.closer_email) {
          const key = event.closer_email.toLowerCase();
          if (!emailMap.has(key)) {
            emailMap.set(key, {
              name: event.closer_name || 'Unknown',
              email: event.closer_email,
              count: 1,
            });
          } else {
            emailMap.get(key)!.count++;
          }
        }
      });
      
      return Array.from(emailMap.values());
    },
    enabled: !!orgId,
  });

  // Get closers missing from table
  const closersNotInTable = (missingClosers || []).filter(mc => {
    return !closers?.some(c => c.email?.toLowerCase() === mc.email.toLowerCase());
  });

  // Update display name mutation
  const updateDisplayName = useMutation({
    mutationFn: async ({ id, displayName }: { id: string; displayName: string }) => {
      const { error } = await supabase
        .from('closers')
        .update({ display_name: displayName.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closers-display-names'] });
      queryClient.invalidateQueries({ queryKey: ['closers-display-names-admin'] });
      queryClient.invalidateQueries({ queryKey: ['events-for-closer-platform'] });
      toast.success('Display name updated');
      setEditingId(null);
      setEditValue('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update: ${error.message}`);
    },
  });

  // Backfill email mutation
  const backfillEmail = useMutation({
    mutationFn: async ({ id, email }: { id: string; email: string }) => {
      const { error } = await supabase
        .from('closers')
        .update({ email: email.toLowerCase().trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['closers-display-names'] });
      queryClient.invalidateQueries({ queryKey: ['closers-display-names-admin'] });
      toast.success('Email updated');
    },
    onError: (error: Error) => {
      toast.error(`Failed to update email: ${error.message}`);
    },
  });

  const startEditing = (closer: CloserWithDisplayName) => {
    setEditingId(closer.id);
    setEditValue(closer.display_name || closer.name);
  };

  const saveEdit = (id: string) => {
    updateDisplayName.mutate({ id, displayName: editValue });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const closersMissingEmail = closers?.filter(c => !c.email) || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Closer Display Names</CardTitle>
        <CardDescription>
          Set the preferred display name for each closer. This controls how names appear in leaderboards and reports.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Alert for missing emails */}
        {closersMissingEmail.length > 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {closersMissingEmail.length} closer(s) are missing email addresses. 
              Add emails to enable proper deduplication across name variants.
            </AlertDescription>
          </Alert>
        )}

        {/* Closers Table */}
        {closers && closers.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Display Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {closers.map((closer) => (
                <TableRow key={closer.id}>
                  <TableCell className="font-medium">{closer.name}</TableCell>
                  <TableCell>
                    {editingId === closer.id ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="h-8 w-[200px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(closer.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                      />
                    ) : (
                      <span 
                        className="cursor-pointer hover:text-primary"
                        onClick={() => startEditing(closer)}
                      >
                        {closer.display_name || closer.name}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {closer.email ? (
                      <span className="text-sm text-muted-foreground">{closer.email}</span>
                    ) : (
                      <Badge variant="outline" className="text-amber-600">
                        <Mail className="h-3 w-3 mr-1" />
                        Missing
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={closer.is_active ? 'default' : 'secondary'}>
                      {closer.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {editingId === closer.id ? (
                      <Button
                        size="sm"
                        onClick={() => saveEdit(closer.id)}
                        disabled={updateDisplayName.isPending}
                      >
                        {updateDisplayName.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(closer)}
                      >
                        Edit
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Alert>
            <AlertDescription>
              No closers configured yet. Closers are automatically created when events are synced from your booking platform.
            </AlertDescription>
          </Alert>
        )}

        {/* Closers found in events but not in table */}
        {closersNotInTable.length > 0 && (
          <div className="space-y-3 mt-6">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Closers in events but not in closers table
            </h4>
            <div className="text-xs text-muted-foreground mb-2">
              These closers appear in your events but haven't been added to the closers table yet.
            </div>
            <div className="space-y-2">
              {closersNotInTable.slice(0, 5).map((mc, idx) => (
                <div 
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div>
                    <span className="font-medium">{mc.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">{mc.email}</span>
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {mc.count} events
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
