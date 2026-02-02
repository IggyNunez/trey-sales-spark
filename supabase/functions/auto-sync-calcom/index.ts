import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCors } from "../_shared/cors.ts";

/**
 * Auto-sync Cal.com bookings for all organizations with Cal.com enabled.
 * Triggered hourly via cron job to catch any missed webhook events.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("Starting Cal.com auto-sync for all organizations...");

  try {
    // Get all orgs with Cal.com connected and auto-sync enabled
    const { data: orgs, error: orgsError } = await supabase
      .from('organization_integrations')
      .select('organization_id, calcom_excluded_event_type_ids, calcom_auto_sync_enabled')
      .not('calcom_api_key_encrypted', 'is', null)
      .eq('calcom_auto_sync_enabled', true);

    if (orgsError) {
      console.error('Failed to fetch organizations:', orgsError);
      return new Response(JSON.stringify({ error: orgsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!orgs || orgs.length === 0) {
      console.log('No organizations with Cal.com auto-sync enabled');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No organizations to sync',
        synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Found ${orgs.length} organizations to sync`);

    const results: Array<{
      orgId: string;
      success: boolean;
      created?: number;
      updated?: number;
      skipped?: number;
      error?: string;
    }> = [];

    // Calculate date range: last 2 hours to catch missed webhooks
    const now = new Date();
    const startDate = new Date(now.getTime() - 2 * 60 * 60 * 1000); // 2 hours ago
    const endDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours ahead to catch upcoming

    for (const org of orgs) {
      try {
        console.log(`Syncing Cal.com for org ${org.organization_id}...`);

        // Call sync-calcom for this org
        const response = await fetch(`${supabaseUrl}/functions/v1/sync-calcom`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            organizationId: org.organization_id,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            status: 'all',
            excludedEventTypeIds: org.calcom_excluded_event_type_ids || [],
          }),
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || `HTTP ${response.status}`);
        }

        // Update last sync timestamp
        await supabase
          .from('organization_integrations')
          .update({ calcom_last_auto_sync_at: new Date().toISOString() })
          .eq('organization_id', org.organization_id);

        results.push({
          orgId: org.organization_id,
          success: true,
          created: data.created || 0,
          updated: data.updated || 0,
          skipped: data.skipped || 0,
        });

        console.log(`Org ${org.organization_id}: created=${data.created}, updated=${data.updated}, skipped=${data.skipped}`);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`Failed to sync org ${org.organization_id}:`, errorMessage);
        results.push({
          orgId: org.organization_id,
          success: false,
          error: errorMessage,
        });
      }

      // Small delay between orgs to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    const successCount = results.filter(r => r.success).length;
    const totalCreated = results.reduce((sum, r) => sum + (r.created || 0), 0);
    const totalUpdated = results.reduce((sum, r) => sum + (r.updated || 0), 0);

    console.log(`Auto-sync complete: ${successCount}/${results.length} orgs synced, ${totalCreated} created, ${totalUpdated} updated`);

    return new Response(JSON.stringify({
      success: true,
      synced: successCount,
      total: results.length,
      totalCreated,
      totalUpdated,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in auto-sync-calcom:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
