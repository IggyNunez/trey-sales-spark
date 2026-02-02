import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface CalendlyEvent {
  uri: string;
  name: string;
  start_time: string;
  end_time: string;
  event_type: string;
  status: string;
  created_at: string;
  invitees_counter: {
    total: number;
    active: number;
  };
  event_memberships?: Array<{
    user: string;
    user_email?: string;
    user_name?: string;
  }>;
}

interface CalendlyInvitee {
  uri: string;
  name: string;
  email: string;
  text_reminder_number: string | null;
  status: string;
  created_at: string; // When the invitee actually booked the appointment
  questions_and_answers?: Array<{
    question: string;
    answer: string;
  }>;
  tracking?: {
    utm_source?: string;
    utm_medium?: string;
    utm_term?: string;
    source?: string;
    platform?: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { filterName, startDate, organizationId } = await req.json();
    
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
    
    console.log(`Syncing Calendly for organization: ${orgData?.name || 'Unknown'} (${organizationId})`);

    // STRICT ORG ISOLATION: Get Calendly API key using encrypted key helper (enables lazy migration)
    const CALENDLY_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'calendly', 'sync-calendly');

    if (!CALENDLY_API_KEY) {
      console.error(`No Calendly API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Calendly API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using encrypted Calendly API key for ${orgData?.name}`);

    const searchFilter = filterName || '';
    
    // Normalize filter: lowercase and remove spaces, dashes, underscores for matching
    const normalizedFilter = searchFilter.toLowerCase().replace(/[\s\-_]+/g, '');
    
    // Default to today if no start date provided (start of day)
    const minStartTime = startDate ? new Date(startDate) : new Date();
    if (!startDate) {
      minStartTime.setHours(0, 0, 0, 0);
    }

    console.log('Syncing Calendly events with filter:', searchFilter);
    console.log('From date:', minStartTime.toISOString());

    // First, get the current user's URI
    const userResponse = await fetch('https://api.calendly.com/users/me', {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!userResponse.ok) {
      const errorText = await userResponse.text();
      console.error('Calendly user API error:', userResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to authenticate with Calendly' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userData = await userResponse.json();
    const userUri = userData.resource.uri;
    const organizationUri = userData.resource.current_organization;

    console.log('Calendly user:', userData.resource.name);
    console.log('Organization:', organizationUri);

    // Fetch scheduled events (don't filter by status to include past events too)
    const eventsUrl = new URL('https://api.calendly.com/scheduled_events');
    eventsUrl.searchParams.append('organization', organizationUri);
    eventsUrl.searchParams.append('min_start_time', minStartTime.toISOString());
    eventsUrl.searchParams.append('count', '100');

    const eventsResponse = await fetch(eventsUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!eventsResponse.ok) {
      const errorText = await eventsResponse.text();
      console.error('Calendly events API error:', eventsResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Calendly events' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const eventsData = await eventsResponse.json();
    const allEvents: CalendlyEvent[] = eventsData.collection || [];

    // Filter events by name containing the search filter (case, space, dash insensitive)
    const filteredEvents = allEvents.filter(event => {
      const normalizedEventName = event.name.toLowerCase().replace(/[\s\-_]+/g, '');
      return normalizedEventName.includes(normalizedFilter);
    });

    // Cache for user details (host names and emails)
    const userCache: Record<string, { name: string; email: string }> = {};

    console.log(`Found ${filteredEvents.length} events matching "${searchFilter}" out of ${allEvents.length} total`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Process each event
    for (const event of filteredEvents) {
      const eventUuid = event.uri.split('/').pop();

      // Get the host (closer) from event memberships
      let closerName: string | null = null;
      let closerEmail: string | null = null;
      if (event.event_memberships && event.event_memberships.length > 0) {
        const hostUserUri = event.event_memberships[0].user;
        
        // Check cache first
        if (userCache[hostUserUri]) {
          closerName = userCache[hostUserUri].name;
          closerEmail = userCache[hostUserUri].email;
        } else {
          // Fetch user details
          try {
            const userDetailsResponse = await fetch(hostUserUri, {
              headers: {
                'Authorization': `Bearer ${CALENDLY_API_KEY}`,
                'Content-Type': 'application/json',
              },
            });
            if (userDetailsResponse.ok) {
              const userDetails = await userDetailsResponse.json();
              closerName = userDetails.resource?.name || null;
              closerEmail = userDetails.resource?.email || null;
              if (closerName && closerEmail) {
                userCache[hostUserUri] = { name: closerName, email: closerEmail };
              }
            }
          } catch (e) {
            console.error('Failed to fetch host details:', e);
          }
        }
      }

      console.log(`Event ${eventUuid} host/closer: ${closerName} (${closerEmail})`);

      console.log(`Event ${eventUuid} host/closer: ${closerName}`);

      // Get invitees for this event
      const inviteesUrl = `${event.uri}/invitees`;
      const inviteesResponse = await fetch(inviteesUrl, {
        headers: {
          'Authorization': `Bearer ${CALENDLY_API_KEY}`,
          'Content-Type': 'application/json',
        },
      });

      if (!inviteesResponse.ok) {
        console.error('Failed to fetch invitees for event:', eventUuid);
        skipped++;
        continue;
      }

      const inviteesData = await inviteesResponse.json();
      const invitees: CalendlyInvitee[] = inviteesData.collection || [];

      for (const invitee of invitees) {
        const inviteeUuid = invitee.uri.split('/').pop();
        const leadEmail = invitee.email?.toLowerCase();
        const leadName = invitee.name || 'Unknown';
        const leadPhone = invitee.text_reminder_number || null;
        
        // Determine the call status based on invitee status
        // If invitee is canceled, we need to check if there's a reschedule
        let callStatus = 'scheduled';
        if (invitee.status === 'canceled') {
          // Check if there's another scheduled event for the same lead and event type
          const { data: otherEvents } = await supabase
            .from('events')
            .select('id')
            .eq('lead_email', leadEmail)
            .eq('event_name', event.name)
            .eq('call_status', 'scheduled')
            .neq('calendly_invitee_uuid', inviteeUuid);
          
          // If there's another scheduled event of the same type, this is a reschedule
          callStatus = (otherEvents && otherEvents.length > 0) ? 'rescheduled' : 'canceled';
        }

        // Extract setter from questions
        let setterName = null;
        if (invitee.questions_and_answers) {
          const setterQuestion = invitee.questions_and_answers.find(
            q => q.question?.toLowerCase().includes('setter') || 
                 q.question?.toLowerCase().includes('who referred')
          );
          if (setterQuestion) {
            setterName = setterQuestion.answer;
          }
        }
        
        // Also check tracking.utm_term for setter (some integrations pass it here)
        // But only if it looks like a real name (not a user ID like "user_xxx...")
        if (!setterName && invitee.tracking?.utm_term) {
          const utmTerm = invitee.tracking.utm_term;
          // Only use utm_term if it doesn't look like a system ID
          if (!utmTerm.startsWith('user_') && !utmTerm.match(/^[a-z0-9]{20,}$/i)) {
            setterName = utmTerm;
            console.log('Using setter from utm_term:', setterName);
          }
        }

        // Extract source from tracking
        let sourceValue = invitee.tracking?.source || 
                          invitee.tracking?.platform || 
                          invitee.tracking?.utm_source || 
                          null;

        // Check if event already exists by Calendly UUIDs
        const { data: existingEventByUuid } = await supabase
          .from('events')
          .select('id, call_status')
          .eq('calendly_event_uuid', eventUuid)
          .eq('calendly_invitee_uuid', inviteeUuid)
          .maybeSingle();

        // Also check for events that match by email + scheduled time (legacy records without Calendly UUIDs)
        let existingEvent = existingEventByUuid;
        if (!existingEvent) {
          const { data: existingEventByMatch } = await supabase
            .from('events')
            .select('id, call_status')
            .eq('lead_email', leadEmail)
            .eq('scheduled_at', event.start_time)
            .eq('organization_id', organizationId)
            .is('calendly_invitee_uuid', null)
            .maybeSingle();
          existingEvent = existingEventByMatch;
        }

        if (existingEvent) {
          // Only update call_status if the invitee is canceled and our record is still scheduled
          // Don't overwrite statuses that have been set by PCF (e.g., completed)
          const shouldUpdateStatus = invitee.status === 'canceled' && existingEvent.call_status === 'scheduled';
          const newCallStatus = shouldUpdateStatus ? callStatus : existingEvent.call_status;
          
          // Update existing with closer name, email, event name, booked_at, and Calendly UUIDs
          await supabase
            .from('events')
            .update({
              calendly_event_uuid: eventUuid,
              calendly_invitee_uuid: inviteeUuid,
              lead_name: leadName,
              lead_email: leadEmail,
              lead_phone: leadPhone,
              scheduled_at: event.start_time,
              booked_at: invitee.created_at, // When the invitee actually booked the appointment
              setter_name: setterName,
              closer_name: closerName,
              closer_email: closerEmail,
              event_name: event.name,
              call_status: newCallStatus,
              // Auto-complete PCF for canceled/rescheduled
              ...(shouldUpdateStatus ? { pcf_submitted: true } : {}),
            })
            .eq('id', existingEvent.id);
          updated++;
        } else {
          // Upsert lead first
          const { data: lead } = await supabase
            .from('leads')
            .upsert({
              email: leadEmail,
              full_name: leadName,
              phone: leadPhone,
              original_setter_name: setterName,
              current_setter_name: setterName,
              organization_id: organizationId,
            }, { onConflict: 'email' })
            .select()
            .single();

          // Find or create source for this org
          let sourceId = null;
          if (sourceValue) {
            const { data: sources } = await supabase
              .from('sources')
              .select('id, name')
              .eq('organization_id', organizationId);
            sourceId = sources?.find(s => 
              s.name.toLowerCase() === sourceValue!.toLowerCase()
            )?.id || null;

            if (!sourceId) {
              const { data: newSource } = await supabase
                .from('sources')
                .insert({ name: sourceValue, organization_id: organizationId })
                .select('id')
                .single();
              sourceId = newSource?.id || null;
            }
          }

          // Create event with closer name, email, event name, and booked_at from invitee
          // Use callStatus which accounts for canceled/rescheduled invitees
          const isCanceledOrRescheduled = callStatus === 'canceled' || callStatus === 'rescheduled';
          const { data: newEvent } = await supabase.from('events').insert({
            calendly_event_uuid: eventUuid,
            calendly_invitee_uuid: inviteeUuid,
            lead_id: lead?.id || null,
            lead_name: leadName,
            lead_email: leadEmail,
            lead_phone: leadPhone,
            scheduled_at: event.start_time,
            booked_at: invitee.created_at, // When the invitee actually booked the appointment
            setter_name: setterName,
            closer_name: closerName,
            closer_email: closerEmail,
            event_name: event.name,
            source_id: sourceId,
            call_status: callStatus,
            organization_id: organizationId,
            // Auto-complete PCF for canceled/rescheduled
            pcf_submitted: isCanceledOrRescheduled,
          }).select('id').single();

          // When inserting a NEW scheduled event, check if there are CANCELED or SCHEDULED events
          // for the same lead/event type and mark them as rescheduled
          if (callStatus === 'scheduled' && leadEmail && event.name && organizationId) {
            // Check for canceled events
            const { data: canceledEvents } = await supabase
              .from('events')
              .select('id')
              .eq('lead_email', leadEmail)
              .eq('event_name', event.name)
              .eq('call_status', 'canceled')
              .eq('organization_id', organizationId)
              .neq('calendly_invitee_uuid', inviteeUuid);

            if (canceledEvents && canceledEvents.length > 0) {
              for (const canceledEvent of canceledEvents) {
                console.log(`Marking canceled event ${canceledEvent.id} as rescheduled (same lead ${leadEmail} has new booking)`);
                await supabase
                  .from('events')
                  .update({ call_status: 'rescheduled', pcf_submitted: true })
                  .eq('id', canceledEvent.id);
              }
            }

            // NEW: Also check for other scheduled events - mark older ones as rescheduled
            const { data: scheduledEvents } = await supabase
              .from('events')
              .select('id')
              .eq('lead_email', leadEmail)
              .eq('event_name', event.name)
              .eq('call_status', 'scheduled')
              .eq('organization_id', organizationId)
              .neq('calendly_invitee_uuid', inviteeUuid);

            if (scheduledEvents && scheduledEvents.length > 0) {
              for (const oldEvent of scheduledEvents) {
                console.log(`Marking scheduled event ${oldEvent.id} as rescheduled (same lead ${leadEmail} has newer booking)`);
                await supabase
                  .from('events')
                  .update({ call_status: 'rescheduled', pcf_submitted: true })
                  .eq('id', oldEvent.id);
              }
            }
          }

          // Fetch setter from Close CRM if we don't have one from Calendly
          if (newEvent && !setterName) {
            try {
              const closeResponse = await fetch(`${SUPABASE_URL}/functions/v1/fetch-close-source`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                },
                body: JSON.stringify({
                  leadEmail: leadEmail,
                  eventId: newEvent.id,
                  organizationId: organizationId,
                }),
              });
              if (closeResponse.ok) {
                const closeData = await closeResponse.json();
                console.log('Close sync result for', leadEmail, ':', closeData);
              }
            } catch (e) {
              console.error('Failed to fetch from Close:', e);
            }
          }
          
          created++;
        }
      }
    }

    console.log(`Sync complete: ${created} created, ${updated} updated, ${skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: filteredEvents.length,
        created,
        updated,
        skipped,
        filter: searchFilter,
        fromDate: minStartTime.toISOString(),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sync-calendly:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
