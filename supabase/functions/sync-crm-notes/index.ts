import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface SyncRequest {
  organization_id: string;
  event_id: string;
  notes?: string;
  pipeline_stage?: {
    pipeline_id: string;
    stage_id: string;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const body: SyncRequest = await req.json();
    const { organization_id, event_id, notes, pipeline_stage } = body;

    if (!organization_id || !event_id) {
      return new Response(
        JSON.stringify({ error: 'organization_id and event_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get event details including CRM contact IDs
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('lead_email, ghl_contact_id, hubspot_contact_id, lead_id')
      .eq('id', event_id)
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (eventError || !event) {
      console.error('Event not found:', eventError);
      return new Response(
        JSON.stringify({ error: 'Event not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get organization's CRM configuration
    const { data: orgIntegration } = await supabase
      .from('organization_integrations')
      .select('primary_crm, ghl_location_id')
      .eq('organization_id', organization_id)
      .maybeSingle();

    const primaryCRM = orgIntegration?.primary_crm || 'none';
    console.log(`Syncing to CRM: ${primaryCRM} for event ${event_id}`);

    const results: Record<string, any> = { crm: primaryCRM };

    // Route to appropriate CRM handler
    switch (primaryCRM) {
      case 'ghl':
        if (event.ghl_contact_id) {
          results.ghl = await syncToGHL(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            organization_id,
            event.ghl_contact_id,
            orgIntegration?.ghl_location_id,
            notes,
            pipeline_stage
          );
        } else {
          results.ghl = { skipped: true, reason: 'No GHL contact ID on event' };
        }
        break;

      case 'close':
        results.close = await syncToClose(
          SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY,
          organization_id,
          event.lead_email,
          notes
        );
        break;

      case 'hubspot':
        if (event.hubspot_contact_id) {
          results.hubspot = await syncToHubSpot(
            SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY,
            organization_id,
            event.hubspot_contact_id,
            notes
          );
        } else {
          results.hubspot = { skipped: true, reason: 'No HubSpot contact ID on event' };
        }
        break;

      case 'none':
      default:
        results.message = 'No CRM configured for this organization';
        break;
    }

    return new Response(
      JSON.stringify({ success: true, ...results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in sync-crm-notes:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// ==================== GHL Handler ====================
async function syncToGHL(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  ghlContactId: string,
  ghlLocationId: string | null,
  notes?: string,
  pipelineStage?: { pipeline_id: string; stage_id: string }
): Promise<Record<string, any>> {
  const ghlApiKey = await getApiKey(supabaseUrl, serviceKey, organizationId, 'ghl', 'sync-crm-notes');
  
  if (!ghlApiKey) {
    return { error: 'GHL API key not configured' };
  }

  const isV2 = ghlApiKey.startsWith('pit-');
  const results: Record<string, any> = { apiVersion: isV2 ? 'V2' : 'V1' };

  try {
    // Add notes
    if (notes) {
      const noteUrl = isV2 
        ? `https://services.leadconnectorhq.com/contacts/${ghlContactId}/notes`
        : `https://rest.gohighlevel.com/v1/contacts/${ghlContactId}/notes`;
      
      const noteHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (isV2) {
        noteHeaders['Authorization'] = `Bearer ${ghlApiKey}`;
        noteHeaders['Version'] = '2021-07-28';
      } else {
        noteHeaders['Authorization'] = `Bearer ${ghlApiKey}`;
      }

      const noteResponse = await fetch(noteUrl, {
        method: 'POST',
        headers: noteHeaders,
        body: JSON.stringify({ body: notes }),
      });

      results.notesAdded = noteResponse.ok;
      if (!noteResponse.ok) {
        results.noteError = await noteResponse.text();
      }
    }

    // Move to pipeline stage (V2 only for now)
    if (pipelineStage && isV2 && ghlLocationId) {
      // Search for existing opportunity
      const searchUrl = `https://services.leadconnectorhq.com/opportunities/search?location_id=${ghlLocationId}&contact_id=${ghlContactId}&pipeline_id=${pipelineStage.pipeline_id}`;
      
      const searchResponse = await fetch(searchUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${ghlApiKey}`,
          'Version': '2021-07-28',
        },
      });

      if (searchResponse.ok) {
        const searchData = await searchResponse.json();
        const opportunities = searchData.opportunities || [];

        if (opportunities.length > 0) {
          // Update existing opportunity
          const oppId = opportunities[0].id;
          const updateResponse = await fetch(`https://services.leadconnectorhq.com/opportunities/${oppId}`, {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${ghlApiKey}`,
              'Version': '2021-07-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ pipelineStageId: pipelineStage.stage_id }),
          });
          results.pipelineUpdated = updateResponse.ok;
        } else {
          // Create new opportunity
          const createResponse = await fetch('https://services.leadconnectorhq.com/opportunities/', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${ghlApiKey}`,
              'Version': '2021-07-28',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              pipelineId: pipelineStage.pipeline_id,
              pipelineStageId: pipelineStage.stage_id,
              locationId: ghlLocationId,
              contactId: ghlContactId,
              name: 'PCF Opportunity',
              status: 'open',
            }),
          });
          results.opportunityCreated = createResponse.ok;
        }
      }
    }

    return results;
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ==================== Close CRM Handler ====================
async function syncToClose(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  leadEmail: string,
  notes?: string
): Promise<Record<string, any>> {
  const closeApiKey = await getApiKey(supabaseUrl, serviceKey, organizationId, 'close', 'sync-crm-notes');
  
  if (!closeApiKey) {
    return { error: 'Close API key not configured' };
  }

  const authHeader = btoa(`${closeApiKey}:`);
  const results: Record<string, any> = {};

  try {
    // First, find the lead by email
    const searchUrl = `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(leadEmail)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
    });

    if (!searchResponse.ok) {
      return { error: 'Failed to search Close leads' };
    }

    const searchData = await searchResponse.json();
    const leads = searchData.data || [];

    if (leads.length === 0) {
      return { skipped: true, reason: 'No lead found in Close for this email' };
    }

    const leadId = leads[0].id;
    results.leadId = leadId;

    // Add notes
    if (notes) {
      const noteResponse = await fetch('https://api.close.com/api/v1/activity/note/', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: leadId,
          note: `[SalesReps PCF] ${notes}`,
        }),
      });

      results.notesAdded = noteResponse.ok;
      if (!noteResponse.ok) {
        results.noteError = await noteResponse.text();
      }
    }

    return results;
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// ==================== HubSpot Handler ====================
async function syncToHubSpot(
  supabaseUrl: string,
  serviceKey: string,
  organizationId: string,
  hubspotContactId: string,
  notes?: string
): Promise<Record<string, any>> {
  const hubspotApiKey = await getApiKey(supabaseUrl, serviceKey, organizationId, 'hubspot', 'sync-crm-notes');
  
  if (!hubspotApiKey) {
    return { error: 'HubSpot API key not configured' };
  }

  const results: Record<string, any> = { contactId: hubspotContactId };

  try {
    // Add notes as engagement
    if (notes) {
      // HubSpot v3 - Create a note engagement
      const noteResponse = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${hubspotApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          properties: {
            hs_note_body: notes,
            hs_timestamp: new Date().toISOString(),
          },
          associations: [{
            to: { id: hubspotContactId },
            types: [{
              associationCategory: 'HUBSPOT_DEFINED',
              associationTypeId: 202, // Note to Contact association
            }],
          }],
        }),
      });

      results.notesAdded = noteResponse.ok;
      if (!noteResponse.ok) {
        results.noteError = await noteResponse.text();
      }
    }

    return results;
  } catch (error: unknown) {
    return { error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
