import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, AlertCircle, RefreshCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { format, formatDistanceToNow } from 'date-fns';

interface TestResult {
  success: boolean;
  event?: {
    name: string;
    email: string;
    scheduledAt: string;
  };
  message?: string;
}

interface CalendlyWebhookStatusProps {
  onDisconnect: () => void;
}

export function CalendlyWebhookStatus({ onDisconnect }: CalendlyWebhookStatusProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [webhookStatus, setWebhookStatus] = useState<{
    isRegistered: boolean;
    webhooks: any[];
    lastEvent?: { timestamp: string; email: string };
  } | null>(null);

  const checkWebhookStatus = async (showToast = false) => {
    if (!orgId) return;

    setChecking(true);
    try {
      const { data: webhookData, error: webhookError } = await supabase.functions.invoke(
        'register-calendly-webhook',
        { body: { action: 'list', organizationId: orgId } }
      );

      if (webhookError) {
        setWebhookStatus({ isRegistered: false, webhooks: [] });
        if (showToast) toast.error('Failed to check webhook status');
        return;
      }

      const ourWebhooks = webhookData?.webhooks || [];

      // Get last event from database
      const { data: lastEvent } = await supabase
        .from('events')
        .select('booked_at, lead_email')
        .eq('organization_id', orgId)
        .not('booked_at', 'is', null)
        .order('booked_at', { ascending: false })
        .limit(1)
        .single();

      setWebhookStatus({
        isRegistered: ourWebhooks.length > 0,
        webhooks: ourWebhooks,
        lastEvent: lastEvent
          ? { timestamp: lastEvent.booked_at, email: lastEvent.lead_email }
          : undefined,
      });
      
      if (showToast) {
        const lastEventInfo = lastEvent 
          ? `Last event: ${lastEvent.lead_email}` 
          : 'No events yet';
        toast.success(`Status refreshed! ${lastEventInfo}`);
      }
    } catch (err) {
      setWebhookStatus({ isRegistered: false, webhooks: [] });
      if (showToast) toast.error('Failed to check status');
    } finally {
      setChecking(false);
    }
  };

  // Test by pulling one event from Calendly API directly
  const testWebhook = async () => {
    if (!orgId) return;

    setTesting(true);
    setTestResult(null);
    
    try {
      // Just list webhooks - if that works, the API key is valid
      const { data, error } = await supabase.functions.invoke('register-calendly-webhook', {
        body: { action: 'list', organizationId: orgId },
      });

      if (error) throw error;

      if (data?.success) {
        const webhookCount = data.webhooks?.length || 0;
        setTestResult({
          success: true,
          message: `API key valid! ${webhookCount} webhook(s) registered.`,
        });
        toast.success('Calendly API key is working!');
      } else {
        throw new Error(data?.error || 'Unknown error');
      }
      
      await checkWebhookStatus();
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Calendly',
      });
      toast.error(err instanceof Error ? err.message : 'Test failed');
    } finally {
      setTesting(false);
    }
  };

  // Delete and reconnect webhook
  const reconnectWebhook = async () => {
    if (!orgId) return;

    setReconnecting(true);
    try {
      // Delete existing webhooks
      if (webhookStatus?.webhooks?.length) {
        for (const wh of webhookStatus.webhooks) {
          await supabase.functions.invoke('register-calendly-webhook', {
            body: { action: 'delete', organizationId: orgId, webhookUri: wh.uri },
          });
        }
      }

      // Register new webhook
      const { data, error } = await supabase.functions.invoke('register-calendly-webhook', {
        body: { action: 'register', organizationId: orgId },
      });

      if (error) throw error;

      toast.success('Webhook reconnected successfully!');
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

  const isActive = webhookStatus?.isRegistered && webhookStatus.webhooks.length > 0;
  const lastEventTime = webhookStatus?.lastEvent?.timestamp
    ? new Date(webhookStatus.lastEvent.timestamp)
    : null;

  return (
    <div className="space-y-4">
      {/* Simple Status Row */}
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
          onClick={testWebhook}
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
          {testResult.event ? (
            <div>
              <p className="font-medium text-success">✓ Latest Event from Calendly:</p>
              <p className="text-muted-foreground mt-1">
                {testResult.event.name} ({testResult.event.email})<br />
                Scheduled: {format(new Date(testResult.event.scheduledAt), 'MMM d, yyyy h:mm a')}
              </p>
            </div>
          ) : (
            <p className={testResult.success ? 'text-success' : 'text-destructive'}>
              {testResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
