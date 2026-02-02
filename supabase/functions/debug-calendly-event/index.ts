import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const calendlyApiKey = Deno.env.get('CALENDLY_API_KEY');
    if (!calendlyApiKey) {
      return new Response(JSON.stringify({ error: 'No Calendly API key configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const { email, invitee_uuid, check_automations } = await req.json();
    
    const results: any = {
      timestamp: new Date().toISOString(),
      email,
      invitee_uuid,
      events: [],
      cancellation_details: [],
      webhooks: [],
      routing_forms: [],
      event_types_with_workflows: []
    };

    // First, get the current user to find their organization
    const userRes = await fetch('https://api.calendly.com/users/me', {
      headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
    });
    const userData = await userRes.json();
    const orgUri = userData.resource?.current_organization;
    const userUri = userData.resource?.uri;
    
    results.organization = orgUri;
    results.user = userData.resource?.name;
    results.user_uri = userUri;

    if (!orgUri) {
      return new Response(JSON.stringify({ error: 'Could not get organization', userData }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // CHECK 1: List all webhook subscriptions (could reveal other integrations)
    console.log('Checking webhook subscriptions...');
    const webhooksUrl = new URL('https://api.calendly.com/webhook_subscriptions');
    webhooksUrl.searchParams.set('organization', orgUri);
    webhooksUrl.searchParams.set('scope', 'organization');
    
    const webhooksRes = await fetch(webhooksUrl.toString(), {
      headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
    });
    const webhooksData = await webhooksRes.json();
    results.webhooks = (webhooksData.collection || []).map((wh: any) => ({
      url: wh.callback_url,
      events: wh.events,
      state: wh.state,
      created_at: wh.created_at,
      creator: wh.creator
    }));
    
    // CHECK 2: Get event types to see if any have special configurations
    console.log('Checking event types...');
    const eventTypesUrl = new URL('https://api.calendly.com/event_types');
    eventTypesUrl.searchParams.set('organization', orgUri);
    eventTypesUrl.searchParams.set('count', '100');
    
    const eventTypesRes = await fetch(eventTypesUrl.toString(), {
      headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
    });
    const eventTypesData = await eventTypesRes.json();
    
    results.event_types = (eventTypesData.collection || []).map((et: any) => ({
      name: et.name,
      slug: et.slug,
      active: et.active,
      booking_method: et.booking_method,
      pooling_type: et.pooling_type,
      secret: et.secret ? 'HAS_SECRET' : null,
      custom_questions: et.custom_questions?.length || 0,
      profile: et.profile?.name
    }));

    // CHECK 3: Look for routing forms (can auto-cancel/redirect)
    console.log('Checking routing forms...');
    try {
      const routingUrl = new URL('https://api.calendly.com/routing_forms');
      routingUrl.searchParams.set('organization', orgUri);
      
      const routingRes = await fetch(routingUrl.toString(), {
        headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
      });
      const routingData = await routingRes.json();
      results.routing_forms = (routingData.collection || []).map((rf: any) => ({
        name: rf.name,
        status: rf.status,
        questions_count: rf.questions?.length || 0
      }));
    } catch (e) {
      results.routing_forms = 'Unable to fetch (may require higher API access)';
    }

    // Search for events by email
    if (email) {
      const eventsUrl = new URL('https://api.calendly.com/scheduled_events');
      eventsUrl.searchParams.set('organization', orgUri);
      eventsUrl.searchParams.set('invitee_email', email);
      eventsUrl.searchParams.set('count', '10');
      eventsUrl.searchParams.set('sort', 'start_time:desc');

      const eventsRes = await fetch(eventsUrl.toString(), {
        headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
      });
      const eventsData = await eventsRes.json();
      
      results.events = eventsData.collection || [];
      
      // For each event, get the invitees to see cancellation details
      for (const event of results.events) {
        const inviteesUrl = `${event.uri}/invitees`;
        const inviteesRes = await fetch(inviteesUrl, {
          headers: { 'Authorization': `Bearer ${calendlyApiKey}` }
        });
        const inviteesData = await inviteesRes.json();
        
        for (const invitee of (inviteesData.collection || [])) {
          if (invitee.cancellation) {
            const bookingTime = new Date(event.created_at).getTime();
            const cancelTime = new Date(invitee.cancellation.created_at).getTime();
            const secondsToCancel = (cancelTime - bookingTime) / 1000;
            
            results.cancellation_details.push({
              event_name: event.name,
              event_status: event.status,
              event_start: event.start_time,
              event_created: event.created_at,
              invitee_email: invitee.email,
              invitee_status: invitee.status,
              cancellation: invitee.cancellation,
              seconds_from_booking_to_cancel: secondsToCancel,
              is_instant_cancel: secondsToCancel < 10,
              possible_causes: secondsToCancel < 10 ? [
                'Calendly Workflow with "When event is scheduled" trigger',
                'Connected calendar rejecting (busy/conflict)',
                'Zapier/Make automation',
                'Another webhook integration calling Calendly API',
                'Routing form redirect'
              ] : []
            });
          }
        }
      }
    }

    // Summary analysis
    results.analysis = {
      total_webhooks: results.webhooks.length,
      webhooks_that_could_cancel: results.webhooks.filter((w: any) => 
        w.events?.includes('invitee.created')
      ).length,
      has_routing_forms: Array.isArray(results.routing_forms) && results.routing_forms.length > 0,
      instant_cancellations: results.cancellation_details.filter((c: any) => c.is_instant_cancel).length,
      recommendation: results.webhooks.length > 1 
        ? 'Multiple webhooks detected - check each callback URL for automation that might cancel'
        : 'Check Calendly Workflows in your admin panel - this is the most common cause of instant cancellations'
    };

    return new Response(JSON.stringify(results, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const err = error as Error;
    return new Response(JSON.stringify({ 
      error: err.message,
      stack: err.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
