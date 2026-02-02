import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, connectionId, startDate, endDate, organizationId } = await req.json();

    if (!connectionId) {
      return new Response(JSON.stringify({ error: 'Missing connectionId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the connection
    const { data: connection, error: connError } = await supabase
      .from('webhook_connections')
      .select('*')
      .eq('id', connectionId)
      .single();

    if (connError || !connection) {
      return new Response(JSON.stringify({ error: 'Connection not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!connection.api_key) {
      return new Response(JSON.stringify({ error: 'No API key configured for this connection' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = connection.api_key;

    // Test action - use v1 API to get company ID
    if (action === 'test') {
      console.log('Testing Whop connection:', connection.name);
      const testResponse = await fetch('https://api.whop.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!testResponse.ok) {
        const errorText = await testResponse.text();
        console.error('Whop API test failed:', errorText);
        throw new Error(`Whop API returned ${testResponse.status}: ${errorText}`);
      }

      const meData = await testResponse.json();
      console.log('Whop connection test successful:', meData);

      return new Response(JSON.stringify({ success: true, data: meData }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Sync action - use API v1 with company_id like the working sync-whop function
    if (action === 'sync') {
      if (!organizationId) {
        return new Response(JSON.stringify({ error: 'organizationId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
      console.log(`Syncing payments for connection: ${connection.name}, organization: ${organizationId}`);
      // Use the company ID from the webhook_secret field, or hardcode for known connections
      // The Nate & Pat connection uses biz_daS2nvgGWOgeLL
      let companyId = connection.webhook_secret;
      
      // Known company IDs for specific connections
      const knownCompanyIds: Record<string, string> = {
        'Whop (Nate & Pat)': 'biz_daS2nvgGWOgeLL',
      };
      
      if (!companyId && knownCompanyIds[connection.name]) {
        companyId = knownCompanyIds[connection.name];
        console.log(`Using known company ID for ${connection.name}: ${companyId}`);
      }
      
      if (!companyId) {
        throw new Error('Missing company ID. Please add your Whop company ID (biz_xxx) to the webhook_secret field of this connection.');
      }
      
      console.log(`Using company_id: ${companyId}`);
      
      let allPayments: any[] = [];
      let cursor: string | null = null;
      let hasNextPage = true;
      let pageCount = 0;

      // Use date filters - default to last 60 days if not provided
      // startDate and endDate may be ISO strings or date strings, so parse them safely
      let syncStartDateStr: string;
      let syncEndDateStr: string;
      
      if (startDate) {
        // If it's already an ISO string, parse it; otherwise treat as date string
        const parsedStart = new Date(startDate);
        if (isNaN(parsedStart.getTime())) {
          throw new Error('Invalid startDate format');
        }
        syncStartDateStr = parsedStart.toISOString();
      } else {
        syncStartDateStr = '2024-11-01T00:00:00Z';
      }
      
      if (endDate) {
        const parsedEnd = new Date(endDate);
        if (isNaN(parsedEnd.getTime())) {
          throw new Error('Invalid endDate format');
        }
        syncEndDateStr = parsedEnd.toISOString();
      } else {
        syncEndDateStr = new Date().toISOString();
      }
      
      console.log(`Syncing payments from ${syncStartDateStr} to ${syncEndDateStr}`);

      // Use API v1 with company_id (same as working sync-whop)
      while (hasNextPage) {
        pageCount++;
        const url = new URL('https://api.whop.com/api/v1/payments');
        url.searchParams.set('company_id', companyId);
        url.searchParams.set('first', '100');
        
        // Filter to paid status
        url.searchParams.append('statuses[]', 'paid');
        
        // Date filters
        url.searchParams.set('created_after', syncStartDateStr);
        url.searchParams.set('created_before', syncEndDateStr);
        
        // Order by paid_at descending
        url.searchParams.set('order', 'paid_at');
        url.searchParams.set('direction', 'desc');
        
        if (cursor) {
          url.searchParams.set('after', cursor);
        }

        console.log(`Fetching page ${pageCount}...`);
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Failed to fetch payments:', errorText);
          throw new Error(`Failed to fetch payments: ${response.status}`);
        }

        const data = await response.json();
        const payments = data.data || [];
        const pageInfo = data.page_info;
        
        console.log(`Page ${pageCount}: Found ${payments.length} payments`);
        
        allPayments = allPayments.concat(payments);

        // Check cursor-based pagination
        if (pageInfo?.has_next_page && pageInfo?.end_cursor) {
          cursor = pageInfo.end_cursor;
        } else {
          hasNextPage = false;
        }
        
        // Safety limit
        if (pageCount >= 500) {
          console.log('Reached safety limit of 500 pages');
          break;
        }
      }

      console.log(`Total payments to process: ${allPayments.length}`);

      // Log first payment structure for debugging
      if (allPayments.length > 0) {
        console.log('Sample payment structure:', JSON.stringify(allPayments[0], null, 2));
      }

      let created = 0;
      let matched = 0;
      let skipped = 0;
      let updated = 0;
      let noEvent = 0;

      for (const payment of allPayments) {
        // Get email from user object (same as working sync-whop)
        const customerEmail = payment.user?.email?.toLowerCase()?.trim();

        if (!customerEmail) {
          console.log(`Skipping payment ${payment.id} - no email. User: ${JSON.stringify(payment.user)}`);
          skipped++;
          continue;
        }

        // Verify payment status is 'paid'
        if (payment.status !== 'paid') {
          console.log(`Skipping payment ${payment.id} - status is ${payment.status}`);
          skipped++;
          continue;
        }

        // Amount is in USD (the "total" or "usd_total" field)
        const paymentAmount = Number(payment.total || payment.usd_total || payment.subtotal || 0);
        
        // Use paid_at for payment date
        const rawDate = payment.paid_at || payment.created_at;
        let paymentDateObj: Date;
        if (typeof rawDate === 'number') {
          paymentDateObj = new Date(rawDate * 1000);
        } else if (typeof rawDate === 'string') {
          paymentDateObj = new Date(rawDate);
        } else {
          paymentDateObj = new Date();
        }

        // Use connection-specific note pattern to avoid conflicts
        const notePattern = `whop_${connection.name}_${payment.id}`;
        
        // Check if payment already exists by note pattern
        const { data: existingByNote } = await supabase
          .from('payments')
          .select('id, amount, whop_connection_id')
          .ilike('notes', `%${notePattern}%`)
          .maybeSingle();

        if (existingByNote) {
          // Only update whop_connection_id if not set, and amount if different
          const updates: Record<string, any> = {};
          if (!existingByNote.whop_connection_id) {
            updates.whop_connection_id = connectionId;
          }
          if (Math.abs(Number(existingByNote.amount) - paymentAmount) > 0.01) {
            updates.amount = paymentAmount;
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from('payments').update(updates).eq('id', existingByNote.id);
            updated++;
          } else {
            matched++;
          }
          continue;
        }

        // Also check if payment exists by email and amount (for payments created before whop tracking)
        const { data: existingByEmailAmount } = await supabase
          .from('payments')
          .select('id, whop_connection_id, notes')
          .eq('customer_email', customerEmail)
          .gte('payment_date', new Date(paymentDateObj.getTime() - 86400000).toISOString())
          .lte('payment_date', new Date(paymentDateObj.getTime() + 86400000).toISOString())
          .maybeSingle();

        if (existingByEmailAmount) {
          // Payment exists - ONLY update whop_connection_id, don't touch other attribution
          const updates: Record<string, any> = {};
          if (!existingByEmailAmount.whop_connection_id) {
            updates.whop_connection_id = connectionId;
          }
          // Append note pattern for future matching
          if (existingByEmailAmount.notes && !existingByEmailAmount.notes.includes(notePattern)) {
            updates.notes = `${existingByEmailAmount.notes} | ${notePattern}`;
          } else if (!existingByEmailAmount.notes) {
            updates.notes = notePattern;
          }
          if (Object.keys(updates).length > 0) {
            await supabase.from('payments').update(updates).eq('id', existingByEmailAmount.id);
            updated++;
            console.log(`Updated existing payment for ${customerEmail} with whop_connection_id`);
          } else {
            matched++;
          }
          continue;
        }

        // Find attribution from leads for NEW payments only (for this org)
        const { data: lead } = await supabase
          .from('leads')
          .select('id, original_setter_name, source_id')
          .eq('email', customerEmail)
          .eq('organization_id', organizationId)
          .maybeSingle();

        // Look up setter_id
        let setterId = null;
        if (lead?.original_setter_name) {
          const { data: setter } = await supabase
            .from('setters')
            .select('id')
            .ilike('name', lead.original_setter_name)
            .maybeSingle();
          setterId = setter?.id;
        }

        // Find event for this customer (for this org)
        const { data: event } = await supabase
          .from('events')
          .select('id, closer_id, setter_id, source_id, traffic_type_id')
          .eq('lead_email', customerEmail)
          .eq('organization_id', organizationId)
          .order('scheduled_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get customer name
        const customerName = payment.user?.name || payment.user?.username || customerEmail.split('@')[0];

        // Check for refunds
        const refundAmount = Number(payment.refunded_amount || 0);
        const refundedAt = payment.refunded_at ? new Date(payment.refunded_at).toISOString() : null;

        const paymentRecord = {
          amount: paymentAmount,
          payment_date: paymentDateObj.toISOString(),
          customer_email: customerEmail,
          customer_name: customerName,
          notes: `${notePattern} - via ${connection.name}`,
          setter_id: event?.setter_id || setterId || null,
          closer_id: event?.closer_id || null,
          source_id: event?.source_id || lead?.source_id || null,
          traffic_type_id: event?.traffic_type_id || null,
          event_id: event?.id || null,
          lead_id: lead?.id || null,
          payment_type: 'paid_in_full' as const,
          refund_amount: refundAmount,
          refunded_at: refundedAt,
          whop_connection_id: connectionId,
          organization_id: organizationId,
        };

        const { error: insertError } = await supabase
          .from('payments')
          .insert(paymentRecord);

        if (insertError) {
          console.error('Error inserting payment:', insertError);
          skipped++;
        } else {
          created++;
          if (event) {
            console.log(`Created payment for ${customerEmail} with event attribution`);
          } else {
            noEvent++;
            console.log(`Created payment for ${customerEmail} (no event)`);
          }
        }
      }

      // Now sync refunds
      console.log('Syncing refunds...');
      let refundsUpdated = 0;
      let refundCursor: string | null = null;
      let hasMoreRefunds = true;
      let refundPageCount = 0;

      while (hasMoreRefunds) {
        refundPageCount++;
        const url = new URL('https://api.whop.com/api/v1/payments');
        url.searchParams.set('company_id', companyId);
        url.searchParams.set('first', '100');
        
        // Filter to refunded substatuses
        url.searchParams.append('substatuses[]', 'refunded');
        url.searchParams.append('substatuses[]', 'partially_refunded');
        url.searchParams.append('substatuses[]', 'auto_refunded');
        
        // Use the same date range to capture refunds from this period
        url.searchParams.set('created_after', syncStartDateStr);
        url.searchParams.set('created_before', syncEndDateStr);
        
        if (refundCursor) {
          url.searchParams.set('after', refundCursor);
        }

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) break;

        const data = await response.json();
        const refunds = data.data || [];
        const pageInfo = data.page_info;

        console.log(`Refund page ${refundPageCount}: Found ${refunds.length} refunded payments`);

        for (const refund of refunds) {
          const notePattern = `whop_${connection.name}_${refund.id}`;
          const refundAmount = Number(refund.refunded_amount || 0) || (refund.substatus === 'refunded' ? Number(refund.total || 0) : 0);

          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id, refund_amount')
            .ilike('notes', `%${notePattern}%`)
            .maybeSingle();

          if (existingPayment && Number(existingPayment.refund_amount || 0) !== refundAmount) {
            await supabase
              .from('payments')
              .update({
                refund_amount: refundAmount,
                refunded_at: new Date().toISOString()
              })
              .eq('id', existingPayment.id);
            refundsUpdated++;
          }
        }

        if (pageInfo?.has_next_page && pageInfo?.end_cursor) {
          refundCursor = pageInfo.end_cursor;
        } else {
          hasMoreRefunds = false;
        }
        
        if (refundPageCount >= 200) break;
      }

      // Update connection stats
      await supabase
        .from('webhook_connections')
        .update({ 
          last_webhook_at: new Date().toISOString(),
          webhook_count: connection.webhook_count + created
        })
        .eq('id', connectionId);

      return new Response(JSON.stringify({
        success: true,
        total: allPayments.length,
        created,
        matched,
        updated,
        skipped,
        noEvent,
        refundsUpdated,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
