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