-- ===========================================
-- DATA IMPORT TEMPLATE
-- ===========================================
-- Run this in YOUR NEW Supabase SQL Editor
-- AFTER running COMBINED_SCHEMA.sql
-- ===========================================

-- INSTRUCTIONS:
-- 1. First run COMBINED_SCHEMA.sql to create all tables
-- 2. For each table below:
--    a. Replace 'PASTE_JSON_HERE' with the JSON from your export
--    b. Run that INSERT statement
--    c. Move to the next table

-- IMPORTANT: Import in this ORDER to respect foreign keys

-- ===========================================
-- STEP 1: ORGANIZATIONS (no dependencies)
-- ===========================================
INSERT INTO organizations (id, name, slug, created_at, updated_at)
SELECT
  (j->>'id')::uuid,
  j->>'name',
  j->>'slug',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 2: SOURCES (no dependencies, if exists)
-- ===========================================
INSERT INTO sources (id, name, organization_id, is_active, created_at)
SELECT
  (j->>'id')::uuid,
  j->>'name',
  (j->>'organization_id')::uuid,
  (j->>'is_active')::boolean,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 3: CLOSERS (depends on organizations)
-- ===========================================
INSERT INTO closers (id, name, email, organization_id, is_active, created_at, updated_at)
SELECT
  (j->>'id')::uuid,
  j->>'name',
  j->>'email',
  (j->>'organization_id')::uuid,
  (j->>'is_active')::boolean,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 4: SETTERS (depends on organizations)
-- ===========================================
INSERT INTO setters (id, name, email, organization_id, is_active, close_user_id, created_at, updated_at)
SELECT
  (j->>'id')::uuid,
  j->>'name',
  j->>'email',
  (j->>'organization_id')::uuid,
  (j->>'is_active')::boolean,
  j->>'close_user_id',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 5: PROFILES (depends on organizations - user_id is auth.users)
-- ===========================================
-- NOTE: Auth users need to be created separately via Supabase Auth
-- This just creates the profile records

INSERT INTO profiles (id, email, full_name, organization_id, linked_closer_name, created_at, updated_at)
SELECT
  (j->>'id')::uuid,
  j->>'email',
  j->>'full_name',
  (j->>'organization_id')::uuid,
  j->>'linked_closer_name',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 6: ORGANIZATION_MEMBERS (depends on organizations)
-- ===========================================
INSERT INTO organization_members (id, organization_id, user_id, role, created_at)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'user_id')::uuid,
  j->>'role',
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 7: USER_ROLES (depends on user)
-- ===========================================
INSERT INTO user_roles (id, user_id, role, created_at)
SELECT
  (j->>'id')::uuid,
  (j->>'user_id')::uuid,
  (j->>'role')::app_role,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 8: LEADS (depends on organizations, sources)
-- ===========================================
INSERT INTO leads (id, organization_id, name, email, phone, source_id, created_at, updated_at)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'name',
  j->>'email',
  j->>'phone',
  (j->>'source_id')::uuid,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 9: EVENTS (depends on organizations, closers, setters, leads)
