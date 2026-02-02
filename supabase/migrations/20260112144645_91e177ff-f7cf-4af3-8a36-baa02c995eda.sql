-- Add GHL contact ID column to events table
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_events_ghl_contact_id ON public.events(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN public.events.ghl_contact_id IS 'Go High Level contact ID for syncing PCF data back to GHL';