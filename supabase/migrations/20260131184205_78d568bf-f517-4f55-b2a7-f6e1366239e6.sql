-- Add Cal.com sync configuration columns to organization_integrations
ALTER TABLE organization_integrations 
ADD COLUMN IF NOT EXISTS calcom_auto_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS calcom_excluded_event_type_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS calcom_last_auto_sync_at TIMESTAMPTZ;

-- Enable pg_net extension for HTTP calls from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add comment for documentation
COMMENT ON COLUMN organization_integrations.calcom_auto_sync_enabled IS 'Whether automatic hourly Cal.com sync is enabled';
COMMENT ON COLUMN organization_integrations.calcom_excluded_event_type_ids IS 'Array of Cal.com event type IDs to exclude from sync';
COMMENT ON COLUMN organization_integrations.calcom_last_auto_sync_at IS 'Timestamp of last automatic sync';