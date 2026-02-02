import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface Pipeline {
  id: string;
  name: string;
  stages: { id: string; name: string }[];
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

    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "Missing organization_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get GHL API key
    const ghlApiKey = await getApiKey(supabaseUrl, supabaseServiceKey, organization_id, 'ghl', 'fetch-ghl-pipelines');

    if (!ghlApiKey) {
      return new Response(
        JSON.stringify({ error: "GHL not configured", pipelines: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const useV2 = isV2Token(ghlApiKey);
    let locationId: string | null = null;

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
            error: "GHL Location ID required", 
            needs_location_id: true,
            pipelines: [] 
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const pipelines: Pipeline[] = [];

    if (useV2) {
      // V2 API - fetch pipelines
      const pipelinesResponse = await fetch(
        `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${locationId}`,
        {
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
          },
        }
      );

      if (pipelinesResponse.ok) {
        const data = await pipelinesResponse.json();
        for (const pipeline of data.pipelines || []) {
          pipelines.push({
            id: pipeline.id,
            name: pipeline.name,
            stages: (pipeline.stages || []).map((s: any) => ({
              id: s.id,
              name: s.name,
            })),
          });
        }
      } else {
        const errText = await pipelinesResponse.text();
        console.error("Failed to fetch pipelines:", errText);
      }
    } else {
      // V1 API - fetch pipelines
      const pipelinesResponse = await fetch(
        "https://rest.gohighlevel.com/v1/pipelines/",
        {
          headers: {
            Authorization: `Bearer ${ghlApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (pipelinesResponse.ok) {
        const data = await pipelinesResponse.json();
        for (const pipeline of data.pipelines || []) {
          pipelines.push({
            id: pipeline.id,
            name: pipeline.name,
            stages: (pipeline.stages || []).map((s: any) => ({
              id: s.id,
              name: s.name,
            })),
          });
        }
      }
    }

    return new Response(
      JSON.stringify({ 
        pipelines, 
        api_version: useV2 ? 'v2' : 'v1',
        location_id: locationId 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in fetch-ghl-pipelines:", error);
    return new Response(
      JSON.stringify({ error: message, pipelines: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
