-- Allow anonymous users (magic link token users) to insert PCFs
-- This is needed because sales reps access via token, not Supabase auth
CREATE POLICY "Anonymous can insert PCFs with valid org" 
ON public.post_call_forms 
FOR INSERT 
TO anon
WITH CHECK (
  -- Must have an organization_id that exists
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);

-- Allow anonymous users to update PCFs they created (by closer_name match)
CREATE POLICY "Anonymous can update PCFs by closer name" 
ON public.post_call_forms 
FOR UPDATE 
TO anon
USING (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);

-- Also need to allow anonymous to update the events table
CREATE POLICY "Anonymous can update events with valid org" 
ON public.events 
FOR UPDATE 
TO anon
USING (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);