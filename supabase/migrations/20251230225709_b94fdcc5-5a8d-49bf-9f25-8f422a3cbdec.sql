-- Add closer_name column to events table to store the Calendly host name
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS closer_name text;