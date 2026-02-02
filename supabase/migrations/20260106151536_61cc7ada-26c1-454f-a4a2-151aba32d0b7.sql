-- Drop and recreate the admin policy with proper permissions for all operations
DROP POLICY IF EXISTS "Admins can manage access tokens" ON public.closer_access_tokens;

-- Create separate policies for each operation type
CREATE POLICY "Admins can view access tokens" 
ON public.closer_access_tokens 
FOR SELECT 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can create access tokens" 
ON public.closer_access_tokens 
FOR INSERT 
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can update access tokens" 
ON public.closer_access_tokens 
FOR UPDATE 
USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete access tokens" 
ON public.closer_access_tokens 
FOR DELETE 
USING (public.is_admin(auth.uid()));