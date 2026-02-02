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
CREATE POLICY "Anyone can accept invitation with valid token"
  ON public.invitations FOR UPDATE
  USING (status = 'pending' AND expires_at > now())
  WITH CHECK (status IN ('pending', 'accepted'));

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