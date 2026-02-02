-- Add hubspot to the crm_type enum
ALTER TYPE public.crm_type ADD VALUE IF NOT EXISTS 'hubspot';

-- Add hubspot_api_key column to organization_integrations
ALTER TABLE public.organization_integrations 
ADD COLUMN IF NOT EXISTS hubspot_api_key text;