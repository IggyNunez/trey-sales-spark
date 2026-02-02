-- Drop the anon-only policies (they don't work because client uses 'public' role)
DROP POLICY IF EXISTS "Anonymous can insert PCFs with valid org" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anonymous can update PCFs by closer name" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anonymous can update events with valid org" ON public.events;

-- Create policies for public role that allow inserts when organization_id is valid
-- This works for both authenticated and unauthenticated users
CREATE POLICY "Anyone can insert PCFs with valid org" 
ON public.post_call_forms 
FOR INSERT 
TO public
WITH CHECK (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);

-- Allow updates for anyone with valid org
CREATE POLICY "Anyone can update PCFs with valid org" 
ON public.post_call_forms 
FOR UPDATE 
TO public
USING (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);

-- Also need to allow updates to events table
CREATE POLICY "Anyone can update events with valid org" 
ON public.events 
FOR UPDATE 
TO public
USING (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);