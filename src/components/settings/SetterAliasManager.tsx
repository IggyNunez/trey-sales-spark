import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useSetterAliases, SetterAlias } from '@/hooks/useSetterAliases';
import { isJunkSetterName } from '@/lib/identityResolver';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, Plus, Trash2, ArrowRight, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface PotentialAlias {
  aliasName: string;
  suggestedCanonical: string;
  eventCount: number;
}

export function SetterAliasManager() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();
  const { data: aliases, isLoading: aliasesLoading } = useSetterAliases();
  
  const [newAlias, setNewAlias] = useState('');
  const [newCanonical, setNewCanonical] = useState('');

  // Fetch setters table for canonical name suggestions
  const { data: setters } = useQuery({
    queryKey: ['setters-for-alias', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters')
        .select('id, name')
        .eq('organization_id', orgId!)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  // Fetch setter names from events to detect potential aliases
  const { data: eventSetterNames } = useQuery({
    queryKey: ['event-setter-names', orgId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('events')
        .select('setter_name, booking_metadata')
        .eq('organization_id', orgId!)
        .not('setter_name', 'is', null);
      if (error) throw error;
      
      // Count occurrences of each setter name
      const counts: Record<string, number> = {};
      data?.forEach(event => {
        const setterName = event.setter_name?.trim();
        const utmSetter = (event.booking_metadata as { utm_setter?: string } | null)?.utm_setter?.trim();
        
        if (setterName && !isJunkSetterName(setterName)) {
          counts[setterName] = (counts[setterName] || 0) + 1;
        }
        if (utmSetter && !isJunkSetterName(utmSetter)) {
          counts[utmSetter] = (counts[utmSetter] || 0) + 1;
        }
      });
      
      return counts;
    },
    enabled: !!orgId,
  });

  // Detect potential aliases - names that don't match any setter exactly
  const potentialAliases = useMemo((): PotentialAlias[] => {
    if (!eventSetterNames || !setters) return [];
    
    const setterNamesLower = new Set(setters.map(s => s.name.toLowerCase()));
    const existingAliases = new Set(aliases?.map(a => a.alias_name.toLowerCase()) || []);
    
    const suggestions: PotentialAlias[] = [];
    
    Object.entries(eventSetterNames).forEach(([name, count]) => {
      const lowerName = name.toLowerCase();
      
      // Skip if already matches a setter or already has an alias
      if (setterNamesLower.has(lowerName) || existingAliases.has(lowerName)) {
        return;
      }
      
      // Try to find a matching setter (partial match)
      const suggestedCanonical = setters.find(s => 
        s.name.toLowerCase().includes(lowerName) || 
        lowerName.includes(s.name.toLowerCase().split(' ')[0]) // First name match
      );
      
      if (suggestedCanonical) {
        suggestions.push({
          aliasName: name,
          suggestedCanonical: suggestedCanonical.name,
          eventCount: count,
        });
      }
    });
    
    return suggestions.sort((a, b) => b.eventCount - a.eventCount);
  }, [eventSetterNames, setters, aliases]);

  // Create alias mutation
  const createAlias = useMutation({
    mutationFn: async ({ aliasName, canonicalName }: { aliasName: string; canonicalName: string }) => {
      const { error } = await supabase
        .from('setter_aliases')
        .insert({
          organization_id: orgId!,
          alias_name: aliasName.toLowerCase().trim(),
          canonical_name: canonicalName.trim(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setter-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['setter-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['utm-setter-metrics'] });
      toast.success('Alias created successfully');
      setNewAlias('');
      setNewCanonical('');
    },
    onError: (error: Error) => {
      toast.error(`Failed to create alias: ${error.message}`);
    },
  });

  // Delete alias mutation
  const deleteAlias = useMutation({
    mutationFn: async (aliasId: string) => {
      const { error } = await supabase
        .from('setter_aliases')
        .delete()
        .eq('id', aliasId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setter-aliases'] });
      queryClient.invalidateQueries({ queryKey: ['setter-leaderboard'] });
      queryClient.invalidateQueries({ queryKey: ['utm-setter-metrics'] });
      toast.success('Alias deleted');
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete alias: ${error.message}`);
    },
  });

  const handleCreateAlias = (aliasName: string, canonicalName: string) => {
    createAlias.mutate({ aliasName, canonicalName });
  };

  if (aliasesLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Setter Alias Manager</CardTitle>
        <CardDescription>
          Map setter name variants (e.g., "jack") to canonical names (e.g., "Jack Hanson") for unified metrics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Potential Aliases Detection */}
        {potentialAliases.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium">{potentialAliases.length} potential aliases detected</span>
            </div>
            <div className="space-y-2">
              {potentialAliases.slice(0, 5).map((potential) => (
                <div 
                  key={potential.aliasName}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{potential.aliasName}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{potential.suggestedCanonical}</span>
                    <Badge variant="secondary" className="text-xs">
                      {potential.eventCount} events
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleCreateAlias(potential.aliasName, potential.suggestedCanonical)}
                    disabled={createAlias.isPending}
                  >
                    {createAlias.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4 mr-1" />
                    )}
                    Create
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Manual Alias Creation */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Add Custom Alias</h4>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Alias (e.g., jack)"
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              className="max-w-[200px]"
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="Canonical name (e.g., Jack Hanson)"
              value={newCanonical}
              onChange={(e) => setNewCanonical(e.target.value)}
              className="max-w-[250px]"
            />
            <Button
              onClick={() => handleCreateAlias(newAlias, newCanonical)}
              disabled={!newAlias.trim() || !newCanonical.trim() || createAlias.isPending}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </div>

        {/* Active Aliases */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Active Aliases</h4>
          {aliases && aliases.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Alias</TableHead>
                  <TableHead>Canonical Name</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliases.map((alias) => (
                  <TableRow key={alias.id}>
                    <TableCell>
                      <Badge variant="outline">{alias.alias_name}</Badge>
                    </TableCell>
                    <TableCell className="font-medium">{alias.canonical_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(alias.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteAlias.mutate(alias.id)}
                        disabled={deleteAlias.isPending}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Alert>
              <AlertDescription>
                No aliases configured yet. Aliases help unify metrics when setter names vary (e.g., "jack" vs "Jack Hanson").
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
