-- Migration: 20260116164230_c66bfa05-97ab-4563-bfac-ca4e6966c323.sql
-- SECURITY FIX: Remove overly permissive public RLS policies
-- Replace with proper organization-scoped access for authenticated users

-- =============================================================================
-- 1. Fix closers table - Remove public SELECT, keep org-member access
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active closers" ON public.closers;

-- Existing "Org members can view their closers" policy already handles authenticated access

-- =============================================================================
-- 2. Fix opportunity_statuses table - Remove public SELECT
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active opportunity statuses" ON public.opportunity_statuses;

-- Existing "Org members can view their opportunity statuses" policy handles authenticated access

-- =============================================================================
-- 3. Fix packages table - Remove public SELECT
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active packages" ON public.packages;

-- Existing "Org members can view their packages" policy handles authenticated access

-- =============================================================================
-- 4. Document the security changes
-- =============================================================================

COMMENT ON POLICY "Org members can view their closers" ON public.closers IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';

COMMENT ON POLICY "Org members can view their opportunity statuses" ON public.opportunity_statuses IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';

COMMENT ON POLICY "Org members can view their packages" ON public.packages IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';
-- Migration: 20260120133554_781dfcc9-6354-4fff-abf0-2cddaa2b0eb4.sql
-- Fix Critical Security Issue 1: Remove permissive "OR (organization_id IS NULL)" clauses from payout tables

-- Update payout_snapshots RLS policy
DROP POLICY IF EXISTS "Org members can view their payout snapshots" ON payout_snapshots;
CREATE POLICY "Org members can view their payout snapshots"
  ON payout_snapshots FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can create payout snapshots" ON payout_snapshots;
CREATE POLICY "Org admins can create payout snapshots"
  ON payout_snapshots FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can update payout snapshots" ON payout_snapshots;
CREATE POLICY "Org admins can update payout snapshots"
  ON payout_snapshots FOR UPDATE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can delete payout snapshots" ON payout_snapshots;
CREATE POLICY "Org admins can delete payout snapshots"
  ON payout_snapshots FOR DELETE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Update payout_snapshot_details RLS policy
DROP POLICY IF EXISTS "Org members can view their payout snapshot details" ON payout_snapshot_details;
CREATE POLICY "Org members can view their payout snapshot details"
  ON payout_snapshot_details FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can create payout snapshot details" ON payout_snapshot_details;
CREATE POLICY "Org admins can create payout snapshot details"
  ON payout_snapshot_details FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can update payout snapshot details" ON payout_snapshot_details;
CREATE POLICY "Org admins can update payout snapshot details"
  ON payout_snapshot_details FOR UPDATE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can delete payout snapshot details" ON payout_snapshot_details;
CREATE POLICY "Org admins can delete payout snapshot details"
  ON payout_snapshot_details FOR DELETE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Update payout_snapshot_summaries RLS policy
DROP POLICY IF EXISTS "Org members can view their payout snapshot summaries" ON payout_snapshot_summaries;
CREATE POLICY "Org members can view their payout snapshot summaries"
  ON payout_snapshot_summaries FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can create payout snapshot summaries" ON payout_snapshot_summaries;
CREATE POLICY "Org admins can create payout snapshot summaries"
  ON payout_snapshot_summaries FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can update payout snapshot summaries" ON payout_snapshot_summaries;
CREATE POLICY "Org admins can update payout snapshot summaries"
  ON payout_snapshot_summaries FOR UPDATE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org admins can delete payout snapshot summaries" ON payout_snapshot_summaries;
CREATE POLICY "Org admins can delete payout snapshot summaries"
  ON payout_snapshot_summaries FOR DELETE
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Add NOT NULL constraints to prevent future NULL organization_id issues
ALTER TABLE payout_snapshots ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payout_snapshot_details ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE payout_snapshot_summaries ALTER COLUMN organization_id SET NOT NULL;

-- Fix Critical Security Issue 2: Remove permissive rate_limits policy
DROP POLICY IF EXISTS "Service role can manage rate limits" ON rate_limits;
-- Create a deny-all policy for direct access (service role bypasses RLS anyway)
CREATE POLICY "Deny all direct access to rate limits"
  ON rate_limits FOR ALL
  USING (false);
-- Migration: 20260120141837_ac9ae931-c04c-4ff8-b14b-c9b04eb9d2c6.sql
-- Tighten overly-permissive INSERT RLS policies flagged by linter
-- Goal: remove WITH CHECK (true) while preserving required functionality.

-- Ensure RLS is enabled (safe if already enabled)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendly_webhook_audit ENABLE ROW LEVEL SECURITY;

-- Replace permissive INSERT policy on audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Replace permissive INSERT policy on calendly_webhook_audit
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.calendly_webhook_audit;
CREATE POLICY "Authenticated can insert calendly webhook audit"
ON public.calendly_webhook_audit
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Note: background jobs using elevated server credentials can still write because they bypass RLS.

-- Migration: 20260120160910_65eb7059-1479-4d5e-ac96-ee3513af061b.sql
-- ============================================
-- FIX 5 SECURITY VULNERABILITIES
-- ============================================
-- 1. payments: Remove OR (organization_id IS NULL) from SELECT
-- 2. profiles: Already secure (only own profile + admins)
-- 3. closers: Remove OR (organization_id IS NULL) from SELECT
-- 4. organization_integrations: Add SELECT policy for org admins only
-- 5. post_call_forms: Consolidate overlapping policies
-- ============================================

-- ============================================
-- FIX 1: PAYMENTS - Remove public access fallback
-- ============================================
DROP POLICY IF EXISTS "Org members can view their payments" ON public.payments;
CREATE POLICY "Org members can view their payments"
  ON public.payments FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- ============================================
-- FIX 2: CLOSERS - Remove public access fallback
-- ============================================
DROP POLICY IF EXISTS "Org members can view their closers" ON public.closers;
CREATE POLICY "Org members can view their closers"
  ON public.closers FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  );

-- ============================================
-- FIX 3: ORGANIZATION_INTEGRATIONS - Add explicit SELECT for admins only
-- The existing "Org admins can manage integrations" is ALL which includes SELECT
-- But let's make it explicit and ensure no public access
-- ============================================
-- First ensure RLS is enabled
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

