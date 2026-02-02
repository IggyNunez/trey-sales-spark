-- Add RESTRICTIVE policies to deny all access to unauthenticated users
-- This ensures that even with other permissive policies, auth.uid() must be present

-- Profiles table: Add restrictive policy requiring authentication
CREATE POLICY "Deny unauthenticated access to profiles"
ON public.profiles
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);

-- Leads table: Add restrictive policy requiring authentication  
CREATE POLICY "Deny unauthenticated access to leads"
ON public.leads
AS RESTRICTIVE
FOR ALL
TO public
USING (auth.uid() IS NOT NULL);