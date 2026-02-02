-- Add event_name column to store the Calendly event type name
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS event_name TEXT;