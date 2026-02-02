import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { action, organizationId, webhookUri } = await req.json();

    // STRICT ORG ISOLATION: Require organizationId
    if (!organizationId) {
      console.error('organizationId is required');
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org name for logging
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();

    // STRICT: Get Calendly API key using encrypted key helper (enables lazy migration)
    const CALENDLY_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'calendly', 'register-calendly-webhook');
    
    if (!CALENDLY_API_KEY) {
      console.error(`No Calendly API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Calendly API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using encrypted Calendly API key for ${orgData?.name}`);
    
    // Get the current user's organization URI first
    console.log('Fetching Calendly user info...');
    const userResponse = await fetch('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Calendly user API error:', userResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Calendly' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = await userResponse.json();
    const calendlyOrgUri = userData.resource.current_organization;
    const userUri = userData.resource.uri;
    
    console.log('Calendly Organization URI:', calendlyOrgUri);
    console.log('User URI:', userUri);

    // Build the webhook URL - CRITICAL: Include organization_id so we know where to route data
    const webhookUrl = `${SUPABASE_URL}/functions/v1/calendly-webhook?org_id=${organizationId}`;

    if (action === 'list') {
      // List existing webhook subscriptions
      console.log('Listing existing webhooks...');
      const listUrl = new URL('https://api.calendly.com/webhook_subscriptions');
      listUrl.searchParams.append('organization', calendlyOrgUri);
      listUrl.searchParams.append('scope', 'organization');

      const listResponse = await fetch(listUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        console.error('Failed to list webhooks:', listResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to list webhooks' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const listData = await listResponse.json();
      const webhooks = listData.collection || [];
      
      // Find webhooks pointing to our URL
      const ourWebhooks = webhooks.filter((wh: any) => 
        wh.callback_url.includes('calendly-webhook')
      );

      return new Response(
        JSON.stringify({ 
          success: true, 
          webhooks: ourWebhooks,
          allWebhooks: webhooks,
          targetUrl: webhookUrl
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'register') {
      // First check if webhook already exists
      console.log('Checking for existing webhooks...');
      const listUrl = new URL('https://api.calendly.com/webhook_subscriptions');
      listUrl.searchParams.append('organization', calendlyOrgUri);
      listUrl.searchParams.append('scope', 'organization');

      const listResponse = await fetch(listUrl.toString(), {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (listResponse.ok) {
        const listData = await listResponse.json();
        const existingWebhook = listData.collection?.find((wh: any) => 
          wh.callback_url === webhookUrl
        );

        if (existingWebhook) {
          console.log('Webhook already exists:', existingWebhook.uri);
          return new Response(
            JSON.stringify({ 
              success: true, 
              message: 'Webhook already registered',
              webhook: existingWebhook,
              alreadyExists: true
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Create the webhook subscription
      console.log('Creating webhook subscription...');
      console.log('Webhook URL:', webhookUrl);
      
      const createResponse = await fetch('https://api.calendly.com/webhook_subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          events: ['invitee.created', 'invitee.canceled'],
          organization: calendlyOrgUri,
          scope: 'organization',
        }),
      });

      if (!createResponse.ok) {
        const errorText = await createResponse.text();
        console.error('Failed to create webhook:', createResponse.status, errorText);
        
        // Parse error for better message
        let errorMessage = 'Failed to create webhook';
        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.message || errorJson.error || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        return new Response(
          JSON.stringify({ error: errorMessage }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const createData = await createResponse.json();
      console.log('Webhook created successfully:', createData);
      
      // IMPORTANT: Calendly returns a signing_key when creating a webhook
      // Automatically save it to the database for signature verification
      const signingKey = createData.resource?.signing_key;
      if (signingKey) {
        console.log('Saving webhook signing key to database...');
        const { error: updateError } = await supabase
          .from('organization_integrations')
          .update({ calendly_webhook_signing_key: signingKey })
          .eq('organization_id', organizationId);
        
        if (updateError) {
          console.error('Failed to save signing key:', updateError);
          // Don't fail the request, just log the error
        } else {
          console.log('Signing key saved successfully for org:', orgData?.name);
        }
      } else {
        console.warn('No signing_key returned in webhook creation response');
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Webhook registered successfully',
          webhook: createData.resource,
          signingKeySaved: !!signingKey
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'delete') {
      if (!webhookUri) {
        return new Response(
          JSON.stringify({ error: 'webhookUri is required for delete action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Deleting webhook:', webhookUri);
      
      const deleteResponse = await fetch(webhookUri, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        },
      });

      if (!deleteResponse.ok && deleteResponse.status !== 204) {
        const errorText = await deleteResponse.text();
        console.error('Failed to delete webhook:', deleteResponse.status, errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to delete webhook' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Webhook deleted successfully' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "list", "register", or "delete"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in register-calendly-webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
