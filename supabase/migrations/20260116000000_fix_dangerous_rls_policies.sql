-- Fix Dangerous RLS Policies
-- This migration removes overly permissive policies and implements secure alternatives
-- Date: 2026-01-16

-- ==========================================
-- STEP 1: Drop the dangerous "Anyone can..." policies
-- ==========================================

-- Post Call Forms - Remove dangerous policies
DROP POLICY IF EXISTS "Anyone can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can view PCFs" ON public.post_call_forms;

-- Events - Remove dangerous policies
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;

-- Payments - Remove dangerous policies
DROP POLICY IF EXISTS "Anyone can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can update payments" ON public.payments;

-- ==========================================
-- STEP 2: Create secure policies for portal access
-- Portal operations go through edge functions using service role
-- which bypasses RLS, so we only need authenticated user policies
-- ==========================================

-- POST_CALL_FORMS: Org members can manage, service role handles portal
CREATE POLICY "Org members can view PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- EVENTS: Only org members can modify
-- Service role is used by edge functions for portal updates
CREATE POLICY "Org members can update events"
  ON public.events FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- PAYMENTS: Only org members can manage
-- Webhooks use service role which bypasses RLS
CREATE POLICY "Org members can view payments"
  ON public.payments FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can insert payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update payments"
  ON public.payments FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ==========================================
-- STEP 3: Ensure service role bypass is working
-- Edge functions use SUPABASE_SERVICE_ROLE_KEY which bypasses RLS
-- This is the secure pattern for unauthenticated operations
-- ==========================================

-- Add comment explaining the security model
COMMENT ON TABLE public.post_call_forms IS 'Post call forms submitted by closers. Portal submissions go through edge functions (portal-pcf) using service role. Authenticated users access via RLS.';
COMMENT ON TABLE public.events IS 'Calendar events synced from Calendly. Updates from portal go through edge functions using service role. Authenticated users access via RLS.';
COMMENT ON TABLE public.payments IS 'Payment records from Stripe/Whop webhooks. Webhook handlers use service role. Authenticated users access via RLS.';

-- ==========================================
-- STEP 4: Verify RLS is enabled on critical tables
-- ==========================================

ALTER TABLE public.post_call_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- STEP 5: Fix invitations policy to not expose all pending invites
-- ==========================================

DROP POLICY IF EXISTS "Public can view invitations by token" ON public.invitations;
DROP POLICY IF EXISTS "Limited public invitation access" ON public.invitations;

-- Only allow viewing invitations if user is in the org or has the token
-- Token validation happens in edge function with service role
CREATE POLICY "Org members can view invitations"
  ON public.invitations FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Note: Invitation acceptance flow uses edge function (validate-invite)
-- which runs with service role key, bypassing RLS.
-- This is secure because the edge function validates the token first.
