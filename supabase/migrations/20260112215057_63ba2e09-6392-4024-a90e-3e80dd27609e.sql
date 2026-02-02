-- Drop and recreate the user_roles policies to allow signup flow
-- Keep the existing policies but add one for self-insert during signup

-- Policy: Allow users to insert their own role (for signup flow)
CREATE POLICY "Users can insert their own role"
ON public.user_roles
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Allow users to view their own role (already exists, but making sure)
-- Already exists: "Users can view their own role"

-- Policy: Admins can manage all roles (already exists)
-- Already exists: "Admins can manage roles"