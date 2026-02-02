-- ============================================================================
-- SCHEMA PREREQUISITES - PART A (Run this FIRST)
-- Creates and extends enum types. Must be committed before Part B.
-- ============================================================================

-- booking_platform_type (from 20260112211455)
DO $$ BEGIN
    CREATE TYPE booking_platform_type AS ENUM ('calendly', 'acuity', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- payment_processor_type (from 20260112211455)
DO $$ BEGIN
    CREATE TYPE payment_processor_type AS ENUM ('whop', 'stripe', 'none');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add missing values to crm_type (COMBINED_SCHEMA only has 'close', 'ghl', 'hubspot')
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'salesforce';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'pipedrive';
ALTER TYPE crm_type ADD VALUE IF NOT EXISTS 'none';
