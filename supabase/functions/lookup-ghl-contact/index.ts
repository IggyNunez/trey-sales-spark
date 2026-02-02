import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface LookupRequest {
  email: string;
  event_id: string;
  organization_id: string;
}

// PIT tokens (V2) start with "pit-"
function isV2Token(apiKey: string): boolean {
  return apiKey.startsWith("pit-");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { email, event_id, organization_id }: LookupRequest = await req.json();

    if (!email || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing email or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GHL API key using encrypted key helper
    const ghlApiKey = await getApiKey(supabaseUrl, supabaseServiceKey, organization_id, 'ghl', 'lookup-ghl-contact');

    if (!ghlApiKey) {
      return new Response(
        JSON.stringify({ error: "GHL not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useV2 = isV2Token(ghlApiKey);
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
            needs_location_id: true 
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`Looking up contact in GHL using API ${useV2 ? 'v2' : 'v1'}`);

    let ghlResponse: Response;
    
    if (useV2) {
      // V2 API with PIT token
      const searchUrl = new URL("https://services.leadconnectorhq.com/contacts/");
      searchUrl.searchParams.set("locationId", locationId!);
      searchUrl.searchParams.set("query", email);
      
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
        `https://rest.gohighlevel.com/v1/contacts/lookup?email=${encodeURIComponent(email)}`,
        {
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );
    }

    if (!ghlResponse.ok) {
      const errorText = await ghlResponse.text();
      console.error("GHL lookup failed:", errorText);
      return new Response(
        JSON.stringify({ error: "GHL lookup failed", details: errorText }),
        { status: ghlResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const ghlData = await ghlResponse.json();
    const contacts = ghlData.contacts || [];
    
    // Find exact email match first
    const matchingContact = contacts.find(
      (c: { email?: string }) => c.email?.toLowerCase() === email.toLowerCase()
    );
    const contactId = matchingContact?.id || contacts[0]?.id || null;

    // If we have a contact ID and event_id, update the event
    if (contactId && event_id) {
      const { error: updateError } = await supabase
        .from("events")
        .update({ ghl_contact_id: contactId })
        .eq("id", event_id);

      if (updateError) {
        console.error("Failed to update event with GHL contact ID:", updateError);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        contact_id: contactId,
        contact: matchingContact || contacts[0] || null,
        api_version: useV2 ? "v2" : "v1"
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in lookup-ghl-contact:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});