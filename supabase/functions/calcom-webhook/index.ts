import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

// Cal.com webhook payload types
interface CalcomPayload {
  triggerEvent: string;
  createdAt: string;
  payload: {
    uid: string;
    title: string;
    description?: string;
    startTime: string;
    endTime: string;
    status: string;
    eventType?: {
      id: number;
      title: string;
      slug: string;
      length: number;
    };
    organizer?: {
      id: number;
      name: string;
      email: string;
      timeZone: string;
    };
    attendees?: Array<{
      email: string;
      name: string;
      phoneNumber?: string;
      timeZone: string;
      noShow?: boolean;
    }>;
    // API v2 uses bookingFieldsResponses for all custom fields and UTM
    bookingFieldsResponses?: Record<string, unknown>;
    // Legacy fields
    responses?: Record<string, string>;
    metadata?: Record<string, string>;
    location?: string;
    rescheduledFromUid?: string;
    rescheduleReason?: string;
    cancellationReason?: string;
    noShowHost?: boolean;
    meetingUrl?: string;
    videoCallData?: {
      url: string;
      password?: string;
    };
    // Meeting lifecycle
    meetingStartedAt?: string;
    meetingEndedAt?: string;
    recordingUrl?: string;
  };
}

// Rate limiting
const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_MINUTES = 1;

async function checkRateLimit(supabase: SupabaseClient, identifier: string, endpoint: string): Promise<{ allowed: boolean; reset_at: string }> {
  try {
    const { data, error } = await supabase.rpc('check_rate_limit', {
      p_identifier: identifier,
      p_endpoint: endpoint,
      p_max_requests: RATE_LIMIT_MAX_REQUESTS,
      p_window_minutes: RATE_LIMIT_WINDOW_MINUTES
    });

    if (error) {
      console.error('Rate limit check error:', error);
      return { allowed: false, reset_at: new Date(Date.now() + 60000).toISOString() };
    }

    return data?.[0] || { allowed: true, reset_at: new Date().toISOString() };
  } catch (err) {
    console.error('Rate limit exception:', err);
    return { allowed: false, reset_at: new Date(Date.now() + 60000).toISOString() };
  }
}

function getClientIdentifier(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const realIp = req.headers.get('x-real-ip');
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  return cfConnectingIp || realIp || forwarded?.split(',')[0]?.trim() || 'unknown';
}

// Organization resolution strategy
async function resolveOrganization(
  supabase: SupabaseClient,
  payload: CalcomPayload['payload'],
  orgIdFromUrl?: string | null
): Promise<string | null> {
  // 1. org_id from webhook URL query param (preferred)
  if (orgIdFromUrl) {
    console.log('Using organization ID from URL:', orgIdFromUrl);
    return orgIdFromUrl;
  }

  // 2. Match by organizer email → profiles → current_organization_id
  const organizerEmail = payload.organizer?.email?.toLowerCase();
  if (organizerEmail) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('current_organization_id')
      .eq('email', organizerEmail)
      .maybeSingle();
    
    if (profile?.current_organization_id) {
      console.log('Found organization from organizer profile:', profile.current_organization_id);
      return profile.current_organization_id;
    }
  }

  // 3. Fallback: single org with Cal.com configured
  const { data: calcomOrgs } = await supabase
    .from('organization_integrations')
    .select('organization_id')
    .not('calcom_api_key_encrypted', 'is', null);
  
  if (calcomOrgs?.length === 1) {
    console.log('Found single organization with Cal.com configured:', calcomOrgs[0].organization_id);
    return calcomOrgs[0].organization_id;
  }

  console.warn('Could not determine organization for Cal.com webhook');
  return null;
}

// Helper to extract .value from nested Cal.com response objects
// Cal.com sends: { label: "...", value: "Newsletter", isHidden: true }
function extractResponseValue(field: unknown): string | null {
  if (typeof field === 'string') return field;
  if (field && typeof field === 'object' && 'value' in field) {
    const val = (field as { value: unknown }).value;
    if (typeof val === 'string') return val;
  }
  return null;
}

