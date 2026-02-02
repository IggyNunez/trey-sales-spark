-- Add organization-level API keys table for multi-tenant support
CREATE TABLE public.organization_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  calendly_api_key TEXT,
  close_api_key TEXT,
  whop_api_key TEXT,
  whop_company_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Enable RLS
ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

-- Only org admins/owners can manage integrations
CREATE POLICY "Org admins can manage integrations"
ON public.organization_integrations
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_organization_integrations_updated_at
BEFORE UPDATE ON public.organization_integrations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add closer_id to payments table for tracking cash collected per rep
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS closer_id UUID;