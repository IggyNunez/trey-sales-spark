-- The is_admin(UUID) function already exists and is used by RLS policies
-- This migration only ensures the no-argument version exists for convenience

-- Create the no-argument version if it doesn't exist
-- This version uses auth.uid() automatically
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT public.is_admin(auth.uid());
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Add comment for documentation
COMMENT ON FUNCTION public.is_admin() IS 'Checks if the current user (auth.uid()) has admin or super_admin role. Wrapper for is_admin(UUID).';
