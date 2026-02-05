-- ============================================================
-- RBAC Permissions: Add Closer and Setter Roles
-- ============================================================
-- This migration adds granular role-based access control for closers and setters
-- Each role now has specific permissions for their own data only

-- ============================================================
-- STEP 1: Add new roles to app_role enum
-- ============================================================
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'closer';
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'setter';

-- ============================================================
-- STEP 2: Add profile_id and user_id to setters table
-- ============================================================
-- This allows setters to have user accounts and log in
ALTER TABLE public.setters
ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id),
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Add indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_setters_user_id ON public.setters(user_id);
CREATE INDEX IF NOT EXISTS idx_setters_profile_id ON public.setters(profile_id);

-- ============================================================
-- STEP 3: Add linked_setter_name to profiles table
-- ============================================================
-- This allows linking a user profile to a setter by name
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS linked_setter_name TEXT;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_setter_name ON public.profiles(linked_setter_name);

-- ============================================================
-- STEP 4: Create helper functions for role checking
-- ============================================================

-- Check if user has the 'closer' role
CREATE OR REPLACE FUNCTION is_closer(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role = 'closer'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user has the 'setter' role
CREATE OR REPLACE FUNCTION is_setter(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role = 'setter'
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Check if user is admin or above (admin or super_admin)
CREATE OR REPLACE FUNCTION is_admin_or_above(user_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = user_uuid AND role IN ('admin', 'super_admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get user's closer identities (name and email for matching events)
CREATE OR REPLACE FUNCTION get_user_closer_identities(user_uuid UUID)
RETURNS TABLE(closer_name TEXT, closer_email TEXT) AS $$
  -- From linked_closer_name in profiles
  SELECT p.linked_closer_name, p.email
  FROM profiles p
  WHERE p.user_id = user_uuid
  AND p.linked_closer_name IS NOT NULL

  UNION

  -- From closers table via profile_id
  SELECT c.name, c.email
  FROM closers c
  JOIN profiles p ON c.profile_id = p.id
  WHERE p.user_id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Get user's setter names for matching leads/events
CREATE OR REPLACE FUNCTION get_user_setter_names(user_uuid UUID)
RETURNS SETOF TEXT AS $$
  -- From linked_setter_name in profiles
  SELECT p.linked_setter_name
  FROM profiles p
  WHERE p.user_id = user_uuid
  AND p.linked_setter_name IS NOT NULL

  UNION

  -- From setters table via profile_id
  SELECT s.name
  FROM setters s
  JOIN profiles p ON s.profile_id = p.id
  WHERE p.user_id = user_uuid

  UNION

  -- From setters table via user_id directly
  SELECT s.name
  FROM setters s
  WHERE s.user_id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ============================================================
-- STEP 5: Update EVENTS RLS Policies
-- ============================================================
-- Drop existing policies to replace with role-specific ones
DROP POLICY IF EXISTS "Org admins can manage events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can view their events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can update their events" ON public.events;
DROP POLICY IF EXISTS "Org members can view events" ON public.events;

-- Super admins: full access to all events
CREATE POLICY "Super admins can manage all events"
  ON public.events FOR ALL
  USING (is_super_admin(auth.uid()));

-- Admins: org-wide access
CREATE POLICY "Admins can manage org events"
  ON public.events FOR ALL
  USING (
    is_admin_or_above(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Closers: view their own events only
CREATE POLICY "Closers can view own events"
  ON public.events FOR SELECT
  USING (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
      OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
    )
  );

-- Closers: update their own events (for PCF submission flag)
CREATE POLICY "Closers can update own events"
  ON public.events FOR UPDATE
  USING (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
      OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
    )
  );

-- Setters: view events for leads they set
CREATE POLICY "Setters can view events for their leads"
  ON public.events FOR SELECT
  USING (
    is_setter(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND setter_name IN (SELECT * FROM get_user_setter_names(auth.uid()))
  );

-- ============================================================
-- STEP 6: Update LEADS RLS Policies
-- ============================================================
DROP POLICY IF EXISTS "Org admins can manage leads" ON public.leads;

-- Super admins: full access
CREATE POLICY "Super admins can manage all leads"
  ON public.leads FOR ALL
  USING (is_super_admin(auth.uid()));

-- Admins: org-wide access
CREATE POLICY "Admins can manage org leads"
  ON public.leads FOR ALL
  USING (
    is_admin_or_above(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Setters: view their own leads
CREATE POLICY "Setters can view own leads"
  ON public.leads FOR SELECT
  USING (
    is_setter(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      original_setter_name IN (SELECT * FROM get_user_setter_names(auth.uid()))
      OR current_setter_name IN (SELECT * FROM get_user_setter_names(auth.uid()))
    )
  );

-- Note: Closers have no policy for leads (cannot see leads)

-- ============================================================
-- STEP 7: Update PAYMENTS RLS Policies
-- ============================================================
DROP POLICY IF EXISTS "Org admins can manage payments" ON public.payments;
DROP POLICY IF EXISTS "Users can view allowed payments" ON public.payments;

-- Super admins: full access
CREATE POLICY "Super admins can manage all payments"
  ON public.payments FOR ALL
  USING (is_super_admin(auth.uid()));

-- Admins: org-wide access
CREATE POLICY "Admins can manage org payments"
  ON public.payments FOR ALL
  USING (
    is_admin_or_above(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Closers: view their own payments
CREATE POLICY "Closers can view own payments"
  ON public.payments FOR SELECT
  USING (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      -- Via closer_id linked to profile
      closer_id IN (
        SELECT c.id FROM closers c
        JOIN profiles p ON c.profile_id = p.id
        WHERE p.user_id = auth.uid()
      )
      OR
      -- Via event's closer_email/name
      event_id IN (
        SELECT id FROM events
        WHERE closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
           OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
      )
    )
  );

-- Note: Setters have no policy for payments (cannot see payments)

-- ============================================================
-- STEP 8: Update POST_CALL_FORMS RLS Policies
-- ============================================================
DROP POLICY IF EXISTS "Org admins can manage PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Org members can view PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can view PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Super admins can manage all PCFs" ON public.post_call_forms;

-- Super admins: full access
CREATE POLICY "Super admins can manage all PCFs"
  ON public.post_call_forms FOR ALL
  USING (is_super_admin(auth.uid()));

-- Admins: org-wide access
CREATE POLICY "Admins can manage org PCFs"
  ON public.post_call_forms FOR ALL
  USING (
    is_admin_or_above(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- Closers: view and submit PCFs for their own events
CREATE POLICY "Closers can view own PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND event_id IN (
      SELECT id FROM events
      WHERE closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
         OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
    )
  );

CREATE POLICY "Closers can insert own PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND event_id IN (
      SELECT id FROM events
      WHERE closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
         OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
    )
  );

CREATE POLICY "Closers can update own PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    is_closer(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND event_id IN (
      SELECT id FROM events
      WHERE closer_email = (SELECT email FROM profiles WHERE user_id = auth.uid())
         OR closer_name IN (SELECT closer_name FROM get_user_closer_identities(auth.uid()))
    )
  );

-- Note: Setters have no policy for PCFs (cannot see or submit PCFs)

-- Portal access uses service role (bypasses RLS), so no public policies needed

-- ============================================================
-- STEP 9: Update organization_integrations (Admin only)
-- ============================================================
-- Ensure closers and setters cannot access integrations/settings
DROP POLICY IF EXISTS "Org admins can view integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Org admins can insert integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Org admins can update integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Org admins can delete integrations" ON public.organization_integrations;
DROP POLICY IF EXISTS "Super admins can manage all integrations" ON public.organization_integrations;

-- Super admins: full access
CREATE POLICY "Super admins can manage all integrations"
  ON public.organization_integrations FOR ALL
  USING (is_super_admin(auth.uid()));

-- Only admins can access integrations (not closers/setters)
CREATE POLICY "Admins can manage org integrations"
  ON public.organization_integrations FOR ALL
  USING (
    is_admin_or_above(auth.uid())
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ============================================================
-- STEP 10: Add invitation role column for team invites
-- ============================================================
-- Add role column to track what role to assign on invite acceptance
ALTER TABLE public.invitations
ADD COLUMN IF NOT EXISTS invite_role app_role DEFAULT 'closer';

-- ============================================================
-- STEP 11: Comments for documentation
-- ============================================================
COMMENT ON FUNCTION is_closer IS 'Returns true if the user has the closer role';
COMMENT ON FUNCTION is_setter IS 'Returns true if the user has the setter role';
COMMENT ON FUNCTION is_admin_or_above IS 'Returns true if the user has admin or super_admin role';
COMMENT ON FUNCTION get_user_closer_identities IS 'Returns the closer names and emails associated with a user for event matching';
COMMENT ON FUNCTION get_user_setter_names IS 'Returns the setter names associated with a user for lead/event matching';
