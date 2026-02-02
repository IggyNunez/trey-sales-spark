-- Add primary_crm and secondary_crm fields to organization_integrations
-- This enables dynamic CRM handling across the application

-- Create enum type for supported CRMs
DO $$ BEGIN
    CREATE TYPE crm_type AS ENUM ('ghl', 'close', 'hubspot', 'salesforce', 'pipedrive', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum type for supported booking platforms
DO $$ BEGIN
    CREATE TYPE booking_platform_type AS ENUM ('calendly', 'acuity', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create enum type for supported payment processors
DO $$ BEGIN
    CREATE TYPE payment_processor_type AS ENUM ('whop', 'stripe', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to organization_integrations
ALTER TABLE organization_integrations 
ADD COLUMN IF NOT EXISTS primary_crm crm_type DEFAULT 'none',
ADD COLUMN IF NOT EXISTS secondary_crm crm_type DEFAULT NULL,
ADD COLUMN IF NOT EXISTS primary_booking_platform booking_platform_type DEFAULT 'none',
ADD COLUMN IF NOT EXISTS primary_payment_processor payment_processor_type DEFAULT 'none';

-- Auto-detect existing integrations and set primary_crm accordingly
UPDATE organization_integrations
SET primary_crm = CASE 
    WHEN ghl_api_key IS NOT NULL AND ghl_api_key != '' THEN 'ghl'::crm_type
    WHEN close_api_key IS NOT NULL AND close_api_key != '' THEN 'close'::crm_type
    ELSE 'none'::crm_type
END
WHERE primary_crm = 'none' OR primary_crm IS NULL;

-- Set secondary_crm for orgs using both GHL and Close
UPDATE organization_integrations
SET secondary_crm = 'close'::crm_type
WHERE primary_crm = 'ghl' 
  AND close_api_key IS NOT NULL 
  AND close_api_key != '';

UPDATE organization_integrations
SET secondary_crm = 'ghl'::crm_type
WHERE primary_crm = 'close' 
  AND ghl_api_key IS NOT NULL 
  AND ghl_api_key != '';

-- Auto-detect booking platform
UPDATE organization_integrations
SET primary_booking_platform = 'calendly'::booking_platform_type
WHERE calendly_api_key IS NOT NULL AND calendly_api_key != '';

-- Auto-detect payment processor
UPDATE organization_integrations
SET primary_payment_processor = 'whop'::payment_processor_type
WHERE whop_api_key IS NOT NULL AND whop_api_key != '';