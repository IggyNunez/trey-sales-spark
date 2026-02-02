import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, RefreshCw, Clock, Calendar } from 'lucide-react';
import { useCalcomSyncSettings } from '@/hooks/useCalcomSyncSettings';
import { formatDistanceToNow } from 'date-fns';

export function CalcomEventTypeManager() {
  const { 
    settings, 
    eventTypes, 
    isLoading,
    toggleAutoSync,
    toggleEventType,
    triggerSync,
  } = useCalcomSyncSettings();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const excludedIds = new Set(settings?.excludedEventTypeIds || []);

  return (
    <div className="space-y-4">
      {/* Auto-sync toggle */}
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-base font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Automatic Hourly Sync
          </Label>
          <p className="text-xs text-muted-foreground">
            Sync new events every hour as a backup to webhooks
          </p>
        </div>
        <Switch 
          checked={settings?.autoSyncEnabled ?? true}
          onCheckedChange={(checked) => toggleAutoSync.mutate(checked)}
          disabled={toggleAutoSync.isPending}
        />
      </div>

      {/* Last sync info */}
      {settings?.lastSyncAt && (
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          Last auto-sync: {formatDistanceToNow(new Date(settings.lastSyncAt))} ago
        </p>
      )}

      {/* Manual trigger button */}
      <Button 
        variant="outline" 
        size="sm" 
        onClick={() => triggerSync.mutate()}
        disabled={triggerSync.isPending}
      >
        {triggerSync.isPending ? (
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        ) : (
          <RefreshCw className="h-4 w-4 mr-2" />
        )}
        Sync Now
      </Button>

      <Separator />

      {/* Event type exclusions */}
      <div className="space-y-3">
        <div>
          <Label className="text-base font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Event Types
          </Label>
          <p className="text-xs text-muted-foreground">
            Enable or disable specific event types from syncing
          </p>
        </div>

        {eventTypes.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No Cal.com events found yet. Event types will appear here after your first sync.
          </p>
        ) : (
          <div className="space-y-2">
            {eventTypes.map((eventType) => {
              const isExcluded = excludedIds.has(eventType.id);
              
              return (
                <div 
                  key={eventType.id} 
                  className="flex items-center justify-between py-2 px-3 rounded-lg border bg-background hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch
                      checked={!isExcluded}
                      onCheckedChange={(checked) => 
                        toggleEventType.mutate({ eventTypeId: eventType.id, exclude: !checked })
                      }
                      disabled={toggleEventType.isPending}
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`font-medium truncate block ${isExcluded ? 'text-muted-foreground line-through' : ''}`}>
                        {eventType.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ID: {eventType.id}
                      </span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    {eventType.count} events
                  </Badge>
                </div>
              );
            })}
          </div>
        )}

        {excludedIds.size > 0 && (
          <p className="text-xs text-muted-foreground">
            ⚠️ {excludedIds.size} event type{excludedIds.size > 1 ? 's' : ''} excluded from sync
          </p>
        )}
      </div>
    </div>
  );
}
