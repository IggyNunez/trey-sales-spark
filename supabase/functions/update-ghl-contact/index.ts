import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface UpdateRequest {
  ghl_contact_id: string;
  organization_id: string;
  custom_fields?: Record<string, any>;
  tags?: string[];
  notes?: string;
  pipeline_stage?: {
    pipeline_id: string;
    stage_id: string;
  };
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

    const { ghl_contact_id, organization_id, custom_fields, tags, notes, pipeline_stage }: UpdateRequest = await req.json();

    if (!ghl_contact_id || !organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing ghl_contact_id or organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Skip if contact was not found in GHL
    if (ghl_contact_id === 'NOT_FOUND') {
      console.log('Skipping update for NOT_FOUND contact');
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'Contact not found in GHL' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GHL API key using encrypted key helper
    const ghlApiKey = await getApiKey(supabaseUrl, supabaseServiceKey, organization_id, 'ghl', 'update-ghl-contact');

    if (!ghlApiKey) {
      return new Response(
        JSON.stringify({ error: "GHL not configured for this organization" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useV2 = isV2Token(ghlApiKey);
    console.log(`[GHL Update] Using API ${useV2 ? 'v2' : 'v1'} for contact ${ghl_contact_id}`);

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
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let updateSuccess = false;
    let contactData: any = null;

    if (useV2) {
      // V2 API with PIT token
      const updatePayload: Record<string, any> = {};

      if (custom_fields && Object.keys(custom_fields).length > 0) {
        updatePayload.customFields = Object.entries(custom_fields).map(([key, value]) => ({
          id: key,
          value: value,
        }));
      }

      if (tags && tags.length > 0) {
        updatePayload.tags = tags;
      }

      // Update contact via V2 API
      const ghlResponse = await fetch(
        `https://services.leadconnectorhq.com/contacts/${ghl_contact_id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!ghlResponse.ok) {
        const errorText = await ghlResponse.text();
        console.error("GHL V2 update failed:", errorText);
        return new Response(
          JSON.stringify({ error: "GHL update failed", details: errorText }),
          { status: ghlResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      contactData = await ghlResponse.json();
      updateSuccess = true;

      // Add notes via V2 API
      if (notes) {
        await fetch(
          `https://services.leadconnectorhq.com/contacts/${ghl_contact_id}/notes`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              "Content-Type": "application/json",
              Version: "2021-07-28",
            },
            body: JSON.stringify({ body: notes }),
          }
        );
      }

      // Move to pipeline stage via V2 API
      if (pipeline_stage?.pipeline_id && pipeline_stage?.stage_id) {
        console.log(`Moving contact to pipeline ${pipeline_stage.pipeline_id}, stage ${pipeline_stage.stage_id}`);
        
        // First, check if opportunity exists for this contact
        const oppsResponse = await fetch(
          `https://services.leadconnectorhq.com/opportunities/search?location_id=${locationId}&contact_id=${ghl_contact_id}`,
          {
            method: "GET",
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              "Content-Type": "application/json",
              Version: "2021-07-28",
            },
          }
        );

        if (oppsResponse.ok) {
          const oppsData = await oppsResponse.json();
          const existingOpp = oppsData.opportunities?.find(
            (opp: any) => opp.pipelineId === pipeline_stage.pipeline_id
          );

          if (existingOpp) {
            // Update existing opportunity stage
            await fetch(
              `https://services.leadconnectorhq.com/opportunities/${existingOpp.id}`,
              {
                method: "PUT",
                headers: {
                  Authorization: `Bearer ${ghlApiKey}`,
                  "Content-Type": "application/json",
                  Version: "2021-07-28",
                },
                body: JSON.stringify({
                  pipelineStageId: pipeline_stage.stage_id,
                }),
              }
            );
            console.log('Updated existing opportunity stage');
          } else {
            // Create new opportunity in the pipeline
            await fetch(
              `https://services.leadconnectorhq.com/opportunities/`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${ghlApiKey}`,
                  "Content-Type": "application/json",
                  Version: "2021-07-28",
                },
                body: JSON.stringify({
                  locationId: locationId,
                  contactId: ghl_contact_id,
                  pipelineId: pipeline_stage.pipeline_id,
                  pipelineStageId: pipeline_stage.stage_id,
                  name: `Opportunity from PCF`,
                  status: "open",
                }),
              }
            );
            console.log('Created new opportunity');
          }
        }
      }
    } else {
      // V1 API - Agency tokens
      const updatePayload: Record<string, any> = {};

      if (custom_fields && Object.keys(custom_fields).length > 0) {
        updatePayload.customField = custom_fields;
      }

      if (tags && tags.length > 0) {
        updatePayload.tags = tags;
      }

      const ghlResponse = await fetch(
        `https://rest.gohighlevel.com/v1/contacts/${ghl_contact_id}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!ghlResponse.ok) {
        const errorText = await ghlResponse.text();
        console.error("GHL V1 update failed:", errorText);
        return new Response(
          JSON.stringify({ error: "GHL update failed", details: errorText }),
          { status: ghlResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      contactData = await ghlResponse.json();
      updateSuccess = true;

      // Add notes via V1 API
      if (notes) {
        await fetch(
          `https://rest.gohighlevel.com/v1/contacts/${ghl_contact_id}/notes`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ body: notes }),
          }
        );
      }

      // Pipeline stage for V1 API
      if (pipeline_stage?.pipeline_id && pipeline_stage?.stage_id) {
        // V1 API uses different endpoint for pipeline updates
        await fetch(
          `https://rest.gohighlevel.com/v1/pipelines/${pipeline_stage.pipeline_id}/opportunities`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ghlApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              contactId: ghl_contact_id,
              stageId: pipeline_stage.stage_id,
              title: "Opportunity from PCF",
            }),
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ success: updateSuccess, contact: contactData, api_version: useV2 ? 'v2' : 'v1' }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in update-ghl-contact:", error);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