-- Drop any permissive policies and recreate strict ones
DROP POLICY IF EXISTS "Org admins can manage integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Org admins can view integrations" ON public.organization_integrations;

-- Only org admins can SELECT (view API keys)
CREATE POLICY "Org admins can view integrations"
  ON public.organization_integrations FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Only org admins can INSERT
CREATE POLICY "Org admins can insert integrations"
  ON public.organization_integrations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Only org admins can UPDATE
CREATE POLICY "Org admins can update integrations"
  ON public.organization_integrations FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Only org admins can DELETE
CREATE POLICY "Org admins can delete integrations"
  ON public.organization_integrations FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Super admins can manage all
CREATE POLICY "Super admins can manage all integrations"
  ON public.organization_integrations FOR ALL
  USING (is_super_admin(auth.uid()));

-- ============================================
-- FIX 4: POST_CALL_FORMS - Consolidate overlapping policies
-- Remove duplicate/overlapping policies and create clean ones
-- ============================================

-- Drop all existing PCF policies to start fresh
DROP POLICY IF EXISTS "Admins can manage all PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Admins can view all PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org admins can delete PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org admins can delete their org PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can insert PCFs for their org" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can update their org PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can view their PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can insert their own PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can update their own PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can view their own PCFs" ON public.post_call_forms;

-- Create consolidated, non-overlapping policies

-- SELECT: Org members can view their org's PCFs (includes admins and sales reps)
CREATE POLICY "Org members can view PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- INSERT: Org members can create PCFs for their org
CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- UPDATE: Org members can update their org's PCFs
CREATE POLICY "Org members can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- DELETE: Only org admins can delete PCFs
CREATE POLICY "Org admins can delete PCFs"
  ON public.post_call_forms FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND user_is_org_admin(auth.uid(), organization_id)
  );

-- Super admins can manage all PCFs
CREATE POLICY "Super admins can manage all PCFs"
  ON public.post_call_forms FOR ALL
  USING (is_super_admin(auth.uid()));

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================
COMMENT ON TABLE public.payments IS 
  'Payment records with strict org-based RLS. No public access. Migration: security_fix_5_vulnerabilities';

COMMENT ON TABLE public.closers IS 
  'Closer records with strict org-based RLS. No public access. Migration: security_fix_5_vulnerabilities';

COMMENT ON TABLE public.organization_integrations IS 
  'Integration settings with admin-only access. Contains encrypted API keys. Migration: security_fix_5_vulnerabilities';

COMMENT ON TABLE public.post_call_forms IS 
  'Post-call forms with consolidated org-based RLS. No overlapping policies. Migration: security_fix_5_vulnerabilities';
-- Migration: 20260120164255_079c53ca-fe47-4d08-a59c-538da59e6d09.sql
-- Fix closers RLS policy to explicitly block anonymous access
-- The "Org admins can manage their closers" policy implicitly uses auth.uid() 
-- but should explicitly check for authentication

DROP POLICY IF EXISTS "Org admins can manage their closers" ON public.closers;

CREATE POLICY "Org admins can manage their closers"
  ON public.closers FOR ALL
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_members.organization_id
      FROM organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (
      SELECT organization_members.organization_id
      FROM organization_members
      WHERE organization_members.user_id = auth.uid()
        AND organization_members.role IN ('owner', 'admin')
    )
  );
-- Migration: 20260121002925_8645c783-841d-4d2c-8267-6487e462e887.sql
-- Comprehensive RLS Policy Security Hardening
-- Add explicit auth.uid() IS NOT NULL checks to prevent anonymous access

-- ============================================================
-- LEADS TABLE - Add org member access and strengthen policies
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can manage all leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads;

-- Create hardened policies
CREATE POLICY "Super admins can manage all leads"
  ON public.leads FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their leads"
  ON public.leads FOR SELECT
  USING (auth.uid() IS NOT NULL AND organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage their leads"
  ON public.leads FOR ALL
  USING (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id))
  WITH CHECK (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id));

-- ============================================================
-- PROFILES TABLE - Strengthen policies with explicit auth checks
-- ============================================================

DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Super admins can manage all profiles"
  ON public.profiles FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() IS NOT NULL AND auth.uid() = user_id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

CREATE POLICY "Org admins can view profiles in their org"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    user_id IN (
      SELECT om.user_id FROM organization_members om
      WHERE om.organization_id IN (SELECT get_user_org_ids(auth.uid()))
    )
  );

-- ============================================================
-- SETTERS TABLE - Strengthen policies
-- ============================================================

DROP POLICY IF EXISTS "Org admins can manage their setters" ON public.setters;
DROP POLICY IF EXISTS "Super admins can manage all setters" ON public.setters;
DROP POLICY IF EXISTS "Org members can view their setters" ON public.setters;

CREATE POLICY "Super admins can manage all setters"
  ON public.setters FOR ALL
  USING (auth.uid() IS NOT NULL AND is_super_admin(auth.uid()));

CREATE POLICY "Org admins can manage their setters"
  ON public.setters FOR ALL
  USING (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id))
  WITH CHECK (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org members can view their setters"
  ON public.setters FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      organization_id IN (SELECT get_user_org_ids(auth.uid()))
      OR organization_id IS NULL
    )
  );

-- ============================================================
-- INVITATIONS TABLE - Strengthen policies
-- ============================================================

DROP POLICY IF EXISTS "Admins and org admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Org admins can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Anyone can accept invitation with valid token" ON public.invitations;

