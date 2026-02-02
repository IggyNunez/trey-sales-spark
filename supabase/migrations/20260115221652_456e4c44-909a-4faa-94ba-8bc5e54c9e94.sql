-- Drop the old constraint and add a new one that includes 'pcf_fields'
ALTER TABLE public.metric_definitions 
DROP CONSTRAINT IF EXISTS metric_definitions_data_source_check;

ALTER TABLE public.metric_definitions 
ADD CONSTRAINT metric_definitions_data_source_check 
CHECK (data_source = ANY (ARRAY['events'::text, 'payments'::text, 'pcf_fields'::text]));