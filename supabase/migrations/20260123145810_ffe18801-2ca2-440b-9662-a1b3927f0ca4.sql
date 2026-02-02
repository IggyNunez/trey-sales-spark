-- Drop and recreate the check constraint to allow more time scope values
ALTER TABLE public.dataset_calculated_fields DROP CONSTRAINT IF EXISTS dataset_calculated_fields_time_scope_check;

ALTER TABLE public.dataset_calculated_fields ADD CONSTRAINT dataset_calculated_fields_time_scope_check 
  CHECK (time_scope = ANY (ARRAY['all'::text, 'today'::text, 'week'::text, 'month'::text, 'mtd'::text, 'quarter'::text, 'year'::text, 'ytd'::text, 'rolling_7d'::text, 'rolling_30d'::text, 'custom'::text]));