-- Phase 5: Auto-sync HubSpot contacts for new Trenton events
-- Enable pg_net extension for HTTP requests from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to trigger HubSpot contact lookup
CREATE OR REPLACE FUNCTION public.trigger_hubspot_contact_lookup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  supabase_url TEXT;
  service_key TEXT;
BEGIN
  -- Only process for Trenton organization
  IF NEW.organization_id = 'c208c810-fb8d-4d7a-b592-db2d2868d8ed' 
     AND NEW.lead_email IS NOT NULL 
     AND NEW.hubspot_contact_id IS NULL THEN
    
    -- Get Supabase URL and service key from vault
    SELECT decrypted_secret INTO supabase_url 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_URL' 
    LIMIT 1;
    
    SELECT decrypted_secret INTO service_key 
    FROM vault.decrypted_secrets 
    WHERE name = 'SUPABASE_SERVICE_ROLE_KEY' 
    LIMIT 1;
    
    -- Only proceed if we have the required secrets
    IF supabase_url IS NOT NULL AND service_key IS NOT NULL THEN
      -- Make async HTTP POST to sync-hubspot-contacts function
      PERFORM net.http_post(
        url := supabase_url || '/functions/v1/sync-hubspot-contacts',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || service_key
        ),
        body := jsonb_build_object(
          'organization_id', NEW.organization_id,
          'limit', 1
        )
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger on events table for new inserts
DROP TRIGGER IF EXISTS trigger_hubspot_lookup_on_event_insert ON public.events;
CREATE TRIGGER trigger_hubspot_lookup_on_event_insert
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_hubspot_contact_lookup();