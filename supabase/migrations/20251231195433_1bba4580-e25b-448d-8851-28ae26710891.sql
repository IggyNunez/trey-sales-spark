-- Create closer access tokens table for magic link authentication
CREATE TABLE public.closer_access_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex') UNIQUE,
  closer_name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(closer_name, organization_id)
);

-- Enable RLS
ALTER TABLE public.closer_access_tokens ENABLE ROW LEVEL SECURITY;

-- Admins can manage tokens
CREATE POLICY "Admins can manage access tokens"
ON public.closer_access_tokens
FOR ALL
USING (is_admin(auth.uid()));

-- Public can view tokens (needed for token validation)
CREATE POLICY "Anyone can validate tokens"
ON public.closer_access_tokens
FOR SELECT
USING (is_active = true);

-- Create index for fast token lookups
CREATE INDEX idx_closer_access_tokens_token ON public.closer_access_tokens(token);
CREATE INDEX idx_closer_access_tokens_closer_org ON public.closer_access_tokens(closer_name, organization_id);