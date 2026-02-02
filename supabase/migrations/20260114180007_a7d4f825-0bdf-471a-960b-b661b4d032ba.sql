-- ============================================
-- SECURE POST-CALL FORMS MIGRATION (RE-APPLY)
-- ============================================

-- PART 1: DROP INSECURE PCF POLICIES
DROP POLICY IF EXISTS "Anyone can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can view PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org admins can manage PCFs" ON public.post_call_forms;

-- PART 2: CREATE SECURE PCF POLICIES
CREATE POLICY "Org members can view their PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org admins can delete PCFs"
  ON public.post_call_forms FOR DELETE
  USING (
    auth.uid() IS NOT NULL 
    AND user_is_org_admin(auth.uid(), organization_id)
  );

-- PART 3: SECURE EVENTS POLICIES
DROP POLICY IF EXISTS "Anyone can update events" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;

CREATE POLICY "Org members can view events"
  ON public.events FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- PART 4: SECURE PAYMENTS POLICIES
DROP POLICY IF EXISTS "Anyone can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can update payments" ON public.payments;

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

-- PART 5: COMMENTS
COMMENT ON TABLE public.post_call_forms IS 
  'Post-call forms with secure org-based access. Portal users access via portal-pcf edge function.';

COMMENT ON TABLE public.events IS 
  'Events with secure org-based access. Portal updates via portal-pcf edge function.';