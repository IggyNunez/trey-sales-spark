import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, getCorsHeaders, handleCors } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCors(req);
  }

  try {
    const { api_key } = await req.json();

    if (!api_key) {
      return new Response(
        JSON.stringify({ valid: false, error: "No API key provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove ALL whitespace and newlines from API key
    const cleanKey = api_key.replace(/\s+/g, '');
    
    console.log('Validating HubSpot key, length:', cleanKey.length, 'first 10 chars:', cleanKey.substring(0, 10));

    // Try the contacts endpoint to validate the key
    let response: Response;
    
    try {
      response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: {
          'Authorization': `Bearer ${cleanKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('HubSpot response status:', response.status);
      
      // If it works, key is valid
      if (response.ok) {
        console.log('Key validated successfully');
        return new Response(
          JSON.stringify({ valid: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } catch (fetchError) {
      console.error('Network error:', fetchError);
      return new Response(
        JSON.stringify({ valid: false, error: 'Network error connecting to HubSpot. Please try again.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Handle rate limiting
    if (response.status === 429) {
      console.log('Rate limited by HubSpot');
      return new Response(
        JSON.stringify({ valid: false, error: 'HubSpot rate limit reached. Please wait a moment and try again.' }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Try to parse error response
    const responseText = await response.text();
    console.log('HubSpot error response:', responseText.substring(0, 500));
    
    let errorData: Record<string, unknown> = {};
    try {
      errorData = JSON.parse(responseText);
    } catch {
      console.log('Could not parse error response as JSON');
    }
    
    const category = errorData.category as string | undefined;
    console.log('Error category:', category, 'Status:', response.status);
    
    // Simplified error message for any auth failure
    let errorMessage = 'Could not authenticate with HubSpot. Please verify your Personal Access Key is correct and has the required scopes.';

    // Only customize for missing scopes
    if (category === 'MISSING_SCOPES') {
      errorMessage = "This key is missing the required 'crm.objects.contacts.read' permission.";
    }

    return new Response(
      JSON.stringify({ 
        valid: false, 
        error: errorMessage,
        status: response.status 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error('Validation error:', err);
    return new Response(
      JSON.stringify({ valid: false, error: 'Server error while validating API key' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});