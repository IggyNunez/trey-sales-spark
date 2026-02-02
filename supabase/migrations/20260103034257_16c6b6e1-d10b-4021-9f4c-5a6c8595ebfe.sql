-- Drop the legacy unique constraint on opportunity_statuses.name
ALTER TABLE public.opportunity_statuses DROP CONSTRAINT IF EXISTS opportunity_statuses_name_key;

-- Add a proper unique constraint on (organization_id, name) to prevent duplicates per org
ALTER TABLE public.opportunity_statuses ADD CONSTRAINT opportunity_statuses_org_name_unique UNIQUE (organization_id, name);

-- Insert standard opportunity statuses for Data in Motion org (c85abed2-6ae7-4388-806e-3d60a09d558d)
INSERT INTO public.opportunity_statuses (organization_id, name, color, sort_order, is_active)
VALUES 
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'New Lead', '#3B82F6', 1, true),
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'Contacted', '#8B5CF6', 2, true),
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'Qualified', '#10B981', 3, true),
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'Unqualified', '#EF4444', 4, true),
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'Won', '#22C55E', 5, true),
  ('c85abed2-6ae7-4388-806e-3d60a09d558d', 'Lost', '#6B7280', 6, true)
ON CONFLICT (organization_id, name) DO NOTHING;