// Extract setter and UTM from booking responses
function extractSetterAndMetadata(payload: CalcomPayload['payload']): { 
  setter: string | null; 
  mergedResponses: Record<string, unknown>;
  mergedMetadata: Record<string, string>;
} {
  const bookingFields = payload.bookingFieldsResponses || {};
  const responses = (payload.responses || {}) as Record<string, unknown>;
  const userFieldsResponses = ((payload as Record<string, unknown>).userFieldsResponses || {}) as Record<string, unknown>;
  const metadata = payload.metadata || {};
  
  // Setter can be in various field names - handle nested objects
  const setter = 
    extractResponseValue(responses.utm_setter) ||
    extractResponseValue(responses.setter) ||
    extractResponseValue(responses['setter-name']) ||
    extractResponseValue(userFieldsResponses.utm_setter) ||
    extractResponseValue(userFieldsResponses.setter) ||
    (bookingFields.utm_setter as string) ||
    (bookingFields.setter as string) ||
    (bookingFields['setter-name'] as string) ||
    (metadata.setter as string) ||
    null;
  
  // Extract all UTM parameters from nested responses object
  const utmFields: Record<string, string> = {};
  
  // From responses (nested structure)
  for (const [key, field] of Object.entries(responses)) {
    if (key.toLowerCase().startsWith('utm_')) {
      const value = extractResponseValue(field);
      if (value) utmFields[key] = value;
    }
  }
  
  // From userFieldsResponses (same nested structure)
  for (const [key, field] of Object.entries(userFieldsResponses)) {
    if (key.toLowerCase().startsWith('utm_') && !utmFields[key]) {
      const value = extractResponseValue(field);
      if (value) utmFields[key] = value;
    }
  }
  
  // From bookingFieldsResponses (flat strings from v2 API)
  for (const [key, value] of Object.entries(bookingFields)) {
    if (key.toLowerCase().startsWith('utm_') && typeof value === 'string' && !utmFields[key]) {
      utmFields[key] = value;
    }
  }
  
  // Flatten all responses for storage (extract .value from nested objects)
  const flattenedResponses: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(responses)) {
    const value = extractResponseValue(field);
    if (value !== null) {
      flattenedResponses[key] = value;
    } else if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
      flattenedResponses[key] = field;
    }
  }
  
  // CRITICAL FIX: Also flatten userFieldsResponses (includes hidden fields like quiz_email)
  for (const [key, field] of Object.entries(userFieldsResponses)) {
    if (!flattenedResponses[key]) { // Don't overwrite if already set
      const value = extractResponseValue(field);
      if (value !== null) {
        flattenedResponses[key] = value;
      } else if (typeof field === 'string' || typeof field === 'number' || typeof field === 'boolean') {
        flattenedResponses[key] = field;
      }
    }
  }
  
  // Merge bookingFieldsResponses (flat strings) into responses
  const mergedResponses = {
    ...flattenedResponses,
    ...Object.fromEntries(
      Object.entries(bookingFields).filter(([_, v]) => 
        typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
      )
    ),
  };
  
  // Merge UTM fields into metadata
  const mergedMetadata = {
    ...metadata,
    ...utmFields,
  };
  
  // Debug logging for hidden fields
  const hiddenFieldsWithValues = Object.entries(responses)
    .filter(([_, v]) => v && typeof v === 'object' && 'isHidden' in v && (v as { isHidden: boolean }).isHidden && 'value' in v && (v as { value: unknown }).value)
    .map(([k]) => k);
  
  console.log('=== BOOKING RESPONSES DEBUG ===');
  console.log('responses keys:', Object.keys(responses));
  console.log('userFieldsResponses keys:', Object.keys(userFieldsResponses));
  console.log('Hidden fields with values:', hiddenFieldsWithValues);
  console.log('quiz_email present:', !!flattenedResponses.quiz_email);
  console.log('Extracted UTM fields:', utmFields);
  console.log('Extracted setter:', setter);
  
  return { setter, mergedResponses, mergedMetadata };
}

// Duplicate detection
async function findExistingEvent(
  supabase: SupabaseClient,
  calcomBookingUid: string,
  leadEmail: string,
  scheduledAt: string,
  organizationId: string
): Promise<{ id: string } | null> {
  // 1. Check by Cal.com booking UID (primary)
  if (calcomBookingUid) {
    const { data: byUid } = await supabase
      .from('events')
      .select('id')
      .eq('calcom_booking_uid', calcomBookingUid)
      .maybeSingle();
    if (byUid) return byUid;
  }

  // 2. Fallback: email + scheduled_at (2 min tolerance) + platform
  if (leadEmail && scheduledAt && organizationId) {
    const schedTime = new Date(scheduledAt);
    const minTime = new Date(schedTime.getTime() - 120000).toISOString();
    const maxTime = new Date(schedTime.getTime() + 120000).toISOString();
    
    const { data: byEmailTime } = await supabase
      .from('events')
      .select('id')
      .eq('lead_email', leadEmail)
      .eq('organization_id', organizationId)
      .eq('booking_platform', 'calcom')
      .gte('scheduled_at', minTime)
      .lte('scheduled_at', maxTime)
      .maybeSingle();
    if (byEmailTime) return byEmailTime;
  }

  return null;
}

