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
    const { organizationId, createMissing = true } = await req.json();

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

    console.log('Fetching Cal.com team members/hosts');

    // Fetch users from Cal.com
    // Note: This endpoint may vary based on Cal.com plan and API version
    const usersResponse = await fetch('https://api.cal.com/v2/me', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'cal-api-version': '2024-08-13',
      },
    });

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      console.error('Cal.com API error:', errorText);
      throw new Error(`Cal.com API error: ${usersResponse.status}`);
    }

    const userData = await usersResponse.json();
    const users = Array.isArray(userData.data) ? userData.data : [userData.data];

    console.log(`Found ${users.length} Cal.com user(s)`);

    // Also try to get team members if on a team plan
    let teamMembers: any[] = [];
    try {
      const teamsResponse = await fetch('https://api.cal.com/v2/teams', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'cal-api-version': '2024-08-13',
        },
      });

      if (teamsResponse.ok) {
        const teamsData = await teamsResponse.json();
        const teams = teamsData.data || [];

        for (const team of teams) {
          const membersResponse = await fetch(`https://api.cal.com/v2/teams/${team.id}/members`, {
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'cal-api-version': '2024-08-13',
            },
          });

          if (membersResponse.ok) {
            const membersData = await membersResponse.json();
            teamMembers.push(...(membersData.data || []));
          }
        }
      }
    } catch (err) {
      console.log('Could not fetch team members (may not be on team plan):', err);
    }

    // Combine and dedupe users
    const allUsers = [...users, ...teamMembers];
    const uniqueEmails = new Set<string>();
    const uniqueUsers = allUsers.filter(u => {
      const email = u.email?.toLowerCase();
      if (!email || uniqueEmails.has(email)) return false;
      uniqueEmails.add(email);
      return true;
    });

    console.log(`Processing ${uniqueUsers.length} unique Cal.com hosts`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const user of uniqueUsers) {
      const email = user.email?.toLowerCase();
      const name = user.name || user.username || email;

      if (!email) {
        skipped++;
        continue;
      }

      // Check if closer already exists
      const { data: existingCloser } = await supabase
        .from('closers')
        .select('id, name')
        .eq('email', email)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (existingCloser) {
        // Update if name changed
        if (existingCloser.name !== name) {
          await supabase
            .from('closers')
            .update({ name, is_active: true })
            .eq('id', existingCloser.id);
          updated++;
        } else {
          skipped++;
        }
      } else if (createMissing) {
        // Create new closer
        const { error: insertError } = await supabase
          .from('closers')
          .insert({
            name,
            email,
            organization_id: organizationId,
            is_active: true,
          });

        if (insertError) {
          console.error('Error creating closer:', insertError);
        } else {
          created++;
        }
      } else {
        skipped++;
      }
    }

    console.log(`Sync complete: created=${created}, updated=${updated}, skipped=${skipped}`);

    return new Response(JSON.stringify({
      success: true,
      totalHosts: uniqueUsers.length,
      created,
      updated,
      skipped,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in sync-calcom-hosts:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
