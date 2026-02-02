-- Fix 1: Profiles table - tighten access to own profile + org admin for team management
-- The current policies are too broad. Restrict to:
-- 1. Users can always view/update their own profile
-- 2. Org admins can view profiles of users in their organization (for team management)
-- 3. Super admins can manage all profiles

-- Drop the overly permissive org member policy
DROP POLICY IF EXISTS "Org admins can view profiles in their org" ON public.profiles;

-- Create new properly scoped policy for org admins
-- This is necessary for team management UI (TeamPage.tsx, OrgMembersList.tsx)
CREATE POLICY "Org admins can view member profiles" 
  ON public.profiles FOR SELECT
  USING (
    auth.uid() IS NOT NULL 
    AND EXISTS (
      -- Check that the viewer is an admin in an org that the target user is also in
      SELECT 1 FROM organization_members admin_om
      INNER JOIN organization_members target_om ON admin_om.organization_id = target_om.organization_id
      WHERE admin_om.user_id = auth.uid()
        AND admin_om.role IN ('owner', 'admin')
        AND target_om.user_id = profiles.user_id
    )
  );

-- Fix 2: Payments table - restrict to admins + own payments (closer/setter)
-- Current policies allow all org members to see all payments
-- Change to: admins see all, sales reps only see their own payments

-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Org members can view their payments" ON public.payments;

-- Create restricted SELECT policy: admins + own payments
CREATE POLICY "Users can view allowed payments"
  ON public.payments FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
    AND (
      -- Org admins can view all payments in their org
      user_is_org_admin(auth.uid(), organization_id)
      OR
      -- Sales reps can view payments where they are the closer
      EXISTS (
        SELECT 1 FROM closers c
        WHERE c.id = payments.closer_id
          AND c.profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid())
      )
      OR
      -- Sales reps can view payments where they are the setter
      EXISTS (
        SELECT 1 FROM setters s
        WHERE s.id = payments.setter_id
          AND s.email = (SELECT email FROM profiles WHERE user_id = auth.uid())
      )
      OR
      -- Also allow if the closer email matches the user's email (linked_closer_name flow)
      EXISTS (
        SELECT 1 FROM events e
        INNER JOIN profiles p ON (p.email = e.closer_email OR p.linked_closer_name = e.closer_name)
        WHERE e.id = payments.event_id AND p.user_id = auth.uid()
      )
    )
  );