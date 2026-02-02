import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const { token } = await req.json();

    if (!token) {
      console.log("No token provided");
      return new Response(
        JSON.stringify({ valid: false, error: "No token provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate token format (can be UUID or 64-char hex string)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const hexRegex = /^[0-9a-f]{64}$/i;
    if (!uuidRegex.test(token) && !hexRegex.test(token)) {
      console.log("Invalid token format:", token.substring(0, 8) + "...");
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid token format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with service role to bypass RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    console.log("Looking up invitation with token:", token.substring(0, 8) + "...");

    // Fetch invitation by token
    const { data: invitation, error: inviteError } = await supabaseAdmin
      .from("invitations")
      .select("id, email, invite_type, closer_name, status, expires_at, organization_id, role")
      .eq("token", token)
      .maybeSingle();

    if (inviteError) {
      console.error("Database error:", inviteError);
      return new Response(
        JSON.stringify({ valid: false, error: "Database error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!invitation) {
      console.log("No invitation found for token");
      return new Response(
        JSON.stringify({ valid: false, error: "Invalid invitation link" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already accepted
    if (invitation.status === "accepted") {
      console.log("Invitation already accepted:", invitation.id);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "This invitation has already been accepted. Please log in instead." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      console.log("Invitation expired:", invitation.id);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: "This invitation has expired. Please request a new one." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch organization name if org_id exists
    let organizationName = null;
    if (invitation.organization_id) {
      const { data: orgData } = await supabaseAdmin
        .from("organizations")
        .select("name")
        .eq("id", invitation.organization_id)
        .single();
      
      organizationName = orgData?.name ?? null;
    }

    console.log("Invitation valid:", invitation.id, "Type:", invitation.invite_type);

    // Return invitation data (safe to expose since they have the token)
    return new Response(
      JSON.stringify({
        valid: true,
        invitation: {
          id: invitation.id,
          email: invitation.email,
          invite_type: invitation.invite_type,
          closer_name: invitation.closer_name,
          status: invitation.status,
          expires_at: invitation.expires_at,
          organization_id: invitation.organization_id,
          organization_name: organizationName,
          role: invitation.role,
        },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error in validate-invite:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ valid: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
