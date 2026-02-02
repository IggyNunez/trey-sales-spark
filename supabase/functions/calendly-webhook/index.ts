import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Sanitize sensitive data from objects for logging
function sanitizeForLogging(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sensitiveKeys = ['email', 'phone', 'signature', 'api_key', 'token', 'authorization', 'password', 'secret', 'key'];
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

// Helper function to extract UUID from Calendly URI
// URIs look like: https://api.calendly.com/scheduled_events/UUID or .../invitees/UUID
function extractUuidFromUri(uriOrUuid: string | undefined | null): string | null {
  if (!uriOrUuid) return null;
  // If it's already a UUID (no slashes), return it
  if (!uriOrUuid.includes('/')) return uriOrUuid;
  // Extract the last segment from the URI
  const parts = uriOrUuid.split('/');
  return parts[parts.length - 1] || null;
}

// Helper function to extract closer info with multiple fallback methods
// Priority: event_memberships[0] > event_guests[0] > scheduled_by > assigned_to > event_type.profile
interface CloserInfo {
  closerName: string | null;
  closerEmail: string | null;
  extractionMethod: string;
}

function extractCloserInfo(
  scheduledEvent: any,
  eventPayload: any,
  invitee: any
): CloserInfo {
  let closerName: string | null = null;
  let closerEmail: string | null = null;
  let extractionMethod = 'none';

  // Method 1: event_memberships[0] (primary - the host of the call)
  if (scheduledEvent?.event_memberships?.length > 0) {
    const host = scheduledEvent.event_memberships[0];
    if (host.user_name || host.user_email) {
      closerName = host.user_name || null;
      closerEmail = host.user_email?.toLowerCase() || null;
      extractionMethod = 'event_memberships';
      console.log('Closer extracted via event_memberships:', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 2: event_guests[0] (sometimes used for round robin)
  if (scheduledEvent?.event_guests?.length > 0) {
    const guest = scheduledEvent.event_guests[0];
    if (guest.name || guest.email) {
      closerName = guest.name || null;
      closerEmail = guest.email?.toLowerCase() || null;
      extractionMethod = 'event_guests';
      console.log('Closer extracted via event_guests:', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 3: scheduled_by (for round robin / manually assigned)
  if (eventPayload?.scheduled_by) {
    const scheduledBy = eventPayload.scheduled_by;
    if (scheduledBy.name || scheduledBy.email) {
      closerName = scheduledBy.name || null;
      closerEmail = scheduledBy.email?.toLowerCase() || null;
      extractionMethod = 'scheduled_by';
      console.log('Closer extracted via scheduled_by:', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 4: assigned_to (alternative round robin field)
  if (eventPayload?.assigned_to) {
    const assignedTo = eventPayload.assigned_to;
    if (assignedTo.name || assignedTo.email) {
      closerName = assignedTo.name || null;
      closerEmail = assignedTo.email?.toLowerCase() || null;
      extractionMethod = 'assigned_to';
      console.log('Closer extracted via assigned_to:', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 5: event_type.profile.name (event type owner as last resort)
  const eventType = scheduledEvent?.event_type || eventPayload?.event_type;
  if (eventType?.profile) {
    const profile = eventType.profile;
    if (profile.name || profile.email) {
      closerName = profile.name || null;
      closerEmail = profile.email?.toLowerCase() || null;
      extractionMethod = 'event_type_profile';
      console.log('Closer extracted via event_type.profile (fallback):', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // Method 6: Check invitee.routing_form_submission for assigned user
  if (invitee?.routing_form_submission?.assigned_to) {
    const assigned = invitee.routing_form_submission.assigned_to;
    if (assigned.name || assigned.email) {
      closerName = assigned.name || null;
      closerEmail = assigned.email?.toLowerCase() || null;
      extractionMethod = 'routing_form_assigned';
      console.log('Closer extracted via routing_form_submission.assigned_to:', closerName, closerEmail);
      return { closerName, closerEmail, extractionMethod };
    }
  }

  // No closer found - log warning
  console.warn('⚠️ CLOSER EXTRACTION FAILED - No closer info found in webhook payload');
  console.warn('Available data: event_memberships=', scheduledEvent?.event_memberships?.length || 0,
    'event_guests=', scheduledEvent?.event_guests?.length || 0,
    'has_scheduled_by=', !!eventPayload?.scheduled_by,
    'has_assigned_to=', !!eventPayload?.assigned_to,
    'has_event_type_profile=', !!eventType?.profile);

  return { closerName, closerEmail, extractionMethod };
}

// Verify Calendly webhook signature using HMAC-SHA256
async function verifyCalendlySignature(
  payload: string,
  signature: string | null,
  signingKey: string | null
): Promise<{ valid: boolean; reason?: string }> {
  // If no signing key configured, skip verification (but log warning)
  if (!signingKey) {
    console.warn('SECURITY: No Calendly signing key configured - signature verification skipped');
    return { valid: true, reason: 'no_key_configured' };
  }

  if (!signature) {
    console.error('SECURITY: Signing key configured but no signature provided - rejecting');
    return { valid: false, reason: 'missing_signature' };
  }

  try {
    // Calendly signature format: t=timestamp,v1=signature
    const parts = signature.split(',');
    const timestampPart = parts.find(p => p.startsWith('t='));
    const signaturePart = parts.find(p => p.startsWith('v1='));

    if (!timestampPart || !signaturePart) {
      return { valid: false, reason: 'invalid_signature_format' };
    }

    const timestamp = timestampPart.substring(2);
    const providedSignature = signaturePart.substring(3);

    // Check timestamp is within 5 minutes (prevent replay attacks)
    const timestampMs = parseInt(timestamp) * 1000;
    const now = Date.now();
    if (Math.abs(now - timestampMs) > 5 * 60 * 1000) {
      return { valid: false, reason: 'timestamp_expired' };
    }

    // Create the signed payload (timestamp.payload)
    const signedPayload = `${timestamp}.${payload}`;

    // Calculate expected signature using Web Crypto API
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(signingKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    if (expectedSignature.toLowerCase() === providedSignature.toLowerCase()) {
      return { valid: true };
    }
    return { valid: false, reason: 'signature_mismatch' };
  } catch (err) {
    console.error('Signature verification error:', err);
    return { valid: false, reason: 'verification_error' };
  }
}

// Rate limiting configuration
const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MINUTES = 1;

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
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get organization_id from URL query parameter
  const url = new URL(req.url);
  const orgIdFromUrl = url.searchParams.get('org_id');

  if (orgIdFromUrl) {
    console.log('Organization ID from webhook URL:', orgIdFromUrl);
  } else {
    console.warn('No org_id in webhook URL - will try to determine org from closer email');
  }

  // Check rate limit
  const clientIp = getClientIdentifier(req);
  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'calendly-webhook');
  
  if (!rateLimitResult.allowed) {
    console.warn(`Rate limit exceeded for ${clientIp} on calendly-webhook. Count: ${rateLimitResult.current_count}`);
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

  try {
    // Clone request to read body twice (once for verification, once for processing)
    const rawBody = await req.text();
    const payload = JSON.parse(rawBody);
    // Log only event type, not full payload (security: avoid PII in logs)
    console.log("Received Calendly webhook event:", payload.event);

    // Get signature from header
    const signature = req.headers.get('calendly-webhook-signature');

    // Look up signing key for this organization
    let signingKey: string | null = null;
    if (orgIdFromUrl) {
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('calendly_webhook_signing_key')
        .eq('organization_id', orgIdFromUrl)
        .maybeSingle();
      signingKey = integration?.calendly_webhook_signing_key || null;
    }

    // Verify webhook signature
    const signatureResult = await verifyCalendlySignature(rawBody, signature, signingKey);
    if (!signatureResult.valid && signatureResult.reason !== 'no_key_configured') {
      console.error('SECURITY: Invalid webhook signature:', signatureResult.reason);
      return new Response(JSON.stringify({ error: 'Invalid signature' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const event = payload.event;
    const eventPayload = payload.payload;

    // AUDIT LOGGING - Capture full payload for debugging instant cancellations
    const inviteeForAudit = eventPayload.invitee || eventPayload;
    const scheduledEventForAudit = eventPayload.scheduled_event || eventPayload.event || {};
    const cancellationForAudit = eventPayload.cancellation || inviteeForAudit.cancellation || {};
    
    const bookedAtAudit = scheduledEventForAudit.created_at || inviteeForAudit.created_at;
    const canceledAtAudit = cancellationForAudit.created_at;
    let secondsToCancel = null;
    let isInstantCancel = false;
    
    if (bookedAtAudit && canceledAtAudit) {
      secondsToCancel = (new Date(canceledAtAudit).getTime() - new Date(bookedAtAudit).getTime()) / 1000;
      isInstantCancel = secondsToCancel < 10;
    }

    // Capture request headers for audit (sanitized for security)
    const requestHeaders: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie', 'x-whop-signature', 'calendly-webhook-signature'];
    req.headers.forEach((value, key) => {
      const keyLower = key.toLowerCase();
      if (sensitiveHeaders.some(s => keyLower.includes(s))) {
        requestHeaders[key] = '[REDACTED]';
      } else {
        requestHeaders[key] = value;
      }
    });
    
    // Determine org ID for audit
    const auditOrgId = orgIdFromUrl || null;
    
    // Insert audit record with ALL available data
    try {
      const auditRecord = {
        event_type: event,
        invitee_email: inviteeForAudit.email?.toLowerCase(),
        invitee_uuid: extractUuidFromUri(inviteeForAudit.uri) || inviteeForAudit.uuid,
        event_uuid: extractUuidFromUri(scheduledEventForAudit.uri) || scheduledEventForAudit.uuid,
        event_name: scheduledEventForAudit.name || scheduledEventForAudit.event_type?.name,
        closer_email: scheduledEventForAudit.event_memberships?.[0]?.user_email?.toLowerCase(),
        scheduled_at: scheduledEventForAudit.start_time || eventPayload.event_start_time,
        booked_at: bookedAtAudit,
        canceled_at: event === 'invitee.canceled' ? canceledAtAudit : null,
        seconds_to_cancel: secondsToCancel,
        is_instant_cancel: isInstantCancel,
        canceler_type: cancellationForAudit.canceler_type,
        canceled_by: cancellationForAudit.canceled_by,
        cancel_reason: cancellationForAudit.reason,
        scheduling_method: inviteeForAudit.scheduling_method,
        invitee_scheduled_by: inviteeForAudit.invitee_scheduled_by,
        routing_form_submission: inviteeForAudit.routing_form_submission || null,
        tracking_params: inviteeForAudit.tracking || null,
        full_payload: payload,
        organization_id: auditOrgId,
        // NEW FIELDS - Headers and metadata for detecting automation
        request_headers: requestHeaders,
        user_agent: req.headers.get('user-agent'),
        request_ip: clientIp,
        calendly_request_id: req.headers.get('x-request-id') || req.headers.get('x-calendly-request-id'),
        rescheduled: inviteeForAudit.rescheduled || false,
        new_invitee_uri: inviteeForAudit.new_invitee?.uri || null,
        old_invitee_uri: inviteeForAudit.old_invitee?.uri || null,
        event_memberships: scheduledEventForAudit.event_memberships || null,
        questions_and_answers: inviteeForAudit.questions_and_answers || null,
        payment: inviteeForAudit.payment || null,
        no_show: inviteeForAudit.no_show || null,
        status: inviteeForAudit.status,
        uri: inviteeForAudit.uri,
        created_at_ms: bookedAtAudit ? new Date(bookedAtAudit).getTime() : null,
        canceled_at_ms: canceledAtAudit ? new Date(canceledAtAudit).getTime() : null
      };
      
      await supabase.from('calendly_webhook_audit').insert(auditRecord);
      
      if (isInstantCancel) {
        // Log only non-sensitive metadata for instant cancellation detection
        console.log('⚠️ INSTANT CANCELLATION DETECTED! Seconds to cancel:', secondsToCancel);
        console.log('Scheduling method:', inviteeForAudit.scheduling_method);
        console.log('Routing form present:', inviteeForAudit.routing_form_submission ? 'YES' : 'NO');
        console.log('Rescheduled flag:', inviteeForAudit.rescheduled);
        console.log('Status:', inviteeForAudit.status);
        // Note: Full details stored in calendly_webhook_audit table with RLS protection
      }
    } catch (auditErr) {
      console.error('Audit log insert failed (non-fatal):', auditErr);
    }

    // Match Calendly organization to our organization
    let calendlyOrgUri: string | null = null;
    let organizationIdFromCalendly: string | null = null;

    if (eventPayload.organization) {
      calendlyOrgUri = eventPayload.organization;
    }

    if (calendlyOrgUri) {
      console.log('Looking up organization by Calendly org URI:', calendlyOrgUri);
      const { data: matchingOrg } = await supabase
        .from('organization_integrations')
        .select('organization_id')
        .eq('calendly_organization_uri', calendlyOrgUri)
        .maybeSingle();

      if (matchingOrg) {
        organizationIdFromCalendly = matchingOrg.organization_id;
        console.log('Found organization from Calendly org URI:', organizationIdFromCalendly);
      }
    }

    if (event === "invitee.created") {
      const invitee = eventPayload.invitee || eventPayload;
      const scheduledEvent = eventPayload.scheduled_event || eventPayload.event || {};
      
      const leadEmail = invitee.email?.toLowerCase();
      const leadName = invitee.name || invitee.first_name || "Unknown";
      const leadPhone = invitee.text_reminder_number || null;
      const scheduledAt = scheduledEvent.start_time || eventPayload.event_start_time;
      const bookedAt = scheduledEvent.created_at || invitee.created_at || new Date().toISOString();
      
      // Extract UUIDs - Calendly V2 API sends URIs, not raw UUIDs
      // Event URI: https://api.calendly.com/scheduled_events/EVENT_UUID
      // Invitee URI: https://api.calendly.com/scheduled_events/.../invitees/INVITEE_UUID
      const calendlyEventUuid = extractUuidFromUri(scheduledEvent.uri) || 
                                extractUuidFromUri(eventPayload.event?.uri) ||
                                scheduledEvent.uuid || 
                                eventPayload.event_uuid;
      const calendlyInviteeUuid = extractUuidFromUri(invitee.uri) || invitee.uuid;
      
      console.log('Extracted UUIDs - Event:', calendlyEventUuid, 'Invitee:', calendlyInviteeUuid);
      
      const eventName = scheduledEvent.name || scheduledEvent.event_type?.name || eventPayload.event_type?.name || null;
      
      console.log('Event name:', eventName, 'Booked at:', bookedAt);
      
      // Extract tracking params
      let urlSource = null;
      let urlPlatform = null;
      
      if (invitee.tracking) {
        urlSource = invitee.tracking.source || invitee.tracking.utm_source || null;
        urlPlatform = invitee.tracking.platform || invitee.tracking.utm_medium || null;
        console.log('Tracking params found:', { source: urlSource, platform: urlPlatform });
      }
      
      if (!urlSource && invitee.utm_source) urlSource = invitee.utm_source;
      if (!urlPlatform && invitee.utm_medium) urlPlatform = invitee.utm_medium;
      
      // Extract setter from questions
      let setterName = null;
      if (invitee.questions_and_answers) {
        const setterQuestion = invitee.questions_and_answers.find(
          (q: any) => q.question?.toLowerCase().includes("setter") || 
                      q.question?.toLowerCase().includes("who referred")
        );
        if (setterQuestion) {
          setterName = setterQuestion.answer;
        }
      }
      
      if (!setterName && invitee.tracking?.utm_term) {
        const utmTerm = invitee.tracking.utm_term;
        if (!utmTerm.startsWith('user_') && !utmTerm.match(/^[a-z0-9]{20,}$/i)) {
          setterName = utmTerm;
          console.log('Using setter from utm_term:', setterName);
        }
      }

      // Extract closer info using enhanced fallback methods
      const closerInfo = extractCloserInfo(scheduledEvent, eventPayload, invitee);
      const closerName = closerInfo.closerName;
      const closerEmail = closerInfo.closerEmail;
      console.log('Host/Closer:', closerName, closerEmail, '(method:', closerInfo.extractionMethod + ')');

      // Determine organization_id
      let organizationId: string | null = null;

      if (organizationIdFromCalendly) {
        organizationId = organizationIdFromCalendly;
        console.log('Using organization from Calendly org URI match:', organizationId);
      }

      if (!organizationId && orgIdFromUrl) {
        organizationId = orgIdFromUrl;
        console.log('Using organization from URL parameter:', organizationId);
      }

      if (!organizationId && closerEmail) {
        console.log('Attempting to determine org from closer email:', closerEmail);

        const { data: closerProfile } = await supabase
          .from('profiles')
          .select('current_organization_id')
          .eq('email', closerEmail)
          .maybeSingle();

        if (closerProfile?.current_organization_id) {
          organizationId = closerProfile.current_organization_id;
          console.log('Found organization from closer profile:', organizationId);
        }

        if (!organizationId) {
          const { data: orgIntegrations } = await supabase
            .from('organization_integrations')
            .select('organization_id')
            .not('calendly_api_key', 'is', null)
            .not('calendly_api_key', 'eq', 'configured');

          if (orgIntegrations && orgIntegrations.length === 1) {
            organizationId = orgIntegrations[0].organization_id;
            console.log('Found organization from single Calendly integration:', organizationId);
          }
        }
      }

      if (!organizationId) {
        console.warn('WARNING: Could not determine organization_id for webhook. Event will not be visible in dashboard.');
      }

      // RESCHEDULE DETECTION: Check for existing events for the same lead + event type
      // Logic: If there are 2+ bookings under the same event type with the same email,
      // mark the older one(s) as rescheduled.
      if (eventName && organizationId && leadEmail && calendlyInviteeUuid) {
        // First, check for CANCELED events (legacy behavior - mark as rescheduled)
        const { data: canceledEvents, error: canceledError } = await supabase
          .from("events")
          .select("id, call_status, calendly_invitee_uuid, scheduled_at")
          .eq("lead_email", leadEmail)
          .eq("event_name", eventName)
          .eq("call_status", "canceled")
          .eq("organization_id", organizationId)
          .neq("calendly_invitee_uuid", calendlyInviteeUuid);

        if (!canceledError && canceledEvents && canceledEvents.length > 0) {
          for (const canceledEvent of canceledEvents) {
            console.log(`Marking canceled event ${canceledEvent.id} as rescheduled (same lead ${leadEmail} booked new meeting)`);
            await supabase
              .from("events")
              .update({
                call_status: "rescheduled",
                pcf_submitted: true
              })
              .eq("id", canceledEvent.id);
          }
        }

        // NEW: Also check for SCHEDULED events - if another scheduled event exists 
        // for the same lead + event type, mark the older one as rescheduled
        const { data: scheduledEvents, error: scheduledError } = await supabase
          .from("events")
          .select("id, call_status, calendly_invitee_uuid, scheduled_at, booking_platform")
          .eq("lead_email", leadEmail)
          .eq("event_name", eventName)
          .eq("call_status", "scheduled")
          .eq("organization_id", organizationId)
          .neq("calendly_invitee_uuid", calendlyInviteeUuid)
          .or("booking_platform.eq.calendly,booking_platform.is.null") // Only affect Calendly events
          .order("scheduled_at", { ascending: false }); // Newest first

        if (!scheduledError && scheduledEvents && scheduledEvents.length > 0) {
          // The current event being created is the new booking
          // Mark all other scheduled events for this lead+event_type as rescheduled
          for (const oldEvent of scheduledEvents) {
            console.log(`Marking scheduled event ${oldEvent.id} as rescheduled (same lead ${leadEmail} has new booking for same event type)`);
            await supabase
              .from("events")
              .update({
                call_status: "rescheduled",
                pcf_submitted: true
              })
              .eq("id", oldEvent.id);
          }
        }
      }

      // Upsert lead
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .upsert({
          email: leadEmail,
          full_name: leadName,
          phone: leadPhone,
          original_setter_name: setterName,
          current_setter_name: setterName,
          organization_id: organizationId,
        }, { onConflict: "email" })
        .select()
        .single();

      if (leadError) {
        console.error("Error upserting lead:", leadError);
      }

      // DUPLICATE PREVENTION: Check for existing event before inserting
      // 1. Check by calendly_invitee_uuid (primary key)
      // 2. Check by lead_email + scheduled_at (fallback for orphan matching)
      let existingEvent = null;
      
      if (calendlyInviteeUuid) {
        const { data: byUuid } = await supabase
          .from("events")
          .select("id")
          .eq("calendly_invitee_uuid", calendlyInviteeUuid)
          .maybeSingle();
        existingEvent = byUuid;
      }
      
      if (!existingEvent && leadEmail && scheduledAt && organizationId) {
        // Fallback: check by email + scheduled_at (within 2 minute tolerance)
        const schedTime = new Date(scheduledAt);
        const minTime = new Date(schedTime.getTime() - 120000).toISOString();
        const maxTime = new Date(schedTime.getTime() + 120000).toISOString();
        
        const { data: byEmailTime } = await supabase
          .from("events")
          .select("id")
          .eq("lead_email", leadEmail)
          .eq("organization_id", organizationId)
          .gte("scheduled_at", minTime)
          .lte("scheduled_at", maxTime)
          .maybeSingle();
        existingEvent = byEmailTime;
      }

      let newEvent;
      if (existingEvent) {
        // UPDATE existing event with Calendly data
        console.log("Found existing event, updating with Calendly data:", existingEvent.id);
        const { data: updated, error: updateError } = await supabase
          .from("events")
          .update({
            calendly_event_uuid: calendlyEventUuid,
            calendly_invitee_uuid: calendlyInviteeUuid,
            lead_name: leadName,
            lead_phone: leadPhone || undefined,
            booked_at: bookedAt,
            setter_name: setterName || undefined,
            closer_name: closerName || undefined,
            closer_email: closerEmail || undefined,
            event_name: eventName || undefined,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingEvent.id)
          .select()
          .single();
        
        if (updateError) {
          console.error("Error updating existing event:", updateError);
          throw updateError;
        }
        newEvent = updated;
        console.log("Successfully updated existing event:", existingEvent.id);
      } else {
        // INSERT new event
        const { data: inserted, error: eventError } = await supabase
          .from("events")
          .insert({
            calendly_event_uuid: calendlyEventUuid,
            calendly_invitee_uuid: calendlyInviteeUuid,
            lead_id: lead?.id || null,
            lead_name: leadName,
            lead_email: leadEmail,
            lead_phone: leadPhone,
            scheduled_at: scheduledAt,
            booked_at: bookedAt,
            setter_name: setterName,
            closer_name: closerName,
            closer_email: closerEmail,
            call_status: "scheduled",
            event_name: eventName,
            organization_id: organizationId,
            booking_platform: 'calendly',
          })
          .select()
          .single();

        if (eventError) {
          console.error("Error creating event:", eventError);
          throw eventError;
        }
        newEvent = inserted;
        console.log("Successfully created new event for:", leadEmail, "Event name:", eventName, "Org:", organizationId);
      }

      console.log("Successfully created event for:", leadEmail, "Event name:", eventName, "Org:", organizationId);

      // Look up CRM contact and store ID on the event
      if (newEvent && organizationId && leadEmail) {
        // Check which CRM is configured for this org
        const { data: orgIntegration } = await supabase
          .from('organization_integrations')
          .select('primary_crm, ghl_location_id')
          .eq('organization_id', organizationId)
          .maybeSingle();

        const primaryCRM = orgIntegration?.primary_crm;
        
        // GHL Contact Lookup (supports V1 and V2 APIs)
        if (primaryCRM === 'ghl') {
          try {
            const ghlApiKey = await getApiKey(supabaseUrl, supabaseKey, organizationId, 'ghl', 'calendly-webhook');

            if (ghlApiKey) {
              console.log('GHL configured for org, looking up contact by email:', leadEmail);
              
              // Detect V2 token (pit- or JWT format)
              const isV2Token = ghlApiKey.startsWith("pit-") || ghlApiKey.startsWith("eyJ");
              let ghlResponse: Response;
              
              if (isV2Token) {
                // V2 API
                let locationId = orgIntegration?.ghl_location_id || null;
                
                // Try to extract location from JWT if not stored
                if (!locationId && ghlApiKey.startsWith("eyJ")) {
                  try {
                    const parts = ghlApiKey.split(".");
                    if (parts.length === 3) {
                      const payload = JSON.parse(atob(parts[1]));
                      locationId = payload.location_id || null;
                    }
                  } catch {}
                }
                
                const searchUrl = new URL("https://services.leadconnectorhq.com/contacts/");
                searchUrl.searchParams.set("query", leadEmail);
                if (locationId) {
                  searchUrl.searchParams.set("locationId", locationId);
                }
                
                console.log('Using GHL V2 API for contact lookup');
                ghlResponse = await fetch(searchUrl.toString(), {
                  headers: {
                    Authorization: `Bearer ${ghlApiKey}`,
                    'Content-Type': 'application/json',
                    'Version': '2021-07-28',
                  },
                });
              } else {
                // V1 API
                console.log('Using GHL V1 API for contact lookup');
                ghlResponse = await fetch(
                  `https://rest.gohighlevel.com/v1/contacts/lookup?email=${encodeURIComponent(leadEmail)}`,
                  {
                    headers: {
                      Authorization: `Bearer ${ghlApiKey}`,
                      'Content-Type': 'application/json',
                    },
                  }
                );
              }

              if (ghlResponse.ok) {
                const ghlData = await ghlResponse.json();
                const contacts = ghlData.contacts || [];
                // Find exact email match first
                const matchingContact = contacts.find(
                  (c: { email?: string }) => c.email?.toLowerCase() === leadEmail.toLowerCase()
                );
                const ghlContactId = matchingContact?.id || contacts[0]?.id || null;
                
                if (ghlContactId) {
                  console.log('Found GHL contact:', ghlContactId, '(API:', isV2Token ? 'V2' : 'V1', ')');
                  await supabase
                    .from('events')
                    .update({ ghl_contact_id: ghlContactId })
                    .eq('id', newEvent.id);
                } else {
                  console.log('No GHL contact found for email:', leadEmail);
                }
              } else {
                console.warn('GHL lookup failed:', await ghlResponse.text());
              }
            }
          } catch (ghlError) {
            console.error('Error looking up GHL contact:', ghlError);
          }
        }
        
        // HubSpot Contact Lookup
        if (primaryCRM === 'hubspot') {
          try {
            const hubspotApiKey = await getApiKey(supabaseUrl, supabaseKey, organizationId, 'hubspot', 'calendly-webhook');

            if (hubspotApiKey) {
              console.log('HubSpot configured for org, looking up contact by email:', leadEmail);
              
              const searchUrl = `https://api.hubapi.com/crm/v3/objects/contacts/search`;
              const hubspotResponse = await fetch(searchUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${hubspotApiKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  filterGroups: [{
                    filters: [{
                      propertyName: 'email',
                      operator: 'EQ',
                      value: leadEmail.toLowerCase()
                    }]
                  }],
                  limit: 1
                })
              });

              if (hubspotResponse.ok) {
                const hubspotData = await hubspotResponse.json();
                const hubspotContactId = hubspotData.results?.[0]?.id || null;
                
                if (hubspotContactId) {
                  console.log('Found HubSpot contact:', hubspotContactId);
                  await supabase
                    .from('events')
                    .update({ hubspot_contact_id: hubspotContactId })
                    .eq('id', newEvent.id);
                } else {
                  console.log('No HubSpot contact found for email:', leadEmail);
                }
              } else {
                console.warn('HubSpot lookup failed:', await hubspotResponse.text());
              }
            }
          } catch (hubspotError) {
            console.error('Error looking up HubSpot contact:', hubspotError);
          }
        }
      }

      // Resolve source
      let resolvedSource = urlSource || urlPlatform;
      let sourceId: string | null = null;
      
      if (resolvedSource && newEvent && organizationId) {
        console.log('Using source from URL params:', resolvedSource);
        const { data: sources } = await supabase
          .from('sources')
          .select('id, name')
          .eq('organization_id', organizationId);
        
        sourceId = sources?.find((s: any) => 
          s.name.toLowerCase() === resolvedSource!.toLowerCase() ||
          resolvedSource!.toLowerCase().includes(s.name.toLowerCase())
        )?.id || null;

        if (!sourceId && organizationId) {
          const { data: newSource } = await supabase
            .from('sources')
            .insert({ name: resolvedSource, organization_id: organizationId })
            .select('id')
            .single();
          sourceId = newSource?.id || null;
          console.log('Created new source:', resolvedSource, 'for org:', organizationId);
        }
      }
      
      // Fall back to Close CRM
      if (!sourceId && newEvent) {
        try {
          const CLOSE_API_KEY = Deno.env.get('CLOSE_API_KEY');
          if (CLOSE_API_KEY) {
            const authHeader = btoa(`${CLOSE_API_KEY}:`);
            
            const searchResponse = await fetch(
              `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(leadEmail)}`,
              {
                headers: {
                  'Authorization': `Basic ${authHeader}`,
                  'Content-Type': 'application/json',
                },
              }
            );

            if (searchResponse.ok) {
              const searchData = await searchResponse.json();
              if (searchData.data && searchData.data.length > 0) {
                const closeLead = searchData.data[0];
                
                const customKeys = Object.keys(closeLead).filter(k => k.startsWith('custom.'));
                let crmSourceValue = null;
                
                for (const key of customKeys) {
                  const fieldName = key.toLowerCase();
                  if (fieldName.includes('source') || fieldName.includes('origin')) {
                    crmSourceValue = closeLead[key];
                    break;
                  }
                  if (closeLead[key] && typeof closeLead[key] === 'string') {
                    const lowerVal = closeLead[key].toLowerCase();
                    if (['instagram', 'youtube', 'linkedin', 'x', 'twitter', 'newsletter', 'organic', 'referral', 'tiktok'].some(s => lowerVal.includes(s))) {
                      crmSourceValue = closeLead[key];
                      break;
                    }
                  }
                }

                if (crmSourceValue && organizationId) {
                  console.log('Using source from Close CRM:', crmSourceValue);
                  const { data: sources } = await supabase
                    .from('sources')
                    .select('id, name')
                    .eq('organization_id', organizationId);
                  
                  sourceId = sources?.find((s: any) => 
                    s.name.toLowerCase() === crmSourceValue.toLowerCase() ||
                    crmSourceValue.toLowerCase().includes(s.name.toLowerCase())
                  )?.id || null;

                  if (!sourceId && organizationId) {
                    const { data: newSource } = await supabase
                      .from('sources')
                      .insert({ name: crmSourceValue, organization_id: organizationId })
                      .select('id')
                      .single();
                    sourceId = newSource?.id || null;
                    console.log('Created new source from CRM:', crmSourceValue, 'for org:', organizationId);
                  }
                }
              }
            }
          }
        } catch (closeError) {
          console.error('Error fetching source from Close (non-fatal):', closeError);
        }
      }
      
      // Update event and lead with source
      if (sourceId && newEvent) {
        await supabase.from('events').update({ source_id: sourceId }).eq('id', newEvent.id);
        if (lead?.id) {
          await supabase.from('leads').update({ source_id: sourceId }).eq('id', lead.id);
        }
        console.log('Updated event with source_id:', sourceId);
      }
    } else if (event === "invitee.canceled") {
      const invitee = eventPayload.invitee || eventPayload;
      const scheduledEvent = eventPayload.scheduled_event || eventPayload.event || {};
      const cancellation = eventPayload.cancellation || invitee.cancellation || {};
      
      // LOG THE CANCELLATION DETAILS - WHO and WHY
      console.log('=== CANCELLATION DETAILS ===');
      console.log('Canceler type:', cancellation.canceler_type || 'UNKNOWN');
      console.log('Cancellation reason:', cancellation.reason || 'No reason provided');
      console.log('Canceled by:', cancellation.canceled_by || 'Unknown');
      console.log('Full cancellation object:', JSON.stringify(cancellation));
      console.log('Full eventPayload keys:', Object.keys(eventPayload));
      console.log('============================');
      
      // Extract invitee UUID using helper function
      const calendlyInviteeUuid = extractUuidFromUri(invitee.uri) || 
                                   invitee.uuid ||
                                   scheduledEvent.invitee_uuid;
      
      // Also extract email for fallback matching
      const leadEmail = invitee.email?.toLowerCase();
      const eventStartTime = scheduledEvent.start_time || eventPayload.event_start_time;
      
      console.log('Processing cancellation - Invitee UUID:', calendlyInviteeUuid, 'Email:', leadEmail, 'Start time:', eventStartTime);

      // Try to find event by invitee UUID first
      let canceledEvent = null;
      let fetchError = null;
      
      if (calendlyInviteeUuid) {
        const result = await supabase
          .from("events")
          .select("id, lead_email, event_name, call_status, organization_id")
          .eq("calendly_invitee_uuid", calendlyInviteeUuid)
          .maybeSingle();
        canceledEvent = result.data;
        fetchError = result.error;
      }
      
      // Fallback: find by email + scheduled_at if UUID match failed
      if (!canceledEvent && leadEmail && eventStartTime) {
        console.log('UUID match failed, trying email + time fallback');
        const result = await supabase
          .from("events")
          .select("id, lead_email, event_name, call_status, organization_id")
          .eq("lead_email", leadEmail)
          .eq("scheduled_at", eventStartTime)
          .eq("call_status", "scheduled")
          .order("created_at", { ascending: false })
          .limit(1);
        canceledEvent = result.data?.[0] || null;
        fetchError = result.error;
        if (canceledEvent) {
          console.log('Found event via email + time fallback:', canceledEvent.id);
        }
      }

      if (fetchError) {
        console.error("Error fetching event to cancel:", fetchError);
        throw fetchError;
      }

      if (canceledEvent) {
        let newStatus = "canceled";

        if (canceledEvent.event_name && canceledEvent.lead_email && canceledEvent.organization_id) {
          const { data: otherEvents } = await supabase
            .from("events")
            .select("id")
            .eq("lead_email", canceledEvent.lead_email)
            .eq("event_name", canceledEvent.event_name)
            .eq("call_status", "scheduled")
            .eq("organization_id", canceledEvent.organization_id)
            .neq("id", canceledEvent.id);
          
          if (otherEvents && otherEvents.length > 0) {
            newStatus = "rescheduled";
            console.log(`Found ${otherEvents.length} other scheduled events for same lead/event type, marking as rescheduled`);
          }
        }

        const { error } = await supabase
          .from("events")
          .update({ 
            call_status: newStatus,
            pcf_submitted: true
          })
          .eq("id", canceledEvent.id);

        if (error) {
          console.error("Error updating event status:", error);
          throw error;
        }

        console.log(`Marked event as ${newStatus}:`, calendlyInviteeUuid);
      } else {
        console.log("Event not found for cancellation. Invitee UUID:", calendlyInviteeUuid);
        console.log("Full cancellation payload for debugging:", JSON.stringify(eventPayload, null, 2));
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Webhook error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
