import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDeletedCloserGroups, useMapDeletedCloser } from '@/hooks/useDeletedCloserMapping';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { format } from 'date-fns';
import { AlertTriangle, UserX, Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function DeletedCloserMapping() {
  const { currentOrganization } = useOrganization();
  const { data: deletedGroups, isLoading } = useDeletedCloserGroups();
  const mapMutation = useMapDeletedCloser();
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [selectedCloser, setSelectedCloser] = useState('');

  // Fetch closers for dropdown
  const { data: closers } = useQuery({
    queryKey: ['closers-for-mapping', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('closers')
        .select('id, name, email')
        .eq('organization_id', currentOrganization.id)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrganization?.id,
  });

  // Also get unique closer names from events for suggestions
  const { data: eventCloserNames } = useQuery({
    queryKey: ['event-closer-names', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      const { data, error } = await supabase
        .from('events')
        .select('closer_name')
        .eq('organization_id', currentOrganization.id)
        .not('closer_name', 'is', null)
        .neq('closer_name', 'deleted')
        .neq('closer_name', 'Unknown');
      if (error) throw error;
      // Get unique names
      const names = new Set(data?.map(e => e.closer_name).filter(Boolean));
      return Array.from(names).sort() as string[];
    },
    enabled: !!currentOrganization?.id,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            Deleted Closer Mapping
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!deletedGroups || deletedGroups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserX className="h-5 w-5" />
            Deleted Closer Mapping
          </CardTitle>
          <CardDescription>
            Map events from deleted Calendly users to actual closer names
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary" />
            No events with deleted closers found
          </div>
        </CardContent>
      </Card>
    );
  }

  // Combine closers from table and unique names from events
  const allCloserOptions = new Set<string>();
  closers?.forEach(c => allCloserOptions.add(c.name));
  eventCloserNames?.forEach(name => allCloserOptions.add(name));
  const closerOptions = Array.from(allCloserOptions).sort();

  const handleSave = (uuid: string) => {
    if (!selectedCloser) return;
    mapMutation.mutate(
      { deletedUserUuid: uuid, newCloserName: selectedCloser },
      {
        onSuccess: () => {
          setEditingUuid(null);
          setSelectedCloser('');
        },
      }
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserX className="h-5 w-5" />
          Deleted Closer Mapping
        </CardTitle>
        <CardDescription>
          Some events have closers marked as "deleted" because the Calendly user was removed. 
          Select the actual closer name to fix your data.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
          <span className="text-sm text-destructive">
            {deletedGroups.reduce((sum, g) => sum + g.eventCount, 0)} events need closer name assignment
          </span>
        </div>

        <div className="space-y-3">
          {deletedGroups.map((group) => (
            <div
              key={group.deletedUserUuid}
              className="flex items-center justify-between gap-4 p-3 border rounded-lg bg-card"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="secondary" className="font-mono text-xs">
                    {group.deletedUserUuid.substring(0, 8)}...
                  </Badge>
                  <Badge variant="outline">{group.eventCount} events</Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(group.firstEvent), 'MMM d, yyyy')} - {format(new Date(group.lastEvent), 'MMM d, yyyy')}
                </p>
              </div>

              {editingUuid === group.deletedUserUuid ? (
                <div className="flex items-center gap-2">
                  <Select value={selectedCloser} onValueChange={setSelectedCloser}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select closer" />
                    </SelectTrigger>
                    <SelectContent>
                      {closerOptions.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleSave(group.deletedUserUuid)}
                    disabled={!selectedCloser || mapMutation.isPending}
                  >
                    {mapMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      'Save'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingUuid(null);
                      setSelectedCloser('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingUuid(group.deletedUserUuid);
                    setSelectedCloser('');
                  }}
                >
                  Assign Name
                </Button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
