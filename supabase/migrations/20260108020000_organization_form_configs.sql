-- Migration: Organization Form Configurations
-- Enables organizations to customize their forms (post-call forms, lead forms, etc.)
-- with custom fields, field ordering, validation rules, and conditional logic

-- Create organization_form_configs table
CREATE TABLE IF NOT EXISTS public.organization_form_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL, -- 'post_call_form', 'lead_form', 'opportunity_form', etc.
  form_name TEXT NOT NULL, -- Display name for the form
  form_description TEXT, -- Optional description
  field_config JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of field definitions
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Whether this is the default form for this type
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, form_type, form_name)
);

-- Create indexes
CREATE INDEX idx_form_configs_org_type ON public.organization_form_configs(organization_id, form_type);
CREATE INDEX idx_form_configs_active ON public.organization_form_configs(is_active) WHERE is_active = true;
CREATE INDEX idx_form_configs_default ON public.organization_form_configs(organization_id, form_type, is_default) WHERE is_default = true;

-- Enable Row Level Security
ALTER TABLE public.organization_form_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view form configs from their organization"
  ON public.organization_form_configs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Admins can create form configs"
  ON public.organization_form_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
      )
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Admins can update form configs"
  ON public.organization_form_configs
  FOR UPDATE
  TO authenticated
  USING (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
      )
    )
    OR
    public.is_super_admin()
  )
  WITH CHECK (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
      )
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Admins can delete form configs"
  ON public.organization_form_configs
  FOR DELETE
  TO authenticated
  USING (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
      )
    )
    OR
    public.is_super_admin()
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_form_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_form_configs_timestamp
  BEFORE UPDATE ON public.organization_form_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_form_configs_updated_at();

-- Function to seed default post-call form for a new organization
CREATE OR REPLACE FUNCTION public.seed_default_post_call_form(org_id UUID)
RETURNS void AS $$
DECLARE
  default_form_config JSONB;
BEGIN
  -- Define the default post-call form structure
  default_form_config := '[
    {
      "id": "call_outcome",
      "type": "select",
      "label": "Call Outcome",
      "fieldName": "call_outcome",
      "required": true,
      "placeholder": "Select outcome",
      "useCustomFields": true,
      "customFieldCategory": "call_outcome",
      "order": 1
    },
    {
      "id": "call_status",
      "type": "select",
      "label": "Call Status",
      "fieldName": "call_status",
      "required": true,
      "placeholder": "Select status",
      "useCustomFields": true,
      "customFieldCategory": "call_status",
      "order": 2
    },
    {
      "id": "revenue",
      "type": "number",
      "label": "Cash Collected",
      "fieldName": "cash_collected",
      "required": false,
      "placeholder": "0.00",
      "min": 0,
      "step": 0.01,
      "prefix": "$",
      "order": 3
    },
    {
      "id": "notes",
      "type": "textarea",
      "label": "Notes",
      "fieldName": "notes",
      "required": false,
      "placeholder": "Add any notes about this call...",
      "rows": 4,
      "order": 4
    },
    {
      "id": "follow_up_date",
      "type": "date",
      "label": "Follow-up Date",
      "fieldName": "follow_up_date",
      "required": false,
      "placeholder": "Select date",
      "order": 5,
      "conditional": {
        "showWhen": {
          "field": "call_outcome",
          "operator": "equals",
          "value": "follow_up"
        }
      }
    },
    {
      "id": "source",
      "type": "select",
      "label": "Lead Source",
      "fieldName": "source",
      "required": false,
      "placeholder": "Select source",
      "useCustomFields": true,
      "customFieldCategory": "source",
      "order": 6
    },
    {
      "id": "traffic_type",
      "type": "select",
      "label": "Traffic Type",
      "fieldName": "traffic_type",
      "required": false,
      "placeholder": "Select traffic type",
      "useCustomFields": true,
      "customFieldCategory": "traffic_type",
      "order": 7
    }
  ]'::jsonb;

  -- Insert the default post-call form
  INSERT INTO public.organization_form_configs (
    organization_id,
    form_type,
    form_name,
    form_description,
    field_config,
    is_active,
    is_default
  )
  VALUES (
    org_id,
    'post_call_form',
    'Default Post-Call Form',
    'Standard post-call form for tracking call outcomes and details',
    default_form_config,
    true,
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to seed default forms
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_name text;
  org_name text;
  org_slug text;
BEGIN
  -- Get user name from metadata or use email prefix
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create organization name and slug
  org_name := user_name || '''s Organization';
  org_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8);

  -- Create the organization
  INSERT INTO public.organizations (name, slug, created_at, updated_at)
  VALUES (org_name, org_slug, now(), now())
  RETURNING id INTO new_org_id;

  -- Add user as owner of the organization
  INSERT INTO public.organization_members (organization_id, user_id, role, created_at, updated_at)
  VALUES (new_org_id, NEW.id, 'owner', now(), now());

  -- Create profile for the user
  INSERT INTO public.profiles (user_id, name, current_organization_id, created_at, updated_at)
  VALUES (NEW.id, user_name, new_org_id, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = COALESCE(profiles.name, user_name),
    current_organization_id = COALESCE(profiles.current_organization_id, new_org_id),
    updated_at = now();

  -- Seed default custom fields for the new organization
  PERFORM public.seed_default_custom_fields(new_org_id);

  -- Seed default post-call form
  PERFORM public.seed_default_post_call_form(new_org_id);

  RETURN NEW;
END;
$$;

-- Seed default forms for existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations
  LOOP
    -- Only seed if organization has no form configs yet
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_form_configs
      WHERE organization_id = org.id AND form_type = 'post_call_form'
    ) THEN
      PERFORM public.seed_default_post_call_form(org.id);
    END IF;
  END LOOP;
END $$;

-- Grant necessary permissions
GRANT ALL ON public.organization_form_configs TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_post_call_form(UUID) TO authenticated;

-- Comment for documentation
COMMENT ON TABLE public.organization_form_configs IS
'Stores form configurations for each organization. Enables organizations to customize their forms with custom fields, ordering, validation, and conditional logic.';

COMMENT ON FUNCTION public.seed_default_post_call_form(UUID) IS
'Seeds the default post-call form configuration for a new organization. Called automatically when a new user signs up.';

COMMENT ON COLUMN public.organization_form_configs.field_config IS
'JSONB array containing field definitions. Each field has: id, type, label, fieldName, required, placeholder, and optional properties like conditional logic, validation rules, etc.';
