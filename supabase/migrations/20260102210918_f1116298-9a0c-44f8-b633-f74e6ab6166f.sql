-- Drop the recursive policies on organization_members
DROP POLICY IF EXISTS "Super admins can manage all members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can view members of their organizations" ON public.organization_members;
DROP POLICY IF EXISTS "Org admins can manage their org members" ON public.organization_members;
DROP POLICY IF EXISTS "Users can insert themselves as members" ON public.organization_members;

-- Create a security definer function to check org membership without recursion
CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Create a security definer function to check if user is org admin
CREATE OR REPLACE FUNCTION public.user_is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner', 'admin')
  )
$$;

-- Create a function to get all org IDs user belongs to
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
$$;

-- Re-create policies using security definer functions
CREATE POLICY "Super admins can manage all members"
ON public.organization_members FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own memberships"
ON public.organization_members FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Users can view members of orgs they belong to"
ON public.organization_members FOR SELECT
USING (user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admins can manage their org members"
ON public.organization_members FOR ALL
USING (user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Users can insert themselves as members"
ON public.organization_members FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Also fix organizations table policies
DROP POLICY IF EXISTS "Super admins can manage all organizations" ON public.organizations;
DROP POLICY IF EXISTS "Users can view their organizations" ON public.organizations;
DROP POLICY IF EXISTS "Org admins can manage their organizations" ON public.organizations;

CREATE POLICY "Super admins can manage all organizations"
ON public.organizations FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their organizations"
ON public.organizations FOR SELECT
USING (id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage their organizations"
ON public.organizations FOR ALL
USING (user_is_org_admin(auth.uid(), id));