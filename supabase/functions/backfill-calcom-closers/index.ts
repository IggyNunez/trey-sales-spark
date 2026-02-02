import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    const { organizationId, batchSize = 50, dryRun = false } = await req.json();

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

    // Find events missing closer data
    const { data: events, error: fetchError } = await supabase
      .from('events')
      .select('id, calcom_booking_uid')
      .eq('organization_id', organizationId)
      .eq('booking_platform', 'calcom')
      .is('closer_name', null)
      .not('calcom_booking_uid', 'is', null)
      .limit(batchSize);

    if (fetchError) {
      console.error('Error fetching events:', fetchError);
      throw fetchError;
    }

    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No events need closer backfill',
        updated: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${events.length} Cal.com events missing closer data`);

    let updated = 0;
    let errors = 0;

    for (const event of events) {
      try {
        // Fetch booking from Cal.com API
        const response = await fetch(`https://api.cal.com/v2/bookings/${event.calcom_booking_uid}`, {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'cal-api-version': '2024-08-13',
          },
        });

        if (!response.ok) {
          console.error(`Failed to fetch booking ${event.calcom_booking_uid}:`, response.status);
          errors++;
          continue;
        }

        const data = await response.json();
        const booking = data.data || data;

        const closerName = booking.user?.name || booking.organizer?.name;
        const closerEmail = (booking.user?.email || booking.organizer?.email)?.toLowerCase();

        if (closerName || closerEmail) {
          if (!dryRun) {
            const { error: updateError } = await supabase
              .from('events')
              .update({
                closer_name: closerName,
                closer_email: closerEmail,
                updated_at: new Date().toISOString(),
              })
              .eq('id', event.id);

            if (updateError) {
              console.error('Error updating event:', updateError);
              errors++;
            } else {
              updated++;
            }
          } else {
            console.log(`Would update event ${event.id} with closer: ${closerName} (${closerEmail})`);
            updated++;
          }
        }

        // Rate limit protection
        await new Promise(r => setTimeout(r, 100));
      } catch (err) {
        console.error(`Error processing event ${event.id}:`, err);
        errors++;
      }
    }

    console.log(`Backfill complete: updated=${updated}, errors=${errors}`);

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      totalProcessed: events.length,
      updated,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in backfill-calcom-closers:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
