import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { organizationId, calcomApiKey, action } = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the Cal.com API key
    let apiKey = calcomApiKey;
    if (!apiKey) {
      // Fetch from encrypted storage
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('calcom_api_key_encrypted')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (integration?.calcom_api_key_encrypted) {
        // Call manage-api-keys to decrypt
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
        
        if (decryptResponse.ok) {
          const decrypted = await decryptResponse.json();
          apiKey = decrypted.apiKey;
        }
      }
    }

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Cal.com API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle unregister action
    if (action === 'unregister') {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('calcom_webhook_id')
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (integration?.calcom_webhook_id) {
        // Delete webhook from Cal.com
        const deleteResponse = await fetch(`https://api.cal.com/v2/webhooks/${integration.calcom_webhook_id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'cal-api-version': '2024-08-13',
          },
        });

        if (!deleteResponse.ok) {
          console.error('Failed to delete Cal.com webhook:', await deleteResponse.text());
        }

        // Clear webhook info from database
        await supabase
          .from('organization_integrations')
          .update({
            calcom_webhook_id: null,
            calcom_webhook_secret: null,
            calcom_webhook_registered_at: null,
          })
          .eq('organization_id', organizationId);
      }

      return new Response(JSON.stringify({ success: true, action: 'unregistered' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Register webhook with Cal.com
    const webhookUrl = `${supabaseUrl}/functions/v1/calcom-webhook?org_id=${organizationId}`;

    console.log('Registering Cal.com webhook:', webhookUrl);

    // Cal.com API v2 webhook creation endpoint
    // Note: Cal.com has multiple webhook scopes (org/event-type/platform). The v2 endpoint below supports
    // the triggers we need (booking lifecycle + meeting/recording events).
    const registerResponse = await fetch('https://api.cal.com/v2/webhooks', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'cal-api-version': '2024-08-13',
      },
      body: JSON.stringify({
        subscriberUrl: webhookUrl,
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
        // Some Cal.com deployments validate these fields strictly.
        payloadTemplate: "",
        secret: "",
        version: "2021-10-20",
      }),
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      console.error('Cal.com webhook registration failed:', errorText);
      return new Response(JSON.stringify({ error: 'Failed to register webhook with Cal.com', details: errorText }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const webhookData = await registerResponse.json();
    console.log('Cal.com webhook registered:', webhookData);

    // Store webhook details
    const { error: updateError } = await supabase
      .from('organization_integrations')
      .update({
        calcom_webhook_id: webhookData.data?.id || webhookData.id,
        calcom_webhook_secret: webhookData.data?.secret || webhookData.secret,
        calcom_webhook_registered_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId);

    if (updateError) {
      console.error('Failed to save webhook details:', updateError);
    }

    return new Response(JSON.stringify({ 
      success: true, 
      webhookId: webhookData.data?.id || webhookData.id,
      subscriberUrl: webhookUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in register-calcom-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
