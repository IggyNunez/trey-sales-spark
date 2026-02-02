import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Sync Close custom fields to events based on lead_email
async function syncEventsWithClose(
  supabase: any,
  authHeader: string,
  orgId: string,
  syncedFieldMappings: any[]
) {
  console.log(`Starting Close events sync for org ${orgId}...`);

  // Fetch all Close users to resolve user IDs to names
  const usersResponse = await fetch('https://api.close.com/api/v1/user/', {
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
  });

  const userNameCache: Record<string, string> = {};
  if (usersResponse.ok) {
    const usersData = await usersResponse.json();
    for (const user of usersData.data || []) {
      userNameCache[user.id] = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.email?.split('@')[0] || user.id;
    }
    console.log('Loaded Close users:', Object.keys(userNameCache).length);
  }

  const resolveUserName = (userId: string | null | undefined): string | null => {
    if (!userId) return null;
    if (userId.startsWith('user_')) {
      return userNameCache[userId] || null;
    }
    return userId;
  };

  // Fetch events that need close_custom_fields populated
  const { data: events, error: eventsError } = await supabase
    .from('events')
    .select('id, lead_email, close_custom_fields')
    .eq('organization_id', orgId)
    .not('lead_email', 'is', null)
    .order('scheduled_at', { ascending: false })
    .limit(500);

  if (eventsError) {
    throw new Error(`Failed to fetch events: ${eventsError.message}`);
  }

  console.log(`Found ${events?.length || 0} events to process`);

  const leadCache: Record<string, any> = {};
  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  const findLeadByEmail = async (email: string): Promise<any | null> => {
    // Strategy 1: Direct lead search
    try {
      const searchResponse = await fetch(
        `https://api.close.com/api/v1/lead/?query=email:"${encodeURIComponent(email)}"`,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        if (searchData.data && searchData.data.length > 0) {
          return searchData.data[0];
        }
      }
    } catch (e) {
      console.error(`Strategy 1 failed for ${email}:`, e);
    }

    // Strategy 2: Contact search
    try {
      const contactResponse = await fetch(
        `https://api.close.com/api/v1/contact/?query=email:"${encodeURIComponent(email)}"`,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (contactResponse.ok) {
        const contactData = await contactResponse.json();
        if (contactData.data && contactData.data.length > 0) {
          const contact = contactData.data[0];
          if (contact.lead_id) {
            const leadResponse = await fetch(
              `https://api.close.com/api/v1/lead/${contact.lead_id}/`,
              {
                headers: {
                  'Authorization': `Basic ${authHeader}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            if (leadResponse.ok) {
              return await leadResponse.json();
            }
          }
        }
      }
    } catch (e) {
      console.error(`Strategy 2 failed for ${email}:`, e);
    }

    return null;
  };

  for (const event of events || []) {
    const email = event.lead_email?.toLowerCase()?.trim();
    if (!email) {
      skipped++;
      continue;
    }

    let leadData = leadCache[email];
    
    if (!leadData) {
      try {
        leadData = await findLeadByEmail(email);
        if (leadData) {
          leadCache[email] = leadData;
        }
      } catch (e) {
        console.error(`Error fetching lead for ${email}:`, e);
        errors++;
        continue;
      }
    }

    if (!leadData) {
      console.log(`Lead not found in Close for: ${email}`);
      notFound++;
      continue;
    }

    // Build close_custom_fields JSONB from synced field mappings
    const closeCustomFields: Record<string, string | null> = {};
    for (const mapping of syncedFieldMappings) {
      const rawValue = leadData[`custom.${mapping.close_field_id}`];
      const resolvedValue = resolveUserName(rawValue) || rawValue;
      if (resolvedValue) {
        closeCustomFields[mapping.local_field_slug] = resolvedValue;
      }
    }

    if (Object.keys(closeCustomFields).length === 0) {
      console.log(`No custom field data found for ${email}`);
      skipped++;
      continue;
    }

    // Update event with close_custom_fields
    const { error: updateError } = await supabase
      .from('events')
      .update({ close_custom_fields: closeCustomFields })
      .eq('id', event.id);

    if (updateError) {
      console.error(`Failed to update event ${event.id}:`, updateError);
      errors++;
    } else {
      updated++;
      console.log(`Updated event ${event.id} for ${email}:`, closeCustomFields);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`Close events sync complete: updated=${updated}, skipped=${skipped}, notFound=${notFound}, errors=${errors}`);
  
  return { updated, skipped, notFound, errors, total: events?.length || 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { organizationId, background } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Close API key
    const CLOSE_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'close', 'sync-close-events');
    
    if (!CLOSE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Close API key not configured. Please add your API key in Settings → Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = btoa(`${CLOSE_API_KEY}:`);

    // Fetch synced close_field_mappings for this org
    const { data: syncedFieldMappings, error: mappingsError } = await supabase
      .from('close_field_mappings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_synced', true);

    if (mappingsError || !syncedFieldMappings || syncedFieldMappings.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No synced Close field mappings found. Please configure and save your Close fields first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found synced field mappings:', syncedFieldMappings.length);

    if (background) {
      const syncPromise = syncEventsWithClose(supabase, authHeader, organizationId, syncedFieldMappings);
      
      // @ts-ignore
      if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
        // @ts-ignore
        EdgeRuntime.waitUntil(syncPromise);
      } else {
        syncPromise.catch(e => console.error('Background sync error:', e));
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Events sync started in background. Refresh in a few moments to see updated data.',
          background: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const result = await syncEventsWithClose(supabase, authHeader, organizationId, syncedFieldMappings);

    return new Response(
      JSON.stringify({ success: true, ...result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-close-events:', error);
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
