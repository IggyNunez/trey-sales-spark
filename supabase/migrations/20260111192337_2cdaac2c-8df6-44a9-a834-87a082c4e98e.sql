-- Drop the old constraint and add a new one that includes 'sum'
ALTER TABLE public.metric_definitions 
DROP CONSTRAINT IF EXISTS metric_definitions_formula_type_check;

ALTER TABLE public.metric_definitions 
ADD CONSTRAINT metric_definitions_formula_type_check 
CHECK (formula_type = ANY (ARRAY['count'::text, 'sum'::text, 'percentage'::text, 'currency'::text, 'ratio'::text]));