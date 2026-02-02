import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { connectionId } = await req.json();

    if (!connectionId) {
      return new Response(
        JSON.stringify({ success: false, error: 'connectionId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the selected connection with its API key
    const { data: connection, error: connError } = await supabase
      .from('webhook_connections')
      .select('id, name, api_key, webhook_secret')
      .eq('id', connectionId)
      .maybeSingle();

    if (connError) {
      return new Response(
        JSON.stringify({ success: false, error: connError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection) {
      return new Response(
        JSON.stringify({ success: false, error: 'Connection not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!connection.api_key) {
      return new Response(
        JSON.stringify({ success: false, error: `Connection "${connection.name}" does not have an API key configured. Go to Settings -> Webhook Connections and click the pencil icon to add one.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the company_id from webhook_secret field
    const companyId = connection.webhook_secret;
    if (!companyId) {
      return new Response(
        JSON.stringify({ success: false, error: `Connection "${connection.name}" does not have a company ID (biz_xxx) configured in the webhook_secret field.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Backfilling for connection: ${connection.name} (${connection.id}), company_id: ${companyId}`);

    // Fetch all payments from this Whop using API v1 (same as sync-whop-connection)
    const allWhopPayments: any[] = [];
    let cursor: string | null = null;
    let hasNextPage = true;
    let pageCount = 0;
    const maxPages = 100; // Safety limit
    
    while (hasNextPage && pageCount < maxPages) {
      pageCount++;
      const url = new URL('https://api.whop.com/api/v1/payments');
      url.searchParams.set('company_id', companyId);
      url.searchParams.set('first', '100');
      url.searchParams.append('statuses[]', 'paid');
      
      // Get all time - no date filters
      url.searchParams.set('order', 'paid_at');
      url.searchParams.set('direction', 'desc');
      
      if (cursor) {
        url.searchParams.set('after', cursor);
      }

      console.log(`Fetching page ${pageCount} from Whop API...`);
      
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${connection.api_key}`,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Whop API error: ${response.status} - ${errorText}`);
        return new Response(
          JSON.stringify({ success: false, error: `Whop API error: ${response.status}. Make sure the API key has access to company ${companyId}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const payments = data.data || [];
      
      console.log(`Got ${payments.length} payments on page ${pageCount}`);
      allWhopPayments.push(...payments);

      // Check pagination
      const pageInfo = data.page_info || data.pagination;
      if (pageInfo?.has_next_page && pageInfo?.end_cursor) {
        cursor = pageInfo.end_cursor;
      } else if (payments.length === 100) {
        // If we got exactly 100 and no pagination info, try the last payment id as cursor
        cursor = payments[payments.length - 1]?.id;
      } else {
        hasNextPage = false;
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`Total Whop payments fetched: ${allWhopPayments.length}`);

    // Now match these payments to our database
    let matched = 0;
    let created = 0;
    let skipped = 0;
    let alreadyAssigned = 0;

    for (const whopPayment of allWhopPayments) {
      // Get payment details
      const email = (whopPayment.user?.email || whopPayment.customer_email || '').toLowerCase();
      const amount = whopPayment.final_amount ? Number(whopPayment.final_amount) / 100 : 0; // Whop uses cents
      const whopPaymentId = whopPayment.id;
      const status = whopPayment.status;

      // Only process paid/successful payments
      if (status !== 'paid' && status !== 'succeeded') {
        skipped++;
        continue;
      }

      if (!email) {
        console.log(`Skipping payment ${whopPaymentId}: no email`);
        skipped++;
        continue;
      }

      // Try to find a matching payment in our database by note pattern (whop_pay_xxx)
      const { data: existingByNote } = await supabase
        .from('payments')
        .select('id, whop_connection_id')
        .ilike('notes', `%${whopPaymentId}%`)
        .limit(1);

      if (existingByNote && existingByNote.length > 0) {
        const existing = existingByNote[0];
        if (existing.whop_connection_id === connectionId) {
          alreadyAssigned++;
          continue;
        }
        // Update the connection
        await supabase
          .from('payments')
          .update({ whop_connection_id: connectionId })
          .eq('id', existing.id);
        matched++;
        console.log(`Matched by note: ${whopPaymentId}`);
        continue;
      }

      // Try to match by email and amount (with tolerance for rounding)
      const { data: existingByEmailAmount } = await supabase
        .from('payments')
        .select('id, whop_connection_id, amount')
        .eq('customer_email', email)
        .is('whop_connection_id', null)
        .limit(10);

      if (existingByEmailAmount && existingByEmailAmount.length > 0) {
        // Find one with matching amount (within $1 tolerance)
        const matchingPayment = existingByEmailAmount.find(p => 
          Math.abs(Number(p.amount) - amount) < 1
        );

        if (matchingPayment) {
          await supabase
            .from('payments')
            .update({ whop_connection_id: connectionId })
            .eq('id', matchingPayment.id);
          matched++;
          console.log(`Matched by email/amount: ${email} $${amount}`);
          continue;
        }
      }

      // No match found - just skip (don't create new payments in backfill)
      skipped++;
    }

    console.log(`Backfill complete: ${matched} matched, ${created} created, ${skipped} skipped, ${alreadyAssigned} already assigned`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        totalPayments: allWhopPayments.length,
        matched,
        created,
        skipped,
        alreadyAssigned,
        connectionName: connection.name
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
