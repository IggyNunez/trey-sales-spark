import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Convert a date string to EST start of day (midnight EST = 5am UTC)
function toESTStartOfDay(dateStr: string): string {
  // dateStr is in YYYY-MM-DD format
  // Midnight EST is 05:00 UTC (or 04:00 UTC during DST)
  // We'll use 05:00 UTC as a safe approximation (EST = UTC-5)
  return `${dateStr}T05:00:00Z`;
}

// Convert a date string to EST end of day (11:59:59 PM EST = 4:59:59 AM next day UTC)
function toESTEndOfDay(dateStr: string): string {
  // 11:59:59 PM EST = 04:59:59 AM next day UTC
  // To capture the full day, we go to 05:00 AM next day UTC
  const nextDay = new Date(dateStr);
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];
  return `${nextDayStr}T04:59:59Z`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { periodStart, periodEnd, name } = await req.json();

    if (!periodStart || !periodEnd) {
      return new Response(JSON.stringify({ error: 'Missing periodStart or periodEnd' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Convert date range to EST boundaries
    const estStart = toESTStartOfDay(periodStart);
    const estEnd = toESTEndOfDay(periodEnd);

    console.log(`Creating payout snapshot for ${periodStart} to ${periodEnd}`);
    console.log(`EST range: ${estStart} to ${estEnd}`);

    // Fetch all payments in the period (based on payment_date) using EST boundaries
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select(`
        id,
        amount,
        refund_amount,
        payment_date,
        refunded_at,
        customer_email,
        customer_name,
        setter_id,
        closer_id,
        source_id,
        traffic_type_id,
        whop_connection_id,
        notes
      `)
      .gte('payment_date', estStart)
      .lte('payment_date', estEnd);

    if (paymentsError) {
      throw new Error(`Failed to fetch payments: ${paymentsError.message}`);
    }

    // Fetch ALL refunds that occurred during the period (based on refunded_at) using EST boundaries
    const { data: refundsInPeriod, error: refundsError } = await supabase
      .from('payments')
      .select(`
        id,
        amount,
        refund_amount,
        payment_date,
        refunded_at,
        customer_email,
        customer_name,
        setter_id,
        closer_id,
        source_id,
        traffic_type_id,
        whop_connection_id,
        notes
      `)
      .gt('refund_amount', 0)
      .not('refunded_at', 'is', null)
      .gte('refunded_at', estStart)
      .lte('refunded_at', estEnd);

    if (refundsError) {
      throw new Error(`Failed to fetch refunds: ${refundsError.message}`);
    }

    console.log(`Found ${payments?.length || 0} payments in period (by payment_date)`);
    console.log(`Found ${refundsInPeriod?.length || 0} refunds in period (by refunded_at)`);

    // Fetch setters, closers, sources, traffic types, whop connections for name lookups
    const [settersRes, closersRes, sourcesRes, trafficTypesRes, whopRes] = await Promise.all([
      supabase.from('setters').select('id, name'),
      supabase.from('closers').select('id, name'),
      supabase.from('sources').select('id, name'),
      supabase.from('traffic_types').select('id, name'),
      supabase.from('webhook_connections').select('id, name'),
    ]);

    const setters = new Map((settersRes.data || []).map(s => [s.id, s.name]));
    const closers = new Map((closersRes.data || []).map(c => [c.id, c.name]));
    const sources = new Map((sourcesRes.data || []).map(s => [s.id, s.name]));
    const trafficTypes = new Map((trafficTypesRes.data || []).map(t => [t.id, t.name]));
    const whopConnections = new Map((whopRes.data || []).map(w => [w.id, w.name]));

    // Helper to get names
    const getNames = (payment: any) => ({
      setterName: payment.setter_id ? setters.get(payment.setter_id) || 'Unknown Setter' : 'Unattributed',
      closerName: payment.closer_id ? closers.get(payment.closer_id) || 'Unknown Closer' : 'Unattributed',
      sourceName: payment.source_id ? sources.get(payment.source_id) || 'Unknown Source' : 'Unattributed',
      trafficTypeName: payment.traffic_type_id ? trafficTypes.get(payment.traffic_type_id) || 'Unknown Traffic' : 'Unattributed',
      whopName: payment.whop_connection_id ? whopConnections.get(payment.whop_connection_id) || 'Unknown Whop' : 'Unattributed',
    });

    // Calculate totals - use refunds by refunded_at, not by payment_date
    let totalRevenue = 0;
    let totalRefunds = 0;

    const details: any[] = [];
    const setterStats = new Map<string, { id: string | null; name: string; revenue: number; refunds: number; count: number }>();
    const closerStats = new Map<string, { id: string | null; name: string; revenue: number; refunds: number; count: number }>();
    const sourceStats = new Map<string, { id: string | null; name: string; revenue: number; refunds: number; count: number }>();
    const trafficTypeStats = new Map<string, { id: string | null; name: string; revenue: number; refunds: number; count: number }>();
    const whopStats = new Map<string, { id: string | null; name: string; revenue: number; refunds: number; count: number }>();

    // Helper to update stats
    const updateStats = (payment: any, revenue: number, refundAmount: number, incrementCount: boolean) => {
      const { setterName, closerName, sourceName, trafficTypeName, whopName } = getNames(payment);

      const updateStat = (map: Map<string, any>, key: string, id: string | null, name: string) => {
        if (!map.has(key)) {
          map.set(key, { id, name, revenue: 0, refunds: 0, count: 0 });
        }
        const stat = map.get(key)!;
        stat.revenue += revenue;
        stat.refunds += refundAmount;
        if (incrementCount && revenue > 0) stat.count++;
      };

      updateStat(setterStats, payment.setter_id || 'unattributed', payment.setter_id, setterName);
      updateStat(closerStats, payment.closer_id || 'unattributed', payment.closer_id, closerName);
      updateStat(sourceStats, payment.source_id || 'unattributed', payment.source_id, sourceName);
      updateStat(trafficTypeStats, payment.traffic_type_id || 'unattributed', payment.traffic_type_id, trafficTypeName);
      updateStat(whopStats, payment.whop_connection_id || 'unattributed', payment.whop_connection_id, whopName);
    };

    // Process payments made during the period (revenue, no refunds here)
    for (const payment of payments || []) {
      const amount = Number(payment.amount) || 0;
      totalRevenue += amount;

      const { setterName, closerName, sourceName, trafficTypeName, whopName } = getNames(payment);

      // Build detail record - payments show as revenue, refund_amount = 0 here
      details.push({
        payment_id: payment.id,
        customer_email: payment.customer_email,
        customer_name: payment.customer_name,
        amount,
        refund_amount: 0, // Refunds tracked separately by refunded_at
        net_amount: amount,
        payment_date: payment.payment_date,
        setter_id: payment.setter_id,
        setter_name: setterName,
        closer_id: payment.closer_id,
        closer_name: closerName,
        source_id: payment.source_id,
        source_name: sourceName,
        traffic_type_id: payment.traffic_type_id,
        traffic_type_name: trafficTypeName,
        whop_connection_id: payment.whop_connection_id,
        whop_connection_name: whopName,
      });

      updateStats(payment, amount, 0, true);
    }

    // Process refunds that occurred during the period (by refunded_at)
    for (const refund of refundsInPeriod || []) {
      const refundAmount = Number(refund.refund_amount) || 0;
      totalRefunds += refundAmount;

      const { setterName, closerName, sourceName, trafficTypeName, whopName } = getNames(refund);

      // Build detail record for refund - shows as negative entry
      details.push({
        payment_id: refund.id,
        customer_email: refund.customer_email,
        customer_name: refund.customer_name,
        amount: 0, // This is a refund, not a payment
        refund_amount: refundAmount,
        net_amount: -refundAmount,
        payment_date: refund.refunded_at, // Use refunded_at as the date
        setter_id: refund.setter_id,
        setter_name: setterName,
        closer_id: refund.closer_id,
        closer_name: closerName,
        source_id: refund.source_id,
        source_name: sourceName,
        traffic_type_id: refund.traffic_type_id,
        traffic_type_name: trafficTypeName,
        whop_connection_id: refund.whop_connection_id,
        whop_connection_name: whopName,
      });

      // Update stats with refund only (no revenue, no count increment)
      updateStats(refund, 0, refundAmount, false);
    }

    // Generate snapshot name if not provided
    const startDate = new Date(periodStart);
    const snapshotName = name || `${startDate.toLocaleString('default', { month: 'long' })} ${startDate.getFullYear()} Payout`;

    // Create the snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from('payout_snapshots')
      .insert({
        name: snapshotName,
        period_start: periodStart,
        period_end: periodEnd,
        status: 'draft',
        total_revenue: totalRevenue,
        total_refunds: totalRefunds,
        net_revenue: totalRevenue - totalRefunds,
      })
      .select()
      .single();

    if (snapshotError) {
      throw new Error(`Failed to create snapshot: ${snapshotError.message}`);
    }

    console.log(`Created snapshot: ${snapshot.id}`);

    // Insert details
    if (details.length > 0) {
      const detailsWithSnapshot = details.map(d => ({ ...d, snapshot_id: snapshot.id }));
      const { error: detailsError } = await supabase
        .from('payout_snapshot_details')
        .insert(detailsWithSnapshot);

      if (detailsError) {
        console.error('Error inserting details:', detailsError);
      }
    }

    // Insert summaries
    const summaries: any[] = [];

    for (const [, stat] of setterStats) {
      summaries.push({
        snapshot_id: snapshot.id,
        summary_type: 'setter',
        entity_id: stat.id,
        entity_name: stat.name,
        total_revenue: stat.revenue,
        total_refunds: stat.refunds,
        net_revenue: stat.revenue - stat.refunds,
        payment_count: stat.count,
      });
    }

    for (const [, stat] of closerStats) {
      summaries.push({
        snapshot_id: snapshot.id,
        summary_type: 'closer',
        entity_id: stat.id,
        entity_name: stat.name,
        total_revenue: stat.revenue,
        total_refunds: stat.refunds,
        net_revenue: stat.revenue - stat.refunds,
        payment_count: stat.count,
      });
    }

    for (const [, stat] of sourceStats) {
      summaries.push({
        snapshot_id: snapshot.id,
        summary_type: 'source',
        entity_id: stat.id,
        entity_name: stat.name,
        total_revenue: stat.revenue,
        total_refunds: stat.refunds,
        net_revenue: stat.revenue - stat.refunds,
        payment_count: stat.count,
      });
    }

    for (const [, stat] of trafficTypeStats) {
      summaries.push({
        snapshot_id: snapshot.id,
        summary_type: 'traffic_type',
        entity_id: stat.id,
        entity_name: stat.name,
        total_revenue: stat.revenue,
        total_refunds: stat.refunds,
        net_revenue: stat.revenue - stat.refunds,
        payment_count: stat.count,
      });
    }

    for (const [, stat] of whopStats) {
      summaries.push({
        snapshot_id: snapshot.id,
        summary_type: 'whop_connection',
        entity_id: stat.id,
        entity_name: stat.name,
        total_revenue: stat.revenue,
        total_refunds: stat.refunds,
        net_revenue: stat.revenue - stat.refunds,
        payment_count: stat.count,
      });
    }

    if (summaries.length > 0) {
      const { error: summariesError } = await supabase
        .from('payout_snapshot_summaries')
        .insert(summaries);

      if (summariesError) {
        console.error('Error inserting summaries:', summariesError);
      }
    }

    console.log(`Snapshot complete: ${details.length} details, ${summaries.length} summaries`);
    console.log(`Revenue: ${totalRevenue}, Refunds: ${totalRefunds}, Net: ${totalRevenue - totalRefunds}`);

    return new Response(JSON.stringify({
      success: true,
      snapshot,
      paymentCount: payments?.length || 0,
      refundCount: refundsInPeriod?.length || 0,
      totalRevenue,
      totalRefunds,
      netRevenue: totalRevenue - totalRefunds,
    }), {
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
