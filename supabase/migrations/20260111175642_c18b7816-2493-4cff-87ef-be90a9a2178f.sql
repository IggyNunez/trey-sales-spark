-- Add exclude_overdue_pcf column to metric_definitions table
ALTER TABLE public.metric_definitions 
ADD COLUMN IF NOT EXISTS exclude_overdue_pcf boolean DEFAULT false;