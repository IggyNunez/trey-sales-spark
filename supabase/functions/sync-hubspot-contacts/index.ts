import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface SyncRequest {
  organization_id: string;
  limit?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organization_id, limit = 500 }: SyncRequest = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get HubSpot API key using encrypted key helper
    const hubspotApiKey = await getApiKey(supabaseUrl, supabaseServiceKey, organization_id, 'hubspot', 'sync-hubspot-contacts');

    if (!hubspotApiKey) {
      return new Response(
        JSON.stringify({ error: "HubSpot not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('Using encrypted HubSpot API key for sync-hubspot-contacts');

    // Get events without HubSpot contact ID
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, lead_email")
      .eq("organization_id", organization_id)
      .is("hubspot_contact_id", null)
      .not("lead_email", "is", null)
      .limit(limit);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    console.log(`Found ${events?.length || 0} events without HubSpot contact ID`);

    let matched = 0;
    let notFound = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each event
    for (const event of events || []) {
      if (!event.lead_email) continue;

      try {
        // HubSpot API v3 - Search contacts by email
        // https://developers.hubspot.com/docs/api/crm/contacts
        const searchUrl = "https://api.hubapi.com/crm/v3/objects/contacts/search";
        
        const searchBody = {
          filterGroups: [{
            filters: [{
              propertyName: "email",
              operator: "EQ",
              value: event.lead_email.toLowerCase()
            }]
          }],
          properties: ["email", "firstname", "lastname"],
          limit: 1
        };

        const hubspotResponse = await fetch(searchUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${hubspotApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(searchBody),
        });

        if (hubspotResponse.ok) {
          const hubspotData = await hubspotResponse.json();
          const contacts = hubspotData.results || [];
          
          if (contacts.length > 0) {
            // HubSpot contact ID is stored in the 'id' field
            const contactId = contacts[0].id;

            if (contactId) {
              // Update event with HubSpot contact ID
              const { error: updateError } = await supabase
                .from("events")
                .update({ hubspot_contact_id: contactId })
                .eq("id", event.id);

              if (updateError) {
                console.error(`Failed to update event ${event.id}:`, updateError.message);
                errors++;
              } else {
                matched++;
                console.log(`Matched ${event.lead_email} -> HubSpot ID: ${contactId}`);
              }
            } else {
              notFound++;
            }
          } else {
            notFound++;
          }
        } else {
          const errText = await hubspotResponse.text();
          // Only log first few errors to avoid spam
          if (errorDetails.length < 3) {
            errorDetails.push(`${event.lead_email}: ${errText}`);
          }
          console.warn(`HubSpot lookup failed for ${event.lead_email}: ${errText}`);
          errors++;
        }

        // Rate limit: HubSpot has rate limits, add a small delay
        // HubSpot allows 100 requests per 10 seconds for search
        await new Promise(resolve => setTimeout(resolve, 120));
      } catch (err) {
        console.error(`Error processing event ${event.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        total_processed: events?.length || 0,
        matched,
        not_found: notFound,
        errors,
        error_sample: errorDetails.length > 0 ? errorDetails : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in sync-hubspot-contacts:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
