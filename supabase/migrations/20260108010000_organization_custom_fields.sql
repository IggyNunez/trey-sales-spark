-- Migration: Organization Custom Fields
-- Enables organizations to define their own dropdown values for various fields
-- (Call Outcomes, Call Statuses, Sources, Call Types, Traffic Types, etc.)

-- Create organization_custom_fields table
CREATE TABLE IF NOT EXISTS public.organization_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_category TEXT NOT NULL, -- 'call_outcome', 'call_status', 'source', 'call_type', 'traffic_type', 'opportunity_status'
  field_value TEXT NOT NULL,
  field_label TEXT NOT NULL, -- Display label for the field
  color TEXT, -- Optional color for UI display (hex code)
  icon TEXT, -- Optional icon name for UI display
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false, -- Whether this is a default/system field
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, field_category, field_value)
);

-- Create indexes for better query performance
CREATE INDEX idx_custom_fields_org_category ON public.organization_custom_fields(organization_id, field_category);
CREATE INDEX idx_custom_fields_active ON public.organization_custom_fields(is_active) WHERE is_active = true;
CREATE INDEX idx_custom_fields_order ON public.organization_custom_fields(organization_id, field_category, display_order);

-- Enable Row Level Security
ALTER TABLE public.organization_custom_fields ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organization_custom_fields
-- Users can view custom fields from their organization(s)
CREATE POLICY "Users can view custom fields from their organization"
  ON public.organization_custom_fields
  FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
    OR
    public.is_super_admin()
  );

-- Users can insert custom fields for their organization (admin/owner only)
CREATE POLICY "Admins can create custom fields"
  ON public.organization_custom_fields
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

-- Users can update custom fields for their organization (admin/owner only)
CREATE POLICY "Admins can update custom fields"
  ON public.organization_custom_fields
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

-- Users can delete custom fields for their organization (admin/owner only)
CREATE POLICY "Admins can delete custom fields"
  ON public.organization_custom_fields
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
CREATE OR REPLACE FUNCTION public.update_custom_fields_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_custom_fields_timestamp
  BEFORE UPDATE ON public.organization_custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_custom_fields_updated_at();

-- Function to seed default custom fields for a new organization
CREATE OR REPLACE FUNCTION public.seed_default_custom_fields(org_id UUID)
RETURNS void AS $$
BEGIN
  -- Default Call Outcomes
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, color, display_order, is_default)
  VALUES
    (org_id, 'call_outcome', 'sold', 'Sold', '#10b981', 1, true),
    (org_id, 'call_outcome', 'no_show', 'No Show', '#ef4444', 2, true),
    (org_id, 'call_outcome', 'follow_up', 'Follow-up', '#f59e0b', 3, true),
    (org_id, 'call_outcome', 'not_interested', 'Not Interested', '#6b7280', 4, true),
    (org_id, 'call_outcome', 'reschedule', 'Reschedule', '#3b82f6', 5, true);

  -- Default Call Statuses
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, color, display_order, is_default)
  VALUES
    (org_id, 'call_status', 'scheduled', 'Scheduled', '#3b82f6', 1, true),
    (org_id, 'call_status', 'completed', 'Completed', '#10b981', 2, true),
    (org_id, 'call_status', 'no_show', 'No Show', '#ef4444', 3, true),
    (org_id, 'call_status', 'cancelled', 'Cancelled', '#6b7280', 4, true),
    (org_id, 'call_status', 'rescheduled', 'Rescheduled', '#f59e0b', 5, true);

  -- Default Sources
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, display_order, is_default)
  VALUES
    (org_id, 'source', 'organic', 'Organic', 1, true),
    (org_id, 'source', 'facebook_ads', 'Facebook Ads', 2, true),
    (org_id, 'source', 'google_ads', 'Google Ads', 3, true),
    (org_id, 'source', 'referral', 'Referral', 4, true),
    (org_id, 'source', 'email', 'Email Campaign', 5, true);

  -- Default Call Types
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, display_order, is_default)
  VALUES
    (org_id, 'call_type', 'discovery', 'Discovery Call', 1, true),
    (org_id, 'call_type', 'close', 'Close Call', 2, true),
    (org_id, 'call_type', 'follow_up', 'Follow-up Call', 3, true),
    (org_id, 'call_type', 'demo', 'Demo Call', 4, true);

  -- Default Traffic Types
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, color, display_order, is_default)
  VALUES
    (org_id, 'traffic_type', 'warm', 'Warm', '#f59e0b', 1, true),
    (org_id, 'traffic_type', 'cold', 'Cold', '#3b82f6', 2, true),
    (org_id, 'traffic_type', 'hot', 'Hot', '#ef4444', 3, true),
    (org_id, 'traffic_type', 'reactivation', 'Reactivation', '#8b5cf6', 4, true);

  -- Default Opportunity Statuses
  INSERT INTO public.organization_custom_fields (organization_id, field_category, field_value, field_label, color, display_order, is_default)
  VALUES
    (org_id, 'opportunity_status', 'new', 'New', '#3b82f6', 1, true),
    (org_id, 'opportunity_status', 'qualified', 'Qualified', '#f59e0b', 2, true),
    (org_id, 'opportunity_status', 'proposal', 'Proposal Sent', '#8b5cf6', 3, true),
    (org_id, 'opportunity_status', 'negotiation', 'In Negotiation', '#f59e0b', 4, true),
    (org_id, 'opportunity_status', 'closed_won', 'Closed Won', '#10b981', 5, true),
    (org_id, 'opportunity_status', 'closed_lost', 'Closed Lost', '#ef4444', 6, true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to seed default custom fields
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

  RETURN NEW;
END;
$$;

-- Seed default custom fields for existing organizations
DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM public.organizations
  LOOP
    -- Only seed if organization has no custom fields yet
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_custom_fields
      WHERE organization_id = org.id
    ) THEN
      PERFORM public.seed_default_custom_fields(org.id);
    END IF;
  END LOOP;
END $$;

-- Grant necessary permissions
GRANT ALL ON public.organization_custom_fields TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_default_custom_fields(UUID) TO authenticated;

-- Comment for documentation
COMMENT ON TABLE public.organization_custom_fields IS
'Stores custom field values for each organization. Enables organizations to define their own dropdown options for outcomes, statuses, sources, etc.';

COMMENT ON FUNCTION public.seed_default_custom_fields(UUID) IS
'Seeds default custom field values for a new organization. Called automatically when a new user signs up.';
