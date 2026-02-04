import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getApiKey } from '../_shared/get-api-key.ts';

// Trenton organization ID - only org enabled for HubSpot sync
const TRENTON_ORG_ID = 'c208c810-fb8d-4d7a-b592-db2d2868d8ed';

// HubSpot contact properties to fetch for attribution
const HUBSPOT_CONTACT_PROPERTIES = [
  'email',
  'firstname',
  'lastname',
  'phone',
  'lifecyclestage',
  'hs_lead_status',
  'hs_analytics_source',
  'hs_analytics_source_data_1',
  'hs_analytics_source_data_2',
  'hubspot_owner_id',
  'createdate',
  'hs_analytics_first_url',
  'hs_analytics_last_url',
  'hs_latest_source',
  'hs_latest_source_data_1',
  'hs_analytics_first_referrer',
  'hs_analytics_num_page_views',
  'hs_analytics_num_visits',
];

// HubSpot deal properties to fetch (deal stage is the key metric for Trenton)
const HUBSPOT_DEAL_PROPERTIES = [
  'dealname',
  'dealstage',
  'amount',
  'closedate',
  'pipeline',
  'hs_lastmodifieddate',
  'createdate',
];

interface SyncResult {
  synced: number;
  errors: number;
  skipped: number;
  deals_fetched: number;
  details: string[];
}

interface DealData {
  id: string;
  dealname: string | null;
  dealstage: string | null;
  amount: string | null;
  closedate: string | null;
  pipeline: string | null;
}

// Fetch associated deals for a contact
async function fetchContactDeals(
  contactId: string,
  hubspotApiKey: string
): Promise<DealData[]> {
  try {
    // Get associations from contact to deals
    const assocResponse = await fetch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
      {
        headers: {
          'Authorization': `Bearer ${hubspotApiKey}`,
        },
      }
    );

    if (!assocResponse.ok) {
      console.log(`No deal associations for contact ${contactId}`);
      return [];
    }

    const assocData = await assocResponse.json();
    const dealIds = (assocData.results || []).map((r: { id: string }) => r.id);

    if (dealIds.length === 0) {
      return [];
    }

    // Batch fetch deal properties
    const batchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${hubspotApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: HUBSPOT_DEAL_PROPERTIES,
        inputs: dealIds.map((id: string) => ({ id })),
      }),
    });

    if (!batchResponse.ok) {
      console.error(`Failed to fetch deals for contact ${contactId}`);
      return [];
    }

    const batchData = await batchResponse.json();
    return (batchData.results || []).map((deal: { id: string; properties: Record<string, string | null> }) => ({
      id: deal.id,
      dealname: deal.properties.dealname || null,
      dealstage: deal.properties.dealstage || null,
      amount: deal.properties.amount || null,
      closedate: deal.properties.closedate || null,
      pipeline: deal.properties.pipeline || null,
    }));
  } catch (error) {
    console.error(`Error fetching deals for contact ${contactId}:`, error);
    return [];
  }
}

