
-- Add booked_at column to events table to store the original Calendly booking timestamp
ALTER TABLE public.events 
ADD COLUMN booked_at TIMESTAMP WITH TIME ZONE;

-- Set existing events' booked_at to their created_at as a fallback
UPDATE public.events SET booked_at = created_at WHERE booked_at IS NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.events.booked_at IS 'Original booking timestamp from Calendly (when the invitee actually booked the call)';
