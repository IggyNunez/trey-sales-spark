-- Add HubSpot contact ID column to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS hubspot_contact_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_events_hubspot_contact_id ON public.events(hubspot_contact_id);

-- Add comment for documentation
COMMENT ON COLUMN public.events.hubspot_contact_id IS 'HubSpot contact ID (vid) for this lead';