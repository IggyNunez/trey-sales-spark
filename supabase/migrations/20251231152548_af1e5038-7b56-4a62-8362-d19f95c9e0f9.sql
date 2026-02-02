-- Make event_id nullable on payments table so we can store payments without events
ALTER TABLE public.payments ALTER COLUMN event_id DROP NOT NULL;