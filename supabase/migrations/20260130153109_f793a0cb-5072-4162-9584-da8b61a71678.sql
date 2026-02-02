-- Phase 1: Team Identity Data Unification

-- Migration 1: Add display_name column to closers table
ALTER TABLE closers 
ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Backfill with current name
UPDATE closers SET display_name = name WHERE display_name IS NULL;

-- Migration 2: Create setter_aliases table for name variant mapping
CREATE TABLE public.setter_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, alias_name)
);

-- Enable RLS
ALTER TABLE setter_aliases ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view setter aliases in their org"
  ON setter_aliases FOR SELECT
  USING (auth.uid() IS NOT NULL AND user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage setter aliases"
  ON setter_aliases FOR ALL
  USING (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id))
  WITH CHECK (auth.uid() IS NOT NULL AND user_is_org_admin(auth.uid(), organization_id));

-- Migration 3: Remove duplicate setter (Amadou Bah - keep older record)
DELETE FROM setters 
WHERE id = '088dcf32-9aaa-462b-9b98-597fa9705b27';

-- Add unique constraint to prevent future duplicates
ALTER TABLE setters 
ADD CONSTRAINT unique_setter_name_per_org 
UNIQUE (organization_id, name);

-- Migration 4: Seed initial aliases for known variants
INSERT INTO setter_aliases (organization_id, alias_name, canonical_name)
VALUES 
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31', 'jack', 'Jack Hanson'),
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31', 'amadou', 'Amadou Bah'),
  ('74c1d616-43ca-4acc-bd3a-4cefc171fa31', 'steve', 'Steve Williams')
ON CONFLICT (organization_id, alias_name) DO NOTHING;