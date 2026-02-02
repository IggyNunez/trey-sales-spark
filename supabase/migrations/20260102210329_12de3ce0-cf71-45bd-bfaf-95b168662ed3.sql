-- Fix organizations RLS to allow super admins to see all orgs
DROP POLICY IF EXISTS "Org admins can manage their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;

CREATE POLICY "Super admins can manage all organizations"
ON public.organizations FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
USING (
  id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org admins can manage their organizations"
ON public.organizations FOR ALL
USING (
  id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Fix organization_members RLS for super admins
DROP POLICY IF EXISTS "Org admins can manage members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view members of their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.organization_members;

CREATE POLICY "Super admins can manage all members"
ON public.organization_members FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view members of their organizations"
ON public.organization_members FOR SELECT
USING (
  organization_id IN (SELECT organization_id FROM organization_members om WHERE om.user_id = auth.uid())
);

CREATE POLICY "Org admins can manage their org members"
ON public.organization_members FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members om
    WHERE om.user_id = auth.uid() 
    AND om.role IN ('owner', 'admin')
  )
);

CREATE POLICY "Users can insert themselves as members"
ON public.organization_members FOR INSERT
WITH CHECK (user_id = auth.uid());