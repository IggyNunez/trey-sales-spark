import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client with service role
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Create user client to verify auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUser = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the authenticated user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { eventIds, organizationId } = await req.json();

    if (!eventIds || !Array.isArray(eventIds) || eventIds.length === 0) {
      return new Response(JSON.stringify({ error: 'No event IDs provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'No organization ID provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user is an admin or owner of this organization
    const { data: membership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (membershipError) {
      console.error('Membership check error:', membershipError);
      return new Response(JSON.stringify({ error: 'Failed to verify permissions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const allowedRoles = ['owner', 'admin'];
    if (!membership || !allowedRoles.includes(membership.role)) {
      // Also check if user is a super_admin
      const { data: superAdmin } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .maybeSingle();

      if (!superAdmin) {
        return new Response(JSON.stringify({ error: 'Permission denied: You must be an org admin or owner' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    console.log(`User ${user.email} deleting ${eventIds.length} events from org ${organizationId}`);

    // First, find payments that reference these events
    const { data: relatedPayments } = await supabaseAdmin
      .from('payments')
      .select('id')
      .in('event_id', eventIds);
    
    const paymentIds = (relatedPayments || []).map(p => p.id);
    
    if (paymentIds.length > 0) {
      // Delete payout_snapshot_details that reference these payments
      console.log(`Deleting payout_snapshot_details for ${paymentIds.length} payments...`);
      const { error: snapshotDetailsError, count: snapshotDetailsCount } = await supabaseAdmin
        .from('payout_snapshot_details')
        .delete({ count: 'exact' })
        .in('payment_id', paymentIds);

      if (snapshotDetailsError) {
        console.error('Delete payout_snapshot_details error:', snapshotDetailsError);
        throw snapshotDetailsError;
      }
      console.log(`Deleted ${snapshotDetailsCount || 0} payout_snapshot_details`);
    }

    // Delete related post_call_forms that reference these events
    console.log(`Deleting related post_call_forms for ${eventIds.length} events...`);
    const { error: pcfDeleteError, count: pcfCount } = await supabaseAdmin
      .from('post_call_forms')
      .delete({ count: 'exact' })
      .in('event_id', eventIds);

    if (pcfDeleteError) {
      console.error('Delete post_call_forms error:', pcfDeleteError);
      throw pcfDeleteError;
    }
    console.log(`Deleted ${pcfCount || 0} related post_call_forms`);

    // Delete related payments that reference these events
    console.log(`Deleting related payments for ${eventIds.length} events...`);
    const { error: paymentsDeleteError, count: paymentsCount } = await supabaseAdmin
      .from('payments')
      .delete({ count: 'exact' })
      .in('event_id', eventIds);

    if (paymentsDeleteError) {
      console.error('Delete payments error:', paymentsDeleteError);
      throw paymentsDeleteError;
    }
    console.log(`Deleted ${paymentsCount || 0} related payments`);

    // Delete events in batches using service role (bypasses RLS)
    const batchSize = 50;
    let totalDeleted = 0;

    for (let i = 0; i < eventIds.length; i += batchSize) {
      const batch = eventIds.slice(i, i + batchSize);
      
      const { error: deleteError, count } = await supabaseAdmin
        .from('events')
        .delete({ count: 'exact' })
        .in('id', batch)
        .eq('organization_id', organizationId);

      if (deleteError) {
        console.error('Delete batch error:', deleteError);
        throw deleteError;
      }

      totalDeleted += count || batch.length;
      console.log(`Deleted batch ${Math.floor(i / batchSize) + 1}: ${count || batch.length} events`);
    }

    console.log(`Total deleted: ${totalDeleted} events`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        deleted: totalDeleted,
        message: `Successfully deleted ${totalDeleted} events`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error in delete-events function:', error);
    const message = error instanceof Error ? error.message : 'Failed to delete events';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
