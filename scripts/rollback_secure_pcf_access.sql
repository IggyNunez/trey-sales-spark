-- ============================================
-- ROLLBACK: SECURE POST-CALL FORMS MIGRATION
-- ============================================
-- Use this if the secure migration causes issues
-- This restores the previous permissive policies
-- ============================================

-- ============================================
-- PART 1: DROP SECURE PCF POLICIES
-- ============================================

DROP POLICY IF EXISTS "Org members can view their PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org admins can delete PCFs" ON public.post_call_forms;

-- ============================================
-- PART 2: RESTORE PERMISSIVE PCF POLICIES
-- ============================================

CREATE POLICY "Anyone can view PCFs"
  ON public.post_call_forms FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (true);

-- ============================================
-- PART 3: DROP SECURE EVENTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Org members can view events" ON public.events;

-- ============================================
-- PART 4: RESTORE PERMISSIVE EVENTS POLICIES
-- ============================================

CREATE POLICY "Public can view events"
  ON public.events FOR SELECT
  USING (true);

CREATE POLICY "Anyone can update events"
  ON public.events FOR UPDATE
  USING (true);

-- ============================================
-- PART 5: DROP SECURE PAYMENTS POLICIES
-- ============================================

DROP POLICY IF EXISTS "Org members can insert payments" ON public.payments;
DROP POLICY IF EXISTS "Org members can update payments" ON public.payments;

-- ============================================
-- PART 6: RESTORE PERMISSIVE PAYMENTS POLICIES
-- ============================================

CREATE POLICY "Anyone can insert payments"
  ON public.payments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update payments"
  ON public.payments FOR UPDATE
  USING (true);

-- ============================================
-- PART 7: UPDATE COMMENTS
-- ============================================

COMMENT ON TABLE public.post_call_forms IS 
  'Post-call forms - ROLLBACK applied, permissive policies restored';

COMMENT ON TABLE public.events IS 
  'Events - ROLLBACK applied, permissive policies restored';