CREATE POLICY "Org admins can manage invitations"
  ON public.invitations FOR ALL
  USING (
    auth.uid() IS NOT NULL AND (
      is_super_admin(auth.uid()) OR
      user_is_org_admin(auth.uid(), organization_id)
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      is_super_admin(auth.uid()) OR
      user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- Keep token-based acceptance but add rate limiting consideration
DROP POLICY IF EXISTS "Anyone can accept invitation with valid token" ON public.invitations;
CREATE POLICY "Anyone can accept invitation with valid token"
  ON public.invitations FOR UPDATE
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status IN ('pending', 'accepted'));

DROP POLICY IF EXISTS "Org members can view invitations" ON public.invitations;
CREATE POLICY "Org members can view invitations"
  ON public.invitations FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND 
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ============================================================
-- CLOSER ACCESS TOKENS - Strengthen INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Admins can create access tokens" ON public.closer_access_tokens;

CREATE POLICY "Org admins can create access tokens"
  ON public.closer_access_tokens FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      is_admin(auth.uid()) OR 
      is_super_admin(auth.uid()) OR
      user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- ============================================================
-- PAYOUT SNAPSHOT DETAILS - Strengthen INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Org admins can create payout snapshot details" ON public.payout_snapshot_details;

CREATE POLICY "Org admins can create payout snapshot details"
  ON public.payout_snapshot_details FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      is_super_admin(auth.uid()) OR
      user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- ============================================================
-- POST CALL FORMS - Strengthen INSERT policy  
-- ============================================================

DROP POLICY IF EXISTS "Org members can insert PCFs" ON public.post_call_forms;

CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ============================================================
-- PAYMENTS - Strengthen INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Org members can insert payments" ON public.payments;

CREATE POLICY "Org members can insert payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND 
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ============================================================
-- ORGANIZATION INTEGRATIONS - Strengthen INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Org admins can insert integrations" ON public.organization_integrations;

CREATE POLICY "Org admins can insert integrations"
  ON public.organization_integrations FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      is_super_admin(auth.uid()) OR
      user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- ============================================================
-- CALENDLY WEBHOOK AUDIT - Strengthen INSERT policy
-- ============================================================

DROP POLICY IF EXISTS "Authenticated can insert calendly webhook audit" ON public.calendly_webhook_audit;

-- This needs to allow service role for webhook processing
CREATE POLICY "Authenticated users can insert calendly webhook audit"
  ON public.calendly_webhook_audit FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL OR auth.role() = 'service_role');
-- Migration: 20260121182823_c510f47e-e3f6-4a29-8587-f7c4cf56c745.sql
-- Add new values to the event_outcome enum
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'not_qualified';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'lost';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'rescheduled';
ALTER TYPE public.event_outcome ADD VALUE IF NOT EXISTS 'canceled';
-- Migration: 20260121194059_597a7f85-f1bd-4fc8-9cc7-fd19881d041d.sql
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS pcf_outcome_label TEXT;
-- Migration: 20260122213626_d171eb09-d986-422f-817f-527e567c1c34.sql
-- Add RESTRICTIVE policies to deny all access to unauthenticated users
-- This ensures that even with other permissive policies, auth.uid() must be present

-- Profiles table: Add restrictive policy requiring authentication
CREATE POLICY "Deny unauthenticated access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Leads table: Add restrictive policy requiring authentication  
CREATE POLICY "Deny unauthenticated access to leads"
ON public.leads
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);
-- Migration: 20260123104803_35dc93d4-4195-4eba-b0cd-85a2f81eed96.sql

-- =====================================================
-- DYNAMIC FORM SYSTEM
-- Allows unlimited custom forms with dynamic fields
-- =====================================================

-- Form Definitions: The form templates (EOD Report, Intake Form, etc.)
CREATE TABLE public.form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Form identity
  name TEXT NOT NULL,                           -- "End of Day Report", "Lead Intake"
  slug TEXT NOT NULL,                           -- "eod_report", "lead_intake"
  description TEXT,
  icon TEXT DEFAULT 'clipboard-list',
  
  -- Relationship configuration
  entity_type TEXT NOT NULL DEFAULT 'standalone', -- 'closer', 'lead', 'event', 'standalone'
  
  -- Scheduling for recurring forms
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT,                       -- 'daily', 'weekly', 'monthly', 'per_event'
  
  -- Access control
  assigned_closers TEXT[] DEFAULT '{}',          -- specific closer IDs, empty = all closers
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id, slug)
);

-- Form Fields: The individual fields within each form
CREATE TABLE public.form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Field identity
  field_name TEXT NOT NULL,                      -- Internal name
  field_slug TEXT NOT NULL,                      -- URL-safe identifier
  label TEXT NOT NULL,                           -- Display label
  
  -- Field configuration
  field_type TEXT NOT NULL DEFAULT 'text',       -- 'boolean', 'number', 'currency', 'text', 'textarea', 'select', 'multi_select', 'date'
  placeholder TEXT,
  help_text TEXT,
  default_value JSONB,
  
  -- Options for select/multi_select fields
  options JSONB,                                  -- [{value: 'opt1', label: 'Option 1', color: '#fff'}]
  
  -- Validation
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}',           -- {min: 0, max: 100, pattern: '...'}
  
  -- Conditional logic
  conditional_logic JSONB,                        -- {conditions: [...], logic: 'AND'|'OR'}
  
  -- Metric configuration
  creates_metric BOOLEAN DEFAULT false,
  metric_config JSONB,                            -- {metric_type, display_name, format, formula, ...}
  
  -- Display
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  show_in_summary BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(form_definition_id, field_slug)
);

-- Form Submissions: Each time a form is filled out
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  
  -- Dynamic entity relationship
  entity_type TEXT NOT NULL,                      -- 'closer', 'lead', 'event', 'standalone'
  entity_id UUID,                                 -- ID of related record (null for standalone)
  entity_name TEXT,                               -- Denormalized name for quick display
  
  -- Submitter info
  submitted_by_id UUID,                           -- User or closer ID
  submitted_by_name TEXT,
  
  -- For recurring forms
  period_date DATE,                               -- The date this submission covers
  
  -- Status
  status TEXT DEFAULT 'submitted',                -- 'draft', 'submitted', 'reviewed'
  
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Form Field Values: The actual values for each submission
CREATE TABLE public.form_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.form_fields(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Flexible value storage (use appropriate column based on field_type)
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  value_json JSONB,                               -- For complex values like multi_select
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(submission_id, field_id)
);

-- Form Metrics: Auto-generated metrics from form fields
CREATE TABLE public.form_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  field_id UUID REFERENCES public.form_fields(id) ON DELETE SET NULL,
  
  -- Metric identity
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'bar-chart',
  
  -- Formula configuration
  formula_type TEXT NOT NULL DEFAULT 'sum',       -- 'count', 'sum', 'average', 'percentage', 'custom'
  formula_config JSONB,                           -- {numerator_field, denominator_field, ...}
  
  -- Aggregation
  aggregate_by TEXT DEFAULT 'total',              -- 'total', 'closer', 'day', 'week', 'month'
  
  -- Display
  format TEXT DEFAULT 'number',                   -- 'number', 'currency', 'percentage'
  color TEXT,
  
  -- Dashboard visibility
  show_on_dashboard BOOLEAN DEFAULT true,
  dashboard_position INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_form_definitions_org ON public.form_definitions(organization_id);
