-- Create close_field_mappings table for storing Close CRM field configurations
CREATE TABLE public.close_field_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  close_field_id TEXT NOT NULL,
  close_field_name TEXT NOT NULL,
  close_field_type TEXT NOT NULL DEFAULT 'text',
  close_field_choices JSONB,
  local_field_slug TEXT NOT NULL,
  is_synced BOOLEAN NOT NULL DEFAULT false,
  show_in_filters BOOLEAN NOT NULL DEFAULT false,
  show_in_dashboard BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, close_field_id)
);

-- Enable RLS
ALTER TABLE public.close_field_mappings ENABLE ROW LEVEL SECURITY;

-- Create index for organization lookups
CREATE INDEX idx_close_field_mappings_org_id ON public.close_field_mappings(organization_id);
CREATE INDEX idx_close_field_mappings_synced ON public.close_field_mappings(organization_id, is_synced) WHERE is_synced = true;

-- RLS policies for close_field_mappings
CREATE POLICY "Users can view their org's close field mappings"
  ON public.close_field_mappings
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_member(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can insert close field mappings"
  ON public.close_field_mappings
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can update close field mappings"
  ON public.close_field_mappings
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

CREATE POLICY "Org admins can delete close field mappings"
  ON public.close_field_mappings
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL AND (
      public.is_super_admin(auth.uid()) OR
      public.user_is_org_admin(auth.uid(), organization_id)
    )
  );

-- Add trigger for updated_at
CREATE TRIGGER update_close_field_mappings_updated_at
  BEFORE UPDATE ON public.close_field_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();