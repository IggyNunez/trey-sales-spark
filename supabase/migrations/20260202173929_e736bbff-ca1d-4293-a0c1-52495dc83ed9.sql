-- Add HubSpot custom fields column to events table
ALTER TABLE events ADD COLUMN hubspot_custom_fields JSONB;

-- Create GIN index for efficient JSONB queries
CREATE INDEX idx_events_hubspot_custom_fields 
ON events USING gin (hubspot_custom_fields);

-- Add comment for documentation
COMMENT ON COLUMN events.hubspot_custom_fields IS 
'HubSpot contact properties synced via sync-hubspot-attribution. 
Includes: lifecyclestage, hs_lead_status, hs_analytics_source, etc.';