CREATE INDEX idx_form_definitions_entity_type ON public.form_definitions(entity_type);
CREATE INDEX idx_form_fields_form ON public.form_fields(form_definition_id);
CREATE INDEX idx_form_fields_org ON public.form_fields(organization_id);
CREATE INDEX idx_form_submissions_org ON public.form_submissions(organization_id);
CREATE INDEX idx_form_submissions_form ON public.form_submissions(form_definition_id);
CREATE INDEX idx_form_submissions_entity ON public.form_submissions(entity_type, entity_id);
CREATE INDEX idx_form_submissions_period ON public.form_submissions(period_date);
CREATE INDEX idx_form_field_values_submission ON public.form_field_values(submission_id);
CREATE INDEX idx_form_field_values_field ON public.form_field_values(field_id);
CREATE INDEX idx_form_metrics_org ON public.form_metrics(organization_id);
CREATE INDEX idx_form_metrics_form ON public.form_metrics(form_definition_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_metrics ENABLE ROW LEVEL SECURITY;

-- Form Definitions policies
CREATE POLICY "Users can view form definitions in their org"
ON public.form_definitions FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form definitions"
ON public.form_definitions FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- Form Fields policies
CREATE POLICY "Users can view form fields in their org"
ON public.form_fields FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form fields"
ON public.form_fields FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- Form Submissions policies
CREATE POLICY "Users can view submissions in their org"
ON public.form_submissions FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can create submissions in their org"
ON public.form_submissions FOR INSERT
TO authenticated
WITH CHECK (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can update their own submissions"
ON public.form_submissions FOR UPDATE
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

-- Form Field Values policies
CREATE POLICY "Users can view field values in their org"
ON public.form_field_values FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can manage field values in their org"
ON public.form_field_values FOR ALL
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_member(auth.uid(), organization_id));

-- Form Metrics policies
CREATE POLICY "Users can view form metrics in their org"
ON public.form_metrics FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form metrics"
ON public.form_metrics FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- =====================================================
-- TRIGGERS FOR updated_at
-- =====================================================

CREATE TRIGGER update_form_definitions_updated_at
  BEFORE UPDATE ON public.form_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_fields_updated_at
  BEFORE UPDATE ON public.form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_field_values_updated_at
  BEFORE UPDATE ON public.form_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_metrics_updated_at
  BEFORE UPDATE ON public.form_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration: 20260123113255_5caba17a-f336-41e5-a5e7-d48c8122b07b.sql
-- ============================================
-- Multi-Source Real-Time Webhook Dashboard Platform
-- ============================================

-- Enhance webhook_connections with multi-source features
ALTER TABLE public.webhook_connections
ADD COLUMN IF NOT EXISTS icon text,
ADD COLUMN IF NOT EXISTS color text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS signature_type text DEFAULT 'none' CHECK (signature_type IN ('hmac_sha256', 'header_token', 'none')),
ADD COLUMN IF NOT EXISTS signature_secret_encrypted text,
ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS dataset_id uuid;

-- Create datasets table (dynamic schema containers)
CREATE TABLE IF NOT EXISTS public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  retention_days integer DEFAULT 90,
  realtime_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_fields table (per-dataset field definitions)
CREATE TABLE IF NOT EXISTS public.dataset_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_slug text NOT NULL,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'currency', 'boolean', 'date', 'datetime', 'json', 'array')),
  source_type text NOT NULL DEFAULT 'mapped' CHECK (source_type IN ('mapped', 'calculated', 'enriched')),
  source_config jsonb DEFAULT '{}',
  formula text,
  format text,
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dataset_id, field_slug)
);

-- Create dataset_records table (real-time data storage)
CREATE TABLE IF NOT EXISTS public.dataset_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_connection_id uuid REFERENCES public.webhook_connections(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL,
  extracted_data jsonb DEFAULT '{}',
  processing_status text DEFAULT 'success' CHECK (processing_status IN ('success', 'partial', 'failed')),
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create dataset_calculated_fields table
CREATE TABLE IF NOT EXISTS public.dataset_calculated_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_slug text NOT NULL,
  display_name text NOT NULL,
  formula_type text NOT NULL DEFAULT 'expression' CHECK (formula_type IN ('expression', 'aggregation', 'comparison')),
  formula text NOT NULL,
  time_scope text DEFAULT 'all' CHECK (time_scope IN ('all', 'mtd', 'ytd', 'rolling_7d', 'rolling_30d')),
  comparison_period text,
  refresh_mode text DEFAULT 'realtime' CHECK (refresh_mode IN ('realtime', 'hourly', 'daily')),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dataset_id, field_slug)
);

-- Create dashboards table
CREATE TABLE IF NOT EXISTS public.webhook_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_shared boolean DEFAULT false,
  share_token text UNIQUE,
  layout_config jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dashboard_widgets table
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.webhook_dashboards(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  widget_type text NOT NULL DEFAULT 'card' CHECK (widget_type IN ('card', 'line', 'bar', 'pie', 'table', 'number', 'gauge')),
  title text,
  metric_config jsonb DEFAULT '{}',
  chart_config jsonb DEFAULT '{}',
  filters jsonb DEFAULT '[]',
  comparison_enabled boolean DEFAULT false,
  position jsonb DEFAULT '{"x": 0, "y": 0, "w": 1, "h": 1}',
  refresh_interval_seconds integer DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_alerts table
CREATE TABLE IF NOT EXISTS public.dataset_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  condition jsonb NOT NULL,
  notification_type text NOT NULL DEFAULT 'in_app' CHECK (notification_type IN ('slack', 'email', 'in_app')),
  notification_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_triggered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_enrichments table
CREATE TABLE IF NOT EXISTS public.dataset_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_field text NOT NULL,
  target_table text NOT NULL CHECK (target_table IN ('leads', 'closers', 'events', 'payments')),
  target_field text NOT NULL,
  auto_create_if_missing boolean DEFAULT false,
  field_mappings jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create webhook_logs table (audit trail)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.webhook_connections(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_record_id uuid REFERENCES public.dataset_records(id) ON DELETE SET NULL,
  payload_hash text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'success', 'failed', 'skipped')),
  error_message text,
  processing_time_ms integer,
  ip_address text,
  headers jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Add foreign key for dataset_id in webhook_connections
