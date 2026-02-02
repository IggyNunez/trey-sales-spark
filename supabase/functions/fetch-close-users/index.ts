import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface CloseUser {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organization_id } = await req.json();

    if (!organization_id) {
      return new Response(
        JSON.stringify({ error: "organization_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Close API key using encrypted key helper (enables lazy migration)
    const closeApiKey = await getApiKey(supabaseUrl, supabaseKey, organization_id, 'close', 'fetch-close-users');

    if (!closeApiKey) {
      return new Response(
        JSON.stringify({ error: "Close API key not configured", users: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log('Using encrypted Close API key for fetch-close-users');
    const authHeader = btoa(`${closeApiKey}:`);
    
    const closeResponse = await fetch("https://api.close.com/api/v1/user/", {
      method: "GET",
      headers: {
        "Authorization": `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
    });

    if (!closeResponse.ok) {
      const errorText = await closeResponse.text();
      console.error("Close API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to fetch users from Close", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const closeData = await closeResponse.json();
    
    // Map Close users to a simpler format
    const users: CloseUser[] = (closeData.data || []).map((user: any) => ({
      id: user.id,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
    }));

    return new Response(
      JSON.stringify({ users, count: users.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error fetching Close users:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