// Handle reschedule chain
async function handleReschedule(
  supabase: SupabaseClient,
  payload: CalcomPayload['payload'],
  organizationId: string
): Promise<void> {
  if (payload.rescheduledFromUid) {
    console.log('Marking original booking as rescheduled:', payload.rescheduledFromUid);
    const { error } = await supabase
      .from('events')
      .update({ 
        call_status: 'rescheduled',
        pcf_submitted: true,
        rescheduled_to_uid: payload.uid,
      })
      .eq('calcom_booking_uid', payload.rescheduledFromUid)
      .eq('organization_id', organizationId);
    
    if (error) {
      console.error('Failed to mark original as rescheduled:', error);
    }
  }
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

  // Rate limiting
  const clientIp = getClientIdentifier(req);
  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'calcom-webhook');
  
  if (!rateLimitResult.allowed) {
    console.warn(`Rate limit exceeded for ${clientIp} on calcom-webhook`);
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const rawBody = await req.text();
    const webhookData: CalcomPayload = JSON.parse(rawBody);
    
    const triggerEvent = webhookData.triggerEvent;
    const payload = webhookData.payload;
    
    console.log("Received Cal.com webhook event:", triggerEvent);

    // Resolve organization
    const organizationId = await resolveOrganization(supabase, payload, orgIdFromUrl);

    // Capture request headers for audit
    const requestHeaders: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'x-api-key', 'cookie'];
    req.headers.forEach((value, key) => {
      if (sensitiveHeaders.some(s => key.toLowerCase().includes(s))) {
        requestHeaders[key] = '[REDACTED]';
      } else {
        requestHeaders[key] = value;
      }
    });

    // Insert audit record
    try {
      await supabase.from('calcom_webhook_audit').insert({
        event_type: triggerEvent,
        booking_uid: payload.uid,
        attendee_email: payload.attendees?.[0]?.email?.toLowerCase(),
        organizer_email: payload.organizer?.email?.toLowerCase(),
        event_type_title: payload.eventType?.title,
        scheduled_at: payload.startTime,
        reschedule_uid: payload.rescheduledFromUid,
        reschedule_reason: payload.rescheduleReason,
        no_show_host: payload.noShowHost,
        no_show_guest: payload.attendees?.[0]?.noShow,
        meeting_started_at: payload.meetingStartedAt,
        meeting_ended_at: payload.meetingEndedAt,
        recording_url: payload.recordingUrl,
        full_payload: webhookData,
        request_headers: requestHeaders,
        request_ip: clientIp,
        organization_id: organizationId,
        processing_result: 'processing',
      });
    } catch (auditErr) {
      console.error('Audit log insert failed (non-fatal):', auditErr);
    }

    // Handle different event types
    if (triggerEvent === 'BOOKING_CREATED' || triggerEvent === 'BOOKING_RESCHEDULED') {
      const leadEmail = payload.attendees?.[0]?.email?.toLowerCase();
      const leadName = payload.attendees?.[0]?.name || 'Unknown';
      const leadPhone = payload.attendees?.[0]?.phoneNumber || null;
      const closerEmail = payload.organizer?.email?.toLowerCase();
      const closerName = payload.organizer?.name || 'Unknown';
      const scheduledAt = payload.startTime;
      const bookedAt = webhookData.createdAt;
      const eventName = payload.eventType?.title || payload.title;
      const { setter, mergedResponses, mergedMetadata } = extractSetterAndMetadata(payload);
      
      // Attempt IGHANDLE → setter resolution if no setter found
      let setterName = setter;
      if (!setterName && organizationId) {
        const igHandle = mergedResponses.IGHANDLE || mergedResponses.ighandle || 
                         mergedResponses['IG Handle'] || mergedResponses['ig_handle'];
        
        if (igHandle && typeof igHandle === 'string') {
          const normalizedHandle = igHandle.replace(/^@/, '').toLowerCase().trim();
          if (normalizedHandle) {
            console.log(`Attempting IGHANDLE → setter resolution: ${igHandle}`);
            
            const { data: aliasMatch } = await supabase
              .from('setter_aliases')
              .select('canonical_name')
              .ilike('alias', `%${normalizedHandle}%`)
              .eq('organization_id', organizationId)
              .limit(1)
              .maybeSingle();
            
            if (aliasMatch?.canonical_name) {
              setterName = aliasMatch.canonical_name;
              console.log(`Resolved setter from IGHANDLE: ${igHandle} → ${setterName}`);
            }
          }
        }
      }

      if (!leadEmail) {
        console.error('No attendee email found in Cal.com webhook');
        return new Response(JSON.stringify({ error: 'No attendee email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (!organizationId) {
        console.warn('Could not determine organization_id for Cal.com webhook');
      }

      // Handle reschedule chain (Cal.com provides this natively!)
      if (organizationId) {
        await handleReschedule(supabase, payload, organizationId);
      }

      // Check for existing event
      const existingEvent = await findExistingEvent(
        supabase,
        payload.uid,
        leadEmail,
        scheduledAt,
        organizationId || ''
      );

      const eventRecord = {
        lead_email: leadEmail,
        lead_name: leadName,
        lead_phone: leadPhone,
        closer_email: closerEmail,
        closer_name: closerName,
        scheduled_at: scheduledAt,
        booked_at: bookedAt,
        event_name: eventName,
        organization_id: organizationId,
        booking_platform: 'calcom',
        calcom_booking_uid: payload.uid,
        calcom_event_type_id: payload.eventType?.id?.toString(),
        rescheduled_from_uid: payload.rescheduledFromUid || null,
        reschedule_reason: payload.rescheduleReason || null,
        booking_responses: mergedResponses,
        booking_metadata: mergedMetadata,
        setter_name: setterName,
        call_status: 'scheduled',
        pcf_submitted: false,
      };

      if (existingEvent) {
        console.log('Updating existing Cal.com event:', existingEvent.id);
        const { error: updateError } = await supabase
          .from('events')
          .update({
            ...eventRecord,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingEvent.id);

        if (updateError) {
          console.error('Error updating Cal.com event:', updateError);
          throw updateError;
        }
      } else {
        console.log('Creating new Cal.com event for:', leadEmail);
        const { error: insertError } = await supabase
          .from('events')
          .insert(eventRecord);

        if (insertError) {
          console.error('Error creating Cal.com event:', insertError);
          throw insertError;
        }
      }

      console.log('Successfully processed Cal.com booking for:', leadEmail);
    }

    else if (triggerEvent === 'BOOKING_CANCELLED') {
      const { error } = await supabase
        .from('events')
        .update({
          call_status: 'canceled',
          cancellation_reason: payload.cancellationReason,
          updated_at: new Date().toISOString(),
        })
        .eq('calcom_booking_uid', payload.uid);

      if (error) {
        console.error('Error canceling Cal.com event:', error);
      } else {
        console.log('Marked Cal.com event as canceled:', payload.uid);
      }
    }

    else if (triggerEvent === 'BOOKING_NO_SHOW_UPDATED') {
      const noShowGuest = payload.attendees?.[0]?.noShow || false;
      const noShowHost = payload.noShowHost || false;
      
      const { error } = await supabase
        .from('events')
        .update({
          no_show_guest: noShowGuest,
          no_show_host: noShowHost,
          no_show_reported_at: new Date().toISOString(),
          event_outcome: noShowGuest ? 'no_show' : undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('calcom_booking_uid', payload.uid);

      if (error) {
        console.error('Error updating no-show status:', error);
      } else {
        console.log('Updated no-show status for Cal.com event:', payload.uid);
      }
    }

    else if (triggerEvent === 'MEETING_STARTED') {
      const { error } = await supabase
        .from('events')
        .update({
          meeting_started_at: payload.meetingStartedAt || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('calcom_booking_uid', payload.uid);

      if (error) {
        console.error('Error updating meeting start:', error);
      }
    }

    else if (triggerEvent === 'MEETING_ENDED') {
      const startTime = payload.meetingStartedAt ? new Date(payload.meetingStartedAt) : null;
      const endTime = payload.meetingEndedAt ? new Date(payload.meetingEndedAt) : new Date();
      const durationMinutes = startTime ? Math.round((endTime.getTime() - startTime.getTime()) / 60000) : null;

      const { error } = await supabase
        .from('events')
        .update({
          meeting_ended_at: endTime.toISOString(),
          actual_duration_minutes: durationMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq('calcom_booking_uid', payload.uid);

      if (error) {
        console.error('Error updating meeting end:', error);
      }
    }

    else if (triggerEvent === 'RECORDING_READY') {
      const { error } = await supabase
        .from('events')
        .update({
          recording_url: payload.recordingUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('calcom_booking_uid', payload.uid);

      if (error) {
        console.error('Error updating recording URL:', error);
      }
    }

    // Update audit record with success
    try {
      await supabase
        .from('calcom_webhook_audit')
        .update({ processing_result: 'success' })
        .eq('booking_uid', payload.uid)
        .eq('event_type', triggerEvent)
        .order('created_at', { ascending: false })
        .limit(1);
    } catch {}

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error processing Cal.com webhook:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
