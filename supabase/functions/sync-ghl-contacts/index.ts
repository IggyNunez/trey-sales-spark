import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface SyncRequest {
  organization_id: string;
  limit?: number; // Default to 5 for testing
}

// PIT tokens (V2) start with "pit-"
function isV2Token(apiKey: string): boolean {
  return apiKey.startsWith("pit-");
}

serve(async (req) => {
  // Get dynamic CORS headers based on request origin
  const origin = req.headers.get("origin");
  const responseHeaders = { ...getCorsHeaders(origin), "Content-Type": "application/json" };

  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    console.log(`[GHL Sync] Environment check - URL: ${supabaseUrl ? 'set' : 'MISSING'}, Service Key: ${supabaseServiceKey ? 'set' : 'MISSING'}`);

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Missing Supabase environment variables");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let bodyText: string;
    try {
      bodyText = await req.text();
      console.log(`[GHL Sync] Request body: ${bodyText}`);
    } catch (e) {
      console.error(`[GHL Sync] Failed to read request body:`, e);
      throw new Error("Failed to read request body");
    }

    let parsedBody: SyncRequest;
    try {
      parsedBody = JSON.parse(bodyText);
    } catch (e) {
      console.error(`[GHL Sync] Failed to parse JSON:`, e);
      throw new Error("Invalid JSON in request body");
    }

    const { organization_id, limit = 50 } = parsedBody;

    console.log(`[GHL Sync] Starting for org ${organization_id}, limit: ${limit}`);

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: responseHeaders }
      );
    }

    // Get GHL API key using encrypted key helper
    console.log(`[GHL Sync] Fetching API key for org ${organization_id}...`);
    let ghlApiKey: string | null;
    try {
      ghlApiKey = await getApiKey(supabaseUrl, supabaseServiceKey, organization_id, 'ghl', 'sync-ghl-contacts');
      console.log(`[GHL Sync] API key result: ${ghlApiKey ? 'found' : 'not found'}`);
    } catch (keyError) {
      console.error(`[GHL Sync] Error fetching API key:`, keyError);
      throw new Error(`Failed to get GHL API key: ${keyError instanceof Error ? keyError.message : 'Unknown error'}`);
    }

    if (!ghlApiKey) {
      return new Response(
        JSON.stringify({ error: "GHL not configured for this organization" }),
        { status: 400, headers: responseHeaders }
      );
    }

    const useV2 = isV2Token(ghlApiKey);
    // SECURITY: Do not log API key details
    console.log(`[GHL Sync] Using API version: ${useV2 ? 'v2' : 'v1'}`);

    let locationId: string | null = null;

    // V2 PIT tokens require location ID
    if (useV2) {
      const { data: integrations } = await supabase
        .from("organization_integrations")
        .select("ghl_location_id")
        .eq("organization_id", organization_id)
        .single();

      locationId = integrations?.ghl_location_id || null;

      if (!locationId) {
        return new Response(
          JSON.stringify({
            error: "GHL Location ID required for PIT tokens",
            needs_location_id: true,
            message: "Please add your GHL Location ID in Settings → Integrations → CRM"
          }),
          { status: 400, headers: responseHeaders }
        );
      }
    }

    console.log(`Using GHL API ${useV2 ? 'v2' : 'v1'}${useV2 ? ' with location configured' : ''}`);

    // Get events without GHL contact ID, starting with most recent
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("id, lead_email")
      .eq("organization_id", organization_id)
      .is("ghl_contact_id", null)
      .not("lead_email", "is", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (eventsError) {
      throw new Error(`Failed to fetch events: ${eventsError.message}`);
    }

    console.log(`Found ${events?.length || 0} events without GHL contact ID`);

    let matched = 0;
    let notFound = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each event
    for (const event of events || []) {
      if (!event.lead_email) continue;

      try {
        let ghlResponse: Response;

        if (useV2) {
          // V2 API with PIT token - requires locationId
          const searchUrl = new URL("https://services.leadconnectorhq.com/contacts/");
          searchUrl.searchParams.set("locationId", locationId!);
          searchUrl.searchParams.set("query", event.lead_email);

          ghlResponse = await fetch(searchUrl.toString(), {
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              "Content-Type": "application/json",
              "Version": "2021-07-28",
            },
          });
        } else {
          // V1 API - Agency tokens
          ghlResponse = await fetch(
            `https://rest.gohighlevel.com/v1/contacts/lookup?email=${encodeURIComponent(event.lead_email)}`,
            {
              headers: {
                Authorization: `Bearer ${ghlApiKey}`,
                "Content-Type": "application/json",
              },
            }
          );
        }

        if (ghlResponse.ok) {
          const ghlData = await ghlResponse.json();
          const contacts = ghlData.contacts || [];

          // Find contact matching the email exactly
          const matchingContact = contacts.find(
            (c: { email?: string }) => c.email?.toLowerCase() === event.lead_email.toLowerCase()
          );
          const contactId = matchingContact?.id || contacts[0]?.id;

          if (contactId) {
            // Update event with GHL contact ID
            const { error: updateError } = await supabase
              .from("events")
              .update({ ghl_contact_id: contactId })
              .eq("id", event.id);

            if (updateError) {
              console.error(`Failed to update event ${event.id}:`, updateError.message);
              errors++;
            } else {
              matched++;
            }
          } else {
            // Mark as checked but not found - so it won't be re-processed
            const { error: updateError } = await supabase
              .from("events")
              .update({ ghl_contact_id: 'NOT_FOUND' })
              .eq("id", event.id);

            if (updateError) {
              console.error(`Failed to mark event ${event.id} as not found:`, updateError.message);
            }
            notFound++;
          }
        } else {
          const errText = await ghlResponse.text();
          if (errorDetails.length < 3) {
            errorDetails.push(`${event.lead_email}: ${errText}`);
          }
          console.warn(`GHL lookup failed for ${event.lead_email}: ${errText}`);
          errors++;
        }

        // Rate limit: GHL has limits, so add a small delay
        await new Promise(resolve => setTimeout(resolve, 100));
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
        api_version: useV2 ? "v2" : "v1",
        error_sample: errorDetails.length > 0 ? errorDetails : undefined,
      }),
      { headers: responseHeaders }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in sync-ghl-contacts:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: responseHeaders }
    );
  }
});
