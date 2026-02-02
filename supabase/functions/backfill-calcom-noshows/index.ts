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
    const { organizationId, startDate, dryRun = false } = await req.json();

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

    // Default start date: 30 days ago
    const defaultStart = new Date();
    defaultStart.setDate(defaultStart.getDate() - 30);
    const effectiveStart = startDate || defaultStart.toISOString().split('T')[0];

    console.log(`Fetching past Cal.com bookings since ${effectiveStart} for no-show data`);

    // Fetch past bookings from Cal.com
    const url = new URL('https://api.cal.com/v2/bookings');
    url.searchParams.set('status', 'past');
    url.searchParams.set('afterStart', effectiveStart);
    url.searchParams.set('take', '100');
    url.searchParams.set('sortStart', 'desc');

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
    const bookings = data.data || [];

    console.log(`Found ${bookings.length} past Cal.com bookings to check for no-shows`);

    let updated = 0;
    let errors = 0;

    for (const booking of bookings) {
      try {
        const noShowHost = booking.absentHost || false;
        const noShowGuest = booking.attendees?.[0]?.absent || false;

        // Only update if there's a no-show
        if (!noShowHost && !noShowGuest) {
          continue;
        }

        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('events')
            .update({
              no_show_host: noShowHost,
              no_show_guest: noShowGuest,
              no_show_reported_at: new Date().toISOString(),
              event_outcome: noShowGuest ? 'no_show' : undefined,
              updated_at: new Date().toISOString(),
            })
            .eq('calcom_booking_uid', booking.uid)
            .eq('organization_id', organizationId);

          if (updateError) {
            console.error('Error updating event:', updateError);
            errors++;
          } else {
            updated++;
            console.log(`Updated no-show status for booking ${booking.uid}: host=${noShowHost}, guest=${noShowGuest}`);
          }
        } else {
          console.log(`Would update booking ${booking.uid}: host=${noShowHost}, guest=${noShowGuest}`);
          updated++;
        }
      } catch (err) {
        console.error(`Error processing booking ${booking.uid}:`, err);
        errors++;
      }
    }

    console.log(`No-show backfill complete: updated=${updated}, errors=${errors}`);

    return new Response(JSON.stringify({
      success: true,
      dryRun,
      totalProcessed: bookings.length,
      updated,
      errors,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in backfill-calcom-noshows:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
