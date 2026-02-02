-- Add encrypted columns for all API keys
ALTER TABLE public.organization_integrations
ADD COLUMN IF NOT EXISTS calendly_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS close_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS ghl_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS hubspot_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS whop_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS stripe_api_key_encrypted text,
ADD COLUMN IF NOT EXISTS stripe_publishable_key text,
ADD COLUMN IF NOT EXISTS encryption_version integer DEFAULT 1;

-- Add comment explaining the encryption format
COMMENT ON COLUMN public.organization_integrations.calendly_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.close_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.ghl_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.hubspot_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.whop_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.stripe_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.encryption_version IS 'Encryption algorithm version for key rotation support';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_org_integrations_encryption_version
ON public.organization_integrations(encryption_version)
WHERE encryption_version IS NOT NULL;