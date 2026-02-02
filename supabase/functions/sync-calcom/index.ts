import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

interface SyncCalcomParams {
  organizationId: string;
  startDate?: string;
  endDate?: string;
  eventTypeId?: number;
  filterName?: string;
  status?: 'upcoming' | 'past' | 'cancelled' | 'all';
  dryRun?: boolean;
  excludedEventTypeIds?: string[];
}

interface CalcomBooking {
  uid: string;
  title: string;
  // Cal.com API v2 uses 'start' and 'end' instead of 'startTime' and 'endTime'
  start: string;
  end: string;
  startTime?: string; // Keep for backwards compatibility
  endTime?: string;
  status: string;
  createdAt: string;
  eventType?: {
    id: number;
    title: string;
    slug: string;
    length: number;
  };
  // API v2 uses 'hosts' array instead of 'user'
  hosts?: Array<{
    id: number;
    name: string;
    email: string;
    timeZone?: string;
  }>;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  attendees?: Array<{
    email: string;
    name: string;
    phoneNumber?: string;
    absent?: boolean;
  }>;
  // API v2 uses bookingFieldsResponses for all custom fields and UTM
  bookingFieldsResponses?: Record<string, unknown>;
  // Legacy fields (may be empty in v2)
  responses?: Record<string, string>;
  metadata?: Record<string, string>;
  rescheduledFromUid?: string;
  rescheduleReason?: string;
  absentHost?: boolean;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const params: SyncCalcomParams & { debug?: boolean; limit?: number; forceUpdate?: boolean } = await req.json();
    const { organizationId, startDate, endDate, eventTypeId, filterName, status, dryRun, debug, limit, forceUpdate, excludedEventTypeIds } = params;

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Cal.com API key
    const decryptResponse = await fetch(`${supabaseUrl}/functions/v1/manage-api-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        action: 'decrypt',
        organizationId,
        keyType: 'calcom',
      }),
    });

    if (!decryptResponse.ok) {
      return new Response(JSON.stringify({ error: 'Cal.com API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { apiKey } = await decryptResponse.json();

    // Fetch bookings from Cal.com with pagination
    const bookings: CalcomBooking[] = [];
    let hasMore = true;
    let skip = 0;
    const take = 100;

    // Default date range: last 30 days to today
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    const effectiveStart = startDate || defaultStart.toISOString().split('T')[0];
    const effectiveEnd = endDate || new Date().toISOString().split('T')[0];

    console.log(`Syncing Cal.com bookings from ${effectiveStart} to ${effectiveEnd}`);

    while (hasMore) {
      const url = new URL('https://api.cal.com/v2/bookings');
      url.searchParams.set('afterStart', effectiveStart);
      url.searchParams.set('beforeEnd', effectiveEnd);
      url.searchParams.set('take', take.toString());
      url.searchParams.set('skip', skip.toString());
      url.searchParams.set('sortStart', 'asc');

      if (status && status !== 'all') {
        url.searchParams.set('status', status);
      }

      if (eventTypeId) {
        url.searchParams.set('eventTypeId', eventTypeId.toString());
      }

      console.log(`Fetching Cal.com bookings: skip=${skip}, take=${take}`);

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': '2024-08-13',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Cal.com API error:', errorText);
        throw new Error(`Cal.com API error: ${response.status}`);
      }

      const data = await response.json();
      const pageBookings = data.data || [];
      
      // Debug: log raw payload for first booking
      if (debug && pageBookings.length > 0 && bookings.length === 0) {
        console.log('=== RAW CAL.COM BOOKING PAYLOAD ===');
        console.log(JSON.stringify(pageBookings[0], null, 2));
        console.log('=== END RAW PAYLOAD ===');
      }
      
      // Filter by name if specified
      let filteredBookings = filterName
        ? pageBookings.filter((b: CalcomBooking) => 
            b.eventType?.title?.toLowerCase().includes(filterName.toLowerCase()) ||
            b.title?.toLowerCase().includes(filterName.toLowerCase())
          )
        : pageBookings;
      
      // Filter out excluded event types
      if (excludedEventTypeIds && excludedEventTypeIds.length > 0) {
        const excludedSet = new Set(excludedEventTypeIds);
        filteredBookings = filteredBookings.filter((b: CalcomBooking) => {
          const eventTypeId = b.eventType?.id?.toString();
          return !eventTypeId || !excludedSet.has(eventTypeId);
        });
      }

      bookings.push(...filteredBookings);
      
      // If limit is set, stop early
      if (limit && bookings.length >= limit) {
        bookings.length = limit;
        hasMore = false;
        break;
      }
      
      hasMore = data.pagination?.hasNextPage || pageBookings.length === take;
      skip += take;

      // Rate limit protection
      await new Promise(r => setTimeout(r, 100));

      // Safety limit
      if (bookings.length > 10000) {
        console.warn('Reached safety limit of 10000 bookings');
        break;
      }
    }

    console.log(`Found ${bookings.length} Cal.com bookings to process`);

    // Process bookings
    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

    for (const booking of bookings) {
      try {
        const leadEmail = booking.attendees?.[0]?.email?.toLowerCase();
        // Cal.com API v2 uses 'start' not 'startTime'
        const scheduledAt = booking.start || booking.startTime;

        if (!leadEmail || !scheduledAt) {
          console.log(`Skipping booking ${booking.uid}: missing email or scheduledAt`);
          stats.skipped++;
          continue;
        }

        // Check for existing event
        const { data: existing } = await supabase
          .from('events')
          .select('id')
          .eq('calcom_booking_uid', booking.uid)
          .maybeSingle();

        // Skip if exists and not forcing update
        if (existing && !forceUpdate) {
          stats.skipped++;
          continue;
        }

        // Handle reschedule chain
        if (booking.rescheduledFromUid && !dryRun) {
          await supabase
            .from('events')
            .update({ 
              call_status: 'rescheduled', 
              pcf_submitted: true,
              rescheduled_to_uid: booking.uid,
            })
            .eq('calcom_booking_uid', booking.rescheduledFromUid)
            .eq('organization_id', organizationId);
        }

        // Helper to extract .value from nested Cal.com response objects
        // Cal.com sends: { label: "...", value: "Newsletter", isHidden: true }
        const extractResponseValue = (field: unknown): string | null => {
          if (typeof field === 'string') return field;
          if (field && typeof field === 'object' && 'value' in field) {
            const val = (field as { value: unknown }).value;
            if (typeof val === 'string') return val;
          }
          return null;
        };

        // Extract setter and UTM from bookingFieldsResponses (v2 API) or legacy fields
        const bookingFields = booking.bookingFieldsResponses || {};
        const responses = (booking.responses || {}) as Record<string, unknown>;
        const userFieldsResponses = ((booking as unknown as Record<string, unknown>).userFieldsResponses || {}) as Record<string, unknown>;
        const metadata = booking.metadata || {};
        
        // Setter can be in various field names - handle nested objects
        const setterName = 
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
        
        // Merge bookingFieldsResponses into booking_responses for storage
        const mergedResponses = {
          ...flattenedResponses,
          ...Object.fromEntries(
            Object.entries(bookingFields).filter(([_, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
          ),
        };
        
        // Merge UTM fields into metadata
        const mergedMetadata = {
          ...metadata,
          ...utmFields,
        };
        
        // Attempt IGHANDLE → setter resolution if no setter found
        let finalSetterName = setterName;
        if (!finalSetterName) {
          const igHandle = flattenedResponses.IGHANDLE || flattenedResponses.ighandle || 
                           flattenedResponses['IG Handle'] || flattenedResponses['ig_handle'];
          
          if (igHandle && typeof igHandle === 'string') {
            const normalizedHandle = igHandle.replace(/^@/, '').toLowerCase().trim();
            if (normalizedHandle) {
              const { data: aliasMatch } = await supabase
                .from('setter_aliases')
                .select('canonical_name')
                .ilike('alias', `%${normalizedHandle}%`)
                .eq('organization_id', organizationId)
                .limit(1)
                .maybeSingle();
              
              if (aliasMatch?.canonical_name) {
                finalSetterName = aliasMatch.canonical_name;
                if (debug) {
                  console.log(`Resolved setter from IGHANDLE: ${igHandle} → ${finalSetterName}`);
                }
              }
            }
          }
        }
        
        if (debug) {
          const hiddenFieldsWithValues = Object.entries(responses)
            .filter(([_, v]) => v && typeof v === 'object' && 'isHidden' in v && (v as { isHidden: boolean }).isHidden && 'value' in v && (v as { value: unknown }).value)
            .map(([k]) => k);
          
          console.log('=== BOOKING RESPONSES DEBUG ===');
          console.log('responses keys:', Object.keys(responses));
          console.log('userFieldsResponses keys:', Object.keys(userFieldsResponses));
          console.log('Hidden fields with values:', hiddenFieldsWithValues);
          console.log('quiz_email present:', !!flattenedResponses.quiz_email);
          console.log('Extracted UTM fields:', utmFields);
          console.log('Extracted setter:', finalSetterName);
        }

        // Determine call status based on booking status
        let callStatus = 'scheduled';
        if (booking.status === 'cancelled') {
          callStatus = 'canceled';
        }

        // API v2 uses 'hosts' array, fallback to 'user' for compatibility
        const host = booking.hosts?.[0] || booking.user;
        
        const eventRecord = {
          lead_email: leadEmail,
          lead_name: booking.attendees?.[0]?.name || 'Unknown',
          lead_phone: booking.attendees?.[0]?.phoneNumber || null,
          closer_email: host?.email?.toLowerCase(),
          closer_name: host?.name,
          scheduled_at: scheduledAt,
          booked_at: booking.createdAt,
          event_name: booking.eventType?.title || booking.title,
          organization_id: organizationId,
          booking_platform: 'calcom',
          calcom_booking_uid: booking.uid,
          calcom_event_type_id: booking.eventType?.id?.toString(),
          rescheduled_from_uid: booking.rescheduledFromUid || null,
          reschedule_reason: booking.rescheduleReason || null,
          booking_responses: mergedResponses,
          booking_metadata: mergedMetadata,
          setter_name: finalSetterName,
          call_status: callStatus,
          pcf_submitted: false,
          no_show_host: booking.absentHost || false,
        };

        if (!dryRun) {
          if (existing) {
            // Update existing event with new data
            const { error: updateError } = await supabase
              .from('events')
              .update({
                booking_responses: mergedResponses,
                booking_metadata: mergedMetadata,
                setter_name: finalSetterName || undefined,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id);

            if (updateError) {
              console.error('Error updating event:', updateError);
              stats.errors++;
            } else {
              stats.updated++;
            }
          } else {
            // Insert new event
            const { error: insertError } = await supabase
              .from('events')
              .insert(eventRecord);

            if (insertError) {
              console.error('Error inserting event:', insertError);
              stats.errors++;
            } else {
              stats.created++;
            }
          }
        } else {
          if (existing) {
            stats.updated++;
          } else {
            stats.created++;
          }
        }
      } catch (err) {
        console.error('Error processing booking:', err);
        stats.errors++;
      }
    }

    console.log(`Sync complete: created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, errors=${stats.errors}`);

    return new Response(JSON.stringify({
      success: true,
      dryRun: dryRun || false,
      dateRange: { start: effectiveStart, end: effectiveEnd },
      totalBookings: bookings.length,
      ...stats,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sync-calcom:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
