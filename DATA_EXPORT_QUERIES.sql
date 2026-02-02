-- ===========================================
-- DATA EXPORT QUERIES
-- ===========================================
-- Run these in Lovable's Supabase SQL Editor
-- Copy the results (JSON) for each query
-- Save each result to a separate file
-- ===========================================

-- IMPORTANT: Run each query separately and save the JSON output

-- 1. ORGANIZATIONS
SELECT json_agg(t) FROM (SELECT * FROM organizations) t;

-- 2. PROFILES
SELECT json_agg(t) FROM (SELECT * FROM profiles) t;

-- 3. ORGANIZATION_MEMBERS
SELECT json_agg(t) FROM (SELECT * FROM organization_members) t;

-- 4. USER_ROLES
SELECT json_agg(t) FROM (SELECT * FROM user_roles) t;

-- 5. CLOSERS
SELECT json_agg(t) FROM (SELECT * FROM closers) t;

-- 6. SETTERS
SELECT json_agg(t) FROM (SELECT * FROM setters) t;

-- 7. SOURCES (if exists)
SELECT json_agg(t) FROM (SELECT * FROM sources) t;

-- 8. EVENTS
SELECT json_agg(t) FROM (SELECT * FROM events) t;

-- 9. LEADS
SELECT json_agg(t) FROM (SELECT * FROM leads) t;

-- 10. PAYMENTS
SELECT json_agg(t) FROM (SELECT * FROM payments) t;

-- 11. POST_CALL_FORMS
SELECT json_agg(t) FROM (SELECT * FROM post_call_forms) t;

-- 12. ORGANIZATION_INTEGRATIONS (contains API keys - handle carefully!)
SELECT json_agg(t) FROM (SELECT * FROM organization_integrations) t;

-- 13. PORTAL_SETTINGS
SELECT json_agg(t) FROM (SELECT * FROM portal_settings) t;

-- 14. INVITATIONS
SELECT json_agg(t) FROM (SELECT * FROM invitations) t;

-- 15. CLOSER_ACCESS_TOKENS
SELECT json_agg(t) FROM (SELECT * FROM closer_access_tokens) t;

-- 16. METRIC_DEFINITIONS
SELECT json_agg(t) FROM (SELECT * FROM metric_definitions) t;

-- 17. CUSTOM_FIELD_DEFINITIONS (if exists)
SELECT json_agg(t) FROM (SELECT * FROM custom_field_definitions) t;

-- 18. CUSTOM_FIELD_VALUES (if exists)
SELECT json_agg(t) FROM (SELECT * FROM custom_field_values) t;

-- 19. FORM_CONFIGS
SELECT json_agg(t) FROM (SELECT * FROM form_configs) t;

-- 20. DASHBOARD_CONFIGS (if exists)
SELECT json_agg(t) FROM (SELECT * FROM dashboard_configs) t;

-- 21. PAYOUT_SNAPSHOTS
SELECT json_agg(t) FROM (SELECT * FROM payout_snapshots) t;

-- 22. PAYOUT_SNAPSHOT_DETAILS
SELECT json_agg(t) FROM (SELECT * FROM payout_snapshot_details) t;

-- 23. PAYOUT_SNAPSHOT_SUMMARIES
SELECT json_agg(t) FROM (SELECT * FROM payout_snapshot_summaries) t;

-- 24. AUDIT_LOGS (optional - can be large)
SELECT json_agg(t) FROM (SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10000) t;

-- 25. WEBHOOK_CONNECTIONS (if exists)
SELECT json_agg(t) FROM (SELECT * FROM webhook_connections) t;

-- 26. SETTER_ACTIVITIES (if exists)
SELECT json_agg(t) FROM (SELECT * FROM setter_activities) t;

-- ===========================================
-- AUTH USERS (Special - from auth schema)
-- ===========================================
-- This exports user emails and IDs
-- Users will need to reset passwords in new system

SELECT json_agg(t) FROM (
  SELECT id, email, created_at, last_sign_in_at, raw_user_meta_data
  FROM auth.users
) t;
