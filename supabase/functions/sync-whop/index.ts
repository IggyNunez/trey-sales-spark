import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const { action, startDate, endDate, organizationId } = await req.json();

    // STRICT ORG ISOLATION: Require organizationId for all operations
    if (!organizationId) {
      console.error('organizationId is required');
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get org name for logging
    const { data: orgData } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .maybeSingle();

    // STRICT: Get Whop API key using encrypted key helper (enables lazy migration)
    const WHOP_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'whop', 'sync-whop');
    
    if (!WHOP_API_KEY) {
      console.error(`No Whop API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Whop API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Get Whop company ID from org integrations (not encrypted)
    const { data: orgIntegration } = await supabase
      .from('organization_integrations')
      .select('whop_company_id')
      .eq('organization_id', organizationId)
      .maybeSingle();
    
    if (!orgIntegration?.whop_company_id) {
      console.error(`No Whop Company ID configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Whop Company ID not configured for ${orgData?.name || 'this organization'}. Please add your Company ID in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const WHOP_COMPANY_ID = orgIntegration.whop_company_id;
    console.log(`Using encrypted Whop API key for ${orgData?.name}`);
    
    const companyId = WHOP_COMPANY_ID;
    console.log('Using company_id:', companyId);

    // Test connection
    if (action === 'test') {
      const response = await fetch('https://api.whop.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${WHOP_API_KEY}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to connect to Whop API');
      }

      const meData = await response.json();
      console.log('Test connection - /me response:', JSON.stringify(meData, null, 2));

      return new Response(
        JSON.stringify({ success: true, message: 'Connected to Whop', data: meData }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Sync payments
    if (action === 'sync') {
      if (!organizationId) {
        console.error('organizationId is required for sync');
        return new Response(
          JSON.stringify({ error: 'organizationId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      console.log('Starting Whop sync for organization:', organizationId);
      
      // Try to find a matching webhook connection by API key
      const { data: matchingConnection } = await supabase
        .from('webhook_connections')
        .select('id, name')
        .eq('api_key', WHOP_API_KEY)
        .eq('connection_type', 'whop')
        .eq('is_active', true)
        .maybeSingle();
      
      const whopConnectionId = matchingConnection?.id || null;
      console.log(`Using whop_connection_id: ${whopConnectionId} (${matchingConnection?.name || 'no match found'})`);
      
      let allPayments: any[] = [];
      let cursor: string | null = null;
      let hasNextPage = true;
      let pageCount = 0;

      // Use date filters - default to last 60 days if not provided
      const syncStartDate = startDate || '2024-11-01';
      const syncEndDate = endDate || new Date().toISOString().split('T')[0];
      console.log(`Syncing payments from ${syncStartDate} to ${syncEndDate}`);

      while (hasNextPage) {
        pageCount++;
        const url = new URL('https://api.whop.com/api/v1/payments');
        url.searchParams.set('company_id', companyId);
        url.searchParams.set('first', '100'); // Max per page
        
        // Filter to paid status
        url.searchParams.append('statuses[]', 'paid');
        
        // Date filters
        url.searchParams.set('created_after', new Date(syncStartDate + 'T00:00:00Z').toISOString());
        url.searchParams.set('created_before', new Date(syncEndDate + 'T23:59:59Z').toISOString());
        
        // Order by paid_at descending to get newest first
        url.searchParams.set('order', 'paid_at');
        url.searchParams.set('direction', 'desc');
        
        if (cursor) {
          url.searchParams.set('after', cursor);
        }

        console.log(`Fetching Whop payments page ${pageCount}, URL: ${url.toString()}`);
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${WHOP_API_KEY}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Whop API error:', errorText);
          throw new Error(`Whop API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        const payments = data.data || [];
        const pageInfo = data.page_info;
        
        console.log(`Page ${pageCount}: Found ${payments.length} payments, has_next_page: ${pageInfo?.has_next_page}`);
        
        allPayments = allPayments.concat(payments);

        // Check cursor-based pagination
        if (pageInfo?.has_next_page && pageInfo?.end_cursor) {
          cursor = pageInfo.end_cursor;
        } else {
          hasNextPage = false;
        }
        
        // Safety limit - but allow more pages
        if (pageCount >= 500) {
          console.log('Reached safety limit of 500 pages');
          break;
        }
      }

      console.log(`Total Whop payments found: ${allPayments.length}`);

      // Log first payment structure for debugging
      if (allPayments.length > 0) {
        console.log('Sample payment structure:', JSON.stringify(allPayments[0], null, 2));
      }

      let matched = 0;
      let created = 0;
      let skipped = 0;
      let noEvent = 0;
      let updated = 0;

      for (const payment of allPayments) {
        // Get email from user object
        const customerEmail = payment.user?.email?.toLowerCase()?.trim();

        if (!customerEmail) {
          console.log(`Skipping payment ${payment.id} - no email. User: ${JSON.stringify(payment.user)}`);
          skipped++;
          continue;
        }
        
        // Verify payment status is 'paid'
        if (payment.status !== 'paid') {
          console.log(`Skipping payment ${payment.id} - status is ${payment.status}, not paid`);
          skipped++;
          continue;
        }
        
        // Amount is in USD (the "total" or "usd_total" field)
        const paymentAmount = Number(payment.total || payment.usd_total || payment.subtotal || 0);
        
        // Use paid_at for payment date, not created_at (as per docs: created_at "does not necessarily reflect the time the Payment was successful")
        const rawDate = payment.paid_at || payment.created_at;
        let paymentDateObj: Date;
        if (typeof rawDate === 'number') {
          paymentDateObj = new Date(rawDate * 1000);
        } else if (typeof rawDate === 'string') {
          paymentDateObj = new Date(rawDate);
        } else {
          paymentDateObj = new Date();
        }

        console.log(`Processing payment ${payment.id} for ${customerEmail}, amount: $${paymentAmount}, status: ${payment.status}, paid_at: ${paymentDateObj.toISOString()}`);

        // Check if payment already exists by Whop payment ID
        const whopPaymentId = `whop_${payment.id}`;
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id, amount, whop_connection_id')
          .eq('notes', whopPaymentId)
          .maybeSingle();

        if (existingPayment) {
          // Update if amount changed OR whop_connection_id is missing
          const needsAmountUpdate = Number(existingPayment.amount) !== paymentAmount;
          const needsConnectionUpdate = !existingPayment.whop_connection_id && whopConnectionId;
          
          if (needsAmountUpdate || needsConnectionUpdate) {
            const updateData: Record<string, unknown> = {};
            if (needsAmountUpdate) updateData.amount = paymentAmount;
            if (needsConnectionUpdate) updateData.whop_connection_id = whopConnectionId;
            
            const { error: updateError } = await supabase
              .from('payments')
              .update(updateData)
              .eq('id', existingPayment.id);
            
            if (!updateError) {
              console.log(`Updated payment ${payment.id}: ${needsAmountUpdate ? 'amount ' : ''}${needsConnectionUpdate ? 'whop_connection_id' : ''}`);
              updated++;
            }
          } else {
            console.log(`Payment ${payment.id} already exists with correct data, skipping`);
            skipped++;
          }
          continue;
        }

        // Try to find matching lead by email for this org
        const { data: matchingLead } = await supabase
          .from('leads')
          .select('id, original_setter_name, current_setter_name, source_id')
          .eq('email', customerEmail)
          .eq('organization_id', organizationId)
          .maybeSingle();

        // Check events for attribution for this org
        const { data: matchingEvent } = await supabase
          .from('events')
          .select('id, closer_id, setter_id, source_id, traffic_type_id')
          .eq('lead_email', customerEmail)
          .eq('organization_id', organizationId)
          .order('scheduled_at', { ascending: false })
          .maybeSingle();

        // Build attribution
        const setterId = matchingEvent?.setter_id || null;
        const closerId = matchingEvent?.closer_id || null;
        const leadId = matchingLead?.id || null;
        const sourceId = matchingLead?.source_id || matchingEvent?.source_id || null;
        const trafficTypeId = matchingEvent?.traffic_type_id || null;

        console.log(`Attribution for ${customerEmail}: lead=${leadId}, setter=${setterId}, closer=${closerId}, source=${sourceId}`);

        // Get customer name from user object
        const customerName = payment.user?.name || payment.user?.username || customerEmail.split('@')[0];
        console.log(`Customer name for ${customerEmail}: ${customerName}`);

        // Determine payment type (could be enhanced with product/plan info)
        let paymentType: 'paid_in_full' | 'split_pay' | 'deposit' = 'paid_in_full';
        
        // Check for refunds
        const refundAmount = Number(payment.refunded_amount || 0);
        const refundedAt = payment.refunded_at ? new Date(payment.refunded_at).toISOString() : null;

        // Create payment record (net_revenue is a generated column, don't insert it)
        const { error: insertError } = await supabase
          .from('payments')
          .insert({
            event_id: matchingEvent?.id || null,
            lead_id: leadId,
            closer_id: closerId,
            setter_id: setterId,
            source_id: sourceId,
            traffic_type_id: trafficTypeId,
            customer_name: customerName,
            customer_email: customerEmail,
            amount: paymentAmount,
            payment_date: paymentDateObj.toISOString(),
            payment_type: paymentType,
            refund_amount: refundAmount,
            refunded_at: refundedAt,
            notes: whopPaymentId,
            whop_connection_id: whopConnectionId,
            organization_id: organizationId,
          });

        if (insertError) {
          console.error('Error inserting payment:', insertError);
          skipped++;
        } else {
          created++;
          if (matchingEvent) {
            matched++;
            console.log(`Created payment for ${customerEmail} with event attribution`);
          } else {
            noEvent++;
            console.log(`Created payment for ${customerEmail} (no event, attribution only)`);
          }
        }
      }

      // Now sync ALL refunds - fetch ALL refunded payments from Whop (no date filter)
      // because refunds can happen at any time after the original payment
      console.log('Now syncing refunds...');
      let refundCursor: string | null = null;
      let hasMoreRefunds = true;
      let refundPageCount = 0;
      let refundsUpdated = 0;

      while (hasMoreRefunds) {
        refundPageCount++;
        const url = new URL('https://api.whop.com/api/v1/payments');
        url.searchParams.set('company_id', companyId);
        url.searchParams.set('first', '100');
        
        // Filter to refunded substatuses only
        url.searchParams.append('substatuses[]', 'refunded');
        url.searchParams.append('substatuses[]', 'partially_refunded');
        url.searchParams.append('substatuses[]', 'auto_refunded');
        
        // NO date filter - we want ALL refunds ever made, then we'll update our records
        
        if (refundCursor) {
          url.searchParams.set('after', refundCursor);
        }

        console.log(`Fetching Whop refunds page ${refundPageCount}`);
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${WHOP_API_KEY}`,
          },
        });

        if (!response.ok) {
          console.error('Whop API error fetching refunds:', await response.text());
          break;
        }

        const data = await response.json();
        const refundedPayments = data.data || [];
        const pageInfo = data.page_info;
        
        console.log(`Refund page ${refundPageCount}: Found ${refundedPayments.length} refunded payments`);

        for (const payment of refundedPayments) {
          const whopPaymentId = `whop_${payment.id}`;
          // For full refunds, refunded_amount might be empty but status is 'refunded' - use total
          const refundAmount = Number(payment.refunded_amount || 0) || (payment.substatus === 'refunded' ? Number(payment.total || 0) : 0);
          const refundedAt = payment.refunded_at ? new Date(payment.refunded_at).toISOString() : new Date().toISOString();

          console.log(`Processing refund: ${payment.id}, substatus: ${payment.substatus}, refunded_amount: ${payment.refunded_amount}, total: ${payment.total}, calculated: $${refundAmount}`);

          // Find and update existing payment
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id, amount, refund_amount')
            .eq('notes', whopPaymentId)
            .maybeSingle();

          if (existingPayment) {
            // Only update if refund amount changed
            if (Number(existingPayment.refund_amount || 0) !== refundAmount) {
              const { error: updateError } = await supabase
                .from('payments')
                .update({ 
                  refund_amount: refundAmount,
                  refunded_at: refundedAt
                })
                .eq('id', existingPayment.id);

              if (!updateError) {
                refundsUpdated++;
                console.log(`Updated refund for payment ${payment.id}: $${refundAmount}`);
              } else {
                console.error(`Failed to update refund for ${payment.id}:`, updateError);
              }
            }
          } else {
            console.log(`No matching payment found for refund ${payment.id}`);
          }
        }

        if (pageInfo?.has_next_page && pageInfo?.end_cursor) {
          refundCursor = pageInfo.end_cursor;
        } else {
          hasMoreRefunds = false;
        }
        
        // Increase limit to ensure we get all refunds
        if (refundPageCount >= 200) break;
      }

      console.log(`Sync complete: total=${allPayments.length}, created=${created}, matched=${matched}, noEvent=${noEvent}, skipped=${skipped}, updated=${updated}, refundsUpdated=${refundsUpdated}`);

      return new Response(
        JSON.stringify({
          success: true,
          total: allPayments.length,
          matched,
          created,
          skipped,
          noEvent,
          updated,
          refundsUpdated,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "test" or "sync"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-whop:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
