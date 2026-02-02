-- Migration: Organization Dashboard Configurations
-- Enables organizations to customize their dashboard layout, widgets, and metrics

-- Create organization_dashboard_configs table
CREATE TABLE IF NOT EXISTS public.organization_dashboard_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- NULL = org default, non-null = user-specific
  config_name TEXT NOT NULL DEFAULT 'Default Dashboard',

  -- Metric Cards Configuration
  enabled_metrics JSONB NOT NULL DEFAULT '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,
  metric_order JSONB NOT NULL DEFAULT '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,

  -- Widget Configuration
  enabled_widgets JSONB NOT NULL DEFAULT '["recent_events", "calls_by_source"]'::jsonb,
  widget_layout JSONB NOT NULL DEFAULT '{
    "recent_events": {"order": 1, "size": "large"},
    "calls_by_source": {"order": 2, "size": "medium"}
  }'::jsonb,

  -- Display Settings
  show_date_range_selector BOOLEAN DEFAULT true,
  default_date_range TEXT DEFAULT 'today', -- today, this_week, this_month, custom
  show_filters BOOLEAN DEFAULT true,
  compact_mode BOOLEAN DEFAULT false,

  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(organization_id, user_id, config_name)
);

-- Create indexes
CREATE INDEX idx_dashboard_configs_org ON public.organization_dashboard_configs(organization_id);
CREATE INDEX idx_dashboard_configs_user ON public.organization_dashboard_configs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_dashboard_configs_default ON public.organization_dashboard_configs(organization_id, is_default) WHERE is_default = true;

-- Enable Row Level Security
ALTER TABLE public.organization_dashboard_configs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view dashboard configs from their organization"
  ON public.organization_dashboard_configs
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Users can create their own dashboard configs"
  ON public.organization_dashboard_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (
      organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Users can update their own or org default configs"
  ON public.organization_dashboard_configs
  FOR UPDATE
  TO authenticated
  USING (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
      )
      AND (
        user_id = auth.uid() -- Own config
        OR (user_id IS NULL AND EXISTS ( -- Org default (admins only)
          SELECT 1 FROM public.organization_members om2
          WHERE om2.user_id = auth.uid()
          AND om2.organization_id = organization_dashboard_configs.organization_id
          AND om2.role IN ('owner', 'admin')
        ))
      )
    )
    OR
    public.is_super_admin()
  );

CREATE POLICY "Users can delete their own configs"
  ON public.organization_dashboard_configs
  FOR DELETE
  TO authenticated
  USING (
    (
      organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
      AND user_id = auth.uid()
    )
    OR
    public.is_super_admin()
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_dashboard_configs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_dashboard_configs_timestamp
  BEFORE UPDATE ON public.organization_dashboard_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dashboard_configs_updated_at();

-- Function to seed default dashboard config for a new organization
CREATE OR REPLACE FUNCTION public.seed_default_dashboard_config(org_id UUID)
RETURNS void AS $$
BEGIN
  INSERT INTO public.organization_dashboard_configs (
    organization_id,
    user_id,
    config_name,
    enabled_metrics,
    metric_order,
    enabled_widgets,
    widget_layout,
    show_date_range_selector,
    default_date_range,
    show_filters,
    compact_mode,
    is_active,
    is_default
  )
  VALUES (
    org_id,
    NULL, -- Org-wide default
    'Default Dashboard',
    '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,
    '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,
    '["recent_events", "calls_by_source"]'::jsonb,
    '{
      "recent_events": {"order": 1, "size": "large"},
      "calls_by_source": {"order": 2, "size": "medium"}
    }'::jsonb,
    true,
    'today',
    true,
    false,
    true,
    true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to seed default dashboard config
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

  -- Seed default dashboard config
  PERFORM public.seed_default_dashboard_config(new_org_id);

  RETURN NEW;
END;
$$;

-- Seed default dashboard configs for existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations
  LOOP
    -- Only seed if organization has no dashboard config yet
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_dashboard_configs
      WHERE organization_id = org.id
    ) THEN
      PERFORM public.seed_default_dashboard_config(org.id);
    END IF;
  END LOOP;
END $$;

-- Grant necessary permissions
GRANT ALL ON public.organization_dashboard_configs TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_dashboard_config(UUID) TO authenticated;

-- Comment for documentation
COMMENT ON TABLE public.organization_dashboard_configs IS
'Stores dashboard customization settings for organizations and individual users. Enables customization of visible metrics, widget layout, and display preferences.';

COMMENT ON COLUMN public.organization_dashboard_configs.user_id IS
'NULL for organization-wide default config. Non-null for user-specific customizations.';

COMMENT ON COLUMN public.organization_dashboard_configs.enabled_metrics IS
'Array of metric IDs to display. Options: scheduled_calls, calls_booked, slot_utilization, cash_collected, conversion_rate, show_rate, close_rate, avg_deal_size, etc.';

COMMENT ON COLUMN public.organization_dashboard_configs.widget_layout IS
'JSONB object defining widget positioning and sizing. Keys are widget IDs, values contain order and size properties.';
