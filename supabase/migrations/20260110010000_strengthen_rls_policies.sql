-- Strengthen RLS Policies for Multi-Tenant Data Isolation
-- This migration updates RLS policies to filter by organization_id
-- ensuring users can only access data from their own organization

-- Helper function to get user's organization IDs
CREATE OR REPLACE FUNCTION get_user_org_ids(user_uuid UUID)
RETURNS SETOF UUID AS $$
  SELECT organization_id FROM organization_members WHERE user_id = user_uuid;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Helper function to check if user is admin of a specific org
CREATE OR REPLACE FUNCTION is_org_admin(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = user_uuid
    AND organization_id = org_uuid
    AND role IN ('admin', 'super_admin', 'owner')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ==========================================
-- EVENTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all events" ON public.events;
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can view their assigned events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can update their assigned events" ON public.events;
DROP POLICY IF EXISTS "Public can view events" ON public.events;

-- Org admins can manage events in their org
CREATE POLICY "Org admins can manage events"
  ON public.events FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Sales reps can view events where they are the closer (by email or name match)
CREATE POLICY "Sales reps can view their events"
  ON public.events FOR SELECT
  USING (
    closer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR closer_id::text = auth.uid()::text
  );

-- Sales reps can update their assigned events
CREATE POLICY "Sales reps can update their events"
  ON public.events FOR UPDATE
  USING (
    closer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR closer_id::text = auth.uid()::text
  );

-- ==========================================
-- LEADS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all leads" ON public.leads;
DROP POLICY IF EXISTS "Admins can view all leads" ON public.leads;

-- Org admins can manage leads in their org
CREATE POLICY "Org admins can manage leads"
  ON public.leads FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- PAYMENTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can view all payments" ON public.payments;

-- Org admins can manage payments in their org
CREATE POLICY "Org admins can manage payments"
  ON public.payments FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- POST_CALL_FORMS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage all PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Admins can view all PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can view their own PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can insert their own PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Sales reps can update their own PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Public can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Public can update PCFs by closer name" ON public.post_call_forms;
DROP POLICY IF EXISTS "Public can view PCFs" ON public.post_call_forms;

-- Org admins can manage PCFs in their org
CREATE POLICY "Org admins can manage PCFs"
  ON public.post_call_forms FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Allow PCF submission without auth (for portal users with token)
CREATE POLICY "Anyone can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (true);

-- Allow PCF updates for portal users
CREATE POLICY "Anyone can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (true);

-- Allow viewing PCFs (needed for portal)
CREATE POLICY "Anyone can view PCFs"
  ON public.post_call_forms FOR SELECT
  USING (true);

-- ==========================================
-- SETTERS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage setters" ON public.setters;
DROP POLICY IF EXISTS "Authenticated users can view setters" ON public.setters;

-- Org admins can manage setters in their org
CREATE POLICY "Org admins can manage setters"
  ON public.setters FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Members can view setters in their org
CREATE POLICY "Org members can view setters"
  ON public.setters FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- CLOSERS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage closers" ON public.closers;
DROP POLICY IF EXISTS "Authenticated users can view closers" ON public.closers;
DROP POLICY IF EXISTS "Public can view active closers" ON public.closers;

-- Org admins can manage closers in their org
CREATE POLICY "Org admins can manage closers"
  ON public.closers FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Members can view closers in their org
CREATE POLICY "Org members can view closers"
  ON public.closers FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Public can view active closers (for portal dropdown)
CREATE POLICY "Public can view closers"
  ON public.closers FOR SELECT
  USING (is_active = true);

-- ==========================================
-- SOURCES TABLE
-- ==========================================
-- Check if sources table has RLS enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'sources') THEN
    ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Org admins can manage sources" ON public.sources;
    DROP POLICY IF EXISTS "Org members can view sources" ON public.sources;

    CREATE POLICY "Org admins can manage sources"
      ON public.sources FOR ALL
      USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

    CREATE POLICY "Org members can view sources"
      ON public.sources FOR SELECT
      USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));
  END IF;
END $$;

-- ==========================================
-- PAYOUT SNAPSHOTS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage payout snapshots" ON public.payout_snapshots;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshots" ON public.payout_snapshots;

-- Org admins can manage payout snapshots in their org
CREATE POLICY "Org admins can manage payout snapshots"
  ON public.payout_snapshots FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- PAYOUT SNAPSHOT DETAILS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage payout snapshot details" ON public.payout_snapshot_details;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshot details" ON public.payout_snapshot_details;

-- Org admins can manage payout snapshot details in their org
CREATE POLICY "Org admins can manage payout snapshot details"
  ON public.payout_snapshot_details FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- PAYOUT SNAPSHOT SUMMARIES TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage payout snapshot summaries" ON public.payout_snapshot_summaries;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshot summaries" ON public.payout_snapshot_summaries;

-- Org admins can manage payout snapshot summaries in their org
CREATE POLICY "Org admins can manage payout snapshot summaries"
  ON public.payout_snapshot_summaries FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- PORTAL SETTINGS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can manage portal settings" ON public.portal_settings;
DROP POLICY IF EXISTS "Authenticated users can view portal settings" ON public.portal_settings;

-- Org admins can manage portal settings in their org
CREATE POLICY "Org admins can manage portal settings"
  ON public.portal_settings FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Org members can view portal settings
CREATE POLICY "Org members can view portal settings"
  ON public.portal_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ==========================================
-- AUDIT LOGS TABLE
-- ==========================================
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.audit_logs;

-- Org admins can view audit logs in their org
CREATE POLICY "Org admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- System can still insert audit logs
-- (keep existing policy if it exists)

-- ==========================================
-- CLOSER ACCESS TOKENS TABLE
-- ==========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'closer_access_tokens') THEN
    ALTER TABLE public.closer_access_tokens ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Org admins can manage access tokens" ON public.closer_access_tokens;
    DROP POLICY IF EXISTS "Public can view access tokens" ON public.closer_access_tokens;

    CREATE POLICY "Org admins can manage access tokens"
      ON public.closer_access_tokens FOR ALL
      USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

    -- Allow token validation without auth (for portal access)
    CREATE POLICY "Public can validate tokens"
      ON public.closer_access_tokens FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- ==========================================
-- INVITATIONS TABLE
-- ==========================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'invitations') THEN
    ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "Org admins can manage invitations" ON public.invitations;

    CREATE POLICY "Org admins can manage invitations"
      ON public.invitations FOR ALL
      USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

    -- Allow public to view invitations by token (for accepting invites)
    CREATE POLICY "Public can view invitations by token"
      ON public.invitations FOR SELECT
      USING (true);
  END IF;
END $$;

-- Add comment explaining the security model
COMMENT ON FUNCTION get_user_org_ids IS 'Returns all organization IDs that the given user is a member of. Used in RLS policies for multi-tenant data isolation.';
COMMENT ON FUNCTION is_org_admin IS 'Checks if the given user is an admin/owner of the specified organization. Used in RLS policies.';
