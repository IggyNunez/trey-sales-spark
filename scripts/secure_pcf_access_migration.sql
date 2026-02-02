-- ============================================
-- SECURE POST-CALL FORMS MIGRATION
-- ============================================
-- This migration secures PCF access by:
-- 1. Removing overly permissive "Anyone can..." policies
-- 2. Adding proper org-based access for authenticated users
-- 3. Portal access is handled via edge function with service role
-- 
-- IMPORTANT: Portal functionality moves to edge function (portal-pcf)
-- which validates tokens server-side and uses service role for operations.
-- ============================================

-- ============================================
-- PART 1: DROP INSECURE PCF POLICIES
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can view PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org admins can manage PCFs" ON public.post_call_forms;

-- ============================================
-- PART 2: CREATE SECURE PCF POLICIES
-- ============================================

-- Policy: Authenticated org members can SELECT their org's PCFs
CREATE POLICY "Org members can view their PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Policy: Authenticated org members can INSERT PCFs for their org
CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Policy: Authenticated org members can UPDATE their org's PCFs
CREATE POLICY "Org members can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Policy: Only org admins can DELETE PCFs
CREATE POLICY "Org admins can delete PCFs"
  ON public.post_call_forms FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND user_is_org_admin(auth.uid(), organization_id)
  );

-- ============================================
-- PART 3: SECURE EVENTS POLICIES
-- ============================================

-- Drop overly permissive event policies
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;

-- Policy: Org members can view their org's events
CREATE POLICY "Org members can view events"
  ON public.events FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Note: Events INSERT/UPDATE for portal is handled by edge function

-- ============================================
-- PART 4: SECURE PAYMENTS POLICIES  
-- ============================================

DROP POLICY IF EXISTS "Anyone can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can update payments" ON public.payments;

-- Payments should only be managed by authenticated org members
-- (Webhooks use service role key and bypass RLS)

CREATE POLICY "Org members can insert payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update payments"
  ON public.payments FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ============================================
-- PART 5: COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.post_call_forms IS 
  'Post-call forms with secure org-based access. Portal users access via portal-pcf edge function which validates tokens. Migration: secure_pcf_access_v2';

COMMENT ON TABLE public.events IS 
  'Events with secure org-based access. Portal updates via portal-pcf edge function. Migration: secure_pcf_access_v2';
