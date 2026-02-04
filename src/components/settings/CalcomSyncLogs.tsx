import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, RefreshCw, CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface WebhookAuditLog {
  id: string;
  event_type: string;
  attendee_email: string | null;
  organizer_email: string | null;
  event_type_title: string | null;
  processing_result: string | null;
  error_message: string | null;
  created_at: string | null;
  scheduled_at: string | null;
  no_show_guest: boolean | null;
  no_show_host: boolean | null;
}

export function CalcomSyncLogs() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const [showAll, setShowAll] = useState(false);

  const { data: logs, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['calcom-webhook-logs', orgId, showAll],
    queryFn: async (): Promise<WebhookAuditLog[]> => {
      if (!orgId) return [];

      const query = supabase
        .from('calcom_webhook_audit')
        .select('id, event_type, attendee_email, organizer_email, event_type_title, processing_result, error_message, created_at, scheduled_at, no_show_guest, no_show_host')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(showAll ? 100 : 20);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Get last auto-sync timestamp
  const { data: syncSettings } = useQuery({
    queryKey: ['calcom-last-sync', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('calcom_last_auto_sync_at, calcom_auto_sync_enabled')
        .eq('organization_id', orgId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
  });

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'BOOKING_CREATED':
        return 'bg-success/10 text-success border-success/20';
      case 'BOOKING_CANCELLED':
        return 'bg-destructive/10 text-destructive border-destructive/20';
      case 'BOOKING_RESCHEDULED':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'BOOKING_NO_SHOW_UPDATED':
        return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
      case 'MEETING_STARTED':
      case 'MEETING_ENDED':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'RECORDING_READY':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getResultIcon = (result: string | null, error: string | null) => {
    if (error) return <XCircle className="h-4 w-4 text-destructive" />;
    if (result === 'created' || result === 'updated') return <CheckCircle2 className="h-4 w-4 text-success" />;
    if (result === 'skipped') return <AlertCircle className="h-4 w-4 text-muted-foreground" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  const formatEventType = (type: string) => {
    return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Cal.com Sync Logs</CardTitle>
            <CardDescription>
              Recent webhook events and sync activity
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isRefetching}
          >
            {isRefetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-sync status */}
        {syncSettings && (
          <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant={syncSettings.calcom_auto_sync_enabled ? 'default' : 'secondary'}>
                Auto-sync: {syncSettings.calcom_auto_sync_enabled ? 'On' : 'Off'}
              </Badge>
            </div>
            {syncSettings.calcom_last_auto_sync_at && (
              <div className="text-muted-foreground">
                Last auto-sync: {formatDistanceToNow(new Date(syncSettings.calcom_last_auto_sync_at), { addSuffix: true })}
              </div>
            )}
          </div>
        )}

        {/* Logs list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : logs && logs.length > 0 ? (
          <>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                  >
                    {getResultIcon(log.processing_result, log.error_message)}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className={getEventTypeColor(log.event_type)}>
                          {formatEventType(log.event_type)}
                        </Badge>
                        {log.event_type_title && (
                          <span className="text-sm text-muted-foreground truncate">
                            {log.event_type_title}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        {log.attendee_email && (
                          <span className="text-foreground font-medium truncate">
                            {log.attendee_email}
                          </span>
                        )}
                        {log.organizer_email && (
                          <span className="text-muted-foreground truncate">
                            → {log.organizer_email}
                          </span>
                        )}
                      </div>
                      {log.error_message && (
                        <p className="text-xs text-destructive truncate">
                          Error: {log.error_message}
                        </p>
                      )}
                      {(log.no_show_guest || log.no_show_host) && (
                        <div className="flex gap-2">
                          {log.no_show_guest && (
                            <Badge variant="outline" className="text-xs bg-orange-500/10 text-orange-600">
                              Guest No-Show
                            </Badge>
                          )}
                          {log.no_show_host && (
                            <Badge variant="outline" className="text-xs bg-red-500/10 text-red-600">
                              Host No-Show
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {log.created_at && (
                        <div title={format(new Date(log.created_at), 'PPpp')}>
                          {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                        </div>
                      )}
                      {log.processing_result && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          {log.processing_result}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-center pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? 'Show Less' : 'Show More'}
              </Button>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>No sync logs yet</p>
            <p className="text-sm mt-1">
              Logs will appear here when Cal.com sends webhook events or auto-sync runs
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