ALTER TABLE public.webhook_connections
ADD CONSTRAINT webhook_connections_dataset_id_fkey
FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE SET NULL;

-- Enable RLS on all new tables
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_calculated_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for datasets
CREATE POLICY "Authenticated users can view org datasets"
ON public.datasets FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage datasets"
ON public.datasets FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_fields
CREATE POLICY "Authenticated users can view org dataset_fields"
ON public.dataset_fields FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage dataset_fields"
ON public.dataset_fields FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_records
CREATE POLICY "Authenticated users can view org dataset_records"
ON public.dataset_records FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org members can insert dataset_records"
ON public.dataset_records FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_calculated_fields
CREATE POLICY "Authenticated users can view org calculated_fields"
ON public.dataset_calculated_fields FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage calculated_fields"
ON public.dataset_calculated_fields FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for webhook_dashboards
CREATE POLICY "Authenticated users can view org dashboards"
ON public.webhook_dashboards FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage dashboards"
ON public.webhook_dashboards FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dashboard_widgets
CREATE POLICY "Authenticated users can view org widgets"
ON public.dashboard_widgets FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage widgets"
ON public.dashboard_widgets FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_alerts
CREATE POLICY "Authenticated users can view org alerts"
ON public.dataset_alerts FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage alerts"
ON public.dataset_alerts FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_enrichments
CREATE POLICY "Authenticated users can view org enrichments"
ON public.dataset_enrichments FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage enrichments"
ON public.dataset_enrichments FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for webhook_logs
CREATE POLICY "Authenticated users can view org webhook_logs"
ON public.webhook_logs FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org members can insert webhook_logs"
ON public.webhook_logs FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

-- Enable Realtime for dataset_records
ALTER PUBLICATION supabase_realtime ADD TABLE public.dataset_records;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_datasets_org_id ON public.datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_dataset_fields_dataset_id ON public.dataset_fields(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_dataset_id ON public.dataset_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_created_at ON public.dataset_records(created_at);
CREATE INDEX IF NOT EXISTS idx_dataset_records_webhook_connection_id ON public.dataset_records(webhook_connection_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_connection_id ON public.webhook_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard_id ON public.dashboard_widgets(dashboard_id);

-- Create updated_at triggers for new tables
CREATE TRIGGER update_datasets_updated_at
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_fields_updated_at
  BEFORE UPDATE ON public.dataset_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_calculated_fields_updated_at
  BEFORE UPDATE ON public.dataset_calculated_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_dashboards_updated_at
  BEFORE UPDATE ON public.webhook_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_alerts_updated_at
  BEFORE UPDATE ON public.dataset_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Migration: 20260123141445_730d0811-3e3e-4efc-a928-61593b67f131.sql

-- Add missing columns to webhook_logs table for full Layer 4 support
-- This includes raw_payload and extracted_data for storing webhook data

-- Add raw_payload column to store the original webhook payload
ALTER TABLE public.webhook_logs 
ADD COLUMN IF NOT EXISTS raw_payload jsonb;

-- Add extracted_data column to store processed/normalized data
ALTER TABLE public.webhook_logs 
ADD COLUMN IF NOT EXISTS extracted_data jsonb;

-- Add index on connection_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_webhook_logs_connection_id 
ON public.webhook_logs(connection_id);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status 
ON public.webhook_logs(status);

-- Add composite index for organization + created_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_created 
ON public.webhook_logs(organization_id, created_at DESC);

-- Add index on dataset_records for organization + dataset + created_at
CREATE INDEX IF NOT EXISTS idx_dataset_records_org_dataset_created 
ON public.dataset_records(organization_id, dataset_id, created_at DESC);

-- Add foreign key constraint for webhook_connection_id on dataset_records if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'dataset_records_webhook_connection_id_fkey'
  ) THEN
    ALTER TABLE public.dataset_records 
    ADD CONSTRAINT dataset_records_webhook_connection_id_fkey 
    FOREIGN KEY (webhook_connection_id) 
    REFERENCES public.webhook_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraint for connection_id on webhook_logs if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'webhook_logs_connection_id_fkey'
  ) THEN
    ALTER TABLE public.webhook_logs 
    ADD CONSTRAINT webhook_logs_connection_id_fkey 
    FOREIGN KEY (connection_id) 
    REFERENCES public.webhook_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Migration: 20260123145810_ffe18801-2ca2-440b-9662-a1b3927f0ca4.sql
-- Drop and recreate the check constraint to allow more time scope values
ALTER TABLE public.dataset_calculated_fields DROP CONSTRAINT IF EXISTS dataset_calculated_fields_time_scope_check;

ALTER TABLE public.dataset_calculated_fields ADD CONSTRAINT dataset_calculated_fields_time_scope_check 
  CHECK (time_scope = ANY (ARRAY['all'::text, 'today'::text, 'week'::text, 'month'::text, 'mtd'::text, 'quarter'::text, 'year'::text, 'ytd'::text, 'rolling_7d'::text, 'rolling_30d'::text, 'custom'::text]));
-- Migration: 20260123155746_eb40be7e-0ed9-41ba-8c58-2b69c53740da.sql
-- 1. Add cooldown_minutes column to dataset_alerts
ALTER TABLE public.dataset_alerts 
ADD COLUMN IF NOT EXISTS cooldown_minutes integer DEFAULT 5;

-- 2. Add foreign key constraints with ON DELETE SET NULL for dataset_records
ALTER TABLE public.dataset_records
DROP CONSTRAINT IF EXISTS dataset_records_dataset_id_fkey,
DROP CONSTRAINT IF EXISTS dataset_records_webhook_connection_id_fkey;

ALTER TABLE public.dataset_records
ADD CONSTRAINT dataset_records_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE SET NULL,
ADD CONSTRAINT dataset_records_webhook_connection_id_fkey 
  FOREIGN KEY (webhook_connection_id) REFERENCES public.webhook_connections(id) ON DELETE SET NULL;

