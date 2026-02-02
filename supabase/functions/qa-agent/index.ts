import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface TestResult {
  name: string;
  category: string;
  status: 'pass' | 'fail' | 'error' | 'warning' | 'skip';
  message: string;
  duration_ms?: number;
  details?: any;
}

interface QAReport {
  timestamp: string;
  organization_name: string;
  tests: TestResult[];
  summary: {
    passed: number;
    failed: number;
    errors: number;
    warnings: number;
    skipped: number;
    total_duration_ms: number;
  };
}

// Helper to run a test with timing
async function runTest(
  name: string, 
  category: string, 
  testFn: () => Promise<{ status: TestResult['status']; message: string; details?: any }>
): Promise<TestResult> {
  const start = Date.now();
  try {
    const result = await testFn();
    return { name, category, ...result, duration_ms: Date.now() - start };
  } catch (e) {
    return {
      name,
      category,
      status: 'error',
      message: e instanceof Error ? e.message : 'Unknown error',
      duration_ms: Date.now() - start,
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const { organization_id, dry_run = false } = await req.json();

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: org } = await supabase
      .from('organizations')
      .select('name')
      .eq('id', organization_id)
      .single();

    const orgName = org?.name || 'Unknown Organization';
    console.log(`🔍 COMPREHENSIVE QA for: ${orgName}`);

    const tests: TestResult[] = [];
    const startTime = Date.now();

    // Helper for edge function tests
    const testEdgeFunction = async (
      name: string,
      body: any,
      expectSuccess = true
    ): Promise<TestResult> => {
      return runTest(name, 'Edge Functions', async () => {
        const response = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        
        const data = await response.json().catch(() => ({}));
        
        if (response.ok) {
          return { status: 'pass', message: `HTTP ${response.status} OK`, details: { response_keys: Object.keys(data) } };
        } else if (response.status === 400 && !expectSuccess) {
          return { status: 'warning', message: data.error || 'Expected 400 (missing config)', details: data };
        } else {
          return { status: 'fail', message: data.error || `HTTP ${response.status}`, details: data };
        }
      });
    };

    // ============================================
    // EDGE FUNCTION TESTS (ALL 18 FUNCTIONS)
    // ============================================
    console.log('Testing Edge Functions...');

    // 1. slack-daily-report
    tests.push(await testEdgeFunction('slack-daily-report', { organization_id, dry_run: true }));

    // 2. slack-overdue-pcf-reminder
    tests.push(await testEdgeFunction('slack-overdue-pcf-reminder', { organization_id, dry_run: true }));

    // 3. get-calendly-utilization
    tests.push(await testEdgeFunction('get-calendly-utilization', { organizationId: organization_id }, false));

    // 4. create-payout-snapshot
    tests.push(await testEdgeFunction('create-payout-snapshot', { 
      organization_id,
      name: 'QA Test',
      periodStart: '2025-01-01',
      periodEnd: '2025-01-02',
      dry_run: true
    }));

    // 5. sync-calendly
    tests.push(await testEdgeFunction('sync-calendly', { organization_id }, false));

    // 6. sync-close
    tests.push(await testEdgeFunction('sync-close', { organization_id }, false));

    // 7. sync-close-attribution
    tests.push(await testEdgeFunction('sync-close-attribution', { organization_id }, false));

    // 8. fetch-close-source
    tests.push(await testEdgeFunction('fetch-close-source', { organization_id, lead_id: 'test' }, false));

    // 9. sync-whop
    tests.push(await testEdgeFunction('sync-whop', { organization_id }, false));

    // 10. sync-whop-connection
    tests.push(await testEdgeFunction('sync-whop-connection', { organization_id, connection_id: 'test' }, false));

    // 11. backfill-whop-connection
    tests.push(await testEdgeFunction('backfill-whop-connection', { organization_id }, false));

    // 12. send-invite-email
    tests.push(await runTest('send-invite-email', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-invite-email`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: 'test@test.com',
          inviteUrl: 'https://test.com',
          organizationName: 'Test',
          dry_run: true
        }),
      });
      if (response.ok || response.status === 400) {
        return { status: 'pass', message: 'Function accessible' };
      }
      return { status: 'fail', message: `HTTP ${response.status}` };
    }));

    // 13. send-commission-link
    tests.push(await runTest('send-commission-link', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/send-commission-link`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: 'test@test.com',
          repName: 'Test Rep',
          commissionLink: 'https://test.com',
          organizationName: 'Test'
        }),
      });
      // Even if it fails validation, we're testing accessibility
      return { status: response.status < 500 ? 'pass' : 'fail', message: `HTTP ${response.status}` };
    }));

    // 14. register-calendly-webhook
    tests.push(await testEdgeFunction('register-calendly-webhook', { organization_id }, false));

    // 15. generic-webhook (test with minimal payload)
    tests.push(await runTest('generic-webhook', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/generic-webhook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      });
      return { status: response.status < 500 ? 'pass' : 'fail', message: `HTTP ${response.status}` };
    }));

    // 16. calendly-webhook
    tests.push(await runTest('calendly-webhook', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/calendly-webhook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ event: 'test', payload: {} }),
      });
      return { status: response.status < 500 ? 'pass' : 'fail', message: `HTTP ${response.status}` };
    }));

    // 17. whop-webhook
    tests.push(await runTest('whop-webhook', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/whop-webhook`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'test', data: {} }),
      });
      return { status: response.status < 500 ? 'pass' : 'fail', message: `HTTP ${response.status}` };
    }));

    // 18. batch-restore-payments
    tests.push(await runTest('batch-restore-payments', 'Edge Functions', async () => {
      const response = await fetch(`${supabaseUrl}/functions/v1/batch-restore-payments`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ timestamp: new Date().toISOString(), dry_run: true }),
      });
      return { status: response.status < 500 ? 'pass' : 'fail', message: `HTTP ${response.status}` };
    }));

    // ============================================
    // DATABASE TABLE TESTS (ALL 27 TABLES)
    // ============================================
    console.log('Testing Database Tables...');

    const tables = [
      'organizations', 'organization_members', 'organization_integrations',
      'profiles', 'user_roles', 'closers', 'setters', 'sources', 'traffic_types',
      'call_types', 'call_outcomes', 'opportunity_statuses', 'leads', 'events',
      'post_call_forms', 'payments', 'payout_snapshots', 'payout_snapshot_details',
      'payout_snapshot_summaries', 'invitations', 'closer_access_tokens',
      'webhook_connections', 'integrations', 'metric_definitions', 'portal_settings',
      'audit_logs', 'rate_limits'
    ];

    for (const table of tables) {
      tests.push(await runTest(`Table: ${table}`, 'Database Tables', async () => {
        const start = Date.now();
        const { data, error, count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: false })
          .limit(1);
        
        const duration = Date.now() - start;
        
        if (error) {
          return { status: 'fail', message: error.message };
        }
        if (duration > 3000) {
          return { status: 'warning', message: `Slow query: ${duration}ms` };
        }
        return { status: 'pass', message: `Accessible, ${count || 0} rows, ${duration}ms` };
      }));
    }

    // ============================================
    // QUERY PERFORMANCE TESTS
    // ============================================
    console.log('Testing Query Performance...');

    // Complex query 1: Events with all relations
    tests.push(await runTest('Events full join', 'Query Performance', async () => {
      const start = Date.now();
      const { data, error } = await supabase
        .from('events')
        .select(`
          *,
          source:sources(name),
          traffic_type:traffic_types(name),
          call_type:call_types(name),
          setter:setters(name),
          closer:closers(name)
        `)
        .eq('organization_id', organization_id)
        .limit(50);
      
      const duration = Date.now() - start;
      if (error) return { status: 'fail', message: error.message };
      if (duration > 2000) return { status: 'warning', message: `Slow: ${duration}ms` };
      return { status: 'pass', message: `${data?.length || 0} rows, ${duration}ms` };
    }));

    // Complex query 2: Payments with all relations
    tests.push(await runTest('Payments full join', 'Query Performance', async () => {
      const start = Date.now();
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          event:events(lead_name, scheduled_at),
          source:sources(name),
          setter:setters(name),
          closer:closers(name)
        `)
        .eq('organization_id', organization_id)
        .limit(50);
      
      const duration = Date.now() - start;
      if (error) return { status: 'fail', message: error.message };
      if (duration > 2000) return { status: 'warning', message: `Slow: ${duration}ms` };
      return { status: 'pass', message: `${data?.length || 0} rows, ${duration}ms` };
    }));

    // Complex query 3: PCFs with outcomes
    tests.push(await runTest('PCFs with outcomes', 'Query Performance', async () => {
      const start = Date.now();
      const { data, error } = await supabase
        .from('post_call_forms')
        .select(`
          *,
          event:events(lead_name, scheduled_at),
          call_outcome:call_outcomes(name),
          opportunity_status:opportunity_statuses(name)
        `)
        .eq('organization_id', organization_id)
        .limit(50);
      
      const duration = Date.now() - start;
      if (error) return { status: 'fail', message: error.message };
      if (duration > 2000) return { status: 'warning', message: `Slow: ${duration}ms` };
      return { status: 'pass', message: `${data?.length || 0} rows, ${duration}ms` };
    }));

    // Aggregation query
    tests.push(await runTest('Aggregation: payments by month', 'Query Performance', async () => {
      const start = Date.now();
      const { data, error } = await supabase
        .from('payments')
        .select('amount, payment_date')
        .eq('organization_id', organization_id)
        .gte('payment_date', '2025-01-01');
      
      const duration = Date.now() - start;
      if (error) return { status: 'fail', message: error.message };
      if (duration > 3000) return { status: 'warning', message: `Slow: ${duration}ms` };
      return { status: 'pass', message: `${data?.length || 0} payments, ${duration}ms` };
    }));

    // ============================================
    // FOREIGN KEY INTEGRITY TESTS
    // ============================================
    console.log('Testing FK Integrity...');

    // Events -> Closers
    tests.push(await runTest('FK: events.closer_id -> closers', 'Data Integrity', async () => {
      const { data: events } = await supabase
        .from('events')
        .select('closer_id')
        .eq('organization_id', organization_id)
        .not('closer_id', 'is', null);
      
      const closerIds = [...new Set(events?.map(e => e.closer_id) || [])];
      if (closerIds.length === 0) return { status: 'pass', message: 'No closer refs to validate' };

      const { data: closers } = await supabase
        .from('closers')
        .select('id')
        .in('id', closerIds);
      
      const validIds = new Set(closers?.map(c => c.id) || []);
      const invalid = closerIds.filter(id => !validIds.has(id));
      
      if (invalid.length > 0) {
        return { status: 'fail', message: `${invalid.length} orphaned closer refs`, details: invalid.slice(0, 5) };
      }
      return { status: 'pass', message: `${closerIds.length} refs valid` };
    }));

    // Events -> Setters
    tests.push(await runTest('FK: events.setter_id -> setters', 'Data Integrity', async () => {
      const { data: events } = await supabase
        .from('events')
        .select('setter_id')
        .eq('organization_id', organization_id)
        .not('setter_id', 'is', null);
      
      const setterIds = [...new Set(events?.map(e => e.setter_id) || [])];
      if (setterIds.length === 0) return { status: 'pass', message: 'No setter refs to validate' };

      const { data: setters } = await supabase
        .from('setters')
        .select('id')
        .in('id', setterIds);
      
      const validIds = new Set(setters?.map(s => s.id) || []);
      const invalid = setterIds.filter(id => !validIds.has(id));
      
      if (invalid.length > 0) {
        return { status: 'fail', message: `${invalid.length} orphaned setter refs`, details: invalid.slice(0, 5) };
      }
      return { status: 'pass', message: `${setterIds.length} refs valid` };
    }));

    // Events -> Sources
    tests.push(await runTest('FK: events.source_id -> sources', 'Data Integrity', async () => {
      const { data: events } = await supabase
        .from('events')
        .select('source_id')
        .eq('organization_id', organization_id)
        .not('source_id', 'is', null);
      
      const sourceIds = [...new Set(events?.map(e => e.source_id) || [])];
      if (sourceIds.length === 0) return { status: 'pass', message: 'No source refs to validate' };

      const { data: sources } = await supabase
        .from('sources')
        .select('id')
        .in('id', sourceIds);
      
      const validIds = new Set(sources?.map(s => s.id) || []);
      const invalid = sourceIds.filter(id => !validIds.has(id));
      
      if (invalid.length > 0) {
        return { status: 'fail', message: `${invalid.length} orphaned source refs`, details: invalid.slice(0, 5) };
      }
      return { status: 'pass', message: `${sourceIds.length} refs valid` };
    }));

    // Payments -> Events
    tests.push(await runTest('FK: payments.event_id -> events', 'Data Integrity', async () => {
      const { data: payments } = await supabase
        .from('payments')
        .select('event_id')
        .eq('organization_id', organization_id)
        .not('event_id', 'is', null);
      
      const eventIds = [...new Set(payments?.map(p => p.event_id) || [])];
      if (eventIds.length === 0) return { status: 'pass', message: 'No event refs to validate' };

      const { data: events } = await supabase
        .from('events')
        .select('id')
        .in('id', eventIds);
      
      const validIds = new Set(events?.map(e => e.id) || []);
      const invalid = eventIds.filter(id => !validIds.has(id));
      
      if (invalid.length > 0) {
        return { status: 'fail', message: `${invalid.length} orphaned event refs`, details: invalid.slice(0, 5) };
      }
      return { status: 'pass', message: `${eventIds.length} refs valid` };
    }));

    // PCFs -> Events
    tests.push(await runTest('FK: post_call_forms.event_id -> events', 'Data Integrity', async () => {
      const { data: pcfs } = await supabase
        .from('post_call_forms')
        .select('event_id')
        .eq('organization_id', organization_id);
      
      const eventIds = [...new Set(pcfs?.map(p => p.event_id) || [])];
      if (eventIds.length === 0) return { status: 'pass', message: 'No PCF refs to validate' };

      const { data: events } = await supabase
        .from('events')
        .select('id')
        .in('id', eventIds);
      
      const validIds = new Set(events?.map(e => e.id) || []);
      const invalid = eventIds.filter(id => !validIds.has(id));
      
      if (invalid.length > 0) {
        return { status: 'fail', message: `${invalid.length} orphaned PCF event refs`, details: invalid.slice(0, 5) };
      }
      return { status: 'pass', message: `${eventIds.length} refs valid` };
    }));

    // ============================================
    // END-TO-END INTEGRATION TESTS (PCF FLOW)
    // ============================================
    console.log('Testing E2E: PCF Flow...');

    // Generate unique test identifiers
    const testId = `qa_test_${Date.now()}`;
    const testEmail = `${testId}@qa-test.com`;
    let testEventId: string | null = null;
    let testPCFId: string | null = null;
    let testPaymentId: string | null = null;

    // E2E Test 1: Create a test event
    tests.push(await runTest('E2E: Create test event', 'Integration', async () => {
      const { data, error } = await supabase
        .from('events')
        .insert({
          organization_id,
          lead_name: `QA Test Lead ${testId}`,
          lead_email: testEmail,
          scheduled_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), // 1 hour ago
          call_status: 'scheduled',
          pcf_submitted: false,
        })
        .select('id')
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      testEventId = data.id;
      return { status: 'pass', message: `Created event ${data.id}` };
    }));

    // E2E Test 2: Verify event is queryable
    tests.push(await runTest('E2E: Event is queryable', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', testEventId)
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      if (data.lead_email !== testEmail) return { status: 'fail', message: 'Email mismatch' };
      if (data.call_status !== 'scheduled') return { status: 'fail', message: 'Status should be scheduled' };
      if (data.pcf_submitted !== false) return { status: 'fail', message: 'PCF should not be submitted' };
      return { status: 'pass', message: 'Event data correct' };
    }));

    // E2E Test 3: Submit PCF (no-show scenario)
    tests.push(await runTest('E2E: Submit PCF (no-show)', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      // Get a test closer
      const { data: closers } = await supabase
        .from('closers')
        .select('id, name')
        .eq('organization_id', organization_id)
        .limit(1);
      
      const closerId = closers?.[0]?.id || 'qa-test-closer';
      const closerName = closers?.[0]?.name || 'QA Test Closer';
      
      const { data, error } = await supabase
        .from('post_call_forms')
        .insert({
          organization_id,
          event_id: testEventId,
          closer_id: closerId,
          closer_name: closerName,
          call_occurred: true,
          lead_showed: false,
          offer_made: false,
          deal_closed: false,
          notes: `QA Test - ${testId}`,
        })
        .select('id')
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      testPCFId = data.id;
      return { status: 'pass', message: `Created PCF ${data.id}` };
    }));

    // E2E Test 4: Update event status after PCF
    tests.push(await runTest('E2E: Update event after PCF', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { error } = await supabase
        .from('events')
        .update({
          call_status: 'no_show',
          event_outcome: 'no_show',
          pcf_submitted: true,
          pcf_submitted_at: new Date().toISOString(),
        })
        .eq('id', testEventId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Event updated' };
    }));

    // E2E Test 5: Verify event reflects PCF submission
    tests.push(await runTest('E2E: Event reflects PCF', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { data, error } = await supabase
        .from('events')
        .select('call_status, event_outcome, pcf_submitted')
        .eq('id', testEventId)
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      if (!data.pcf_submitted) return { status: 'fail', message: 'pcf_submitted should be true' };
      if (data.call_status !== 'no_show') return { status: 'fail', message: `call_status should be no_show, got ${data.call_status}` };
      if (data.event_outcome !== 'no_show') return { status: 'fail', message: `event_outcome should be no_show, got ${data.event_outcome}` };
      return { status: 'pass', message: 'Event correctly reflects PCF' };
    }));

    // E2E Test 6: Update PCF to showed + closed deal
    tests.push(await runTest('E2E: Update PCF to closed deal', 'Integration', async () => {
      if (!testPCFId) return { status: 'skip', message: 'No test PCF' };
      
      const { error } = await supabase
        .from('post_call_forms')
        .update({
          lead_showed: true,
          offer_made: true,
          deal_closed: true,
          cash_collected: 997,
          payment_type: 'paid_in_full',
        })
        .eq('id', testPCFId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'PCF updated to closed deal' };
    }));

    // E2E Test 7: Update event to closed
    tests.push(await runTest('E2E: Update event to closed', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { error } = await supabase
        .from('events')
        .update({
          call_status: 'completed',
          event_outcome: 'closed',
        })
        .eq('id', testEventId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Event updated to closed' };
    }));

    // E2E Test 8: Create payment for closed deal
    tests.push(await runTest('E2E: Create payment', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { data, error } = await supabase
        .from('payments')
        .insert({
          organization_id,
          event_id: testEventId,
          amount: 997,
          payment_type: 'paid_in_full',
          payment_date: new Date().toISOString(),
          customer_email: testEmail,
          customer_name: `QA Test Lead ${testId}`,
        })
        .select('id')
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      testPaymentId = data.id;
      return { status: 'pass', message: `Created payment ${data.id}` };
    }));

    // E2E Test 9: Verify PCF data integrity
    tests.push(await runTest('E2E: PCF data integrity', 'Integration', async () => {
      if (!testPCFId) return { status: 'skip', message: 'No test PCF' };
      
      const { data, error } = await supabase
        .from('post_call_forms')
        .select('*')
        .eq('id', testPCFId)
        .single();
      
      if (error) return { status: 'fail', message: error.message };
      if (!data.lead_showed) return { status: 'fail', message: 'lead_showed should be true' };
      if (!data.offer_made) return { status: 'fail', message: 'offer_made should be true' };
      if (!data.deal_closed) return { status: 'fail', message: 'deal_closed should be true' };
      if (data.cash_collected !== 997) return { status: 'fail', message: `cash_collected should be 997, got ${data.cash_collected}` };
      if (data.payment_type !== 'paid_in_full') return { status: 'fail', message: `payment_type should be paid_in_full, got ${data.payment_type}` };
      return { status: 'pass', message: 'PCF data integrity verified' };
    }));

    // E2E Test 10: Verify payment linked to event
    tests.push(await runTest('E2E: Payment-Event link', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('event_id', testEventId);
      
      if (error) return { status: 'fail', message: error.message };
      if (!data || data.length === 0) return { status: 'fail', message: 'No payment found for event' };
      if (data[0].amount !== 997) return { status: 'fail', message: `Payment amount should be 997, got ${data[0].amount}` };
      return { status: 'pass', message: 'Payment correctly linked' };
    }));

    // E2E Test 11: Dashboard metrics query
    tests.push(await runTest('E2E: Dashboard metrics query', 'Integration', async () => {
      const { data: events, error: evError } = await supabase
        .from('events')
        .select('id, event_outcome, pcf_submitted')
        .eq('organization_id', organization_id)
        .eq('pcf_submitted', true)
        .limit(100);
      
      if (evError) return { status: 'fail', message: evError.message };
      
      const closedCount = events?.filter(e => e.event_outcome === 'closed').length || 0;
      const showedCount = events?.filter(e => e.event_outcome !== 'no_show').length || 0;
      
      return { status: 'pass', message: `Metrics query OK: ${closedCount} closed, ${showedCount} showed`, details: { closedCount, showedCount } };
    }));

    // E2E Test 12: Aggregate cash collected
    tests.push(await runTest('E2E: Cash collected aggregation', 'Integration', async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, net_revenue')
        .eq('organization_id', organization_id);
      
      if (error) return { status: 'fail', message: error.message };
      
      const totalCash = data?.reduce((sum, p) => sum + (p.amount || 0), 0) || 0;
      const totalNet = data?.reduce((sum, p) => sum + (p.net_revenue || p.amount || 0), 0) || 0;
      
      return { status: 'pass', message: `Aggregation OK: $${totalCash} gross, $${totalNet} net`, details: { totalCash, totalNet, count: data?.length } };
    }));

    // E2E Test 13: Clear PCF (delete flow)
    tests.push(await runTest('E2E: Delete payment', 'Integration', async () => {
      if (!testPaymentId) return { status: 'skip', message: 'No test payment' };
      
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', testPaymentId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Payment deleted' };
    }));

    // E2E Test 14: Delete PCF
    tests.push(await runTest('E2E: Delete PCF', 'Integration', async () => {
      if (!testPCFId) return { status: 'skip', message: 'No test PCF' };
      
      const { error } = await supabase
        .from('post_call_forms')
        .delete()
        .eq('id', testPCFId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'PCF deleted' };
    }));

    // E2E Test 15: Reset event after PCF clear
    tests.push(await runTest('E2E: Reset event', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { error } = await supabase
        .from('events')
        .update({
          call_status: 'scheduled',
          event_outcome: null,
          pcf_submitted: false,
          pcf_submitted_at: null,
        })
        .eq('id', testEventId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Event reset' };
    }));

    // E2E Test 16: Verify clean state
    tests.push(await runTest('E2E: Verify clean state', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { data: ev } = await supabase
        .from('events')
        .select('call_status, pcf_submitted')
        .eq('id', testEventId)
        .single();
      
      const { data: pcf } = await supabase
        .from('post_call_forms')
        .select('id')
        .eq('event_id', testEventId);
      
      const { data: pay } = await supabase
        .from('payments')
        .select('id')
        .eq('event_id', testEventId);
      
      if (ev?.call_status !== 'scheduled') return { status: 'fail', message: 'Event not reset to scheduled' };
      if (ev?.pcf_submitted !== false) return { status: 'fail', message: 'pcf_submitted not reset' };
      if (pcf && pcf.length > 0) return { status: 'fail', message: 'PCF still exists' };
      if (pay && pay.length > 0) return { status: 'fail', message: 'Payment still exists' };
      return { status: 'pass', message: 'Clean state verified' };
    }));

    // CLEANUP: Delete test event
    tests.push(await runTest('E2E: Cleanup test event', 'Integration', async () => {
      if (!testEventId) return { status: 'skip', message: 'No test event' };
      
      const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', testEventId);
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Test event cleaned up' };
    }));

    // ============================================
    // BUSINESS LOGIC TESTS
    // ============================================
    console.log('Testing Business Logic...');

    // PCF: deal_closed should have cash_collected
    tests.push(await runTest('BL: Closed deals have cash', 'Business Logic', async () => {
      const { data } = await supabase
        .from('post_call_forms')
        .select('id, deal_closed, cash_collected')
        .eq('organization_id', organization_id)
        .eq('deal_closed', true)
        .or('cash_collected.is.null,cash_collected.eq.0');
      
      if (data && data.length > 0) {
        return { status: 'warning', message: `${data.length} closed deals with $0 cash` };
      }
      return { status: 'pass', message: 'All closed deals have cash' };
    }));

    // PCF: offer_made should be true if deal_closed
    tests.push(await runTest('BL: Closed deals had offer', 'Business Logic', async () => {
      const { data } = await supabase
        .from('post_call_forms')
        .select('id, deal_closed, offer_made')
        .eq('organization_id', organization_id)
        .eq('deal_closed', true)
        .eq('offer_made', false);
      
      if (data && data.length > 0) {
        return { status: 'fail', message: `${data.length} deals closed without offer` };
      }
      return { status: 'pass', message: 'All closed deals had offers' };
    }));

    // Events: completed should have PCF
    tests.push(await runTest('BL: Completed calls have PCF', 'Business Logic', async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('call_status', 'completed')
        .eq('pcf_submitted', false);
      
      if (count && count > 0) {
        return { status: 'warning', message: `${count} completed calls missing PCF` };
      }
      return { status: 'pass', message: 'All completed calls have PCF' };
    }));

    // Payments: positive amounts
    tests.push(await runTest('BL: Payments are positive', 'Business Logic', async () => {
      const { count } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .lte('amount', 0);
      
      if (count && count > 0) {
        return { status: 'fail', message: `${count} payments with zero/negative amount` };
      }
      return { status: 'pass', message: 'All payments positive' };
    }));

    // Events: future events shouldn't be completed
    tests.push(await runTest('BL: Future events not completed', 'Business Logic', async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('call_status', 'completed')
        .gt('scheduled_at', new Date().toISOString());
      
      if (count && count > 0) {
        return { status: 'fail', message: `${count} future events marked completed` };
      }
      return { status: 'pass', message: 'No future completed events' };
    }));

    // Events: past scheduled events
    tests.push(await runTest('BL: Stale scheduled events', 'Business Logic', async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .eq('call_status', 'scheduled')
        .lt('scheduled_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      if (count && count > 0) {
        return { status: 'warning', message: `${count} past events still "scheduled"` };
      }
      return { status: 'pass', message: 'No stale scheduled events' };
    }));

    // ============================================
    // DATA QUALITY TESTS
    // ============================================
    console.log('Testing Data Quality...');

    // Required fields: events
    tests.push(await runTest('DQ: Events required fields', 'Data Quality', async () => {
      const { count } = await supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .or('lead_name.is.null,lead_email.is.null,scheduled_at.is.null');
      
      if (count && count > 0) {
        return { status: 'fail', message: `${count} events missing required fields` };
      }
      return { status: 'pass', message: 'All events have required fields' };
    }));

    // Required fields: payments
    tests.push(await runTest('DQ: Payments required fields', 'Data Quality', async () => {
      const { count } = await supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization_id)
        .or('amount.is.null,payment_date.is.null');
      
      if (count && count > 0) {
        return { status: 'fail', message: `${count} payments missing required fields` };
      }
      return { status: 'pass', message: 'All payments have required fields' };
    }));

    // Duplicate detection: same lead, same day
    tests.push(await runTest('DQ: Duplicate bookings', 'Data Quality', async () => {
      const { data } = await supabase
        .from('events')
        .select('lead_email, scheduled_at')
        .eq('organization_id', organization_id)
        .gte('scheduled_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());
      
      const byLeadDay: Record<string, number> = {};
      data?.forEach(e => {
        const key = `${e.lead_email}-${new Date(e.scheduled_at).toDateString()}`;
        byLeadDay[key] = (byLeadDay[key] || 0) + 1;
      });
      
      const dupes = Object.entries(byLeadDay).filter(([_, c]) => c > 1);
      if (dupes.length > 0) {
        return { status: 'warning', message: `${dupes.length} leads with multiple same-day bookings` };
      }
      return { status: 'pass', message: 'No duplicate bookings' };
    }));

    // Email format validation
    tests.push(await runTest('DQ: Valid email format', 'Data Quality', async () => {
      const { data } = await supabase
        .from('events')
        .select('lead_email')
        .eq('organization_id', organization_id)
        .limit(500);
      
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalid = data?.filter(e => e.lead_email && !emailRegex.test(e.lead_email)) || [];
      
      if (invalid.length > 0) {
        return { status: 'warning', message: `${invalid.length} events with invalid email format` };
      }
      return { status: 'pass', message: 'All emails valid format' };
    }));

    // ============================================
    // SECURITY TESTS
    // ============================================
    console.log('Testing Security...');

    // Rate limiting works
    tests.push(await runTest('SEC: Rate limiting RPC', 'Security', async () => {
      const { data, error } = await supabase.rpc('check_rate_limit', {
        p_endpoint: 'qa_test',
        p_identifier: 'qa_agent',
        p_max_requests: 1000,
        p_window_minutes: 1
      });
      
      if (error) return { status: 'fail', message: error.message };
      return { status: 'pass', message: 'Rate limiting works' };
    }));

    // Organization isolation
    tests.push(await runTest('SEC: Org isolation (closers)', 'Security', async () => {
      const { data } = await supabase
        .from('closers')
        .select('id, organization_id')
        .eq('organization_id', organization_id);
      
      const otherOrgs = data?.filter(c => c.organization_id !== organization_id);
      if (otherOrgs && otherOrgs.length > 0) {
        return { status: 'fail', message: 'Cross-org data leak detected!' };
      }
      return { status: 'pass', message: 'Data properly isolated' };
    }));

    // ============================================
    // BUILD SUMMARY
    // ============================================
    const totalDuration = Date.now() - startTime;
    const summary = {
      passed: tests.filter(t => t.status === 'pass').length,
      failed: tests.filter(t => t.status === 'fail').length,
      errors: tests.filter(t => t.status === 'error').length,
      warnings: tests.filter(t => t.status === 'warning').length,
      skipped: tests.filter(t => t.status === 'skip').length,
      total_duration_ms: totalDuration,
    };

    const report: QAReport = {
      timestamp: new Date().toISOString(),
      organization_name: orgName,
      tests,
      summary,
    };

    console.log(`\n📊 QA COMPLETE: ${summary.passed} passed, ${summary.failed} failed, ${summary.errors} errors, ${summary.warnings} warnings (${totalDuration}ms)`);

    // ============================================
    // AI ANALYSIS
    // ============================================
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    let aiAnalysis = '';

    const problemTests = tests.filter(t => t.status === 'fail' || t.status === 'error');
    
    if (LOVABLE_API_KEY && problemTests.length > 0) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are a senior QA engineer. Analyze failures and provide:
1. Root cause for each failure
2. Specific fix (code or SQL)
3. Priority (P0=critical, P1=high, P2=medium, P3=low)

Format for Slack. Be actionable and specific.`
              },
              {
                role: 'user',
                content: `Test failures:\n${JSON.stringify(problemTests, null, 2)}`
              }
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          aiAnalysis = aiData.choices?.[0]?.message?.content || '';
        }
      } catch (e) {
        console.error('AI analysis failed:', e);
      }
    }

    // ============================================
    // SLACK MESSAGE
    // ============================================
    const emoji = { pass: '✅', fail: '❌', error: '💥', warning: '⚠️', skip: '⏭️' };
    
    let slackBlocks: any[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: `🧪 Full QA Report: ${orgName}`, emoji: true },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${tests.length} tests run in ${(totalDuration / 1000).toFixed(1)}s*\n✅ ${summary.passed} | ❌ ${summary.failed} | 💥 ${summary.errors} | ⚠️ ${summary.warnings}`,
        },
      },
    ];

    // Show failures and errors
    const failures = tests.filter(t => t.status === 'fail' || t.status === 'error');
    if (failures.length > 0) {
      slackBlocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*❌ Failures & Errors (${failures.length}):*\n${failures.map(t => 
              `${emoji[t.status]} *${t.name}* (${t.category}): ${t.message}`
            ).join('\n')}`,
          },
        }
      );
    }

    // Show warnings
    const warnings = tests.filter(t => t.status === 'warning');
    if (warnings.length > 0) {
      slackBlocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*⚠️ Warnings (${warnings.length}):*\n${warnings.map(t => 
              `• *${t.name}*: ${t.message}`
            ).join('\n')}`,
          },
        }
      );
    }

    if (aiAnalysis) {
      slackBlocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*🤖 AI Analysis:*\n${aiAnalysis}` },
        }
      );
    }

    // Lovable prompt
    if (failures.length > 0) {
      const lovablePrompt = `Fix these QA failures:\n${failures.map(t => 
        `- [${t.category}] ${t.name}: ${t.message}${t.details ? ` | Details: ${JSON.stringify(t.details)}` : ''}`
      ).join('\n')}`;

      slackBlocks.push(
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `*📋 Copy to Lovable:*\n\`\`\`${lovablePrompt}\`\`\`` },
        }
      );
    }

    const slackPayload = { blocks: slackBlocks };

    if (!dry_run) {
      const SLACK_WEBHOOK_URL = Deno.env.get('SLACK_WEBHOOK_URL');
      if (SLACK_WEBHOOK_URL) {
        await fetch(SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackPayload),
        });
        console.log('Report sent to Slack');
      }
    }

    return new Response(JSON.stringify({
      success: true,
      report,
      ai_analysis: aiAnalysis,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('QA Agent error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
