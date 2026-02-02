import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface OverduePCFRequest {
  organization_id: string;
  dry_run?: boolean; // If true, return message instead of sending to Slack
}

interface CloserWithOverdue {
  closer_name: string;
  closer_email: string | null;
  overdue_count: number;
  oldest_overdue: string;
  events: Array<{
    lead_name: string;
    scheduled_at: string;
  }>;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const slackWebhookUrl = Deno.env.get("SLACK_WEBHOOK_URL");
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { organization_id, dry_run = false }: OverduePCFRequest = await req.json();

    if (!organization_id) {
      throw new Error("organization_id is required");
    }

    console.log(`Checking overdue PCFs for org: ${organization_id}, dry_run: ${dry_run}`);

    // Get current time
    const now = new Date();
    
    // Find events that:
    // 1. Are in the past (scheduled_at < now)
    // 2. Have not had a PCF submitted (pcf_submitted = false)
    // 3. Are not cancelled
    const { data: overdueEvents, error: eventsError } = await supabase
      .from("events")
      .select(`
        id,
        lead_name,
        closer_name,
        closer_email,
        scheduled_at,
        call_status,
        pcf_submitted
      `)
      .eq("organization_id", organization_id)
      .eq("pcf_submitted", false)
      .lt("scheduled_at", now.toISOString())
      .neq("call_status", "cancelled")
      .order("scheduled_at", { ascending: true });

    if (eventsError) {
      console.error("Error fetching overdue events:", eventsError);
      throw eventsError;
    }

    console.log(`Found ${overdueEvents?.length || 0} overdue PCFs`);

    if (!overdueEvents || overdueEvents.length === 0) {
      console.log("No overdue PCFs found!");
      return new Response(
        JSON.stringify({
          success: true,
          message: "No overdue PCFs found",
          overdue_count: 0
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Group by closer
    const closerMap = new Map<string, CloserWithOverdue>();
    
    for (const event of overdueEvents) {
      const closerName = event.closer_name || "Unassigned";
      
      if (!closerMap.has(closerName)) {
        closerMap.set(closerName, {
          closer_name: closerName,
          closer_email: event.closer_email,
          overdue_count: 0,
          oldest_overdue: event.scheduled_at,
          events: []
        });
      }
      
      const closer = closerMap.get(closerName)!;
      closer.overdue_count++;
      closer.events.push({
        lead_name: event.lead_name,
        scheduled_at: event.scheduled_at
      });
      
      // Track oldest overdue
      if (new Date(event.scheduled_at) < new Date(closer.oldest_overdue)) {
        closer.oldest_overdue = event.scheduled_at;
      }
    }

    const closersWithOverdue = Array.from(closerMap.values())
      .sort((a, b) => b.overdue_count - a.overdue_count);

    console.log(`${closersWithOverdue.length} closers with overdue PCFs`);

    // Format time difference for display
    const formatTimeSince = (dateStr: string): string => {
      const diff = now.getTime() - new Date(dateStr).getTime();
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      
      if (days > 0) {
        return `${days}d ${hours % 24}h ago`;
      }
      return `${hours}h ago`;
    };

    // Build Slack message
    const totalOverdue = overdueEvents.length;
    
    const closersList = closersWithOverdue.map(closer => {
      const oldestTime = formatTimeSince(closer.oldest_overdue);
      return `• *${closer.closer_name}*: ${closer.overdue_count} overdue (oldest: ${oldestTime})`;
    }).join("\n");

    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "⚠️ Overdue Post-Call Forms Alert",
            emoji: true
          }
        },
        {
          type: "divider"
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${totalOverdue} post-call forms are overdue!*\n\nThe following closers have pending forms:\n\n${closersList}`
          }
        },
        {
          type: "divider"
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "💡 _Please submit your post-call forms promptly to keep our data accurate._"
            }
          ]
        }
      ]
    };

    // If dry run or no webhook URL, return the message
    if (dry_run || !slackWebhookUrl) {
      console.log("Dry run mode - returning message without sending");
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "Message generated (not sent - no webhook configured or dry run)",
          slack_payload: slackMessage,
          stats: {
            total_overdue: totalOverdue,
            closers_with_overdue: closersWithOverdue.length,
            closers: closersWithOverdue.map(c => ({
              name: c.closer_name,
              overdue_count: c.overdue_count,
              oldest_overdue: c.oldest_overdue,
              oldest_overdue_relative: formatTimeSince(c.oldest_overdue)
            }))
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to Slack
    console.log("Sending overdue PCF reminder to Slack...");
    const slackResponse = await fetch(slackWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(slackMessage)
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      console.error("Slack API error:", errorText);
      throw new Error(`Slack API error: ${errorText}`);
    }

    console.log("Overdue PCF reminder sent successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Overdue PCF reminder sent to Slack",
        stats: {
          total_overdue: totalOverdue,
          closers_with_overdue: closersWithOverdue.length
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in slack-overdue-pcf-reminder:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
