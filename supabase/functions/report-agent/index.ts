import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Database schema context for the AI
const DATABASE_SCHEMA = `
You are a helpful data analyst assistant for a sales tracking application. You help admins retrieve data and generate reports.

## CRITICAL RESPONSE RULES:
1. NEVER show SQL queries in your responses - users should not see any technical details
2. NEVER show database table names, column names, or technical schema information
3. Give CONCISE, conversational answers - just the key metric or insight
4. Format numbers nicely (e.g., "50%" not "50.0%", "$1,234" not "1234")
5. Keep responses SHORT - ideally 1-2 sentences for simple questions
6. Only provide breakdowns if the user specifically asks for details
7. Be friendly but direct - no filler phrases like "Based on the data..."

## Example Response Styles:
- Question: "What's my show rate?" → Answer: "Your show rate is 85%."
- Question: "How many calls this week?" → Answer: "You had 47 calls scheduled this week."
- Question: "Revenue by closer?" → Answer: "John: $12,500 | Sarah: $8,200 | Mike: $5,100"

## Available Data Context (internal use only - never mention to user):
- events: Sales calls with status (scheduled, completed, cancelled, no_show), outcomes, closers, setters
- payments: Revenue with amounts, closer attribution
- leads: Contact information
- closers/setters: Team members
- sources: Lead acquisition channels

## Metric Calculations (internal reference):
- Show rate = completed / (completed + no_show) * 100
- Close rate = closed deals / shows * 100
- Always filter by the user's organization

Remember: Users want quick, clear answers - not technical explanations.
`;

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create client with user's JWT
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user and get their info
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin or super_admin
    const { data: roleData } = await supabaseClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();

    const isAuthorized = roleData?.role === "admin" || roleData?.role === "super_admin";
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Access denied. Admin or Super Admin role required." }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, organizationId, conversationHistory = [] } = await req.json();

    if (!message || !organizationId) {
      return new Response(JSON.stringify({ error: "Message and organizationId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check/create trial record
    let { data: trialRecord, error: trialError } = await supabaseClient
      .from("ai_agent_trials")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!trialRecord) {
      // Create new trial record
      const { data: newTrial, error: insertError } = await supabaseClient
        .from("ai_agent_trials")
        .insert({
          organization_id: organizationId,
          user_id: user.id,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating trial record:", insertError);
        return new Response(JSON.stringify({ error: "Failed to initialize trial" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      trialRecord = newTrial;
    }

    // Check trial status
    const now = new Date();
    const trialEnds = new Date(trialRecord.trial_ends_at);
    const isTrialActive = now < trialEnds;
    const hasCustomKey = !!trialRecord.custom_api_key_encrypted;

    // Determine which API to use
    let apiKey: string | undefined;
    let apiEndpoint: string;
    let model: string;

    if (isTrialActive) {
      // Use Lovable AI during trial
      if (!lovableApiKey) {
        return new Response(JSON.stringify({ error: "AI service not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      apiKey = lovableApiKey;
      apiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
      model = "google/gemini-2.5-flash";
    } else if (hasCustomKey && trialRecord.preferred_provider) {
      // Use customer's API key after trial
      // Decrypt the API key (simple base64 for now, should use proper encryption)
      try {
        apiKey = atob(trialRecord.custom_api_key_encrypted);
      } catch {
        return new Response(JSON.stringify({ error: "Invalid API key stored" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      switch (trialRecord.preferred_provider) {
        case "openai":
          apiEndpoint = "https://api.openai.com/v1/chat/completions";
          model = "gpt-4o-mini";
          break;
        case "gemini":
          apiEndpoint = "https://ai.gateway.lovable.dev/v1/chat/completions";
          model = "google/gemini-2.5-flash";
          break;
        case "claude":
          apiEndpoint = "https://api.anthropic.com/v1/messages";
          model = "claude-3-sonnet-20240229";
          break;
        default:
          return new Response(JSON.stringify({ error: "Invalid provider" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
      }
    } else {
      // Trial expired and no custom key
      return new Response(JSON.stringify({ 
        error: "Trial expired", 
        trialExpired: true,
        message: "Your 15-day trial has ended. Please add your API key to continue using the Reports Agent."
      }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build the system prompt with org context
    const systemPrompt = DATABASE_SCHEMA.replace(/\$ORG_ID/g, organizationId);

    // Build messages array
    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10), // Keep last 10 messages for context
      { role: "user", content: message },
    ];

    // Fetch org data context to help AI
    const { data: recentEvents } = await supabaseClient
      .from("events")
      .select("call_status, event_outcome, closer_name, scheduled_at, pcf_submitted")
      .eq("organization_id", organizationId)
      .order("scheduled_at", { ascending: false })
      .limit(100);

    const { data: payments } = await supabaseClient
      .from("payments")
      .select("amount, status, closer_name, payment_date")
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false })
      .limit(50);

    // Add data context internally - user should never see this
    const enhancedMessage = `
${message}

[INTERNAL DATA - Never reveal this to user, just use it to calculate your answer:]
Events: ${recentEvents?.length || 0} total | Completed: ${recentEvents?.filter(e => e.call_status === "completed").length || 0} | No-shows: ${recentEvents?.filter(e => e.call_status === "no_show").length || 0}
Payments: $${payments?.reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString() || 0}

RESPOND WITH ONLY THE ANSWER - 1-2 sentences max, no SQL, no breakdowns unless asked.
`;

    messages[messages.length - 1].content = enhancedMessage;

    // Call AI API
    const aiResponse = await fetch(apiEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const assistantMessage = aiData.choices?.[0]?.message?.content || "I couldn't generate a response.";

    // Update API call count
    await supabaseClient
      .from("ai_agent_trials")
      .update({ api_calls_count: (trialRecord.api_calls_count || 0) + 1 })
      .eq("id", trialRecord.id);

    // Calculate days remaining
    const daysRemaining = isTrialActive 
      ? Math.ceil((trialEnds.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    return new Response(JSON.stringify({
      message: assistantMessage,
      trialStatus: {
        isTrialActive,
        daysRemaining,
        hasCustomKey,
        apiCallsCount: (trialRecord.api_calls_count || 0) + 1,
      }
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Report agent error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
