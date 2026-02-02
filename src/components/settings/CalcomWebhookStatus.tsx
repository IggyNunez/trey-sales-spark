import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { formatDistanceToNow } from 'date-fns';

interface CalcomWebhookStatusProps {
  onDisconnect: () => void;
}

export function CalcomWebhookStatus({ onDisconnect }: CalcomWebhookStatusProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    isRegistered: boolean;
    webhookId?: string;
    registeredAt?: string;
    lastEvent?: { timestamp: string; email: string };
  } | null>(null);

  const checkWebhookStatus = async (showToast = false) => {
    if (!orgId) return;

    setChecking(true);
    try {
      // Check organization_integrations for webhook details
      const { data: integrations, error: intError } = await supabase
        .from('organization_integrations')
        .select('calcom_webhook_id, calcom_webhook_registered_at, calcom_api_key_encrypted')
        .eq('organization_id', orgId)
        .maybeSingle();

      if (intError) throw intError;

      const hasWebhook = !!integrations?.calcom_webhook_id;

      // Get last event from database
      const { data: lastEvent } = await supabase
        .from('events')
        .select('booked_at, lead_email')
        .eq('organization_id', orgId)
        .eq('booking_platform', 'calcom')
        .not('booked_at', 'is', null)
        .order('booked_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      setWebhookStatus({
        isRegistered: hasWebhook,
        webhookId: integrations?.calcom_webhook_id || undefined,
        registeredAt: integrations?.calcom_webhook_registered_at || undefined,
        lastEvent: lastEvent
          ? { timestamp: lastEvent.booked_at, email: lastEvent.lead_email }
          : undefined,
      });
      
      if (showToast) {
        const lastEventInfo = lastEvent 
          ? `Last event: ${lastEvent.lead_email}` 
          : 'No Cal.com events yet';
        toast.success(`Status refreshed! ${lastEventInfo}`);
      }
    } catch (err) {
      console.error('Error checking Cal.com webhook status:', err);
      setWebhookStatus({ isRegistered: false });
      if (showToast) toast.error('Failed to check status');
    } finally {
      setChecking(false);
    }
  };

  const testConnection = async () => {
    if (!orgId) return;

    setTesting(true);
    setTestResult(null);
    
    try {
      // Test by calling get-calcom-utilization with a simple action
      const { data, error } = await supabase.functions.invoke('get-calcom-utilization', {
        body: { 
          organizationId: orgId,
          action: 'test-connection',
        },
      });

      if (error) throw error;

      if (data?.success || data?.eventTypes) {
        setTestResult({
          success: true,
          message: `API key valid! Found ${data.eventTypes?.length || 0} event type(s).`,
        });
        toast.success('Cal.com API key is working!');
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
      
      await checkWebhookStatus();
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Cal.com',
      });
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  const reconnectWebhook = async () => {
    if (!orgId) return;

    setReconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke('register-calcom-webhook', {
        body: { organizationId: orgId },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Cal.com webhook reconnected successfully!');
      await checkWebhookStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reconnect');
    } finally {
      setReconnecting(false);
    }
  };

  useEffect(() => {
    if (orgId) {
      checkWebhookStatus();
    }
  }, [orgId]);

  const isActive = webhookStatus?.isRegistered;
  const lastEventTime = webhookStatus?.lastEvent?.timestamp
    ? new Date(webhookStatus.lastEvent.timestamp)
    : null;

  return (
    <div className="space-y-4">
      {/* Status Row */}
      <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-3">
          {isActive ? (
            <CheckCircle2 className="h-5 w-5 text-success" />
          ) : (
            <AlertCircle className="h-5 w-5 text-destructive" />
          )}
          <div>
            <p className="font-medium">
              {isActive ? 'Webhook Active' : 'Webhook Not Connected'}
            </p>
            {lastEventTime && (
              <p className="text-sm text-muted-foreground">
                Last event: {formatDistanceToNow(lastEventTime, { addSuffix: true })}
              </p>
            )}
          </div>
        </div>
        <Badge variant={isActive ? 'default' : 'destructive'} className={isActive ? 'bg-success' : ''}>
          {isActive ? 'Connected' : 'Disconnected'}
        </Badge>
      </div>

      {/* Subscribed Events Info */}
      {isActive && (
        <div className="p-3 rounded-lg bg-muted/30 text-sm">
          <p className="font-medium mb-1">Subscribed Events:</p>
          <p className="text-muted-foreground text-xs">
            BOOKING_CREATED, BOOKING_CANCELLED, BOOKING_RESCHEDULED, 
            BOOKING_NO_SHOW_UPDATED, MEETING_STARTED, MEETING_ENDED, RECORDING_READY
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => checkWebhookStatus(true)}
          disabled={checking}
        >
          {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Refresh</span>
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={testConnection}
          disabled={testing}
        >
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          <span className="ml-2">Test Connection</span>
        </Button>

        <Button
          variant={isActive ? 'outline' : 'default'}
          size="sm"
          onClick={reconnectWebhook}
          disabled={reconnecting}
        >
          {reconnecting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="ml-2">Reconnecting...</span>
            </>
          ) : (
            <span>{isActive ? 'Reconnect Webhook' : 'Connect Webhook'}</span>
          )}
        </Button>

        <Button
          variant="destructive"
          size="sm"
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`p-3 rounded-lg text-sm ${testResult.success ? 'bg-success/10 border border-success/20' : 'bg-destructive/10 border border-destructive/20'}`}>
          <p className={testResult.success ? 'text-success' : 'text-destructive'}>
            {testResult.message}
          </p>
        </div>
      )}
    </div>
  );
}
