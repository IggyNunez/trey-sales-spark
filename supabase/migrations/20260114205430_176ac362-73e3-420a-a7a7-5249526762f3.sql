-- Add webhook signing key columns to organization_integrations for signature verification
-- These columns will store encrypted signing keys for verifying webhook signatures

-- Add Calendly webhook signing key column
ALTER TABLE public.organization_integrations 
ADD COLUMN IF NOT EXISTS calendly_webhook_signing_key TEXT;

-- Add Whop webhook signing key column (may already exist but ensure it does)
ALTER TABLE public.organization_integrations 
ADD COLUMN IF NOT EXISTS whop_webhook_signing_key TEXT;

-- Add Stripe webhook signing key column
ALTER TABLE public.organization_integrations 
ADD COLUMN IF NOT EXISTS stripe_webhook_signing_key TEXT;

-- Add comment explaining these columns
COMMENT ON COLUMN public.organization_integrations.calendly_webhook_signing_key IS 'Calendly webhook signing key for HMAC signature verification';
COMMENT ON COLUMN public.organization_integrations.whop_webhook_signing_key IS 'Whop webhook signing key for HMAC signature verification';
COMMENT ON COLUMN public.organization_integrations.stripe_webhook_signing_key IS 'Stripe webhook signing key (whsec_xxx) for signature verification';