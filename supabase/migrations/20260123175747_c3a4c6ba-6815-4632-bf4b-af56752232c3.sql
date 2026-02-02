-- Drop the existing check constraint and add a new one with additional widget types
ALTER TABLE public.dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_widget_type_check 
CHECK (widget_type IN ('card', 'number', 'line', 'bar', 'pie', 'table', 'gauge', 'multi-bar', 'summary'));