// Fetch pipeline stage labels to convert IDs to human-readable names
async function fetchPipelineStages(
  hubspotApiKey: string
): Promise<Map<string, string>> {
  const stageMap = new Map<string, string>();
  
  try {
    const response = await fetch('https://api.hubapi.com/crm/v3/pipelines/deals', {
      headers: {
        'Authorization': `Bearer ${hubspotApiKey}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch pipelines');
      return stageMap;
    }

    const data = await response.json();
    for (const pipeline of data.results || []) {
      for (const stage of pipeline.stages || []) {
        // Store both pipeline-qualified and standalone stage IDs
        stageMap.set(stage.id, stage.label);
        stageMap.set(`${pipeline.id}:${stage.id}`, stage.label);
      }
    }
    
    console.log(`Loaded ${stageMap.size} pipeline stages`);
  } catch (error) {
    console.error('Error fetching pipeline stages:', error);
  }
  
  return stageMap;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const { organization_id, limit = 100, contact_id, force_refresh = false } = body;

    // Validate organization is Trenton
    const targetOrgId = organization_id || TRENTON_ORG_ID;
    if (targetOrgId !== TRENTON_ORG_ID) {
      console.log(`Skipping sync for non-Trenton org: ${targetOrgId}`);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'HubSpot sync is only enabled for Trenton organization',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 403 }
      );
    }

    // Get HubSpot API key using the shared helper (handles decryption)
    const hubspotApiKey = await getApiKey(
      supabaseUrl, 
      supabaseServiceKey, 
      TRENTON_ORG_ID, 
      'hubspot', 
      'sync-hubspot-attribution'
    );

    if (!hubspotApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'HubSpot API key not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Using encrypted HubSpot API key for sync-hubspot-attribution');

    // Fetch pipeline stages upfront for label resolution
    const stageLabels = await fetchPipelineStages(hubspotApiKey);

    // Build query for events needing sync
    let eventsQuery = supabase
      .from('events')
      .select('id, hubspot_contact_id, hubspot_custom_fields')
      .eq('organization_id', TRENTON_ORG_ID)
      .not('hubspot_contact_id', 'is', null);

    // Optionally filter to specific contact
    if (contact_id) {
      eventsQuery = eventsQuery.eq('hubspot_contact_id', contact_id);
    } else if (!force_refresh) {
      // Only sync events that haven't been synced yet OR don't have deal data
      // Check for missing deal_stage specifically since that's what Trenton needs
      eventsQuery = eventsQuery.or('hubspot_custom_fields.is.null,hubspot_custom_fields.eq.{}');
    }

    eventsQuery = eventsQuery.limit(limit);

    const { data: events, error: eventsError } = await eventsQuery;

    if (eventsError) {
      console.error('Failed to fetch events:', eventsError);
      throw eventsError;
    }

    if (!events || events.length === 0) {
      console.log('No events to sync');
      return new Response(
        JSON.stringify({ 
          success: true, 
          result: { synced: 0, errors: 0, skipped: 0, deals_fetched: 0, details: ['No events to sync'] } 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${events.length} events to sync`);

    // Get unique contact IDs
    const contactIds = [...new Set(events.map(e => e.hubspot_contact_id).filter(Boolean))];
    console.log(`Fetching ${contactIds.length} unique HubSpot contacts`);

    // Fetch contact properties from HubSpot (batch API supports up to 100 at a time)
    const contactPropertiesMap = new Map<string, Record<string, string | null>>();
    const contactDealsMap = new Map<string, DealData[]>();
    const batchSize = 100;

    for (let i = 0; i < contactIds.length; i += batchSize) {
      const batchIds = contactIds.slice(i, i + batchSize);
      
      try {
        // Use batch read API for contacts
        const batchResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/batch/read', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${hubspotApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            properties: HUBSPOT_CONTACT_PROPERTIES,
            inputs: batchIds.map(id => ({ id })),
          }),
        });

        if (!batchResponse.ok) {
          const errorText = await batchResponse.text();
          console.error(`HubSpot batch read failed: ${batchResponse.status} - ${errorText}`);
          continue;
        }

        const batchData = await batchResponse.json();
        
        for (const contact of batchData.results || []) {
          contactPropertiesMap.set(contact.id, contact.properties);
        }

        console.log(`Fetched ${batchData.results?.length || 0} contacts in batch ${Math.floor(i / batchSize) + 1}`);
      } catch (batchError) {
        console.error(`Error fetching batch ${Math.floor(i / batchSize) + 1}:`, batchError);
      }
    }

    // Fetch deals for each contact (with rate limiting)
    let dealsFetched = 0;
    for (const contactId of contactIds) {
      const deals = await fetchContactDeals(contactId, hubspotApiKey);
      if (deals.length > 0) {
        contactDealsMap.set(contactId, deals);
        dealsFetched += deals.length;
      }
      // Rate limit: small delay between deal fetches
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    console.log(`Fetched ${dealsFetched} deals for ${contactDealsMap.size} contacts`);

    // Update events with HubSpot properties including deal data
    const result: SyncResult = { synced: 0, errors: 0, skipped: 0, deals_fetched: dealsFetched, details: [] };

    for (const event of events) {
      const contactId = event.hubspot_contact_id;
      if (!contactId) {
        result.skipped++;
        continue;
      }

      const properties = contactPropertiesMap.get(contactId);
      if (!properties) {
        result.skipped++;
        result.details.push(`Contact ${contactId} not found in HubSpot`);
        continue;
      }

      // Build hubspot_custom_fields object with contact properties
      const hubspotFields: Record<string, string | null | DealData[]> = {};
      for (const prop of HUBSPOT_CONTACT_PROPERTIES) {
        if (properties[prop] !== undefined) {
          hubspotFields[prop] = properties[prop];
        }
      }

      // Add deal data - get the most recent/relevant deal
      const deals = contactDealsMap.get(contactId) || [];
      if (deals.length > 0) {
        // Store all deals for reference
        hubspotFields.deals = deals;
        
        // Get the primary deal (first one, usually most recent)
        const primaryDeal = deals[0];
        
        // Store deal stage with human-readable label
        const stageId = primaryDeal.dealstage;
        const pipelineId = primaryDeal.pipeline;
        
        // Try to resolve stage label
        let stageLabel = stageId;
        if (stageId) {
          // Try pipeline-qualified lookup first
          if (pipelineId && stageLabels.has(`${pipelineId}:${stageId}`)) {
            stageLabel = stageLabels.get(`${pipelineId}:${stageId}`) || stageId;
          } else if (stageLabels.has(stageId)) {
            stageLabel = stageLabels.get(stageId) || stageId;
          }
        }
        
        hubspotFields.deal_stage = stageLabel;
        hubspotFields.deal_stage_id = stageId;
        hubspotFields.deal_name = primaryDeal.dealname;
        hubspotFields.deal_amount = primaryDeal.amount;
        hubspotFields.deal_close_date = primaryDeal.closedate;
        hubspotFields.deal_count = String(deals.length);
      }

      // Update the event
      const { error: updateError } = await supabase
        .from('events')
        .update({ hubspot_custom_fields: hubspotFields })
        .eq('id', event.id);

      if (updateError) {
        result.errors++;
        result.details.push(`Failed to update event ${event.id}: ${updateError.message}`);
        console.error(`Failed to update event ${event.id}:`, updateError);
      } else {
        result.synced++;
      }
    }

    console.log(`Sync complete: ${result.synced} synced, ${result.errors} errors, ${result.skipped} skipped, ${result.deals_fetched} deals`);

    return new Response(
      JSON.stringify({ success: true, result }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('sync-hubspot-attribution error:', error);
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
