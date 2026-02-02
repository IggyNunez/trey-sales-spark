import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface PCFPayload {
  event_id: string;
  closer_id: string;
  closer_name: string;
  call_occurred: boolean;
  lead_showed: boolean;
  offer_made: boolean;
  deal_closed: boolean;
  cash_collected?: number;
  opportunity_status_id?: string;
  notes?: string;
  organization_id?: string;
}

interface PCFUpdatePayload {
  pcf_id: string;
  lead_showed?: boolean;
  offer_made?: boolean;
  opportunity_status_id?: string;
  notes?: string;
  cash_collected?: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client for token validation and data operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    // Allow token validation without requiring an existing token header
    // This is needed for the initial magic-link bootstrapping step.
    const earlyUrl = new URL(req.url);
    if (req.method === 'GET' && earlyUrl.searchParams.get('action') === 'validate_token') {
      const tokenToValidate = earlyUrl.searchParams.get('token');
      if (!tokenToValidate) {
        return new Response(
          JSON.stringify({ valid: false, error: 'token parameter is required' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: validToken } = await supabaseAdmin
        .from('closer_access_tokens')
        .select('id, organization_id, closer_name, is_active')
        .eq('token', tokenToValidate)
        .eq('is_active', true)
        .maybeSingle();

      if (!validToken) {
        return new Response(
          JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabaseAdmin
        .from('closer_access_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', validToken.id);

      return new Response(
        JSON.stringify({
          valid: true,
          organization_id: validToken.organization_id,
          closer_name: validToken.closer_name,
          is_universal: validToken.closer_name === '__UNIVERSAL__',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract portal token from header
    const portalToken = req.headers.get('x-portal-token');
    
    // Also check Authorization header for authenticated users
    const authHeader = req.headers.get('authorization');
    let isAuthenticated = false;
    let userOrgIds: string[] = [];

    // Validate authentication (for admin access)
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const jwt = authHeader.replace('Bearer ', '');
      const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(jwt);
      
      if (user && !authError) {
        isAuthenticated = true;
        // Get user's organization IDs
        const { data: orgData } = await supabaseAdmin
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id);
        
        userOrgIds = orgData?.map(o => o.organization_id) || [];
      }
    }

    // Validate portal token if provided
    let tokenData: { organization_id: string; closer_name: string; id: string } | null = null;
    
    if (portalToken) {
      const { data: token, error: tokenError } = await supabaseAdmin
        .from('closer_access_tokens')
        .select('id, organization_id, closer_name')
        .eq('token', portalToken)
        .eq('is_active', true)
        .single();

      if (tokenError || !token) {
        return new Response(
          JSON.stringify({ error: 'Invalid or expired portal token' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      tokenData = token;

      // Update last_used_at for the token
      await supabaseAdmin
        .from('closer_access_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', token.id);
    }

    const url = new URL(req.url);
    const method = req.method;
    const action = method === 'GET' ? (url.searchParams.get('action') || 'get_pcf') : null;

    // Must have either valid token or authenticated admin (except token validation endpoint)
    if (!tokenData && !isAuthenticated && action !== 'validate_token') {
      return new Response(
        JSON.stringify({ error: 'Authentication required. Provide portal token or login.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET /portal-pcf - Multiple query types
    if (method === 'GET') {
      const action = url.searchParams.get('action') || 'get_pcf';
      
      // SPECIAL: Validate token action - doesn't require prior auth since we're validating the token itself
      if (action === 'validate_token') {
        const tokenToValidate = url.searchParams.get('token');
        if (!tokenToValidate) {
          return new Response(
            JSON.stringify({ error: 'token parameter is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: validToken, error: tokenError } = await supabaseAdmin
          .from('closer_access_tokens')
          .select('id, organization_id, closer_name, is_active')
          .eq('token', tokenToValidate)
          .eq('is_active', true)
          .single();

        if (tokenError || !validToken) {
          return new Response(
            JSON.stringify({ valid: false, error: 'Invalid or expired token' }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Update last_used_at
        await supabaseAdmin
          .from('closer_access_tokens')
          .update({ last_used_at: new Date().toISOString() })
          .eq('id', validToken.id);

        return new Response(
          JSON.stringify({ 
            valid: true, 
            organization_id: validToken.organization_id,
            closer_name: validToken.closer_name,
            is_universal: validToken.closer_name === '__UNIVERSAL__'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Get events for a closer
      if (action === 'get_events') {
        const closerName = url.searchParams.get('closer_name');
        const startDate = url.searchParams.get('start_date');
        const endDate = url.searchParams.get('end_date');
        
        if (!closerName) {
          return new Response(
            JSON.stringify({ error: 'closer_name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // For portal tokens, must have valid org access
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        let query = supabaseAdmin
          .from('events')
          .select(`
            id, lead_name, lead_email, lead_phone, scheduled_at, created_at, 
            closer_name, call_status, pcf_submitted, event_name, event_outcome, pcf_outcome_label, setter_name,
            close_custom_fields, booking_platform,
            post_call_forms!left(opportunity_status_id, opportunity_statuses!left(id, name, color))
          `)
          .eq('organization_id', orgId)
          .eq('closer_name', closerName)
          .order('scheduled_at', { ascending: false })
          .limit(500);

        if (startDate) {
          query = query.gte('scheduled_at', startDate);
        }
        if (endDate) {
          query = query.lte('scheduled_at', endDate);
        }
        
        // Platform filter using JSONB containment
        const platform = url.searchParams.get('platform');
        if (platform) {
          query = query.contains('close_custom_fields', { platform });
        }

        const { data: eventsRaw, error: eventsError } = await query;

        if (eventsError) {
          return new Response(
            JSON.stringify({ error: eventsError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Flatten the nested PCF data to include opportunity_status_name directly
        const events = (eventsRaw || []).map((e: any) => {
          const pcf = Array.isArray(e.post_call_forms) ? e.post_call_forms[0] : e.post_call_forms;
          const status = pcf?.opportunity_statuses;
          return {
            id: e.id,
            lead_name: e.lead_name,
            lead_email: e.lead_email,
            lead_phone: e.lead_phone,
            scheduled_at: e.scheduled_at,
            created_at: e.created_at,
            closer_name: e.closer_name,
            call_status: e.call_status,
            pcf_submitted: e.pcf_submitted,
            event_name: e.event_name,
            event_outcome: e.event_outcome,
            pcf_outcome_label: e.pcf_outcome_label,
            setter_name: e.setter_name,
            close_custom_fields: e.close_custom_fields,
            booking_platform: e.booking_platform,
            opportunity_status_name: status?.name || null,
            opportunity_status_color: status?.color || null,
          };
        });

        return new Response(
          JSON.stringify({ events }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get unique platforms for dropdown
      if (action === 'get_platforms') {
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: eventsWithPlatform, error: platformError } = await supabaseAdmin
          .from('events')
          .select('close_custom_fields')
          .eq('organization_id', orgId)
          .not('close_custom_fields', 'is', null);

        if (platformError) {
          return new Response(
            JSON.stringify({ error: platformError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Extract unique platform values
        const platforms = [...new Set(
          (eventsWithPlatform || [])
            .map((e: any) => e.close_custom_fields?.platform)
            .filter(Boolean)
        )].sort();

        return new Response(
          JSON.stringify({ platforms }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get closers list for organization
      if (action === 'get_closers') {
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: closers, error: closersError } = await supabaseAdmin
          .from('closers')
          .select('id, name')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('name');

        if (closersError) {
          return new Response(
            JSON.stringify({ error: closersError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ closers }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get opportunity statuses
      if (action === 'get_statuses') {
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: statuses, error: statusesError } = await supabaseAdmin
          .from('opportunity_statuses')
          .select('id, name, description, color')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order');

        if (statusesError) {
          return new Response(
            JSON.stringify({ error: statusesError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ statuses }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get form config
      if (action === 'get_form_config') {
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: formConfig, error: formError } = await supabaseAdmin
          .from('form_configs')
          .select('*')
          .eq('organization_id', orgId)
          .eq('form_type', 'post_call_form')
          .eq('is_active', true)
          .maybeSingle();

        return new Response(
          JSON.stringify({ formConfig }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get dynamic forms for closer
      if (action === 'get_dynamic_forms') {
        const closerName = url.searchParams.get('closer_name');
        const closerId = url.searchParams.get('closer_id');
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: allForms, error: formsError } = await supabaseAdmin
          .from('form_definitions')
          .select('*')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (formsError) {
          return new Response(
            JSON.stringify({ error: formsError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Filter forms for this closer
        const forms = (allForms || []).filter((form: any) => {
          const assignedClosers = form.assigned_closers || [];
          const isAssigned = assignedClosers.length === 0 || 
                            (closerName && assignedClosers.includes(closerName)) || 
                            (closerId && assignedClosers.includes(closerId));
          return isAssigned && form.entity_type === 'closer';
        });

        return new Response(
          JSON.stringify({ forms }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get form fields for a specific form
      if (action === 'get_form_fields') {
        const formId = url.searchParams.get('form_id');
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!formId) {
          return new Response(
            JSON.stringify({ error: 'form_id is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { data: fields, error: fieldsError } = await supabaseAdmin
          .from('form_fields')
          .select('*')
          .eq('form_definition_id', formId)
          .eq('is_active', true)
          .order('sort_order', { ascending: true });

        if (fieldsError) {
          return new Response(
            JSON.stringify({ error: fieldsError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ fields }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get today's form submissions for closer
      if (action === 'get_today_submissions') {
        const closerName = url.searchParams.get('closer_name');
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (!closerName) {
          return new Response(
            JSON.stringify({ error: 'closer_name is required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const { data: submissions, error: submissionsError } = await supabaseAdmin
          .from('form_submissions')
          .select('id, form_definition_id, submitted_at')
          .eq('organization_id', orgId)
          .eq('entity_name', closerName)
          .gte('submitted_at', today.toISOString())
          .order('submitted_at', { ascending: false });

        if (submissionsError) {
          return new Response(
            JSON.stringify({ error: submissionsError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({ submissions }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Default: Get PCF for an event
      const eventId = url.searchParams.get('event_id');
      if (!eventId) {
        return new Response(
          JSON.stringify({ error: 'event_id is required for get_pcf action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Verify access to this event
      const { data: event, error: eventError } = await supabaseAdmin
        .from('events')
        .select('id, organization_id, closer_name')
        .eq('id', eventId)
        .single();

      if (eventError || !event) {
        return new Response(
          JSON.stringify({ error: 'Event not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check authorization
      const canAccess = 
        (tokenData && tokenData.organization_id === event.organization_id) ||
        (isAuthenticated && userOrgIds.includes(event.organization_id!));

      if (!canAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this event' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get PCF
      const { data: pcf, error: pcfError } = await supabaseAdmin
        .from('post_call_forms')
        .select('*')
        .eq('event_id', eventId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ pcf }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /portal-pcf - Handle various POST actions
    if (method === 'POST') {
      const body = await req.json();

      // Check if this is a dynamic form submission
      if (body.action === 'submit_dynamic_form') {
        const orgId = tokenData?.organization_id || (userOrgIds.length > 0 ? userOrgIds[0] : null);
        
        if (!orgId) {
          return new Response(
            JSON.stringify({ error: 'No organization access' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const { form_definition_id, closer_name, closer_id, field_values, dataset_id } = body;

        if (!form_definition_id || !closer_name) {
          return new Response(
            JSON.stringify({ error: 'form_definition_id and closer_name are required' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create submission
        const { data: submission, error: submissionError } = await supabaseAdmin
          .from('form_submissions')
          .insert({
            organization_id: orgId,
            form_definition_id,
            entity_type: 'closer',
            entity_id: closer_id || null,
            entity_name: closer_name,
            submitted_by_name: closer_name,
            submitted_at: new Date().toISOString(),
            status: 'submitted',
          })
          .select()
          .single();

        if (submissionError) {
          return new Response(
            JSON.stringify({ error: submissionError.message }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Create field values
        if (field_values && field_values.length > 0) {
          const fieldValueRecords = field_values.map((fv: any) => ({
            ...fv,
            submission_id: submission.id,
            organization_id: orgId,
          }));

          const { error: valuesError } = await supabaseAdmin
            .from('form_field_values')
            .insert(fieldValueRecords);

          if (valuesError) {
            console.error('Field values insert error:', valuesError);
          }
        }

        // Auto-sync to dataset if linked - with upsert logic for same entity + date
        if (dataset_id && body.extracted_data) {
          const extractedData = body.extracted_data as Record<string, any>;
          const dateValue = extractedData.date || extractedData.period_date;
          const entityName = extractedData.entity_name;
          
          let existingRecordId: string | null = null;
          
          if (dateValue && entityName) {
            const { data: existingRecords } = await supabaseAdmin
              .from('dataset_records')
              .select('id, extracted_data')
              .eq('dataset_id', dataset_id)
              .eq('organization_id', orgId);
            
            const matchingRecord = existingRecords?.find((r: any) => {
              const ed = r.extracted_data as Record<string, any>;
              const recordDate = ed?.date || ed?.period_date;
              const recordEntity = ed?.entity_name;
              return recordDate === dateValue && recordEntity === entityName;
            });
            
            if (matchingRecord) {
              existingRecordId = matchingRecord.id;
            }
          }

          if (existingRecordId) {
            await supabaseAdmin.from('dataset_records')
              .update({
                raw_payload: { source: 'rep_portal', submission_id: submission.id, updated: true },
                extracted_data: extractedData,
              })
              .eq('id', existingRecordId);
          } else {
            await supabaseAdmin.from('dataset_records').insert({
              organization_id: orgId,
              dataset_id: dataset_id,
              raw_payload: { source: 'rep_portal', submission_id: submission.id },
              extracted_data: extractedData,
              processing_status: 'success',
            });
          }
        }

        return new Response(
          JSON.stringify({ submission }),
          { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Default: Create PCF (original logic)
      const pcfBody: PCFPayload = body;

      // Verify access to this event
      const { data: event, error: eventError } = await supabaseAdmin
        .from('events')
        .select('id, organization_id, closer_name')
        .eq('id', pcfBody.event_id)
        .single();

      if (eventError || !event) {
        return new Response(
          JSON.stringify({ error: 'Event not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check authorization
      const canAccess = 
        (tokenData && tokenData.organization_id === event.organization_id) ||
        (isAuthenticated && userOrgIds.includes(event.organization_id!));

      if (!canAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this event' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Create PCF
      const { data: pcf, error: pcfError } = await supabaseAdmin
        .from('post_call_forms')
        .insert({
          event_id: pcfBody.event_id,
          closer_id: pcfBody.closer_id,
          closer_name: pcfBody.closer_name,
          call_occurred: pcfBody.call_occurred,
          lead_showed: pcfBody.lead_showed,
          offer_made: pcfBody.offer_made,
          deal_closed: pcfBody.deal_closed,
          cash_collected: pcfBody.cash_collected || 0,
          opportunity_status_id: pcfBody.opportunity_status_id,
          notes: pcfBody.notes,
          organization_id: event.organization_id,
        })
        .select()
        .single();

      if (pcfError) {
        console.error('PCF insert error:', pcfError.message);
        return new Response(
          JSON.stringify({ error: pcfError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Determine event outcome based on pipeline status if available
      let eventOutcome: string = 'no_show';
      let callStatus = 'completed';
      let pcfOutcomeLabel: string | null = null;
      
      if (pcfBody.opportunity_status_id) {
        // Fetch the status name to determine outcome
        const { data: status } = await supabaseAdmin
          .from('opportunity_statuses')
          .select('name')
          .eq('id', pcfBody.opportunity_status_id)
          .single();
        
        // Capture the actual outcome label selected
        pcfOutcomeLabel = status?.name || null;
        const statusLower = (status?.name || '').toLowerCase();
        
        // Priority order: Check specific status names first
        // No Show statuses
        if (statusLower.includes('no show') || statusLower.includes('no-show') || statusLower === 'dns' || statusLower.includes('did not show')) {
          eventOutcome = 'no_show';
          callStatus = 'no_show';
        }
        // Canceled statuses
        else if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) {
          eventOutcome = 'canceled';
          callStatus = 'canceled';
        }
        // Rescheduled statuses
        else if (statusLower.includes('reschedule') || statusLower.includes('rescheduled')) {
          eventOutcome = 'rescheduled';
          callStatus = 'rescheduled';
        }
        // Not Qualified statuses
        else if (statusLower.includes('unqualified') || statusLower.includes('not qualified') || statusLower.includes('disqualified') || statusLower === 'dq') {
          eventOutcome = 'not_qualified';
          callStatus = 'completed';
        }
        // Lost status (exact match)
        else if (statusLower === 'lost') {
          eventOutcome = 'lost';
          callStatus = 'completed';
        }
        // Won/Closed Won statuses
        else if (statusLower === 'won' || statusLower === 'closed won') {
          eventOutcome = 'closed';
          callStatus = 'completed';
        }
        // Default based on boolean fields
        else if (!pcfBody.lead_showed) {
          eventOutcome = 'no_show';
          callStatus = 'no_show';
        } else if (pcfBody.offer_made) {
          eventOutcome = 'showed_offer_no_close';
          callStatus = 'completed';
        } else {
          eventOutcome = 'showed_no_offer';
          callStatus = 'completed';
        }
      } else {
        // Fallback to boolean logic when no status selected
        if (!pcfBody.lead_showed) {
          eventOutcome = 'no_show';
          callStatus = 'no_show';
        } else if (pcfBody.deal_closed) {
          eventOutcome = 'closed';
          callStatus = 'completed';
        } else if (pcfBody.offer_made) {
          eventOutcome = 'showed_offer_no_close';
          callStatus = 'completed';
        } else {
          eventOutcome = 'showed_no_offer';
          callStatus = 'completed';
        }
      }

      await supabaseAdmin
        .from('events')
        .update({
          pcf_submitted: true,
          pcf_submitted_at: new Date().toISOString(),
          event_outcome: eventOutcome,
          call_status: callStatus,
          pcf_outcome_label: pcfOutcomeLabel,
        })
        .eq('id', pcfBody.event_id);

      return new Response(
        JSON.stringify({ pcf }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // PUT /portal-pcf - Update existing PCF
    if (method === 'PUT') {
      const body: PCFUpdatePayload = await req.json();

      if (!body.pcf_id) {
        return new Response(
          JSON.stringify({ error: 'pcf_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get existing PCF to check organization
      const { data: existingPcf, error: fetchError } = await supabaseAdmin
        .from('post_call_forms')
        .select('id, organization_id, event_id')
        .eq('id', body.pcf_id)
        .single();

      if (fetchError || !existingPcf) {
        return new Response(
          JSON.stringify({ error: 'PCF not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check authorization
      const canAccess = 
        (tokenData && tokenData.organization_id === existingPcf.organization_id) ||
        (isAuthenticated && userOrgIds.includes(existingPcf.organization_id!));

      if (!canAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied to this PCF' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update PCF
      const updateData: Record<string, unknown> = {};
      if (body.lead_showed !== undefined) updateData.lead_showed = body.lead_showed;
      if (body.offer_made !== undefined) updateData.offer_made = body.offer_made;
      if (body.opportunity_status_id !== undefined) updateData.opportunity_status_id = body.opportunity_status_id;
      if (body.notes !== undefined) updateData.notes = body.notes;
      if (body.cash_collected !== undefined) updateData.cash_collected = body.cash_collected;

      const { data: pcf, error: updateError } = await supabaseAdmin
        .from('post_call_forms')
        .update(updateData)
        .eq('id', body.pcf_id)
        .select()
        .single();

      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Update event outcome if relevant fields changed
      if (body.lead_showed !== undefined || body.offer_made !== undefined || body.opportunity_status_id !== undefined) {
        let eventOutcome: string = 'no_show';
        let callStatus = 'completed';
        let pcfOutcomeLabel: string | null = null;
        
        if (pcf.opportunity_status_id) {
          // Fetch the status name to determine outcome
          const { data: status } = await supabaseAdmin
            .from('opportunity_statuses')
            .select('name')
            .eq('id', pcf.opportunity_status_id)
            .single();
          
          // Capture the actual outcome label selected
          pcfOutcomeLabel = status?.name || null;
          const statusLower = (status?.name || '').toLowerCase();
          
          // Priority order: Check specific status names first
          // No Show statuses
          if (statusLower.includes('no show') || statusLower.includes('no-show') || statusLower === 'dns' || statusLower.includes('did not show')) {
            eventOutcome = 'no_show';
            callStatus = 'no_show';
          }
          // Canceled statuses
          else if (statusLower === 'canceled' || statusLower === 'cancelled' || statusLower.includes('cancel')) {
            eventOutcome = 'canceled';
            callStatus = 'canceled';
          }
          // Rescheduled statuses
          else if (statusLower.includes('reschedule') || statusLower.includes('rescheduled')) {
            eventOutcome = 'rescheduled';
            callStatus = 'rescheduled';
          }
          // Not Qualified statuses
          else if (statusLower.includes('unqualified') || statusLower.includes('not qualified') || statusLower.includes('disqualified') || statusLower === 'dq') {
            eventOutcome = 'not_qualified';
            callStatus = 'completed';
          }
          // Lost status (exact match)
          else if (statusLower === 'lost') {
            eventOutcome = 'lost';
            callStatus = 'completed';
          }
          // Won/Closed Won statuses
          else if (statusLower === 'won' || statusLower === 'closed won') {
            eventOutcome = 'closed';
            callStatus = 'completed';
          }
          // Default based on boolean fields
          else if (!pcf.lead_showed) {
            eventOutcome = 'no_show';
            callStatus = 'no_show';
          } else if (pcf.offer_made) {
            eventOutcome = 'showed_offer_no_close';
            callStatus = 'completed';
          } else {
            eventOutcome = 'showed_no_offer';
            callStatus = 'completed';
          }
        } else {
          // Fallback to boolean logic when no status selected
          if (!pcf.lead_showed) {
            eventOutcome = 'no_show';
            callStatus = 'no_show';
          } else if (pcf.deal_closed) {
            eventOutcome = 'closed';
            callStatus = 'completed';
          } else if (pcf.offer_made) {
            eventOutcome = 'showed_offer_no_close';
            callStatus = 'completed';
          } else {
            eventOutcome = 'showed_no_offer';
            callStatus = 'completed';
          }
        }

        await supabaseAdmin
          .from('events')
          .update({ event_outcome: eventOutcome, call_status: callStatus, pcf_outcome_label: pcfOutcomeLabel })
          .eq('id', existingPcf.event_id);
      }

      return new Response(
        JSON.stringify({ pcf }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // DELETE /portal-pcf?pcf_id=xxx - Delete PCF (admin only)
    if (method === 'DELETE') {
      const pcfId = url.searchParams.get('pcf_id');
      if (!pcfId) {
        return new Response(
          JSON.stringify({ error: 'pcf_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get PCF to check authorization
      const { data: existingPcf, error: fetchError } = await supabaseAdmin
        .from('post_call_forms')
        .select('id, organization_id, event_id')
        .eq('id', pcfId)
        .single();

      if (fetchError || !existingPcf) {
        return new Response(
          JSON.stringify({ error: 'PCF not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check authorization - only authenticated admins OR portal token holders can delete
      const canAccess = 
        (tokenData && tokenData.organization_id === existingPcf.organization_id) ||
        (isAuthenticated && userOrgIds.includes(existingPcf.organization_id!));

      if (!canAccess) {
        return new Response(
          JSON.stringify({ error: 'Access denied' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Delete PCF
      const { error: deleteError } = await supabaseAdmin
        .from('post_call_forms')
        .delete()
        .eq('id', pcfId);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: deleteError.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Reset event status
      await supabaseAdmin
        .from('events')
        .update({
          pcf_submitted: false,
          pcf_submitted_at: null,
          event_outcome: null,
          call_status: 'scheduled',
        })
        .eq('id', existingPcf.event_id);

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Portal PCF error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
