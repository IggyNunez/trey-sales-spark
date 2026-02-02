import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Parse body once - it can only be consumed once
    const body = await req.json();
    const { action, organizationId, fields, email } = body;

    if (!organizationId) {
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

    // Get Close API key
    const CLOSE_API_KEY = await getApiKey(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!,
      organizationId,
      'close',
      'fetch-close-custom-fields'
    );

    if (!CLOSE_API_KEY) {
      return new Response(
        JSON.stringify({
          error: `Close API key not configured for ${orgData?.name || 'this organization'}. Please add your API key in Settings → Integrations.`
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = btoa(`${CLOSE_API_KEY}:`);

    if (action === 'discover') {
      console.log(`Discovering Close custom fields for ${orgData?.name}`);

      // Fetch all lead custom fields from Close
      const response = await fetch('https://api.close.com/api/v1/custom_field/lead/', {
        headers: {
          'Authorization': `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Failed to fetch Close custom fields:', errorText);
        throw new Error('Failed to fetch custom fields from Close CRM');
      }

      const data = await response.json();
      const fields = data.data || [];

      console.log(`Found ${fields.length} custom fields in Close`);

      // Transform Close field data
      const transformedFields = fields.map((field: any) => ({
        close_field_id: field.id,
        close_field_name: field.name,
        close_field_type: field.type || 'text',
        close_field_choices: field.choices || null,
      }));

      // Get existing mappings for this org
      const { data: existingMappings } = await supabase
        .from('close_field_mappings')
        .select('close_field_id, is_synced, show_in_filters, show_in_dashboard')
        .eq('organization_id', organizationId);

      const existingMap = new Map(
        (existingMappings || []).map(m => [m.close_field_id, m])
      );

      // Merge with existing mappings
      const mergedFields = transformedFields.map((field: any) => ({
        ...field,
        existing: existingMap.get(field.close_field_id) || null,
      }));

      return new Response(
        JSON.stringify({ success: true, fields: mergedFields }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'save') {
      if (!fields || !Array.isArray(fields)) {
        return new Response(
          JSON.stringify({ error: 'fields array is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Saving ${fields.length} field mappings for ${orgData?.name}`);

      // Upsert all field mappings
      for (const field of fields) {
        const slug = field.close_field_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_|_$/g, '');

        const { error } = await supabase
          .from('close_field_mappings')
          .upsert(
            {
              organization_id: organizationId,
              close_field_id: field.close_field_id,
              close_field_name: field.close_field_name,
              close_field_type: field.close_field_type,
              close_field_choices: field.close_field_choices,
              local_field_slug: slug,
              is_synced: field.is_synced || false,
              show_in_filters: field.show_in_filters || false,
              show_in_dashboard: field.show_in_dashboard || false,
              sort_order: field.sort_order || 0,
            },
            {
              onConflict: 'organization_id,close_field_id',
            }
          );

        if (error) {
          console.error(`Failed to save field mapping for ${field.close_field_name}:`, error);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: `Saved ${fields.length} field mappings` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'preview') {
      if (!email) {
        return new Response(
          JSON.stringify({ error: 'email is required for preview' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchResponse = await fetch(
        `https://api.close.com/api/v1/lead/?query=email:${encodeURIComponent(email)}`,
        {
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!searchResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to search Close leads' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchData = await searchResponse.json();

      if (!searchData.data || searchData.data.length === 0) {
        return new Response(
          JSON.stringify({ success: true, lead: null, message: 'No lead found with that email' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const lead = searchData.data[0];

      // Extract all custom field values
      const customFields: Record<string, any> = {};
      for (const [key, value] of Object.entries(lead)) {
        if (key.startsWith('custom.')) {
          const fieldId = key.replace('custom.', '');
          customFields[fieldId] = value;
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          lead: {
            id: lead.id,
            display_name: lead.display_name,
            custom_fields: customFields,
          },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action. Use "discover", "save", or "preview"' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in fetch-close-custom-fields:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
