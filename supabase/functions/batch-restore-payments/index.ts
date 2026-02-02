import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

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
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      console.error('SECURITY: Invalid token:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claims.claims.sub as string;

    // Verify user has admin or super_admin role
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isAdmin = roles?.some(r => ['admin', 'super_admin'].includes(r.role));
    if (!isAdmin) {
      console.error('SECURITY: User is not admin:', userId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated admin user:', userId);
    
    const { timestamp } = await req.json();
    
    if (!timestamp) {
      return new Response(
        JSON.stringify({ error: 'Missing timestamp parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Batch restore to point before: ${timestamp}`);

    // Get all audit logs AFTER this timestamp
    const { data: auditLogs, error: auditError } = await supabase
      .from('audit_logs')
      .select('record_id, old_data')
      .eq('table_name', 'payments')
      .eq('action', 'UPDATE')
      .gte('created_at', timestamp + ':00Z')
      .order('created_at', { ascending: true });

    if (auditError) {
      throw auditError;
    }

    if (!auditLogs || auditLogs.length === 0) {
      return new Response(
        JSON.stringify({ success: true, restored: 0, message: 'No changes found after this point' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${auditLogs.length} audit log entries`);

    // Group by payment_id and get first old_data (state before changes)
    const paymentStates = new Map<string, Record<string, any>>();
    for (const log of auditLogs) {
      if (!paymentStates.has(log.record_id) && log.old_data) {
        paymentStates.set(log.record_id, log.old_data);
      }
    }

    console.log(`Restoring ${paymentStates.size} unique payments`);

    // Batch update using Promise.all with chunks
    const entries = Array.from(paymentStates.entries());
    const BATCH_SIZE = 50;
    let restored = 0;
    let errors = 0;

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = entries.slice(i, i + BATCH_SIZE);
      
      const updatePromises = batch.map(async ([paymentId, oldData]) => {
        const { error } = await supabase
          .from('payments')
          .update({
            setter_id: oldData.setter_id || null,
            closer_id: oldData.closer_id || null,
            source_id: oldData.source_id || null,
            traffic_type_id: oldData.traffic_type_id || null,
          })
          .eq('id', paymentId);

        if (error) {
          console.error(`Error restoring ${paymentId}:`, error);
          return { success: false };
        }
        return { success: true };
      });

      const results = await Promise.all(updatePromises);
      restored += results.filter(r => r.success).length;
      errors += results.filter(r => !r.success).length;
    }

    console.log(`Restored ${restored} payments, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        restored,
        errors,
        auditLogsProcessed: auditLogs.length 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in batch restore:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
