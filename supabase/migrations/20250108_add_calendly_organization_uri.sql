-- Add calendly_organization_uri to organization_integrations
-- This stores the unique Calendly organization URI for each org's Calendly account
-- Used to match incoming webhooks to the correct organization

ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS calendly_organization_uri TEXT;

-- Add comment for documentation
COMMENT ON COLUMN organization_integrations.calendly_organization_uri IS
'The Calendly organization URI (e.g., https://api.calendly.com/organizations/xxx) used to match incoming webhooks to the correct organization';
