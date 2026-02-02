-- Create invitations table for tracking both types of invites
CREATE TABLE public.invitations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  invite_type text NOT NULL CHECK (invite_type IN ('whitelabel', 'sales_rep')),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Admins can manage all invitations
CREATE POLICY "Admins can manage invitations"
ON public.invitations
FOR ALL
USING (is_admin(auth.uid()));

-- Anyone can view invitations by token (for accepting)
CREATE POLICY "Anyone can view invitation by token"
ON public.invitations
FOR SELECT
USING (true);

-- Create index for faster token lookups
CREATE INDEX idx_invitations_token ON public.invitations(token);
CREATE INDEX idx_invitations_email ON public.invitations(email);