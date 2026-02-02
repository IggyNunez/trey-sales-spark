-- Add custom_domain column to portal_settings for invite links
ALTER TABLE portal_settings
ADD COLUMN IF NOT EXISTS custom_domain TEXT;

-- Add comment for clarity
COMMENT ON COLUMN portal_settings.custom_domain IS 'Custom domain for generating portal invite links (e.g., app.yourdomain.com)';
