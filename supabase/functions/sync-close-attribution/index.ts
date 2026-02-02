import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

// Background sync function
async function runSync(supabase: any, authHeader: string, orgId: string, startDate?: string, endDate?: string, preserveExisting: boolean = false) {
  console.log(`Starting Close attribution sync... preserveExisting=${preserveExisting}`);

  // Fetch all Close users to resolve user IDs to names
  const usersResponse = await fetch('https://api.close.com/api/v1/user/', {
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
  });

  const userNameCache: Record<string, string> = {};
  if (usersResponse.ok) {
    const usersData = await usersResponse.json();
    for (const user of usersData.data || []) {
      userNameCache[user.id] = user.first_name && user.last_name 
        ? `${user.first_name} ${user.last_name}`.trim()
        : user.email?.split('@')[0] || user.id;
    }
    console.log('Loaded Close users:', Object.keys(userNameCache).length);
  } else {
    console.error('Failed to fetch Close users');
  }

  const resolveUserName = (userId: string | null | undefined): string | null => {
    if (!userId) return null;
    if (userId.startsWith('user_')) {
      return userNameCache[userId] || null;
    }
    return userId;
  };

  // Fetch all custom fields
  const customFieldsResponse = await fetch('https://api.close.com/api/v1/custom_field/lead/', {
    headers: {
      'Authorization': `Basic ${authHeader}`,
      'Content-Type': 'application/json',
    },
  });

  if (!customFieldsResponse.ok) {
    throw new Error('Failed to fetch Close custom fields');
  }

  const customFieldsData = await customFieldsResponse.json();

  // Fetch synced close_field_mappings for this org to know which fields to extract
  const { data: syncedFieldMappings, error: mappingsError } = await supabase
    .from('close_field_mappings')
    .select('*')
    .eq('organization_id', orgId)
    .eq('is_synced', true);

  if (mappingsError) {
    console.error('Failed to fetch close field mappings:', mappingsError);
  }
  
  console.log('Found synced field mappings:', syncedFieldMappings?.length || 0);

  const platformField = customFieldsData.data?.find((f: { name: string }) => 
    f.name.toLowerCase() === 'platform' || f.name.toLowerCase().includes('platform')
  );
  const setterField = customFieldsData.data?.find((f: { name: string }) => 
    f.name === 'Lead Owner | Setter' || 
    (f.name.toLowerCase().includes('lead owner') && f.name.toLowerCase().includes('setter'))
  );
  const closerField = customFieldsData.data?.find((f: { name: string }) => 
    f.name === 'Lead Owner | Closer' || 
    (f.name.toLowerCase().includes('lead owner') && f.name.toLowerCase().includes('closer'))
  );
  const trafficTypeField = customFieldsData.data?.find((f: { name: string }) => 
    f.name.toLowerCase() === 'traffic type' || f.name.toLowerCase().includes('traffic type')
  );

  console.log('Field mappings:', {
    platform: platformField?.name,
    setter: setterField?.name,
    closer: closerField?.name,
    trafficType: trafficTypeField?.name,
  });

  // Build query
  let query = supabase
    .from('payments')
    .select('id, customer_email, source_id, setter_id, closer_id, traffic_type_id')
    .not('customer_email', 'is', null);

  if (startDate && endDate) {
    query = query.gte('payment_date', startDate).lte('payment_date', endDate);
    console.log(`Syncing payments from ${startDate} to ${endDate}`);
  } else {
    query = query.or('source_id.is.null,setter_id.is.null,closer_id.is.null,traffic_type_id.is.null');
    console.log('Syncing payments missing attribution data');
  }

  const { data: payments, error: paymentsError } = await query.order('payment_date', { ascending: false }).limit(500);

  if (paymentsError) {
    throw new Error(`Failed to fetch payments: ${paymentsError.message}`);
  }

  console.log(`Found ${payments?.length || 0} payments to process`);

  const { data: sources } = await supabase.from('sources').select('id, name');
  const { data: trafficTypes } = await supabase.from('traffic_types').select('id, name');
  const { data: setters } = await supabase.from('setters').select('id, name');
  const { data: closers } = await supabase.from('closers').select('id, name');

  let updated = 0;
  let skipped = 0;
  let notFound = 0;
  let errors = 0;

  const leadCache: Record<string, any> = {};

  const findLeadByEmail = async (email: string): Promise<any | null> => {
    try {
      const searchResponse = await fetch(
        `https://api.close.com/api/v1/lead/?query=email:"${encodeURIComponent(email)}"`,
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
          return searchData.data[0];
        }
      }
    } catch (e) {
      console.error(`Strategy 1 failed for ${email}:`, e);
    }

    try {
      const contactResponse = await fetch(
        `https://api.close.com/api/v1/contact/?query=email:"${encodeURIComponent(email)}"`,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (contactResponse.ok) {
        const contactData = await contactResponse.json();
        if (contactData.data && contactData.data.length > 0) {
          const contact = contactData.data[0];
          if (contact.lead_id) {
            const leadResponse = await fetch(
              `https://api.close.com/api/v1/lead/${contact.lead_id}/`,
              {
                headers: {
                  'Authorization': `Basic ${authHeader}`,
                  'Content-Type': 'application/json',
                },
              }
            );
            if (leadResponse.ok) {
              return await leadResponse.json();
            }
          }
        }
      }
    } catch (e) {
      console.error(`Strategy 2 failed for ${email}:`, e);
    }

    try {
      const searchResponse = await fetch(
        `https://api.close.com/api/v1/lead/?query=${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        for (const lead of searchData.data || []) {
          const contacts = lead.contacts || [];
          for (const contact of contacts) {
            const emails = contact.emails || [];
            for (const emailObj of emails) {
              if (emailObj.email?.toLowerCase() === email.toLowerCase()) {
                return lead;
              }
            }
          }
        }
      }
    } catch (e) {
      console.error(`Strategy 3 failed for ${email}:`, e);
    }

    return null;
  };

  for (const payment of payments || []) {
    const email = payment.customer_email?.toLowerCase()?.trim();
    if (!email) {
      skipped++;
      continue;
    }

    let leadData = leadCache[email];
    
    if (!leadData) {
      try {
        leadData = await findLeadByEmail(email);
        if (leadData) {
          leadCache[email] = leadData;
        }
      } catch (e) {
        console.error(`Error fetching lead for ${email}:`, e);
        errors++;
        continue;
      }
    }

    if (!leadData) {
      console.log(`Lead not found in Close for: ${email}`);
      notFound++;
      continue;
    }

    const platformValue = platformField ? leadData[`custom.${platformField.id}`] : null;
    const rawSetterValue = setterField ? leadData[`custom.${setterField.id}`] : null;
    const rawCloserValue = closerField ? leadData[`custom.${closerField.id}`] : null;
    const trafficTypeValue = trafficTypeField ? leadData[`custom.${trafficTypeField.id}`] : null;

    const setterName = resolveUserName(rawSetterValue);
    const closerName = resolveUserName(rawCloserValue);

    console.log(`${email}: platform=${platformValue}, setter=${setterName}, closer=${closerName}, traffic=${trafficTypeValue}`);

    let sourceId: string | null = null;
    let setterId: string | null = null;
    let closerId: string | null = null;
    let trafficTypeId: string | null = null;

    if (platformValue) {
      const matchedSource = sources?.find((s: any) => 
        s.name.toLowerCase() === platformValue.toLowerCase()
      );
      if (matchedSource) {
        sourceId = matchedSource.id;
      } else {
        const { data: newSource } = await supabase
          .from('sources')
          .insert({ name: platformValue })
          .select('id')
          .single();
        if (newSource) {
          sourceId = newSource.id;
          sources?.push({ id: newSource.id, name: platformValue });
        }
      }
    }

    if (setterName) {
      const matchedSetter = setters?.find((s: any) => 
        s.name.toLowerCase() === setterName.toLowerCase()
      );
      if (matchedSetter) {
        setterId = matchedSetter.id;
      } else {
        const { data: newSetter } = await supabase
          .from('setters')
          .insert({ name: setterName })
          .select('id')
          .single();
        if (newSetter) {
          setterId = newSetter.id;
          setters?.push({ id: newSetter.id, name: setterName });
        }
      }
    }

    if (closerName) {
      const matchedCloser = closers?.find((c: any) => 
        c.name.toLowerCase() === closerName.toLowerCase()
      );
      if (matchedCloser) {
        closerId = matchedCloser.id;
      } else {
        const { data: newCloser } = await supabase
          .from('closers')
          .insert({ name: closerName })
          .select('id')
          .single();
        if (newCloser) {
          closerId = newCloser.id;
          closers?.push({ id: newCloser.id, name: closerName });
        }
      }
    }

    if (trafficTypeValue) {
      const matchedType = trafficTypes?.find((t: any) => 
        t.name.toLowerCase() === trafficTypeValue.toLowerCase()
      );
      if (matchedType) {
        trafficTypeId = matchedType.id;
      } else {
        const { data: newType } = await supabase
          .from('traffic_types')
          .insert({ name: trafficTypeValue })
          .select('id')
          .single();
        if (newType) {
          trafficTypeId = newType.id;
          trafficTypes?.push({ id: newType.id, name: trafficTypeValue });
        }
      }
    }

    // Build update object - only update fields that have new values from Close
    const updateData: Record<string, any> = {};
    
    if (sourceId && (!preserveExisting || !payment.source_id)) {
      updateData.source_id = sourceId;
    }
    if (setterId && (!preserveExisting || !payment.setter_id)) {
      updateData.setter_id = setterId;
    }
    if (closerId && (!preserveExisting || !payment.closer_id)) {
      updateData.closer_id = closerId;
    }
    if (trafficTypeId && (!preserveExisting || !payment.traffic_type_id)) {
      updateData.traffic_type_id = trafficTypeId;
    }
    
    // Build close_custom_fields JSONB from synced field mappings
    const closeCustomFields: Record<string, string | null> = {};
    if (syncedFieldMappings && syncedFieldMappings.length > 0) {
      for (const mapping of syncedFieldMappings) {
        const rawValue = leadData[`custom.${mapping.close_field_id}`];
        // Resolve user IDs to names if applicable
        const resolvedValue = resolveUserName(rawValue) || rawValue;
        if (resolvedValue) {
          closeCustomFields[mapping.local_field_slug] = resolvedValue;
        }
      }
    }

    // Skip if no updates needed
    if (Object.keys(updateData).length === 0) {
      console.log(`Skipping payment ${payment.id} - ${preserveExisting ? 'preserving existing data' : 'no new data from Close'}`);
      skipped++;
      continue;
    }
    
    // Also update corresponding events with close_custom_fields
    if (Object.keys(closeCustomFields).length > 0) {
      const { error: eventUpdateError } = await supabase
        .from('events')
        .update({ close_custom_fields: closeCustomFields })
        .eq('lead_email', email)
        .eq('organization_id', orgId);
      
      if (eventUpdateError) {
        console.error(`Failed to update event close_custom_fields for ${email}:`, eventUpdateError);
      } else {
        console.log(`Updated event close_custom_fields for ${email}:`, closeCustomFields);
      }
    }

    const { error: updateError } = await supabase
      .from('payments')
      .update(updateData)
      .eq('id', payment.id);

    if (updateError) {
      console.error(`Failed to update payment ${payment.id}:`, updateError);
      errors++;
    } else {
      updated++;
      console.log(`Updated payment ${payment.id}`);
    }

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`Close attribution sync complete: updated=${updated}, skipped=${skipped}, notFound=${notFound}, errors=${errors}`);
  
  return { updated, skipped, notFound, errors, total: payments?.length || 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { action, startDate, endDate, background, preserveExisting, organizationId } = await req.json();

    // STRICT ORG ISOLATION: Require organizationId
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

    // STRICT: Get Close API key using encrypted key helper (enables lazy migration)
    const CLOSE_API_KEY = await getApiKey(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, organizationId, 'close', 'sync-close-attribution');
    
    if (!CLOSE_API_KEY) {
      console.error(`No Close API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Close API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`Using encrypted Close API key for ${orgData?.name}`);
    
    const authHeader = btoa(`${CLOSE_API_KEY}:`);

    if (action === 'test') {
      const response = await fetch('https://api.close.com/api/v1/me/', {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to connect to Close API');
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, message: 'Connected to Close', data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'sync') {
      if (background) {
        const syncPromise = runSync(supabase, authHeader, organizationId, startDate, endDate, preserveExisting);
        
        // @ts-ignore - EdgeRuntime is available in Supabase Edge Functions
        if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime.waitUntil) {
          // @ts-ignore
          EdgeRuntime.waitUntil(syncPromise);
        } else {
          syncPromise.catch(e => console.error('Background sync error:', e));
        }
        
        return new Response(
          JSON.stringify({ 
            success: true, 
            message: `Sync started in background${preserveExisting ? ' (preserving existing)' : ' (overwriting)'}. Refresh in a few moments to see updated data.`,
            background: true
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const result = await runSync(supabase, authHeader, organizationId, startDate, endDate, preserveExisting);

      return new Response(
        JSON.stringify({
          success: true,
          ...result,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "test" or "sync"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-close-attribution:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
