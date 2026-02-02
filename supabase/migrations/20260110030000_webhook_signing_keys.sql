-- Add webhook signing key columns for signature verification
-- These store the secret keys used to verify webhook authenticity

-- Add to organization_integrations for provider-specific keys
ALTER TABLE public.organization_integrations
ADD COLUMN IF NOT EXISTS calendly_webhook_signing_key TEXT,
ADD COLUMN IF NOT EXISTS whop_webhook_signing_key TEXT;

-- Add to webhook_connections for per-connection signing keys
ALTER TABLE public.webhook_connections
ADD COLUMN IF NOT EXISTS signing_key TEXT;

-- Add comments explaining the columns
COMMENT ON COLUMN public.organization_integrations.calendly_webhook_signing_key IS 'Calendly webhook signing key for signature verification. Get this from Calendly webhook settings.';
COMMENT ON COLUMN public.organization_integrations.whop_webhook_signing_key IS 'Whop webhook signing key for signature verification. Get this from Whop dashboard.';
COMMENT ON COLUMN public.webhook_connections.signing_key IS 'Webhook signing key for verifying webhook authenticity.';

-- Update the magic link expiration for existing tokens (set to 90 days from now)
UPDATE public.closer_access_tokens
SET expires_at = NOW() + INTERVAL '90 days'
WHERE expires_at IS NULL;

-- Set default expiration for new tokens
ALTER TABLE public.closer_access_tokens
ALTER COLUMN expires_at SET DEFAULT NOW() + INTERVAL '90 days';
