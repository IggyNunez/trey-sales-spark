ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS pcf_outcome_label TEXT;