-- ===========================================
INSERT INTO events (
  id, organization_id, calendly_event_id, lead_name, lead_email, lead_phone,
  closer_id, closer_name, closer_email, setter_id, setter_name,
  event_type, booked_at, event_time, outcome, canceled, rescheduled, no_show,
  ghl_contact_id, hubspot_contact_id, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'calendly_event_id',
  j->>'lead_name',
  j->>'lead_email',
  j->>'lead_phone',
  (j->>'closer_id')::uuid,
  j->>'closer_name',
  j->>'closer_email',
  (j->>'setter_id')::uuid,
  j->>'setter_name',
  j->>'event_type',
  (j->>'booked_at')::timestamptz,
  (j->>'event_time')::timestamptz,
  j->>'outcome',
  (j->>'canceled')::boolean,
  (j->>'rescheduled')::boolean,
  (j->>'no_show')::boolean,
  j->>'ghl_contact_id',
  j->>'hubspot_contact_id',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 10: PAYMENTS (depends on organizations, events, closers)
-- ===========================================
INSERT INTO payments (
  id, organization_id, event_id, closer_id, amount, payment_type, deal_type,
  stripe_payment_id, whop_payment_id, notes, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'event_id')::uuid,
  (j->>'closer_id')::uuid,
  (j->>'amount')::numeric,
  (j->>'payment_type')::payment_type,
  j->>'deal_type',
  j->>'stripe_payment_id',
  j->>'whop_payment_id',
  j->>'notes',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 11: POST_CALL_FORMS (depends on events, closers)
-- ===========================================
INSERT INTO post_call_forms (
  id, organization_id, event_id, closer_id, closer_name, outcome,
  notes, follow_up_date, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'event_id')::uuid,
  (j->>'closer_id')::uuid,
  j->>'closer_name',
  j->>'outcome',
  j->>'notes',
  (j->>'follow_up_date')::date,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 12: ORGANIZATION_INTEGRATIONS (depends on organizations)
-- ===========================================
-- WARNING: Contains API keys - these are encrypted
INSERT INTO organization_integrations (
  id, organization_id, primary_crm,
  ghl_api_key_encrypted, ghl_location_id,
  hubspot_api_key_encrypted,
  close_api_key_encrypted,
  calendly_api_key_encrypted, calendly_organization_uri,
  stripe_api_key_encrypted,
  whop_api_key_encrypted, whop_company_id,
  encryption_version, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'primary_crm',
  j->>'ghl_api_key_encrypted',
  j->>'ghl_location_id',
  j->>'hubspot_api_key_encrypted',
  j->>'close_api_key_encrypted',
  j->>'calendly_api_key_encrypted',
  j->>'calendly_organization_uri',
  j->>'stripe_api_key_encrypted',
  j->>'whop_api_key_encrypted',
  j->>'whop_company_id',
  (j->>'encryption_version')::integer,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 13: PORTAL_SETTINGS
-- ===========================================
INSERT INTO portal_settings (
  id, organization_id, logo_url, primary_color, company_name,
  custom_domain, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'logo_url',
  j->>'primary_color',
  j->>'company_name',
  j->>'custom_domain',
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 14: INVITATIONS
-- ===========================================
INSERT INTO invitations (
  id, organization_id, email, token, invite_type, closer_name,
  status, expires_at, accepted_at, created_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'email',
  j->>'token',
  j->>'invite_type',
  j->>'closer_name',
  j->>'status',
  (j->>'expires_at')::timestamptz,
  (j->>'accepted_at')::timestamptz,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 15: CLOSER_ACCESS_TOKENS
-- ===========================================
INSERT INTO closer_access_tokens (
  id, organization_id, closer_id, closer_name, token,
  is_active, is_universal, expires_at, created_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'closer_id')::uuid,
  j->>'closer_name',
  j->>'token',
  (j->>'is_active')::boolean,
  (j->>'is_universal')::boolean,
  (j->>'expires_at')::timestamptz,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 16: METRIC_DEFINITIONS
-- ===========================================
INSERT INTO metric_definitions (
  id, organization_id, name, display_name, description,
  calculation_type, numerator_conditions, denominator_conditions,
  format, color, icon, sort_order, is_active, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'name',
  j->>'display_name',
  j->>'description',
  j->>'calculation_type',
  (j->>'numerator_conditions')::jsonb,
  (j->>'denominator_conditions')::jsonb,
  j->>'format',
  j->>'color',
  j->>'icon',
  (j->>'sort_order')::integer,
  (j->>'is_active')::boolean,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 17: FORM_CONFIGS
-- ===========================================
INSERT INTO form_configs (
  id, organization_id, form_type, field_config, is_default, created_at, updated_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'form_type',
  (j->>'field_config')::jsonb,
  (j->>'is_default')::boolean,
  (j->>'created_at')::timestamptz,
  (j->>'updated_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 18: PAYOUT_SNAPSHOTS
-- ===========================================
INSERT INTO payout_snapshots (
  id, organization_id, name, start_date, end_date, created_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'organization_id')::uuid,
  j->>'name',
  (j->>'start_date')::date,
  (j->>'end_date')::date,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 19: PAYOUT_SNAPSHOT_DETAILS
-- ===========================================
INSERT INTO payout_snapshot_details (
  id, snapshot_id, organization_id, closer_id, closer_name,
  total_sales, total_commission, created_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'snapshot_id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'closer_id')::uuid,
  j->>'closer_name',
  (j->>'total_sales')::numeric,
  (j->>'total_commission')::numeric,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- STEP 20: PAYOUT_SNAPSHOT_SUMMARIES
-- ===========================================
INSERT INTO payout_snapshot_summaries (
  id, snapshot_id, organization_id, total_revenue, total_commission, created_at
)
SELECT
  (j->>'id')::uuid,
  (j->>'snapshot_id')::uuid,
  (j->>'organization_id')::uuid,
  (j->>'total_revenue')::numeric,
  (j->>'total_commission')::numeric,
  (j->>'created_at')::timestamptz
FROM json_array_elements('PASTE_JSON_HERE'::json) AS j
ON CONFLICT (id) DO NOTHING;

-- ===========================================
-- DONE! Verify counts
-- ===========================================
SELECT 'organizations' as table_name, count(*) as row_count FROM organizations
UNION ALL SELECT 'profiles', count(*) FROM profiles
UNION ALL SELECT 'closers', count(*) FROM closers
UNION ALL SELECT 'setters', count(*) FROM setters
UNION ALL SELECT 'events', count(*) FROM events
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'post_call_forms', count(*) FROM post_call_forms
ORDER BY table_name;
