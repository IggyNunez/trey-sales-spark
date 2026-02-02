import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

/**
 * Diagnose Cal.com webhook status and optionally force re-register.
 * This helps debug why real-time webhooks aren't being received.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { organizationId, forceReregister } = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get integration config
    const { data: integration, error: intError } = await supabase
      .from('organization_integrations')
      .select('calcom_api_key_encrypted, calcom_webhook_id, calcom_webhook_registered_at, calcom_auto_sync_enabled')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (intError || !integration) {
      return new Response(JSON.stringify({ error: 'Organization integration not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!integration.calcom_api_key_encrypted) {
      return new Response(JSON.stringify({ error: 'Cal.com API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Decrypt API key
    const decryptResponse = await fetch(`${supabaseUrl}/functions/v1/manage-api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'decrypt',
        organizationId,
        keyType: 'calcom',
      }),
    });

    if (!decryptResponse.ok) {
      return new Response(JSON.stringify({ error: 'Failed to decrypt API key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { apiKey } = await decryptResponse.json();

    // List all webhooks from Cal.com
    console.log('Fetching webhooks from Cal.com...');
    const listResponse = await fetch('https://api.cal.com/v2/webhooks', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      },
    });

    if (!listResponse.ok) {
      const errorText = await listResponse.text();
      console.error('Failed to list webhooks:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to list Cal.com webhooks', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhooksData = await listResponse.json();
    const webhooks = webhooksData.data || webhooksData || [];
    
    console.log('Found webhooks:', JSON.stringify(webhooks, null, 2));

    // Find our webhook
    const expectedUrl = `${supabaseUrl}/functions/v1/calcom-webhook?org_id=${organizationId}`;
    const ourWebhook = webhooks.find((w: { subscriberUrl?: string }) => 
      w.subscriberUrl?.includes('calcom-webhook')
    );

    const diagnosis = {
      storedWebhookId: integration.calcom_webhook_id,
      storedRegisteredAt: integration.calcom_webhook_registered_at,
      expectedWebhookUrl: expectedUrl,
      totalWebhooksInCalcom: webhooks.length,
      ourWebhookFound: !!ourWebhook,
      ourWebhookDetails: ourWebhook || null,
      webhookActive: ourWebhook?.active ?? false,
      webhookUrlCorrect: ourWebhook?.subscriberUrl === expectedUrl,
      triggers: ourWebhook?.triggers || [],
      allWebhooks: webhooks.map((w: { id: string; subscriberUrl?: string; active?: boolean; triggers?: string[] }) => ({
        id: w.id,
        subscriberUrl: w.subscriberUrl,
        active: w.active,
        triggers: w.triggers,
      })),
    };

    // If force re-register requested
    if (forceReregister) {
      console.log('Force re-registering webhook...');
      
      // Delete all existing webhooks pointing to our endpoint
      for (const webhook of webhooks) {
        if ((webhook as { subscriberUrl?: string }).subscriberUrl?.includes('calcom-webhook')) {
          console.log('Deleting existing webhook:', (webhook as { id: string }).id);
          await fetch(`https://api.cal.com/v2/webhooks/${(webhook as { id: string }).id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'cal-api-version': '2024-08-13',
            },
          });
        }
      }

      // Register new webhook
      const registerResponse = await fetch('https://api.cal.com/v2/webhooks', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'cal-api-version': '2024-08-13',
        },
        body: JSON.stringify({
          subscriberUrl: expectedUrl,
          triggers: [
            'BOOKING_CREATED',
            'BOOKING_RESCHEDULED',
            'BOOKING_CANCELLED',
            'BOOKING_NO_SHOW_UPDATED',
            'MEETING_STARTED',
            'MEETING_ENDED',
            'RECORDING_READY',
          ],
          active: true,
          payloadTemplate: "",
          secret: "",
        }),
      });

      if (!registerResponse.ok) {
        const errorText = await registerResponse.text();
        console.error('Re-registration failed:', errorText);
        return new Response(JSON.stringify({ 
          error: 'Failed to re-register webhook',
          details: errorText,
          diagnosis,
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const newWebhook = await registerResponse.json();
      console.log('New webhook registered:', newWebhook);

      // Update database
      await supabase
        .from('organization_integrations')
        .update({
          calcom_webhook_id: newWebhook.data?.id || newWebhook.id,
          calcom_webhook_secret: newWebhook.data?.secret || newWebhook.secret,
          calcom_webhook_registered_at: new Date().toISOString(),
        })
        .eq('organization_id', organizationId);

      return new Response(JSON.stringify({
        success: true,
        message: 'Webhook force re-registered successfully',
        newWebhookId: newWebhook.data?.id || newWebhook.id,
        subscriberUrl: expectedUrl,
        previousDiagnosis: diagnosis,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Return diagnosis
    return new Response(JSON.stringify({
      success: true,
      diagnosis,
      recommendation: !ourWebhook 
        ? 'No webhook found - run with forceReregister: true' 
        : !ourWebhook.active 
          ? 'Webhook exists but is inactive - run with forceReregister: true'
          : ourWebhook.subscriberUrl !== expectedUrl
            ? 'Webhook URL mismatch - run with forceReregister: true'
            : 'Webhook appears correctly configured. Check Cal.com dashboard for delivery logs.',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in diagnose-calcom-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
