-- Add custom_domain column to portal_settings table
ALTER TABLE public.portal_settings 
ADD COLUMN IF NOT EXISTS custom_domain TEXT DEFAULT NULL;