import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    const { leadEmail, eventId, organizationId } = await req.json();
    
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

    // STRICT: Only use org-specific API key - NO global fallback
    const { data: orgIntegration } = await supabase
      .from('organization_integrations')
      .select('close_api_key')
      .eq('organization_id', organizationId)
      .maybeSingle();
    
    if (!orgIntegration?.close_api_key || orgIntegration.close_api_key === 'configured') {
      console.error(`No Close API key configured for org ${orgData?.name}`);
      return new Response(
        JSON.stringify({ error: `Close API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const CLOSE_API_KEY = orgIntegration.close_api_key;
    console.log(`Using ORG-SPECIFIC Close API key for ${orgData?.name}`);
    console.log('Fetching lead source from Close for:', leadEmail);

    const authHeader = btoa(`${CLOSE_API_KEY}:`);
    
    // Search for lead in Close by email
    const searchResponse = await fetch(
      `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(leadEmail)}`,
      {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (!searchResponse.ok) {
      const errorText = await searchResponse.text();
      console.error('Close API search error:', searchResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to search Close leads' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.data || searchData.data.length === 0) {
      console.log('Lead not found in Close:', leadEmail);
      return new Response(
        JSON.stringify({ success: false, message: 'Lead not found in Close' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const lead = searchData.data[0];
    console.log('Found Close lead:', lead.id);

    // Get custom fields to find source field
    const customFieldsResponse = await fetch('https://api.close.com/api/v1/custom_field/lead/', {
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/json',
      },
    });

    let sourceValue = null;
    let setterValue = null;
    let trafficTypeValue = null;

    if (customFieldsResponse.ok) {
      const customFieldsData = await customFieldsResponse.json();
      console.log('Available custom fields:', customFieldsData.data?.map((f: { name: string, id: string }) => ({ name: f.name, id: f.id })));
      
      // Find "Platform" field for source
      const platformField = customFieldsData.data?.find((f: { name: string }) => 
        f.name.toLowerCase() === 'platform' ||
        f.name.toLowerCase().includes('platform')
      );

      if (platformField) {
        const customFieldKey = `custom.${platformField.id}`;
        sourceValue = lead[customFieldKey] || null;
        console.log('Found Platform field:', platformField.name, '=', sourceValue);
      }

      // Find "Lead Owner | Setter" field
      const setterField = customFieldsData.data?.find((f: { name: string }) => 
        f.name.toLowerCase().includes('lead owner') ||
        f.name.toLowerCase().includes('setter') ||
        f.name === 'Lead Owner | Setter'
      );

      if (setterField) {
        const setterFieldKey = `custom.${setterField.id}`;
        setterValue = lead[setterFieldKey] || null;
        console.log('Found Setter field:', setterField.name, '=', setterValue);
      }

      // Find "Traffic Type" field for paid/organic
      const trafficTypeField = customFieldsData.data?.find((f: { name: string }) => 
        f.name.toLowerCase().includes('traffic type') ||
        f.name.toLowerCase() === 'traffic type'
      );

      if (trafficTypeField) {
        const trafficFieldKey = `custom.${trafficTypeField.id}`;
        trafficTypeValue = lead[trafficFieldKey] || null;
        console.log('Found Traffic Type field:', trafficTypeField.name, '=', trafficTypeValue);
      }
    }

    // If we found a source, try to match it to our sources table
    let sourceId = null;
    if (sourceValue) {
      const { data: sources } = await supabase
        .from('sources')
        .select('id, name');

      if (sources) {
        const matchedSource = sources.find(s => 
          s.name.toLowerCase() === sourceValue.toLowerCase() ||
          sourceValue.toLowerCase().includes(s.name.toLowerCase())
        );
        
        if (matchedSource) {
          sourceId = matchedSource.id;
          console.log('Matched to source:', matchedSource.name);
        } else {
          // Create a new source if we don't have it
          const { data: newSource } = await supabase
            .from('sources')
            .insert({ name: sourceValue })
            .select('id')
            .single();
          
          if (newSource) {
            sourceId = newSource.id;
            console.log('Created new source:', sourceValue);
          }
        }
      }
    }

    // If we found a traffic type, try to match it to our traffic_types table
    let trafficTypeId = null;
    if (trafficTypeValue) {
      const { data: trafficTypes } = await supabase
        .from('traffic_types')
        .select('id, name');

      if (trafficTypes) {
        const matchedType = trafficTypes.find(t => 
          t.name.toLowerCase() === trafficTypeValue.toLowerCase() ||
          trafficTypeValue.toLowerCase().includes(t.name.toLowerCase())
        );
        
        if (matchedType) {
          trafficTypeId = matchedType.id;
          console.log('Matched to traffic type:', matchedType.name);
        } else {
          // Create a new traffic type if we don't have it
          const { data: newType } = await supabase
            .from('traffic_types')
            .insert({ name: trafficTypeValue })
            .select('id')
            .single();
          
          if (newType) {
            trafficTypeId = newType.id;
            console.log('Created new traffic type:', trafficTypeValue);
          }
        }
      }
    }

    // Update the event with source, setter, and traffic type if we have an eventId
    if (eventId) {
      const updateData: Record<string, unknown> = {};
      if (sourceId) updateData.source_id = sourceId;
      if (setterValue) updateData.setter_name = setterValue;
      if (trafficTypeId) updateData.traffic_type_id = trafficTypeId;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from('events')
          .update(updateData)
          .eq('id', eventId);

        if (updateError) {
          console.error('Failed to update event:', updateError);
        } else {
          console.log('Updated event with Close data:', updateData);
        }
      }
    }

    // Also update the lead record if it exists
    if (sourceId || setterValue) {
      const { data: existingLead } = await supabase
        .from('leads')
        .select('id')
        .eq('email', leadEmail)
        .maybeSingle();

      if (existingLead) {
        const leadUpdateData: Record<string, unknown> = {};
        if (sourceId) leadUpdateData.source_id = sourceId;
        if (setterValue) {
          leadUpdateData.current_setter_name = setterValue;
        }

        await supabase
          .from('leads')
          .update(leadUpdateData)
          .eq('id', existingLead.id);
        console.log('Updated lead with source/setter');
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        sourceValue,
        sourceId,
        setterValue,
        trafficTypeValue,
        trafficTypeId,
        closeLeadId: lead.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in fetch-close-source:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