-- 3. Add foreign key constraint for dataset_calculated_fields
ALTER TABLE public.dataset_calculated_fields
DROP CONSTRAINT IF EXISTS dataset_calculated_fields_dataset_id_fkey;

ALTER TABLE public.dataset_calculated_fields
ADD CONSTRAINT dataset_calculated_fields_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 4. Add foreign key constraint for dataset_fields
ALTER TABLE public.dataset_fields
DROP CONSTRAINT IF EXISTS dataset_fields_dataset_id_fkey;

ALTER TABLE public.dataset_fields
ADD CONSTRAINT dataset_fields_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 5. Add foreign key constraint for dataset_alerts
ALTER TABLE public.dataset_alerts
DROP CONSTRAINT IF EXISTS dataset_alerts_dataset_id_fkey;

ALTER TABLE public.dataset_alerts
ADD CONSTRAINT dataset_alerts_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 6. Add foreign key constraint for dataset_enrichments
ALTER TABLE public.dataset_enrichments
DROP CONSTRAINT IF EXISTS dataset_enrichments_dataset_id_fkey;

ALTER TABLE public.dataset_enrichments
ADD CONSTRAINT dataset_enrichments_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 7. Add foreign key constraint for webhook_logs
ALTER TABLE public.webhook_logs
DROP CONSTRAINT IF EXISTS webhook_logs_connection_id_fkey;

ALTER TABLE public.webhook_logs
ADD CONSTRAINT webhook_logs_connection_id_fkey 
  FOREIGN KEY (connection_id) REFERENCES public.webhook_connections(id) ON DELETE SET NULL;

-- 8. Add payload_hash column to dataset_records for deduplication
ALTER TABLE public.dataset_records 
ADD COLUMN IF NOT EXISTS payload_hash text;

-- 9. Create unique index for deduplication (dataset_id + payload_hash)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_records_dedup 
ON public.dataset_records(dataset_id, payload_hash) 
WHERE payload_hash IS NOT NULL;

-- 10. Add index on webhook_connection_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_dataset_records_connection 
ON public.dataset_records(webhook_connection_id);

-- 11. Add index on dataset_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_dataset_records_dataset 
ON public.dataset_records(dataset_id);

-- 12. Make dataset_id nullable for ON DELETE SET NULL to work
ALTER TABLE public.dataset_records 
ALTER COLUMN dataset_id DROP NOT NULL;
-- Migration: 20260123160538_1a3bfc8a-bf7e-4a31-87b8-2d6d966bfe45.sql
-- Fix 1: Update dedup index to include webhook_connection_id to allow same payload from different sources
DROP INDEX IF EXISTS idx_dataset_records_dedup;
CREATE UNIQUE INDEX idx_dataset_records_dedup 
ON public.dataset_records(dataset_id, webhook_connection_id, payload_hash) 
WHERE payload_hash IS NOT NULL;

-- Fix 2: Add index for faster orphan queries
CREATE INDEX IF NOT EXISTS idx_dataset_records_null_dataset 
ON public.dataset_records(organization_id) 
WHERE dataset_id IS NULL;

-- Fix 3: Add unique constraint on leads(email, organization_id) for safe UPSERT
-- First check if it exists, create if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_email_org_unique'
  ) THEN
    ALTER TABLE public.leads 
    ADD CONSTRAINT leads_email_org_unique UNIQUE (email, organization_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint may already exist or email column missing: %', SQLERRM;
END $$;
-- Migration: 20260123163951_0cac824c-b80e-497f-93e0-e980f2a9178c.sql
-- Add dataset_id to form_definitions for auto-sync
ALTER TABLE public.form_definitions 
ADD COLUMN dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL;

-- Add index for the foreign key
CREATE INDEX idx_form_definitions_dataset_id ON public.form_definitions(dataset_id);

-- Comment for documentation
COMMENT ON COLUMN public.form_definitions.dataset_id IS 'Optional link to a Dataset for auto-syncing form submissions to dashboard widgets';
-- Migration: 20260123175747_c3a4c6ba-6815-4632-bf4b-af56752232c3.sql
-- Drop the existing check constraint and add a new one with additional widget types
ALTER TABLE public.dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_widget_type_check 
CHECK (widget_type IN ('card', 'number', 'line', 'bar', 'pie', 'table', 'gauge', 'multi-bar', 'summary'));
-- Migration: 20260124122724_33ed3a3d-f02b-41a3-9377-3e21d8954c59.sql
-- Add 'notes' widget type to the dashboard_widgets table constraint
ALTER TABLE public.dashboard_widgets DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets ADD CONSTRAINT dashboard_widgets_widget_type_check 
CHECK (widget_type IN ('card', 'number', 'line', 'bar', 'pie', 'table', 'gauge', 'multi-bar', 'summary', 'notes'));
-- Migration: 20260126171139_cb7681a4-1e78-4fff-b7b9-2b254794d0b2.sql
-- Create close_field_mappings table for storing Close CRM field configurations
CREATE TABLE public.close_field_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  close_field_id TEXT NOT NULL,
  close_field_name TEXT NOT NULL,
  close_field_type TEXT NOT NULL DEFAULT 'text',
  close_field_choices JSONB,
  local_field_slug TEXT NOT NULL,
  is_synced BOOLEAN NOT NULL DEFAULT false,
  show_in_filters BOOLEAN NOT NULL DEFAULT false,
  show_in_dashboard BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, close_field_id)
);

-- Enable RLS
ALTER TABLE public.close_field_mappings ENABLE ROW LEVEL SECURITY;

-- Create index for organization lookups
CREATE INDEX idx_close_field_mappings_org_id ON public.close_field_mappings(organization_id);
CREATE INDEX idx_close_field_mappings_synced ON public.close_field_mappings(organization_id, is_synced) WHERE is_synced = true;

