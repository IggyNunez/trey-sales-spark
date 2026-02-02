-- Event display columns configuration table
-- Allows orgs to configure which booking_metadata fields appear as columns in EventsTable

CREATE TABLE public.event_display_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  display_label TEXT NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  field_source TEXT DEFAULT 'booking_metadata',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, field_key)
);

-- Enable RLS
ALTER TABLE public.event_display_columns ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own org columns"
  ON public.event_display_columns FOR SELECT
  USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can insert org columns"
  ON public.event_display_columns FOR INSERT
  WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can update org columns"
  ON public.event_display_columns FOR UPDATE
  USING (public.user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Admins can delete org columns"
  ON public.event_display_columns FOR DELETE
  USING (public.user_is_org_admin(auth.uid(), organization_id));

-- Auto-update updated_at
CREATE TRIGGER update_event_display_columns_updated_at
  BEFORE UPDATE ON public.event_display_columns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default columns for all existing organizations
INSERT INTO public.event_display_columns (organization_id, field_key, display_label, is_visible, sort_order, field_source)
SELECT o.id, d.field_key, d.display_label, d.is_visible, d.sort_order, d.field_source
FROM public.organizations o
CROSS JOIN (VALUES
  ('utm_platform', 'Traffic Source', true, 1, 'booking_metadata'),
  ('utm_source', 'UTM Source', false, 2, 'booking_metadata'),
  ('utm_medium', 'UTM Medium', false, 3, 'booking_metadata'),
  ('utm_campaign', 'UTM Campaign', false, 4, 'booking_metadata'),
  ('utm_setter', 'UTM Setter', false, 5, 'booking_metadata')
) AS d(field_key, display_label, is_visible, sort_order, field_source)
ON CONFLICT (organization_id, field_key) DO NOTHING;