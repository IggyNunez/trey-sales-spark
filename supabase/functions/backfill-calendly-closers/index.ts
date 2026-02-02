import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Helper function to extract closer info from Calendly API response
interface CloserInfo {
  closerName: string | null;
  closerEmail: string | null;
  extractionMethod: string;
}

function extractCloserFromCalendlyEvent(event: any): CloserInfo {
  let closerName: string | null = null;
  let closerEmail: string | null = null;
  let extractionMethod = 'none';

  // Method 1: event_memberships (primary - hosts of the call)
  if (event.event_memberships?.length > 0) {
    const host = event.event_memberships[0];
    if (host.user_name || host.user_email) {
      closerName = host.user_name || null;
      closerEmail = host.user_email?.toLowerCase() || null;
      extractionMethod = 'event_memberships';
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 2: event_guests (sometimes used for round robin)
  if (event.event_guests?.length > 0) {
    const guest = event.event_guests[0];
    if (guest.name || guest.email) {
      closerName = guest.name || null;
      closerEmail = guest.email?.toLowerCase() || null;
      extractionMethod = 'event_guests';
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 3: event_type.profile (owner of the event type)
  if (event.event_type?.profile) {
    const profile = event.event_type.profile;
    if (profile.name || profile.email) {
      closerName = profile.name || null;
      closerEmail = profile.email?.toLowerCase() || null;
      extractionMethod = 'event_type_profile';
      return { closerName, closerEmail, extractionMethod };
    }
  }

  return { closerName, closerEmail, extractionMethod };
}

// Fetch event details from Calendly API
async function fetchCalendlyEvent(
  calendlyEventUuid: string,
  apiKey: string
): Promise<{ event: any | null; error: string | null }> {
  try {
    const eventUri = `https://api.calendly.com/scheduled_events/${calendlyEventUuid}`;
    
    const response = await fetch(eventUri, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      return { event: null, error: 'Event not found in Calendly' };
    }

    if (response.status === 401) {
      return { event: null, error: 'Invalid Calendly API key' };
    }

    if (!response.ok) {
      const errorText = await response.text();
      return { event: null, error: `Calendly API error: ${response.status} - ${errorText}` };
    }

    const data = await response.json();
    return { event: data.resource, error: null };
  } catch (err) {
    return { event: null, error: `Fetch error: ${err instanceof Error ? err.message : 'Unknown'}` };
  }
}

// Rate limiting helper
async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun ?? true; // Default to dry run for safety
    const batchSize = body.batchSize ?? 50;
    const specificOrgId = body.organizationId || null; // Optional: process only one org
    const maxEvents = body.maxEvents ?? 500; // Safety limit

    console.log('=== BACKFILL CALENDLY CLOSERS ===');
    console.log('Dry run:', dryRun);
    console.log('Batch size:', batchSize);
    console.log('Specific org:', specificOrgId || 'ALL');
    console.log('Max events:', maxEvents);

    // Step 1: Find all organizations with Calendly configured
    let orgsQuery = supabase
      .from('organization_integrations')
      .select('organization_id, calendly_api_key_encrypted')
      .not('calendly_api_key_encrypted', 'is', null);

    if (specificOrgId) {
      orgsQuery = orgsQuery.eq('organization_id', specificOrgId);
    }

    const { data: orgs, error: orgsError } = await orgsQuery;

    if (orgsError) {
      throw new Error(`Failed to fetch organizations: ${orgsError.message}`);
    }

    if (!orgs || orgs.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        message: 'No organizations with Calendly configured found',
        stats: { organizations: 0, events: 0, updated: 0, errors: 0 }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${orgs.length} organizations with Calendly configured`);

    const results = {
      organizations: orgs.length,
      eventsFound: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [] as Array<{ eventId: string; error: string }>,
      updatedEvents: [] as Array<{ eventId: string; closerName: string; method: string }>,
    };

    // Step 2: Process each organization
    for (const org of orgs) {
      const orgId = org.organization_id;
      console.log(`\n--- Processing organization: ${orgId} ---`);

      // Get Calendly API key for this org
      const calendlyApiKey = await getApiKey(
        supabaseUrl,
        supabaseKey,
        orgId,
        'calendly',
        'backfill-calendly-closers'
      );

      if (!calendlyApiKey) {
        console.warn(`No Calendly API key found for org ${orgId}, skipping`);
        continue;
      }

      // Find events missing closer_name for this org
      const { data: events, error: eventsError } = await supabase
        .from('events')
        .select('id, calendly_event_uuid, lead_email, lead_name, scheduled_at, closer_name, closer_email')
        .eq('organization_id', orgId)
        .is('closer_name', null)
        .not('calendly_event_uuid', 'is', null)
        .order('created_at', { ascending: false })
        .limit(batchSize);

      if (eventsError) {
        console.error(`Failed to fetch events for org ${orgId}:`, eventsError);
        results.errors++;
        continue;
      }

      if (!events || events.length === 0) {
        console.log(`No events missing closer_name for org ${orgId}`);
        continue;
      }

      console.log(`Found ${events.length} events missing closer_name`);
      results.eventsFound += events.length;

      // Check if we've hit the max events limit
      if (results.eventsFound > maxEvents) {
        console.warn(`Reached max events limit (${maxEvents}), stopping`);
        break;
      }

      // Process each event
      for (const event of events) {
        const eventUuid = event.calendly_event_uuid;
        
        if (!eventUuid) {
          results.skipped++;
          continue;
        }

        console.log(`Processing event ${event.id} (Calendly UUID: ${eventUuid})`);

        // Fetch event details from Calendly API
        const { event: calendlyEvent, error: fetchError } = await fetchCalendlyEvent(
          eventUuid,
          calendlyApiKey
        );

        if (fetchError) {
          console.warn(`Failed to fetch Calendly event ${eventUuid}: ${fetchError}`);
          results.errors++;
          results.errorDetails.push({ eventId: event.id, error: fetchError });
          continue;
        }

        if (!calendlyEvent) {
          results.skipped++;
          continue;
        }

        // Extract closer info
        const closerInfo = extractCloserFromCalendlyEvent(calendlyEvent);

        if (!closerInfo.closerName && !closerInfo.closerEmail) {
          console.log(`No closer info found for event ${event.id}`);
          results.skipped++;
          continue;
        }

        console.log(`Found closer for event ${event.id}: ${closerInfo.closerName} (${closerInfo.extractionMethod})`);

        if (dryRun) {
          results.updated++;
          results.updatedEvents.push({
            eventId: event.id,
            closerName: closerInfo.closerName || 'N/A',
            method: closerInfo.extractionMethod,
          });
        } else {
          // Actually update the event
          const { error: updateError } = await supabase
            .from('events')
            .update({
              closer_name: closerInfo.closerName,
              closer_email: closerInfo.closerEmail,
            })
            .eq('id', event.id);

          if (updateError) {
            console.error(`Failed to update event ${event.id}:`, updateError);
            results.errors++;
            results.errorDetails.push({ eventId: event.id, error: updateError.message });
          } else {
            results.updated++;
            results.updatedEvents.push({
              eventId: event.id,
              closerName: closerInfo.closerName || 'N/A',
              method: closerInfo.extractionMethod,
            });
          }
        }

        // Rate limit: 100ms delay between API calls to respect Calendly limits
        await sleep(100);
      }
    }

    console.log('\n=== BACKFILL COMPLETE ===');
    console.log('Results:', JSON.stringify(results, null, 2));

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      message: dryRun 
        ? `Dry run complete. Would update ${results.updated} events.` 
        : `Backfill complete. Updated ${results.updated} events.`,
      stats: {
        organizations: results.organizations,
        eventsFound: results.eventsFound,
        updated: results.updated,
        skipped: results.skipped,
        errors: results.errors,
      },
      updatedEvents: results.updatedEvents.slice(0, 100), // Limit response size
      errorDetails: results.errorDetails.slice(0, 50),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
