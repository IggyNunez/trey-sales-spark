import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // SECURITY: Verify caller is authenticated and is super_admin only
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('SECURITY: No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabaseAdmin.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      console.error('SECURITY: Invalid token:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerUserId = claims.claims.sub as string;

    // SECURITY: Only super_admin can delete users
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId);

    const isSuperAdmin = callerRoles?.some(r => r.role === 'super_admin');
    if (!isSuperAdmin) {
      console.error('SECURITY: User is not super_admin:', callerUserId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Super admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated super_admin user:', callerUserId);

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Prevent self-deletion
    const callerEmail = claims.claims.email as string;
    if (email.toLowerCase() === callerEmail?.toLowerCase()) {
      return new Response(
        JSON.stringify({ error: "Cannot delete your own account" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the user by email
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("Error listing users:", listError);
      return new Response(
        JSON.stringify({ error: "Failed to list users", details: listError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userToDelete = users.users.find(u => u.email === email);

    if (!userToDelete) {
      return new Response(
        JSON.stringify({ error: "User not found", email }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userToDelete.id;

    // Delete related data first (cascade should handle most, but let's be explicit)
    console.log(`Deleting related data for user ${userId}...`);

    // Delete from organization_members
    await supabaseAdmin.from("organization_members").delete().eq("user_id", userId);
    
    // Delete from user_roles
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    
    // Delete from profiles
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);

    // Reset any invitations for this email
    await supabaseAdmin
      .from("invitations")
      .update({ status: "pending", accepted_at: null })
      .eq("email", email);

    // Delete the auth user
    console.log(`Deleting auth user ${userId}...`);
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteError) {
      console.error("Error deleting user:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete user", details: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Successfully deleted user ${email}`);

    return new Response(
      JSON.stringify({ success: true, deletedEmail: email }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in delete-auth-user:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
