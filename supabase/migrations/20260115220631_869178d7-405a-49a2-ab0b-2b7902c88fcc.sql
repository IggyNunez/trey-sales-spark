-- Add pcf_field_id column to metric_definitions for tracking form field responses
ALTER TABLE public.metric_definitions
ADD COLUMN IF NOT EXISTS pcf_field_id TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.metric_definitions.pcf_field_id IS 'The form field ID to track when data_source is pcf_fields';