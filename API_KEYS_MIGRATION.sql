-- ===========================================
-- API KEYS MIGRATION TEMPLATE
-- ===========================================
-- This is a TEMPLATE file. DO NOT commit actual API keys to git.
-- Keep your actual keys in a secure location (password manager, encrypted file).
-- ===========================================

-- INSTRUCTIONS:
-- 1. Copy this file to a LOCAL version (not tracked by git)
-- 2. Replace the placeholder values with actual API keys
-- 3. Run against your Supabase database
-- 4. Keys will be auto-encrypted on first access

-- ===========================================
-- TEMPLATE: Organization Integration
-- ===========================================
-- Copy and modify this block for each organization:

/*
INSERT INTO organization_integrations (
  organization_id,
  calendly_api_key,
  close_api_key,
  ghl_api_key,
  hubspot_api_key,
  whop_api_key,
  created_at,
  updated_at
)
VALUES (
  'YOUR_ORGANIZATION_UUID_HERE',
  'YOUR_CALENDLY_API_KEY_HERE',  -- Calendly PAT token (eyJ...)
  'YOUR_CLOSE_API_KEY_HERE',      -- Close CRM API key (api_...)
  'YOUR_GHL_API_KEY_HERE',        -- GoHighLevel API key
  'YOUR_HUBSPOT_API_KEY_HERE',    -- HubSpot PAT (pat-na2-...)
  'YOUR_WHOP_API_KEY_HERE',       -- Whop API key (apik_...)
  NOW(),
  NOW()
)
ON CONFLICT (organization_id) DO UPDATE SET
  calendly_api_key = EXCLUDED.calendly_api_key,
  close_api_key = EXCLUDED.close_api_key,
  ghl_api_key = EXCLUDED.ghl_api_key,
  hubspot_api_key = EXCLUDED.hubspot_api_key,
  whop_api_key = EXCLUDED.whop_api_key,
  updated_at = NOW();
*/

-- ===========================================
-- KEYS THAT REQUIRE EDGE FUNCTION
-- ===========================================
-- These integrations don't have legacy plaintext columns:
-- - Cal.com
-- - Stripe
--
-- Add them via the app UI (Settings > Integrations)
-- Or call the edge function:
--
-- curl -X POST 'YOUR_SUPABASE_URL/functions/v1/manage-api-keys' \
--   -H 'Authorization: Bearer YOUR_SERVICE_KEY' \
--   -H 'Content-Type: application/json' \
--   -d '{
--     "action": "save",
--     "organizationId": "YOUR_ORG_ID",
--     "keyType": "stripe",
--     "apiKey": "YOUR_STRIPE_SECRET_KEY"
--   }'

-- ===========================================
-- VERIFY IMPORT
-- ===========================================
SELECT
  o.name as organization_name,
  oi.organization_id,
  CASE WHEN oi.calendly_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as calendly,
  CASE WHEN oi.ghl_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as ghl,
  CASE WHEN oi.close_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as close,
  CASE WHEN oi.hubspot_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as hubspot,
  CASE WHEN oi.whop_api_key IS NOT NULL THEN 'YES' ELSE 'NO' END as whop
FROM organization_integrations oi
JOIN organizations o ON o.id = oi.organization_id
ORDER BY o.name;
