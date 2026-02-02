-- FIX 1: Replace overly permissive RLS policies on events table
-- Drop the permissive UPDATE policy
DROP POLICY IF EXISTS "Allow PCF submission updates to events" ON public.events;

-- Create proper org-scoped UPDATE policy
CREATE POLICY "Org members can update their events" 
ON public.events 
FOR UPDATE 
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.user_id = auth.uid() 
    AND (profiles.email = events.closer_email OR profiles.linked_closer_name = events.closer_name)
  )
);

-- FIX 2: Replace overly permissive RLS policies on post_call_forms table
DROP POLICY IF EXISTS "Allow PCF deletion" ON public.post_call_forms;
DROP POLICY IF EXISTS "Public can insert PCFs" ON public.post_call_forms;
DROP POLICY IF EXISTS "Public can update PCFs by closer name" ON public.post_call_forms;

-- Create proper org-scoped INSERT policy
CREATE POLICY "Org members can insert PCFs for their org" 
ON public.post_call_forms 
FOR INSERT 
WITH CHECK (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

-- Create proper org-scoped UPDATE policy
CREATE POLICY "Org members can update their org PCFs" 
ON public.post_call_forms 
FOR UPDATE 
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR closer_id = auth.uid()
);

-- Create proper org-scoped DELETE policy
CREATE POLICY "Org admins can delete their org PCFs" 
ON public.post_call_forms 
FOR DELETE 
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
  OR is_super_admin(auth.uid())
);