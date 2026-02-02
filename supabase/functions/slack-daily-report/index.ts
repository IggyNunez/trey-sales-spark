import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

interface DailyReportRequest {
  organization_id: string;
  dry_run?: boolean;
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

    // SECURITY: Verify caller is authenticated and is admin/super_admin
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      console.error('SECURITY: No authorization header provided');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      console.error('SECURITY: Invalid token:', claimsError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const callerUserId = claims.claims.sub as string;

    // Verify caller has admin or super_admin role
    const { data: callerRoles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', callerUserId);

    const isAdmin = callerRoles?.some(r => ['admin', 'super_admin'].includes(r.role));
    if (!isAdmin) {
      console.error('SECURITY: User is not admin:', callerUserId);
      return new Response(
        JSON.stringify({ error: 'Forbidden - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Authenticated admin user:', callerUserId);

    const { organization_id, dry_run = false }: DailyReportRequest = await req.json();

    if (!organization_id) {
      throw new Error("organization_id is required");
    }

    // SECURITY: Verify caller has access to this organization
    const { data: callerMembership } = await supabase
      .from('organization_members')
      .select('role')
      .eq('user_id', callerUserId)
      .eq('organization_id', organization_id)
      .maybeSingle();

    const isSuperAdmin = callerRoles?.some(r => r.role === 'super_admin');
    if (!isSuperAdmin && !callerMembership) {
      console.error('SECURITY: User has no access to org:', organization_id);
      return new Response(
        JSON.stringify({ error: 'Forbidden - No access to this organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Generating daily report for org: ${organization_id}, dry_run: ${dry_run}`);

    // Get date boundaries in EST
    const now = new Date();
    const estOffset = -5 * 60; // EST is UTC-5
    const estNow = new Date(now.getTime() + (estOffset - now.getTimezoneOffset()) * 60000);
    
    // Yesterday's date range
    const yesterdayStart = new Date(estNow);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    yesterdayStart.setHours(0, 0, 0, 0);
    
    const yesterdayEnd = new Date(estNow);
    yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
    yesterdayEnd.setHours(23, 59, 59, 999);

    // Today's date range
    const todayStart = new Date(estNow);
    todayStart.setHours(0, 0, 0, 0);
    
    const todayEnd = new Date(estNow);
    todayEnd.setHours(23, 59, 59, 999);

    // First of month to yesterday (for overdue PCFs)
    const monthStart = new Date(estNow);
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    // Convert to UTC for database queries
    const yesterdayStartUTC = new Date(yesterdayStart.getTime() - estOffset * 60000);
    const yesterdayEndUTC = new Date(yesterdayEnd.getTime() - estOffset * 60000);
    const todayStartUTC = new Date(todayStart.getTime() - estOffset * 60000);
    const todayEndUTC = new Date(todayEnd.getTime() - estOffset * 60000);
    const monthStartUTC = new Date(monthStart.getTime() - estOffset * 60000);

    console.log(`Yesterday (UTC): ${yesterdayStartUTC.toISOString()} to ${yesterdayEndUTC.toISOString()}`);
    console.log(`Today (UTC): ${todayStartUTC.toISOString()} to ${todayEndUTC.toISOString()}`);
    console.log(`Month start (UTC): ${monthStartUTC.toISOString()}`);

    // 1. Get yesterday's scheduled calls (on calendar)
    const { data: yesterdayEvents, error: eventsError } = await supabase
      .from("events")
      .select("id, lead_name, closer_name, scheduled_at, call_status, event_outcome, pcf_submitted")
      .eq("organization_id", organization_id)
      .gte("scheduled_at", yesterdayStartUTC.toISOString())
      .lte("scheduled_at", yesterdayEndUTC.toISOString());

    if (eventsError) {
      console.error("Error fetching yesterday's events:", eventsError);
      throw eventsError;
    }

    const callsOnCalendar = yesterdayEvents?.length || 0;
    const showedCalls = yesterdayEvents?.filter(e => 
      e.event_outcome === 'closed' || 
      e.event_outcome === 'showed_no_offer' || 
      e.event_outcome === 'showed_offer_no_close'
    ).length || 0;
    const showRate = callsOnCalendar > 0 ? Math.round((showedCalls / callsOnCalendar) * 100) : 0;

    console.log(`Yesterday: ${callsOnCalendar} calls, ${showedCalls} showed (${showRate}%)`);

    // 2. Get yesterday's cash collected
    const { data: yesterdayPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("amount, refund_amount")
      .eq("organization_id", organization_id)
      .gte("payment_date", yesterdayStartUTC.toISOString().split("T")[0])
      .lte("payment_date", yesterdayEndUTC.toISOString().split("T")[0]);

    if (paymentsError) {
      console.error("Error fetching payments:", paymentsError);
      throw paymentsError;
    }

    const cashCollected = yesterdayPayments?.reduce((sum, p) => {
      const net = (p.amount || 0) - (p.refund_amount || 0);
      return sum + net;
    }, 0) || 0;
    console.log(`Yesterday cash collected: $${cashCollected}`);

    // 3. Get calls booked yesterday (created_at)
    const { data: bookedYesterday, error: bookedError } = await supabase
      .from("events")
      .select("id")
      .eq("organization_id", organization_id)
      .gte("created_at", yesterdayStartUTC.toISOString())
      .lte("created_at", yesterdayEndUTC.toISOString());

    if (bookedError) {
      console.error("Error fetching booked calls:", bookedError);
      throw bookedError;
    }

    const callsBooked = bookedYesterday?.length || 0;
    console.log(`Calls booked yesterday: ${callsBooked}`);

    // 4. Get today's scheduled calls (on calendar)
    const { data: todayEvents, error: todayError } = await supabase
      .from("events")
      .select("id")
      .eq("organization_id", organization_id)
      .gte("scheduled_at", todayStartUTC.toISOString())
      .lte("scheduled_at", todayEndUTC.toISOString())
      .neq("call_status", "canceled")
      .neq("call_status", "cancelled");

    if (todayError) {
      console.error("Error fetching today's events:", todayError);
      throw todayError;
    }

    const todayCallsOnCalendar = todayEvents?.length || 0;
    console.log(`Today calls on calendar: ${todayCallsOnCalendar}`);

    // 5. Get overdue PCFs (1st of month to yesterday)
    const { data: overdueEvents, error: overdueError } = await supabase
      .from("events")
      .select("id, closer_name, scheduled_at")
      .eq("organization_id", organization_id)
      .eq("pcf_submitted", false)
      .gte("scheduled_at", monthStartUTC.toISOString())
      .lte("scheduled_at", yesterdayEndUTC.toISOString())
      .neq("call_status", "canceled")
      .neq("call_status", "cancelled");

    if (overdueError) {
      console.error("Error fetching overdue PCFs:", overdueError);
      throw overdueError;
    }

    const overduePCFs = overdueEvents || [];
    console.log(`Overdue PCFs (month to yesterday): ${overduePCFs.length}`);

    // Group by closer and count
    const byCloser = overduePCFs.reduce((acc, event) => {
      const closer = event.closer_name || "Unassigned";
      acc[closer] = (acc[closer] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Sort by count descending
    const sortedClosers = Object.entries(byCloser)
      .sort((a, b) => b[1] - a[1]);

    // Format date for header
    const formatDate = (d: Date) => d.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric"
    });
    
    const yesterdayStr = formatDate(yesterdayStart);
    const todayStr = formatDate(todayStart);

    // Build cleaner Slack message with clear sections
    const blocks: any[] = [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Yesterday (${yesterdayStr})*\n📅 ${callsOnCalendar} calls on calendar\n✅ ${showRate}% show rate\n💰 $${cashCollected.toLocaleString()} collected\n📞 ${callsBooked} calls booked`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Today (${todayStr})*\n📅 ${todayCallsOnCalendar} calls on calendar`
        }
      }
    ];

    // Add overdue PCFs section if any
    if (sortedClosers.length > 0) {
      const monthName = monthStart.toLocaleDateString("en-US", { month: "short" });
      const dayOfMonth = yesterdayStart.getDate();
      const overdueRangeStr = dayOfMonth === 1 
        ? `${monthName} 1` 
        : `${monthName} 1-${dayOfMonth}`;

      const closerList = sortedClosers
        .map(([closer, count]) => `${closer}: ${count}`)
        .join("\n");

      blocks.push({
        type: "divider"
      });
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Overdue PCFs (${overdueRangeStr})*\n${overduePCFs.length} total\n\n${closerList}`
        }
      });
    }

    const slackMessage = { blocks };

    // If dry run or no webhook URL, return the message
    if (dry_run || !slackWebhookUrl) {
      console.log("Dry run mode - returning message without sending");
      return new Response(
        JSON.stringify({
          success: true,
          dry_run: true,
          message: "Message generated (not sent)",
          slack_payload: slackMessage,
          stats: {
            yesterday_calls_on_calendar: callsOnCalendar,
            yesterday_showed_calls: showedCalls,
            yesterday_show_rate: showRate,
            yesterday_cash_collected: cashCollected,
            yesterday_calls_booked: callsBooked,
            today_calls_on_calendar: todayCallsOnCalendar,
            overdue_pcfs: overduePCFs.length
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send to Slack
    console.log("Sending message to Slack...");
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

    console.log("Daily report sent successfully!");

    return new Response(
      JSON.stringify({
        success: true,
        message: "Daily report sent to Slack",
        stats: {
          yesterday_calls_on_calendar: callsOnCalendar,
          yesterday_showed_calls: showedCalls,
          yesterday_show_rate: showRate,
          yesterday_cash_collected: cashCollected,
          yesterday_calls_booked: callsBooked,
          today_calls_on_calendar: todayCallsOnCalendar,
          overdue_pcfs: overduePCFs.length
        }
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in slack-daily-report:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
