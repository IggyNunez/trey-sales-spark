-- Add new values to the event_outcome enum
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'not_qualified';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'rescheduled';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'canceled';