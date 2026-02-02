import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getApiKey } from "../_shared/get-api-key.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get('Origin'));
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { organizationId, closeUserIds, startDate, endDate } = await req.json();

    if (!organizationId) {
      return new Response(JSON.stringify({ error: 'organizationId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // SECURITY: Get the Close API key using encrypted key helper instead of plaintext
    const closeApiKey = await getApiKey(supabaseUrl, supabaseKey, organizationId, 'close', 'sync-close-activities');

    if (!closeApiKey) {
      return new Response(JSON.stringify({ error: 'Close API key not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = 'Basic ' + btoa(closeApiKey + ':');

    // Default to today if no dates provided
    const queryStartDate = startDate || new Date().toISOString().split('T')[0];
    const queryEndDate = endDate || new Date().toISOString().split('T')[0];

    // If no specific user IDs provided, get all setters with close_user_id
    let userIdsToSync = closeUserIds;
    if (!userIdsToSync || userIdsToSync.length === 0) {
      const { data: setters } = await supabase
        .from('setters')
        .select('close_user_id')
        .eq('organization_id', organizationId)
        .not('close_user_id', 'is', null);
      
      userIdsToSync = setters?.map(s => s.close_user_id).filter(Boolean) || [];
    }

    if (userIdsToSync.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No setters with Close user IDs configured',
        synced: 0 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const results: any[] = [];

    for (const closeUserId of userIdsToSync) {
      // Initialize daily aggregates
      const dailyStats: Record<string, {
        total_dials: number;
        connected_calls: number;
        voicemails_left: number;
        total_talk_time_seconds: number;
        emails_sent: number;
        sms_sent: number;
      }> = {};

      // Fetch calls (dials)
      let hasMoreCalls = true;
      let callsSkip = 0;
      
      while (hasMoreCalls) {
        const callsQuery = new URLSearchParams({
          user_id: closeUserId,
          direction: 'outbound',
          date_created__gte: queryStartDate,
          date_created__lte: queryEndDate + 'T23:59:59',
          _skip: callsSkip.toString(),
          _limit: '100',
        });

        const callsResponse = await fetch(
          `https://api.close.com/api/v1/activity/call/?${callsQuery}`,
          { headers: { 'Authorization': authHeader } }
        );

        if (!callsResponse.ok) {
          console.error('Failed to fetch calls:', await callsResponse.text());
          break;
        }

        const callsData = await callsResponse.json();
        const calls = callsData.data || [];

        for (const call of calls) {
          const date = call.date_created?.split('T')[0];
          if (!date) continue;

          if (!dailyStats[date]) {
            dailyStats[date] = {
              total_dials: 0,
              connected_calls: 0,
              voicemails_left: 0,
              total_talk_time_seconds: 0,
              emails_sent: 0,
              sms_sent: 0,
            };
          }

          dailyStats[date].total_dials++;

          if (call.disposition === 'answered') {
            dailyStats[date].connected_calls++;
            dailyStats[date].total_talk_time_seconds += call.duration || 0;
          } else if (call.disposition === 'vm-left') {
            dailyStats[date].voicemails_left++;
          }
        }

        hasMoreCalls = calls.length === 100;
        callsSkip += 100;
      }

      // Fetch emails sent
      let hasMoreEmails = true;
      let emailsSkip = 0;

      while (hasMoreEmails) {
        const emailsQuery = new URLSearchParams({
          user_id: closeUserId,
          direction: 'outgoing',
          date_created__gte: queryStartDate,
          date_created__lte: queryEndDate + 'T23:59:59',
          _skip: emailsSkip.toString(),
          _limit: '100',
        });

        const emailsResponse = await fetch(
          `https://api.close.com/api/v1/activity/email/?${emailsQuery}`,
          { headers: { 'Authorization': authHeader } }
        );

        if (!emailsResponse.ok) {
          console.error('Failed to fetch emails:', await emailsResponse.text());
          break;
        }

        const emailsData = await emailsResponse.json();
        const emails = emailsData.data || [];

        for (const email of emails) {
          const date = email.date_created?.split('T')[0];
          if (!date) continue;

          if (!dailyStats[date]) {
            dailyStats[date] = {
              total_dials: 0,
              connected_calls: 0,
              voicemails_left: 0,
              total_talk_time_seconds: 0,
              emails_sent: 0,
              sms_sent: 0,
            };
          }

          dailyStats[date].emails_sent++;
        }

        hasMoreEmails = emails.length === 100;
        emailsSkip += 100;
      }

      // Fetch SMS sent
      let hasMoreSms = true;
      let smsSkip = 0;

      while (hasMoreSms) {
        const smsQuery = new URLSearchParams({
          user_id: closeUserId,
          direction: 'outbound',
          date_created__gte: queryStartDate,
          date_created__lte: queryEndDate + 'T23:59:59',
          _skip: smsSkip.toString(),
          _limit: '100',
        });

        const smsResponse = await fetch(
          `https://api.close.com/api/v1/activity/sms/?${smsQuery}`,
          { headers: { 'Authorization': authHeader } }
        );

        if (!smsResponse.ok) {
          console.error('Failed to fetch SMS:', await smsResponse.text());
          break;
        }

        const smsData = await smsResponse.json();
        const smsMessages = smsData.data || [];

        for (const sms of smsMessages) {
          const date = sms.date_created?.split('T')[0];
          if (!date) continue;

          if (!dailyStats[date]) {
            dailyStats[date] = {
              total_dials: 0,
              connected_calls: 0,
              voicemails_left: 0,
              total_talk_time_seconds: 0,
              emails_sent: 0,
              sms_sent: 0,
            };
          }

          dailyStats[date].sms_sent++;
        }

        hasMoreSms = smsMessages.length === 100;
        smsSkip += 100;
      }

      // Find the setter_id for this close_user_id
      const { data: setter } = await supabase
        .from('setters')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('close_user_id', closeUserId)
        .single();

      // Upsert daily stats
      for (const [date, stats] of Object.entries(dailyStats)) {
        const { error: upsertError } = await supabase
          .from('setter_activities')
          .upsert({
            organization_id: organizationId,
            setter_id: setter?.id || null,
            close_user_id: closeUserId,
            activity_date: date,
            ...stats,
          }, {
            onConflict: 'organization_id,close_user_id,activity_date',
          });

        if (upsertError) {
          console.error('Failed to upsert activity:', upsertError);
        } else {
          results.push({ closeUserId, date, ...stats });
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      synced: results.length,
      results 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    console.error('Error syncing Close activities:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
