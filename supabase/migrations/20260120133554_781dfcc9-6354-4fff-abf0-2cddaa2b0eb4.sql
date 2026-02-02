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