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