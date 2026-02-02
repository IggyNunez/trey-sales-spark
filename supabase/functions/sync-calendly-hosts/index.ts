import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { organizationId } = await req.json();
    
    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Calendly API key using encrypted key helper (enables lazy migration)
    const CALENDLY_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'calendly', 'sync-calendly-hosts');

    if (!CALENDLY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Calendly API key not configured. Please add your API key in Settings → Integrations.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Using encrypted Calendly API key for sync-calendly-hosts');

    // Get the current user to find their organization
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
    const organizationUri = userData.resource.current_organization;

    console.log('Fetching organization members from:', organizationUri);

    // Fetch organization members (all hosts in the Calendly organization)
    const membersUrl = new URL('https://api.calendly.com/organization_memberships');
    membersUrl.searchParams.append('organization', organizationUri);
    membersUrl.searchParams.append('count', '100');

    const membersResponse = await fetch(membersUrl.toString(), {
      headers: {
        'Authorization': `Bearer ${CALENDLY_API_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!membersResponse.ok) {
      const errorText = await membersResponse.text();
      console.error('Calendly members API error:', membersResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Calendly organization members' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const membersData = await membersResponse.json();
    const members = membersData.collection || [];

    console.log(`Found ${members.length} Calendly organization members`);

    // Get existing closers for this org
    const { data: existingClosers } = await supabase
      .from('closers')
      .select('id, name, email')
      .eq('organization_id', organizationId);

    const existingEmails = new Set((existingClosers || []).map(c => c.email?.toLowerCase()).filter(Boolean));
    const existingNames = new Set((existingClosers || []).map(c => c.name?.toLowerCase().trim()).filter(Boolean));

    let added = 0;
    let skipped = 0;
    const addedClosers: { name: string; email: string }[] = [];

    for (const member of members) {
      const user = member.user;
      if (!user) continue;

      const name = user.name;
      const email = user.email?.toLowerCase();

      if (!name || !email) {
        console.log('Skipping member without name or email:', user);
        skipped++;
        continue;
      }

      // Check if already exists (by email or by exact name)
      if (existingEmails.has(email) || existingNames.has(name.toLowerCase().trim())) {
        console.log(`Skipping existing closer: ${name} (${email})`);
        skipped++;
        continue;
      }

      // Add new closer
      const { error: insertError } = await supabase
        .from('closers')
        .insert({
          name,
          email,
          organization_id: organizationId,
          is_active: true,
        });

      if (insertError) {
        console.error(`Failed to add closer ${name}:`, insertError);
        skipped++;
      } else {
        console.log(`Added closer: ${name} (${email})`);
        added++;
        addedClosers.push({ name, email });
        // Update our tracking sets
        existingEmails.add(email);
        existingNames.add(name.toLowerCase().trim());
      }
    }

    console.log(`Sync complete: ${added} added, ${skipped} skipped`);

    return new Response(
      JSON.stringify({
        success: true,
        totalFound: members.length,
        added,
        skipped,
        addedClosers,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in sync-calendly-hosts:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
