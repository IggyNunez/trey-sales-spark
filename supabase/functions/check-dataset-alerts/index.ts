import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlertCondition {
  field: string;
  operator: '>' | '<' | '>=' | '<=' | '=' | '!=' | 'contains' | 'not_contains';
  value: number | string;
  aggregation?: 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX' | 'VALUE';
  time_window?: 'all' | 'today' | 'hour' | 'day' | 'week' | 'month';
}

interface NotificationConfig {
  slack_webhook_url?: string;
  slack_channel?: string;
  email_addresses?: string[];
  in_app_title?: string;
  in_app_message?: string;
  cooldown_minutes?: number;
}

// Calculate time window filter
function getTimeWindowFilter(timeWindow: string): Date | null {
  const now = new Date();
  
  switch (timeWindow) {
    case 'hour':
      return new Date(now.getTime() - 60 * 60 * 1000);
    case 'today':
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return today;
    case 'day':
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case 'week':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case 'month':
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case 'all':
    default:
      return null;
  }
}

// Calculate aggregated value from records
function calculateValue(
  records: any[],
  field: string,
  aggregation: string
): number | string | null {
  if (!records.length) return aggregation === 'COUNT' ? 0 : null;

  const values = records
    .map(r => r.extracted_data?.[field])
    .filter(v => v !== null && v !== undefined);

  if (aggregation === 'COUNT') {
    return records.length;
  }

  if (aggregation === 'VALUE' && values.length > 0) {
    return values[0]; // Latest value
  }

  const numericValues = values.map(v => Number(v)).filter(v => !isNaN(v));
  if (numericValues.length === 0) return null;

  switch (aggregation) {
    case 'SUM':
      return numericValues.reduce((a, b) => a + b, 0);
    case 'AVG':
      return numericValues.reduce((a, b) => a + b, 0) / numericValues.length;
    case 'MIN':
      return Math.min(...numericValues);
    case 'MAX':
      return Math.max(...numericValues);
    default:
      return numericValues[0];
  }
}

// Check if condition is met
function checkCondition(
  currentValue: number | string | null,
  operator: string,
  threshold: number | string
): boolean {
  if (currentValue === null) return false;

  const numCurrent = typeof currentValue === 'number' ? currentValue : parseFloat(String(currentValue));
  const numThreshold = typeof threshold === 'number' ? threshold : parseFloat(String(threshold));

  switch (operator) {
    case '>':
      return !isNaN(numCurrent) && !isNaN(numThreshold) && numCurrent > numThreshold;
    case '<':
      return !isNaN(numCurrent) && !isNaN(numThreshold) && numCurrent < numThreshold;
    case '>=':
      return !isNaN(numCurrent) && !isNaN(numThreshold) && numCurrent >= numThreshold;
    case '<=':
      return !isNaN(numCurrent) && !isNaN(numThreshold) && numCurrent <= numThreshold;
    case '=':
      return String(currentValue) === String(threshold);
    case '!=':
      return String(currentValue) !== String(threshold);
    case 'contains':
      return String(currentValue).toLowerCase().includes(String(threshold).toLowerCase());
    case 'not_contains':
      return !String(currentValue).toLowerCase().includes(String(threshold).toLowerCase());
    default:
      return false;
  }
}

