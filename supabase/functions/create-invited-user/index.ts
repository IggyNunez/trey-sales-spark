import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // SECURITY: Verify caller is authenticated and is admin/super_admin
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

    // Verify caller has admin or super_admin role
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId);

    const isAdmin = callerRoles?.some(r => ['admin', 'super_admin'].includes(r.role));
    if (!isAdmin) {
      console.error('SECURITY: User is not admin:', callerUserId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated admin user:', callerUserId);

    const { email, name, organization_id, role } = await req.json();

    if (!email || !organization_id) {
      return new Response(
        JSON.stringify({ error: "email and organization_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SECURITY: Verify caller has access to this organization
    const { data: callerMembership } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('organization_id', organization_id)
      .maybeSingle();

    const isSuperAdmin = callerRoles?.some(r => r.role === 'super_admin');
    const isOrgAdmin = callerMembership?.role === 'admin' || callerMembership?.role === 'owner';

    if (!isSuperAdmin && !isOrgAdmin) {
      console.error('SECURITY: User does not have admin access to org:', organization_id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - No admin access to this organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user with a temporary password
    const tempPassword = crypto.randomUUID();
    const { data: userData, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: name || email.split('@')[0] }
    });

    if (createError) {
      console.error("Create user error:", createError);
      return new Response(
        JSON.stringify({ error: createError.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const userName = name || email.split('@')[0];

    // Create profile
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        user_id: userId,
        email: email,
        name: userName,
        current_organization_id: organization_id
      });

    if (profileError) {
      console.error("Profile error:", profileError);
    }

    // Add user role
    const userRole = role === 'admin' ? 'admin' : 'sales_rep';
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: userRole });

    if (roleError) {
      console.error("Role error:", roleError);
    }

    // Add to organization
    const orgRole = role === 'admin' ? 'admin' : 'member';
    const { error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        user_id: userId,
        organization_id: organization_id,
        role: orgRole
      });

    if (memberError) {
      console.error("Member error:", memberError);
    }

    // Create closer record if this is a sales rep
    if (userRole === 'sales_rep') {
      const { error: closerError } = await supabaseAdmin
        .from('closers')
        .insert({
          name: userName,
          email: email,
          organization_id: organization_id,
          profile_id: userId,
          is_active: true
        });

      if (closerError) {
        console.error("Closer error:", closerError);
      }
    }

    console.log(`Created user ${email} with role ${userRole} in org ${organization_id}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        userId: userId,
        email: email,
        role: userRole 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error creating user:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