-- RLS policies for close_field_mappings
CREATE POLICY "Users can view their org's close field mappings"
  ON public.close_field_mappings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_member(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can insert close field mappings"
  ON public.close_field_mappings
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can update close field mappings"
  ON public.close_field_mappings
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can delete close field mappings"
  ON public.close_field_mappings
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_close_field_mappings_updated_at
  BEFORE UPDATE ON public.close_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
-- Migration: 20260126172248_3c8c4e3c-3c0c-49a0-991c-44e7d07b266a.sql
-- Add JSONB column to events for storing Close CRM custom field values
ALTER TABLE public.events 
ADD COLUMN IF NOT EXISTS close_custom_fields JSONB DEFAULT '{}';

-- Create a GIN index for efficient JSONB filtering
CREATE INDEX IF NOT EXISTS idx_events_close_custom_fields 
ON public.events USING GIN (close_custom_fields);

-- Add comment for documentation
COMMENT ON COLUMN public.events.close_custom_fields IS 'Stores Close CRM custom field values for filtering (e.g., platform, setter, traffic_type)';

-- Migration: 20260126220802_375f8a9e-9667-4fb2-ba36-c0b3224b3813.sql
-- Phase 1: Merge Duplicate Events - Handle PCF references properly
-- First, re-link PCFs from orphans to their matching Calendly events before deletion

-- Step 1: Re-link PCFs from orphan events to matching Calendly events
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, pcf_submitted, event_outcome, notes, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_pairs AS (
  SELECT
    o.id AS orphan_id,
    c.id AS calendly_id,
    o.lead_email,
    o.organization_id
  FROM orphans o
  JOIN events c ON
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
)
UPDATE post_call_forms pcf
SET event_id = mp.calendly_id
FROM matching_pairs mp
WHERE pcf.event_id = mp.orphan_id;

-- Step 2: Re-link payments from orphan events to matching Calendly events
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_pairs AS (
  SELECT
    o.id AS orphan_id,
    c.id AS calendly_id
  FROM orphans o
  JOIN events c ON
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
)
UPDATE payments p
SET event_id = mp.calendly_id
FROM matching_pairs mp
WHERE p.event_id = mp.orphan_id;

-- Step 3: Now merge event data and delete orphans
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, pcf_submitted, event_outcome, notes, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_calendly AS (
  SELECT
    o.id AS orphan_id,
    c.id AS calendly_id,
    o.pcf_submitted AS orphan_pcf_submitted,
    o.event_outcome AS orphan_outcome,
    o.notes AS orphan_notes
  FROM orphans o
  JOIN events c ON
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
),
do_updates AS (
  UPDATE events e
  SET
    pcf_submitted = GREATEST(m.orphan_pcf_submitted, e.pcf_submitted),
    event_outcome = COALESCE(m.orphan_outcome, e.event_outcome),
    notes = COALESCE(m.orphan_notes, e.notes),
    updated_at = now()
  FROM matching_calendly m
  WHERE e.id = m.calendly_id
  RETURNING e.id
)
DELETE FROM events
WHERE id IN (SELECT orphan_id FROM matching_calendly);

-- Step 4: Fix multi-scheduled events - mark older ones as rescheduled
WITH scheduled_groups AS (
  SELECT
    lead_email,
    event_name,
    organization_id,
    id,
    scheduled_at,
    ROW_NUMBER() OVER (
      PARTITION BY lead_email, event_name, organization_id
      ORDER BY scheduled_at DESC
    ) as rn
  FROM events
  WHERE call_status = 'scheduled'
    AND lead_email IS NOT NULL
    AND event_name IS NOT NULL
)
UPDATE events e
SET
  call_status = 'rescheduled',
  pcf_submitted = true,
  updated_at = now()
FROM scheduled_groups sg
WHERE e.id = sg.id
  AND sg.rn > 1;

-- Migration: 20260127213451_a6317d87-9268-47e0-a9fc-43c356f1c60a.sql
-- Phase 1: Cal.com Integration Database Foundation

-- 1.1 Add 'calcom' to booking_platform_type enum
ALTER TYPE booking_platform_type ADD VALUE IF NOT EXISTS 'calcom';

-- 1.2 Add Cal.com fields to organization_integrations
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS calcom_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_secret TEXT,
ADD COLUMN IF NOT EXISTS calcom_organization_id TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_id TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_registered_at TIMESTAMPTZ;

-- Index for org resolution by Cal.com org ID
CREATE INDEX IF NOT EXISTS idx_org_integrations_calcom_org
ON organization_integrations(calcom_organization_id)
WHERE calcom_organization_id IS NOT NULL;

-- 1.3 Add Cal.com fields to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS calcom_booking_uid TEXT,
ADD COLUMN IF NOT EXISTS calcom_event_type_id TEXT,
ADD COLUMN IF NOT EXISTS booking_platform TEXT DEFAULT 'calendly',
ADD COLUMN IF NOT EXISTS meeting_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS meeting_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS no_show_host BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS no_show_guest BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS no_show_reported_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescheduled_from_uid TEXT,
ADD COLUMN IF NOT EXISTS rescheduled_to_uid TEXT,
ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS booking_responses JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS booking_metadata JSONB DEFAULT '{}';

-- Indexes for Cal.com event queries
CREATE INDEX IF NOT EXISTS idx_events_calcom_booking_uid
ON events(calcom_booking_uid) WHERE calcom_booking_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_booking_platform
ON events(booking_platform);

CREATE INDEX IF NOT EXISTS idx_events_rescheduled_from
ON events(rescheduled_from_uid) WHERE rescheduled_from_uid IS NOT NULL;

-- 1.4 Create Cal.com webhook audit table
CREATE TABLE IF NOT EXISTS calcom_webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  booking_uid TEXT,
  attendee_email TEXT,
  organizer_email TEXT,
  event_type_title TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  reschedule_uid TEXT,
  reschedule_reason TEXT,
  no_show_host BOOLEAN,
  no_show_guest BOOLEAN,
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,
  recording_url TEXT,
  full_payload JSONB,
  request_headers JSONB,
  request_ip TEXT,
  organization_id UUID REFERENCES organizations(id),
  processing_result TEXT,
  error_message TEXT
);

-- Enable RLS on audit table
ALTER TABLE calcom_webhook_audit ENABLE ROW LEVEL SECURITY;

-- RLS policy for audit table - org members can view their logs
CREATE POLICY "Org members can view their Cal.com audit logs"
  ON calcom_webhook_audit FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Service role can insert audit logs
CREATE POLICY "Service role can insert Cal.com audit logs"
  ON calcom_webhook_audit FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