// Send Slack notification
async function sendSlackNotification(
  webhookUrl: string,
  alertName: string,
  condition: AlertCondition,
  currentValue: number | string | null,
  channel?: string
): Promise<boolean> {
  try {
    const payload: any = {
      text: `🚨 Alert Triggered: ${alertName}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🚨 ${alertName}`, emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Field:*\n${condition.field}` },
            { type: 'mrkdwn', text: `*Condition:*\n${condition.operator} ${condition.value}` },
            { type: 'mrkdwn', text: `*Current Value:*\n${currentValue}` },
            { type: 'mrkdwn', text: `*Triggered At:*\n${new Date().toISOString()}` },
          ]
        }
      ]
    };

    if (channel) {
      payload.channel = channel;
    }

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    return response.ok;
  } catch (error) {
    console.error('Slack notification error:', error);
    return false;
  }
}

// Store in-app notification (using a simple approach - could be expanded)
async function sendInAppNotification(
  supabase: any,
  organizationId: string,
  alertId: string,
  title: string,
  message: string,
  currentValue: number | string | null
): Promise<boolean> {
  // For now, we'll just log the notification
  // In a full implementation, you'd insert into a notifications table
  console.log(`In-app notification for org ${organizationId}:`, {
    alert_id: alertId,
    title,
    message,
    current_value: currentValue,
    triggered_at: new Date().toISOString(),
  });
  
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { alert_id, test_mode = false } = body;

    let alertsToCheck: any[] = [];

    if (alert_id) {
      // Check specific alert (for testing or single trigger)
      const { data: alert, error } = await supabase
        .from('dataset_alerts')
        .select('*')
        .eq('id', alert_id)
        .single();

      if (error || !alert) {
        return new Response(
          JSON.stringify({ error: 'Alert not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      alertsToCheck = [alert];
    } else {
      // Check all active alerts
      const { data: alerts, error } = await supabase
        .from('dataset_alerts')
        .select('*')
        .eq('is_active', true);

      if (error) {
        throw new Error(`Failed to fetch alerts: ${error.message}`);
      }

      alertsToCheck = alerts || [];
    }

    console.log(`Checking ${alertsToCheck.length} alert(s)...`);

    const results: any[] = [];

    for (const alert of alertsToCheck) {
      const condition = alert.condition as AlertCondition;
      const notificationConfig = alert.notification_config as NotificationConfig;

      // Check cooldown (skip if recently triggered and not in test mode)
      if (!test_mode && alert.last_triggered_at) {
        const cooldownMs = (notificationConfig.cooldown_minutes || 60) * 60 * 1000;
        const lastTriggered = new Date(alert.last_triggered_at).getTime();
        if (Date.now() - lastTriggered < cooldownMs) {
          console.log(`Alert ${alert.id} in cooldown, skipping...`);
          results.push({ 
            alert_id: alert.id, 
            skipped: true, 
            reason: 'cooldown' 
          });
          continue;
        }
      }

      // Fetch dataset records with time window filter
      let query = supabase
        .from('dataset_records')
        .select('extracted_data, created_at')
        .eq('dataset_id', alert.dataset_id)
        .order('created_at', { ascending: false });

      const timeFilter = getTimeWindowFilter(condition.time_window || 'all');
      if (timeFilter) {
        query = query.gte('created_at', timeFilter.toISOString());
      }

      // Limit records for performance
      query = query.limit(1000);

      const { data: records, error: recordsError } = await query;

      if (recordsError) {
        console.error(`Error fetching records for alert ${alert.id}:`, recordsError);
        results.push({ 
          alert_id: alert.id, 
          error: recordsError.message 
        });
        continue;
      }

      // Calculate current value
      const currentValue = calculateValue(
        records || [],
        condition.field,
        condition.aggregation || 'VALUE'
      );

      // Check if condition is met
      const triggered = checkCondition(currentValue, condition.operator, condition.value);

      console.log(`Alert ${alert.id}: current=${currentValue}, threshold=${condition.value}, triggered=${triggered}`);

      if (test_mode) {
        // Just return the result without sending notification
        results.push({
          alert_id: alert.id,
          triggered,
          current_value: currentValue,
          threshold: condition.value,
          operator: condition.operator,
        });
        continue;
      }

      if (triggered) {
        // Send notification based on type
        let notificationSent = false;

        switch (alert.notification_type) {
          case 'slack':
            if (notificationConfig.slack_webhook_url) {
              notificationSent = await sendSlackNotification(
                notificationConfig.slack_webhook_url,
                alert.name,
                condition,
                currentValue,
                notificationConfig.slack_channel
              );
            }
            break;

          case 'email':
            // Email would require an email service integration
            console.log(`Email notification would be sent to: ${notificationConfig.email_addresses?.join(', ')}`);
            notificationSent = true; // Placeholder
            break;

          case 'in_app':
            notificationSent = await sendInAppNotification(
              supabase,
              alert.organization_id,
              alert.id,
              notificationConfig.in_app_title || alert.name,
              notificationConfig.in_app_message || `Alert triggered: ${alert.name}`,
              currentValue
            );
            break;
        }

        // Update last_triggered_at
        if (notificationSent) {
          await supabase
            .from('dataset_alerts')
            .update({ last_triggered_at: new Date().toISOString() })
            .eq('id', alert.id);
        }

        results.push({
          alert_id: alert.id,
          triggered: true,
          current_value: currentValue,
          notification_sent: notificationSent,
          notification_type: alert.notification_type,
        });
      } else {
        results.push({
          alert_id: alert.id,
          triggered: false,
          current_value: currentValue,
        });
      }
    }

    const processingTime = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        alerts_checked: alertsToCheck.length,
        results,
        processing_time_ms: processingTime,
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error: unknown) {
    console.error('Alert check error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        processing_time_ms: Date.now() - startTime,
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
