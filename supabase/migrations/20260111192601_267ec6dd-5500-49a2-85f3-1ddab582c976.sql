-- Add data_source column to metric_definitions for differentiating events vs payments data
ALTER TABLE public.metric_definitions 
ADD COLUMN IF NOT EXISTS data_source text DEFAULT 'events';

-- Add a check constraint to validate data_source values
ALTER TABLE public.metric_definitions 
ADD CONSTRAINT metric_definitions_data_source_check 
CHECK (data_source = ANY (ARRAY['events'::text, 'payments'::text]));