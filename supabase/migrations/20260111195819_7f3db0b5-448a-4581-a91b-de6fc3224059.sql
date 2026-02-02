-- Add date_field column to metric_definitions for date-based filtering differentiation
ALTER TABLE public.metric_definitions 
ADD COLUMN IF NOT EXISTS date_field text DEFAULT 'scheduled_at';

-- Add a check constraint to validate date_field values
ALTER TABLE public.metric_definitions 
ADD CONSTRAINT metric_definitions_date_field_check 
CHECK (date_field = ANY (ARRAY['scheduled_at'::text, 'booked_at'::text, 'payment_date'::text, 'created_at'::text]));