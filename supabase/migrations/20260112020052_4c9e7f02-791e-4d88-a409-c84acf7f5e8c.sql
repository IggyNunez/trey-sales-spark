-- Custom Field Definitions: Defines what fields an organization has
CREATE TABLE public.custom_field_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_slug TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'select' CHECK (field_type IN ('select', 'multi-select', 'text', 'number', 'date', 'boolean')),
  applies_to TEXT[] NOT NULL DEFAULT ARRAY['events'],
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  show_in_dashboard BOOLEAN NOT NULL DEFAULT true,
  show_in_forms BOOLEAN NOT NULL DEFAULT true,
  show_in_filters BOOLEAN NOT NULL DEFAULT true,
  show_in_exports BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, field_slug)
);

-- Custom Field Options: Options for select/multi-select fields
CREATE TABLE public.custom_field_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  option_value TEXT NOT NULL,
  option_label TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(field_definition_id, option_value)
);

-- Custom Field Values: Stores actual values for records
CREATE TABLE public.custom_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('events', 'payments', 'leads', 'post_call_forms')),
  value JSONB NOT NULL DEFAULT '{}',
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(field_definition_id, record_id, record_type)
);

-- Dashboard Layouts: Configurable dashboard layouts per org/user
CREATE TABLE public.dashboard_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  layout_name TEXT NOT NULL DEFAULT 'Default',
  layout_type TEXT NOT NULL DEFAULT 'dashboard' CHECK (layout_type IN ('dashboard', 'attribution', 'analytics', 'rep_portal')),
  layout_config JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for custom_field_definitions
CREATE POLICY "Org members can view their custom fields"
ON public.custom_field_definitions FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Org admins can manage their custom fields"
ON public.custom_field_definitions FOR ALL
USING (organization_id IN (
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
));

-- RLS Policies for custom_field_options
CREATE POLICY "Org members can view their field options"
ON public.custom_field_options FOR SELECT
USING (field_definition_id IN (
  SELECT id FROM custom_field_definitions 
  WHERE organization_id IN (SELECT get_user_organization_ids(auth.uid()))
));

CREATE POLICY "Org admins can manage their field options"
ON public.custom_field_options FOR ALL
USING (field_definition_id IN (
  SELECT id FROM custom_field_definitions 
  WHERE organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  )
));

-- RLS Policies for custom_field_values
CREATE POLICY "Org members can view their field values"
ON public.custom_field_values FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can manage their field values"
ON public.custom_field_values FOR ALL
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- RLS Policies for dashboard_layouts
CREATE POLICY "Users can view org layouts"
ON public.dashboard_layouts FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Org admins can manage org layouts"
ON public.dashboard_layouts FOR ALL
USING (
  (user_id = auth.uid()) OR
  (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ))
);

-- Indexes for performance
CREATE INDEX idx_custom_field_definitions_org ON public.custom_field_definitions(organization_id);
CREATE INDEX idx_custom_field_options_definition ON public.custom_field_options(field_definition_id);
CREATE INDEX idx_custom_field_values_record ON public.custom_field_values(record_id, record_type);
CREATE INDEX idx_custom_field_values_definition ON public.custom_field_values(field_definition_id);
CREATE INDEX idx_dashboard_layouts_org ON public.dashboard_layouts(organization_id);

-- Triggers for updated_at
CREATE TRIGGER update_custom_field_definitions_updated_at
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dashboard_layouts_updated_at
  BEFORE UPDATE ON public.dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();