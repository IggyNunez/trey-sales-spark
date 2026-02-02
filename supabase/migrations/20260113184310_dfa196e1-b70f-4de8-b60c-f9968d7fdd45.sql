-- Drop the existing constraint and add updated one with client_admin
ALTER TABLE public.invitations DROP CONSTRAINT invitations_invite_type_check;

ALTER TABLE public.invitations ADD CONSTRAINT invitations_invite_type_check 
CHECK (invite_type = ANY (ARRAY['whitelabel'::text, 'sales_rep'::text, 'admin'::text, 'client_admin'::text]));