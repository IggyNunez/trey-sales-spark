import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Sanitize sensitive data from objects for logging
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['email', 'phone', 'signature', 'api_key', 'token', 'authorization', 'password', 'secret', 'key', 'amount', 'total'];
  const sanitized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    if (sensitiveKeys.some(s => keyLower.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = Array.isArray(value) ? '[Array]' : '[Object]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

// Verify Whop webhook signature using HMAC-SHA256
async function verifyWhopSignature(
  payload: string,
  signature: string | null,
  signingKey: string | null
): Promise<{ valid: boolean; reason?: string }> {
  if (!signingKey) {
    console.warn('SECURITY: No Whop signing key configured - signature verification skipped');
    return { valid: true, reason: 'no_key_configured' };
  }

  if (!signature) {
    console.error('SECURITY: Signing key configured but no signature provided - rejecting');
    return { valid: false, reason: 'missing_signature' };
  }

  try {
    // Whop uses HMAC-SHA256 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSignature.toLowerCase() === signature.toLowerCase()) {
      return { valid: true };
    }
    return { valid: false, reason: 'signature_mismatch' };
  } catch (err) {
    console.error('Signature verification error:', err);
    return { valid: false, reason: 'verification_error' };
  }
}

// Rate limiting configuration
const RATE_LIMIT_MAX_REQUESTS = 100; // requests per window
const RATE_LIMIT_WINDOW_MINUTES = 1; // time window in minutes

async function checkRateLimit(supabase: any, identifier: string, endpoint: string): Promise<{ allowed: boolean; current_count: number; reset_at: string }> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES
    });

    if (error) {
      console.error('Rate limit check error:', error);
      // SECURITY FIX: Fail-closed - deny request if rate limit check fails
      return { allowed: false, current_count: 0, reset_at: new Date(Date.now() + 60000).toISOString() };
    }

    return data?.[0] || { allowed: true, current_count: 0, reset_at: new Date().toISOString() };
  } catch (err) {
    console.error('Rate limit exception:', err);
    // SECURITY FIX: Fail-closed - deny request on exception
    return { allowed: false, current_count: 0, reset_at: new Date(Date.now() + 60000).toISOString() };
  }
}

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  
  return cfConnectingIp || realIp || forwarded?.split(',')[0]?.trim() || 'unknown';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

  // Check rate limit before processing
  const clientIp = getClientIdentifier(req);
  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'whop-webhook');
  
  if (!rateLimitResult.allowed) {
    console.warn(`Rate limit exceeded for ${clientIp} on whop-webhook. Count: ${rateLimitResult.current_count}`);
    return new Response(JSON.stringify({ 
      error: 'Too many requests', 
      retry_after: rateLimitResult.reset_at 
    }), {
      status: 429,
      headers: { 
        ...corsHeaders, 
        'Content-Type': 'application/json',
        'Retry-After': rateLimitResult.reset_at,
        'X-RateLimit-Limit': String(RATE_LIMIT_MAX_REQUESTS),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.reset_at
      },
    });
  }

  // Get organization_id from URL parameter (set when configuring webhook in Whop dashboard)
  const url = new URL(req.url);
  const orgIdFromUrl = url.searchParams.get('org_id');

  if (orgIdFromUrl) {
    console.log('Organization ID from webhook URL:', orgIdFromUrl);
  }

  try {
    // Read raw body for signature verification
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    // Log only event type, not full payload (security: avoid PII/financial data in logs)
    console.log('Received Whop webhook event:', payload.event || payload.action);

    // Get signature from header
    const signature = req.headers.get('x-whop-signature');

    // Look up signing key for this organization
    let signingKey: string | null = null;
    if (orgIdFromUrl) {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('whop_webhook_signing_key')
        .eq('organization_id', orgIdFromUrl)
        .maybeSingle();
      signingKey = integration?.whop_webhook_signing_key || null;
    }

    // Verify webhook signature
    const signatureResult = await verifyWhopSignature(rawBody, signature, signingKey);
    if (!signatureResult.valid && signatureResult.reason !== 'no_key_configured') {
      console.error('SECURITY: Invalid Whop webhook signature:', signatureResult.reason);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const eventType = payload.event || payload.action;
    const data = payload.data || payload;

    // Try to match organization by Whop company_id
    let orgIdFromWhopCompany: string | null = null;
    const whopCompanyId = data.company_id || data.business_id || payload.company_id || null;

    if (whopCompanyId) {
      console.log('Whop company_id from payload:', whopCompanyId);
      const { data: matchingOrg } = await supabase
        .from('organization_integrations')
        .select('organization_id')
        .eq('whop_company_id', whopCompanyId)
        .maybeSingle();

      if (matchingOrg) {
        orgIdFromWhopCompany = matchingOrg.organization_id;
        console.log('Found organization from Whop company_id:', orgIdFromWhopCompany);
      }
    }

    // Handle payment events
    if (eventType === 'payment.succeeded' || eventType === 'payment.completed' || eventType === 'payment_completed') {
      const payment = data.payment || data;
      
      const customerEmail = (payment.user_email || payment.email || data.user?.email || '').toLowerCase().trim();
      if (!customerEmail) {
        console.log('No email found in payment webhook, skipping');
        return new Response(
          JSON.stringify({ success: true, message: 'No email, skipped' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Whop uses dollars not cents
      const amount = Number(payment.total || payment.amount || payment.usd_total || 0);
      const paymentId = payment.id || data.id;
      const whopPaymentId = `whop_${paymentId}`;

      // Log sanitized info (no PII or amounts)
      console.log('Processing payment webhook, payment_id:', paymentId);

      // Check if payment already exists
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id')
        .eq('notes', whopPaymentId)
        .maybeSingle();

      if (existingPayment) {
        console.log(`Payment ${paymentId} already exists, skipping`);
        return new Response(
          JSON.stringify({ success: true, message: 'Already exists' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get attribution from lead - also get org_id
      const { data: matchingLead } = await supabase
        .from('leads')
        .select('id, source_id, organization_id')
        .eq('email', customerEmail)
        .maybeSingle();

      // Get attribution from most recent event - also get org_id
      const { data: matchingEvent } = await supabase
        .from('events')
        .select('id, closer_id, setter_id, source_id, organization_id')
        .eq('lead_email', customerEmail)
        .order('scheduled_at', { ascending: false })
        .maybeSingle();

      const setterId = matchingEvent?.setter_id || null;
      const closerId = matchingEvent?.closer_id || null;
      const leadId = matchingLead?.id || null;
      const sourceId = matchingLead?.source_id || matchingEvent?.source_id || null;

      // CRITICAL: Determine organization_id
      // Priority: 1) Whop company_id match, 2) URL param, 3) event/lead lookup
      let organizationId: string | null = null;

      // BEST: Match by Whop company_id (automatic, tied to API key)
      if (orgIdFromWhopCompany) {
        organizationId = orgIdFromWhopCompany;
        console.log('Using organization from Whop company_id match:', organizationId);
      }

      // FALLBACK 1: URL parameter
      if (!organizationId && orgIdFromUrl) {
        organizationId = orgIdFromUrl;
        console.log('Using organization from URL parameter:', organizationId);
      }

      // FALLBACK 2: From matching event or lead
      if (!organizationId) {
        organizationId = matchingEvent?.organization_id || matchingLead?.organization_id || null;
        if (organizationId) {
          console.log('Using organization from event/lead:', organizationId);
        }
      }

      if (!organizationId) {
        console.error('CRITICAL: Could not determine organization_id for payment. Email:', customerEmail);
      }

      // Log only IDs, not PII
      console.log('Attribution found:', { leadId: !!leadId, setterId: !!setterId, closerId: !!closerId, sourceId: !!sourceId, orgId: !!organizationId });

      // Determine payment type
      let paymentType: 'paid_in_full' | 'split_pay' | 'deposit' = 'paid_in_full';
      if (payment.payment_plan) {
        paymentType = 'split_pay';
      }

      // Parse payment date
      let paymentDate = new Date();
      if (payment.paid_at) {
        paymentDate = typeof payment.paid_at === 'number' 
          ? new Date(payment.paid_at * 1000) 
          : new Date(payment.paid_at);
      } else if (payment.created_at) {
        paymentDate = typeof payment.created_at === 'number'
          ? new Date(payment.created_at * 1000)
          : new Date(payment.created_at);
      }

      // Create payment record - INCLUDE ORGANIZATION_ID
      const { error: insertError } = await supabase
        .from('payments')
        .insert({
          event_id: matchingEvent?.id || null,
          lead_id: leadId,
          closer_id: closerId,
          setter_id: setterId,
          amount: amount,
          payment_date: paymentDate.toISOString(),
          payment_type: paymentType,
          notes: whopPaymentId,
          organization_id: organizationId, // CRITICAL: Include org_id
        });

      if (insertError) {
        console.error('Error inserting payment:', insertError);
        throw insertError;
      }

      console.log('Payment created successfully');
      
      return new Response(
        JSON.stringify({ success: true, message: 'Payment created' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle refund events
    if (eventType === 'payment.refunded' || eventType === 'refund.created' || eventType === 'payment_refunded') {
      const payment = data.payment || data;
      
      const customerEmail = (payment.user_email || payment.email || data.user?.email || '').toLowerCase().trim();
      const paymentId = payment.id || data.id;
      const whopPaymentId = `whop_${paymentId}`;
      const refundAmount = Number(payment.total || payment.refunded_amount || payment.amount || 0);

      // Log sanitized info (no PII or amounts)
      console.log('Processing refund webhook, payment_id:', paymentId);

      // Parse refund date
      let refundDate = new Date();
      if (payment.refunded_at) {
        refundDate = typeof payment.refunded_at === 'number'
          ? new Date(payment.refunded_at * 1000)
          : new Date(payment.refunded_at);
      }

      // Check if we have this payment
      const { data: existingPayment } = await supabase
        .from('payments')
        .select('id, amount')
        .eq('notes', whopPaymentId)
        .maybeSingle();

      if (existingPayment) {
        // Update existing payment with refund
        const { error: updateError } = await supabase
          .from('payments')
          .update({
            refund_amount: refundAmount,
            refunded_at: refundDate.toISOString()
          })
          .eq('id', existingPayment.id);

        if (updateError) {
          console.error('Error updating refund:', updateError);
          throw updateError;
        }

        console.log('Updated payment with refund:', existingPayment.id);
      } else {
        // Create new refunded payment with attribution - include org_id
        const { data: matchingLead } = await supabase
          .from('leads')
          .select('id, source_id, organization_id')
          .eq('email', customerEmail)
          .maybeSingle();

        const { data: matchingEvent } = await supabase
          .from('events')
          .select('id, closer_id, setter_id, source_id, organization_id')
          .eq('lead_email', customerEmail)
          .order('scheduled_at', { ascending: false })
          .maybeSingle();

        // CRITICAL: Determine organization_id with priority chain
        // Priority: 1) Whop company_id match, 2) URL param, 3) event/lead lookup
        let organizationId: string | null = null;
        if (orgIdFromWhopCompany) {
          organizationId = orgIdFromWhopCompany;
        } else if (orgIdFromUrl) {
          organizationId = orgIdFromUrl;
        } else {
          organizationId = matchingEvent?.organization_id || matchingLead?.organization_id || null;
        }

        let paymentDate = new Date();
        if (payment.paid_at || payment.created_at) {
          const rawDate = payment.paid_at || payment.created_at;
          paymentDate = typeof rawDate === 'number'
            ? new Date(rawDate * 1000)
            : new Date(rawDate);
        }

        const { error: insertError } = await supabase
          .from('payments')
          .insert({
            event_id: matchingEvent?.id || null,
            lead_id: matchingLead?.id || null,
            closer_id: matchingEvent?.closer_id || null,
            setter_id: matchingEvent?.setter_id || null,
            amount: refundAmount,
            payment_date: paymentDate.toISOString(),
            refund_amount: refundAmount,
            refunded_at: refundDate.toISOString(),
            notes: whopPaymentId,
            organization_id: organizationId, // CRITICAL: Include org_id
          });

        if (insertError) {
          console.error('Error inserting refunded payment:', insertError);
          throw insertError;
        }

        console.log('Created refunded payment record');
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Refund processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Unhandled webhook event type: ${eventType}`);
    return new Response(
      JSON.stringify({ success: true, message: 'Event type not handled' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in whop-webhook:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
