import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const url = new URL(req.url);
    const connectionId = url.searchParams.get("connection_id");

    if (!connectionId) {
      return new Response(
        JSON.stringify({ error: "Missing connection_id parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the webhook connection to find the organization
    const { data: connection, error: connError } = await supabase
      .from("webhook_connections")
      .select("organization_id, name, sync_count")
      .eq("id", connectionId)
      .single();

    if (connError || !connection) {
      console.error("Connection not found:", connError);
      return new Response(
        JSON.stringify({ error: "Invalid connection" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();
    console.log("ManyChat webhook received:", JSON.stringify(payload, null, 2));

    /*
    ManyChat sends data in this format when triggered from a flow:
    {
      "id": "123456789",
      "key": "subscriber_key",
      "page_id": "page_id",
      "status": "active",
      "first_name": "John",
      "last_name": "Doe",
      "name": "John Doe",
      "gender": "male",
      "profile_pic": "https://...",
      "locale": "en_US",
      "language": "English",
      "timezone": "America/New_York",
      "live_chat_url": "https://...",
      "subscribed": "2024-01-01T00:00:00+00:00",
      "last_interaction": "2024-01-15T12:00:00+00:00",
      "last_seen": "2024-01-15T12:00:00+00:00",
      "is_followup_enabled": true,
      "ig_username": "@username",
      "ig_id": "ig_id",
      "whatsapp_phone": "+1234567890",
      "optin_phone": "+1234567890",
      "phone": "+1234567890",
      "optin_email": "email@example.com",
      "email": "email@example.com",
      "custom_fields": {
        "field_name": "value"
      },
      "tags": ["tag1", "tag2", "call_booked"]
    }
    */

    // Extract relevant data from ManyChat payload
    const subscriberId = payload.id || payload.subscriber_id;
    const name = payload.name || `${payload.first_name || ""} ${payload.last_name || ""}`.trim();
    const email = payload.email || payload.optin_email;
    const phone = payload.phone || payload.optin_phone || payload.whatsapp_phone;
    const igUsername = payload.ig_username;
    const tags = payload.tags || [];
    const customFields = payload.custom_fields || {};
    
    // Determine event type based on tags or custom fields
    let eventType = "manychat_lead";
    let eventOutcome = "pending";
    
    // Check for call-related tags
    const callTags = ["call_booked", "booked", "scheduled", "appointment"];
    const hasCallTag = tags.some((tag: string) => 
      callTags.some(ct => tag.toLowerCase().includes(ct))
    );
    
    if (hasCallTag) {
      eventType = "call_booked";
      eventOutcome = "pending";
    }
    
    // Check for conversation tags
    const convTags = ["conversation", "dm", "messaged", "replied"];
    const hasConvTag = tags.some((tag: string) =>
      convTags.some(ct => tag.toLowerCase().includes(ct))
    );
    
    if (hasConvTag) {
      eventType = "conversation";
    }

    // Create an event record
    const eventData = {
      organization_id: connection.organization_id,
      event_type: eventType,
      event_name: `ManyChat: ${eventType}`,
      event_outcome: eventOutcome,
      invitee_name: name || "Unknown",
      invitee_email: email,
      lead_phone: phone,
      lead_source: igUsername ? `Instagram: ${igUsername}` : "ManyChat",
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      external_event_id: `manychat_${subscriberId}_${Date.now()}`,
      raw_payload: payload,
    };

    const { data: event, error: insertError } = await supabase
      .from("events")
      .insert(eventData)
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting event:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create event", details: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update connection last activity
    await supabase
      .from("webhook_connections")
      .update({ 
        last_activity: new Date().toISOString(),
        sync_count: connection.sync_count ? connection.sync_count + 1 : 1
      })
      .eq("id", connectionId);

    console.log("Created event:", event.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        event_id: event.id,
        event_type: eventType,
        message: `Event created for ${name || subscriberId}`
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("ManyChat webhook error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
