import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useIsHubSpotSyncEnabled } from '@/hooks/useHubSpotSync';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '@/hooks/useOrganization';

interface SyncResult {
  synced: number;
  errors: number;
  skipped: number;
  details: string[];
}

export function HubSpotSyncCard() {
  const { toast } = useToast();
  const { currentOrganization } = useOrganization();
  const isEnabled = useIsHubSpotSyncEnabled();
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  // Fetch stats about HubSpot sync status
  const { data: syncStats, refetch: refetchStats } = useQuery({
    queryKey: ['hubspot-sync-stats', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return null;
      
      // Get count of events with hubspot_contact_id
      const { count: totalWithContact } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', currentOrganization.id)
        .not('hubspot_contact_id', 'is', null);

      // Get count of events with hubspot_custom_fields populated
      const { count: synced } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', currentOrganization.id)
        .not('hubspot_contact_id', 'is', null)
        .not('hubspot_custom_fields', 'is', null)
        .neq('hubspot_custom_fields', '{}');

      return {
        totalWithContact: totalWithContact || 0,
        synced: synced || 0,
        pending: (totalWithContact || 0) - (synced || 0),
      };
    },
    enabled: isEnabled && !!currentOrganization?.id,
  });

  const handleSync = async () => {
    if (!currentOrganization?.id) return;
    
    setIsSyncing(true);
    setLastResult(null);

    try {
      const { data, error } = await supabase.functions.invoke('sync-hubspot-attribution', {
        body: { organization_id: currentOrganization.id, limit: 500 },
      });

      if (error) throw error;

      if (data?.success && data?.result) {
        setLastResult(data.result);
        toast({
          title: 'HubSpot Sync Complete',
          description: `Synced ${data.result.synced} events${data.result.errors > 0 ? `, ${data.result.errors} errors` : ''}`,
        });
        refetchStats();
      } else {
        throw new Error(data?.error || 'Sync failed');
      }
    } catch (error) {
      toast({
        title: 'Sync Failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Only show for Trenton org
  if (!isEnabled) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-warning" />
            <CardTitle className="text-lg">HubSpot Attribution Sync</CardTitle>
          </div>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            Trenton Only
          </Badge>
        </div>
        <CardDescription>
          Sync contact properties from HubSpot for lead attribution analysis.
          Daily auto-sync runs at 6 AM UTC.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync stats */}
        {syncStats && (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 rounded-lg bg-muted/50">
              <p className="text-2xl font-bold">{syncStats.totalWithContact}</p>
              <p className="text-xs text-muted-foreground">Linked to HubSpot</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-success/10">
              <p className="text-2xl font-bold text-success">{syncStats.synced}</p>
              <p className="text-xs text-muted-foreground">Properties Synced</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-warning/10">
              <p className="text-2xl font-bold text-warning">{syncStats.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </div>
        )}

        {/* Last sync result */}
        {lastResult && (
          <div className="p-3 rounded-lg border bg-muted/30">
            <p className="text-sm font-medium mb-2">Last Sync Result</p>
            <div className="flex gap-4 text-sm">
              <span className="flex items-center gap-1 text-success">
                <CheckCircle2 className="h-4 w-4" /> {lastResult.synced} synced
              </span>
              {lastResult.errors > 0 && (
                <span className="flex items-center gap-1 text-destructive">
                  <AlertCircle className="h-4 w-4" /> {lastResult.errors} errors
                </span>
              )}
              {lastResult.skipped > 0 && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-4 w-4" /> {lastResult.skipped} skipped
                </span>
              )}
            </div>
          </div>
        )}

        {/* Sync button */}
        <Button 
          onClick={handleSync} 
          disabled={isSyncing}
          className="w-full"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Syncing HubSpot Data...' : 'Sync Now'}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Properties synced: Lifecycle Stage, Lead Status, Analytics Source, First/Last URLs, Page Views
        </p>
      </CardContent>
    </Card>
  );
}
