-- Add 'client_admin' as an allowed invite_type for client admin onboarding
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_invite_type_check;

ALTER TABLE public.invitations ADD CONSTRAINT invitations_invite_type_check
  CHECK (invite_type IN ('whitelabel', 'sales_rep', 'client_admin'));

-- Add comment explaining the invite types
COMMENT ON COLUMN public.invitations.invite_type IS
  'Type of invitation: whitelabel (partner), sales_rep (team member), client_admin (organization admin)';