-- Indexes for audit table
CREATE INDEX IF NOT EXISTS idx_calcom_audit_booking_uid ON calcom_webhook_audit(booking_uid);
CREATE INDEX IF NOT EXISTS idx_calcom_audit_org ON calcom_webhook_audit(organization_id);
CREATE INDEX IF NOT EXISTS idx_calcom_audit_created ON calcom_webhook_audit(created_at DESC);

-- 1.5 Backfill existing events as Calendly (only if booking_platform is null)
UPDATE events
SET booking_platform = 'calendly'
WHERE booking_platform IS NULL
  AND calendly_event_uuid IS NOT NULL;

-- Migration: 20260128171649_19a1dc6a-3077-46f4-8cf4-af3db8766941.sql
-- Event display columns configuration table
CREATE TABLE public.event_display_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  field_source TEXT DEFAULT 'booking_metadata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, field_key)
);

ALTER TABLE public.event_display_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org columns"
  ON public.event_display_columns FOR SELECT
  USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert org columns"
  ON public.event_display_columns FOR INSERT
  WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update org columns"
  ON public.event_display_columns FOR UPDATE
  USING (public.user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete org columns"
  ON public.event_display_columns FOR DELETE
  USING (public.user_is_org_admin(auth.uid(), organization_id));

CREATE TRIGGER update_event_display_columns_updated_at
  BEFORE UPDATE ON public.event_display_columns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default columns for all existing organizations
INSERT INTO public.event_display_columns (organization_id, field_key, display_label, is_visible, sort_order, field_source)
SELECT o.id, d.field_key, d.display_label, d.is_visible, d.sort_order, d.field_source
FROM public.organizations o
CROSS JOIN (VALUES
  ('utm_platform', 'Traffic Source', true, 1, 'booking_metadata'),
  ('utm_source', 'UTM Source', false, 2, 'booking_metadata'),
  ('utm_medium', 'UTM Medium', false, 3, 'booking_metadata'),
  ('utm_campaign', 'UTM Campaign', false, 4, 'booking_metadata'),
  ('utm_setter', 'UTM Setter', false, 5, 'booking_metadata')
) AS d(field_key, display_label, is_visible, sort_order, field_source)
ON CONFLICT (organization_id, field_key) DO NOTHING;

-- Migration: 20260130153109_f793a0cb-5072-4162-9584-da8b61a71678.sql
-- Phase 1: Team Identity Data Unification

-- Migration 1: Add display_name column to closers table
ALTER TABLE closers
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill with current name
UPDATE closers SET display_name = name WHERE display_name IS NULL;

-- Migration 2: Create setter_aliases table for name variant mapping
CREATE TABLE public.setter_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, alias_name)
);

ALTER TABLE setter_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view setter aliases in their org"
  ON setter_aliases FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage setter aliases"
  ON setter_aliases FOR ALL
  USING (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id))
  WITH CHECK (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id));

-- Migration 3: Remove duplicate setter (Amadou Bah - keep older record)
-- NOTE: This DELETE targets a specific org ID from the source - safe to run on empty DB (no-op)
DELETE FROM setters
WHERE id = '088dcf32-9aaa-462b-9b98-597fa9705b27';

-- Add unique constraint to prevent future duplicates
ALTER TABLE setters
ADD CONSTRAINT unique_setter_name_per_org
UNIQUE (organization_id, name);

-- Migration 4: Seed initial aliases for known variants
-- Only insert if the org exists (it won't until data migration)
INSERT INTO setter_aliases (organization_id, alias_name, canonical_name)
SELECT org_id, alias, canonical
FROM (VALUES
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31'::uuid, 'jack', 'Jack Hanson'),
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31'::uuid, 'amadou', 'Amadou Bah'),
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31'::uuid, 'steve', 'Steve Williams')
) AS v(org_id, alias, canonical)
WHERE EXISTS (SELECT 1 FROM organizations WHERE id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31')
ON CONFLICT (organization_id, alias_name) DO NOTHING;

-- Migration: 20260130155223_29d25562-db92-4a93-aefc-970cfdf02e05.sql
-- Fix 1: Profiles table - tighten access to own profile + org admin for team management
DROP POLICY IF EXISTS "Org admins can view profiles in their org" ON public.profiles;

CREATE POLICY "Org admins can view member profiles"
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM organization_members admin_om
      INNER JOIN organization_members target_om ON admin_om.organization_id = target_om.organization_id
      WHERE admin_om.user_id = auth.uid()
        AND admin_om.role IN ('owner', 'admin')
        AND target_om.user_id = profiles.user_id
    )
  );

-- Fix 2: Payments table - restrict to admins + own payments (closer/setter)
DROP POLICY IF EXISTS "Org members can view their payments" ON public.payments;

CREATE POLICY "Users can view allowed payments"
  ON public.payments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      user_is_org_admin(auth.uid(), organization_id)
      OR
      EXISTS (
        SELECT 1 FROM closers c
        WHERE c.id = payments.closer_id
          AND c.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
      )
      OR
      EXISTS (
        SELECT 1 FROM setters s
        WHERE s.id = payments.setter_id
          AND s.email = (SELECT email FROM profiles WHERE user_id = auth.uid())
      )
      OR
      EXISTS (
        SELECT 1 FROM events e
        INNER JOIN profiles p ON (p.email = e.closer_email OR p.linked_closer_name = e.closer_name)
        WHERE e.id = payments.event_id AND p.user_id = auth.uid()
      )
    )
  );

-- Migration: 20260131184205_78d568bf-f517-4f55-b2a7-f6e1366239e6.sql
-- Add Cal.com sync configuration columns to organization_integrations
ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS calcom_auto_sync_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS calcom_excluded_event_type_ids JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS calcom_last_auto_sync_at TIMESTAMPTZ;

-- Enable pg_net extension for HTTP calls from cron jobs
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Add comment for documentation
COMMENT ON COLUMN organization_integrations.calcom_auto_sync_enabled IS 'Whether automatic hourly Cal.com sync is enabled';
COMMENT ON COLUMN organization_integrations.calcom_excluded_event_type_ids IS 'Array of Cal.com event type IDs to exclude from sync';
COMMENT ON COLUMN organization_integrations.calcom_last_auto_sync_at IS 'Timestamp of last automatic sync';
