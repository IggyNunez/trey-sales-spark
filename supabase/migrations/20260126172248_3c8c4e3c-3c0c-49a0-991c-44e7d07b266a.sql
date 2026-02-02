-- Add JSONB column to events for storing Close CRM custom field values
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS close_custom_fields JSONB DEFAULT '{}';

-- Create a GIN index for efficient JSONB filtering
CREATE INDEX IF NOT EXISTS idx_events_close_custom_fields 
ON public.events USING GIN (close_custom_fields);

-- Add comment for documentation
COMMENT ON COLUMN public.events.close_custom_fields IS 'Stores Close CRM custom field values for filtering (e.g., platform, setter, traffic_type)';