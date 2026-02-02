import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const table = url.searchParams.get('table')
    const startDate = url.searchParams.get('start_date')
    const endDate = url.searchParams.get('end_date')

    if (!table) {
      return new Response(JSON.stringify({ error: 'Table parameter required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const validTables = [
      'events', 'payments', 'leads', 'post_call_forms', 'audit_logs',
      'organizations', 'profiles', 'organization_members', 'user_roles',
      'closers', 'setters', 'sources', 'portal_settings', 'closer_access_tokens',
      'custom_field_definitions', 'custom_field_values', 'form_configs',
      'dashboard_layouts', 'payout_snapshots', 'payout_snapshot_details',
      'payout_snapshot_summaries', 'webhook_connections', 'traffic_types',
      'call_types', 'call_outcomes', 'opportunity_statuses', 'packages',
      'invitations', 'calendly_webhook_audit', 'metric_definitions',
      'organization_integrations', 'setter_activities', 'integrations'
    ]

    if (!validTables.includes(table)) {
      return new Response(JSON.stringify({ error: 'Invalid table name' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let query = supabase.from(table).select('*')

    // Apply date filters if provided
    if (startDate) {
      query = query.gte('created_at', startDate)
    }
    if (endDate) {
      query = query.lt('created_at', endDate)
    }

    // Fetch all data (no limit)
    const { data, error } = await query

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const filename = startDate && endDate 
      ? `${table}_${startDate}_to_${endDate}.json`
      : `${table}_full_export.json`

    return new Response(JSON.stringify(data, null, 2), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
