-- Add role column to invitations table
ALTER TABLE public.invitations 
ADD COLUMN role text DEFAULT 'member';

-- Add a comment for clarity
COMMENT ON COLUMN public.invitations.role IS 'The role to assign when the invitation is accepted (admin, member, etc.)';