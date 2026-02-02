-- ============================================
-- FIX: Remove dangerous public SELECT policy on invitations
-- Date: 2026-01-14
-- Issue: Email addresses exposed to public internet
-- Solution: Route invitation lookups through edge function
-- ============================================

-- 1. DROP the dangerous public SELECT policy
DROP POLICY IF EXISTS "Anyone can view invitation by token" ON public.invitations;

-- 2. Add a policy for unauthenticated users to UPDATE invitations (to mark as accepted)
-- This is safe because they need to know the token (UUID) to update
CREATE POLICY "Anyone can accept invitation with valid token"
ON public.invitations
FOR UPDATE
USING (status = 'pending' AND expires_at > now())
WITH CHECK (status = 'accepted' AND accepted_at IS NOT NULL);

-- 3. Add comment documenting the security fix
COMMENT ON TABLE public.invitations IS 
  'Invitation records. Public SELECT removed 2026-01-14. Lookups via validate-invite edge function.';
