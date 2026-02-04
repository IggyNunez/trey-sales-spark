-- =====================================================
-- Email-First Identity Unification for Acquisition Ace
-- Step 1: Remove global leads_email_key constraint
-- (The org-scoped unique constraint already exists)
-- =====================================================

-- Drop the global unique constraint on leads.email
-- This allows the same email to exist in different organizations
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_email_key;