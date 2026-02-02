-- Drop existing policies and recreate to include super_admin
DROP POLICY IF EXISTS "Admins can view access tokens" ON public.closer_access_tokens;
DROP POLICY IF EXISTS "Admins can create access tokens" ON public.closer_access_tokens;
DROP POLICY IF EXISTS "Admins can update access tokens" ON public.closer_access_tokens;
DROP POLICY IF EXISTS "Admins can delete access tokens" ON public.closer_access_tokens;

-- Create policies that check for both admin and super_admin roles
CREATE POLICY "Admins can view access tokens" 
ON public.closer_access_tokens 
FOR SELECT 
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can create access tokens" 
ON public.closer_access_tokens 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can update access tokens" 
ON public.closer_access_tokens 
FOR UPDATE 
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete access tokens" 
ON public.closer_access_tokens 
FOR DELETE 
USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));