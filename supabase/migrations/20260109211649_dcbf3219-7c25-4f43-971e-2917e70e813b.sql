-- Create form_configs table for PCF builder
CREATE TABLE public.form_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL DEFAULT 'post_call_form',
  name TEXT NOT NULL DEFAULT 'Post-Call Form',
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add index for faster lookups
CREATE INDEX idx_form_configs_org ON public.form_configs(organization_id);
CREATE INDEX idx_form_configs_type ON public.form_configs(form_type);

-- Enable RLS
ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view form configs for their org"
ON public.form_configs FOR SELECT
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can insert form configs"
ON public.form_configs FOR INSERT
WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can update form configs"
ON public.form_configs FOR UPDATE
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can delete form configs"
ON public.form_configs FOR DELETE
USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- Trigger for updated_at
CREATE TRIGGER update_form_configs_updated_at
BEFORE UPDATE ON public.form_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add comment explaining the fields JSONB structure
COMMENT ON COLUMN public.form_configs.fields IS 'Array of field objects: {id, type, label, required, options?, conditionalOn?, conditionalValue?, placeholder?, defaultValue?}';