-- Add organization_id to tables that need it

-- closers table
ALTER TABLE public.closers ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- setters table  
ALTER TABLE public.setters ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- sources table
ALTER TABLE public.sources ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- traffic_types table
ALTER TABLE public.traffic_types ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- payments table
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- payout_snapshots table
ALTER TABLE public.payout_snapshots ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- payout_snapshot_details table
ALTER TABLE public.payout_snapshot_details ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- payout_snapshot_summaries table
ALTER TABLE public.payout_snapshot_summaries ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- post_call_forms table
ALTER TABLE public.post_call_forms ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- call_outcomes table
ALTER TABLE public.call_outcomes ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- call_types table
ALTER TABLE public.call_types ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- opportunity_statuses table
ALTER TABLE public.opportunity_statuses ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- webhook_connections table
ALTER TABLE public.webhook_connections ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

-- Create helper function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
$$;

-- Create helper function to get user's organization IDs
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id 
  FROM public.organization_members 
  WHERE user_id = _user_id
$$;

-- Create helper function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_in_organization(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Update RLS policies for closers
DROP POLICY IF EXISTS "Admins can manage closers" ON public.closers;
DROP POLICY IF EXISTS "Authenticated users can view closers" ON public.closers;
DROP POLICY IF EXISTS "Public can view active closers" ON public.closers;

CREATE POLICY "Super admins can manage all closers"
ON public.closers FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their closers"
ON public.closers FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their closers"
ON public.closers FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for setters
DROP POLICY IF EXISTS "Admins can manage setters" ON public.setters;
DROP POLICY IF EXISTS "Authenticated users can view setters" ON public.setters;

CREATE POLICY "Super admins can manage all setters"
ON public.setters FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their setters"
ON public.setters FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their setters"
ON public.setters FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for sources
DROP POLICY IF EXISTS "Admins can manage sources" ON public.sources;
DROP POLICY IF EXISTS "Authenticated users can view sources" ON public.sources;

CREATE POLICY "Super admins can manage all sources"
ON public.sources FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their sources"
ON public.sources FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their sources"
ON public.sources FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for traffic_types
DROP POLICY IF EXISTS "Admins can manage traffic types" ON public.traffic_types;
DROP POLICY IF EXISTS "Authenticated users can view traffic types" ON public.traffic_types;

CREATE POLICY "Super admins can manage all traffic types"
ON public.traffic_types FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their traffic types"
ON public.traffic_types FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their traffic types"
ON public.traffic_types FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for payments
DROP POLICY IF EXISTS "Admins can manage all payments" ON public.payments;
DROP POLICY IF EXISTS "Authenticated users can view all payments" ON public.payments;

CREATE POLICY "Super admins can manage all payments"
ON public.payments FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payments"
ON public.payments FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their payments"
ON public.payments FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for payout_snapshots
DROP POLICY IF EXISTS "Admins can manage payout snapshots" ON public.payout_snapshots;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshots" ON public.payout_snapshots;

CREATE POLICY "Super admins can manage all payout snapshots"
ON public.payout_snapshots FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payout snapshots"
ON public.payout_snapshots FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their payout snapshots"
ON public.payout_snapshots FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for payout_snapshot_details
DROP POLICY IF EXISTS "Admins can manage payout snapshot details" ON public.payout_snapshot_details;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshot details" ON public.payout_snapshot_details;

CREATE POLICY "Super admins can manage all payout snapshot details"
ON public.payout_snapshot_details FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payout snapshot details"
ON public.payout_snapshot_details FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their payout snapshot details"
ON public.payout_snapshot_details FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for payout_snapshot_summaries
DROP POLICY IF EXISTS "Admins can manage payout snapshot summaries" ON public.payout_snapshot_summaries;
DROP POLICY IF EXISTS "Authenticated users can view payout snapshot summaries" ON public.payout_snapshot_summaries;

CREATE POLICY "Super admins can manage all payout snapshot summaries"
ON public.payout_snapshot_summaries FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payout snapshot summaries"
ON public.payout_snapshot_summaries FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their payout snapshot summaries"
ON public.payout_snapshot_summaries FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for webhook_connections
DROP POLICY IF EXISTS "Admins can manage webhook connections" ON public.webhook_connections;

CREATE POLICY "Super admins can manage all webhook connections"
ON public.webhook_connections FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their webhook connections"
ON public.webhook_connections FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their webhook connections"
ON public.webhook_connections FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for call_outcomes
DROP POLICY IF EXISTS "Admins can manage call outcomes" ON public.call_outcomes;
DROP POLICY IF EXISTS "Authenticated users can view call outcomes" ON public.call_outcomes;

CREATE POLICY "Super admins can manage all call outcomes"
ON public.call_outcomes FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their call outcomes"
ON public.call_outcomes FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their call outcomes"
ON public.call_outcomes FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for call_types
DROP POLICY IF EXISTS "Admins can manage call types" ON public.call_types;
DROP POLICY IF EXISTS "Authenticated users can view call types" ON public.call_types;

CREATE POLICY "Super admins can manage all call types"
ON public.call_types FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their call types"
ON public.call_types FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their call types"
ON public.call_types FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);

-- Update RLS policies for opportunity_statuses
DROP POLICY IF EXISTS "Admins can manage opportunity statuses" ON public.opportunity_statuses;
DROP POLICY IF EXISTS "Authenticated users can view opportunity statuses" ON public.opportunity_statuses;
DROP POLICY IF EXISTS "Public can view active opportunity statuses" ON public.opportunity_statuses;

CREATE POLICY "Super admins can manage all opportunity statuses"
ON public.opportunity_statuses FOR ALL
USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their opportunity statuses"
ON public.opportunity_statuses FOR SELECT
USING (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
  OR organization_id IS NULL
);

CREATE POLICY "Org admins can manage their opportunity statuses"
ON public.opportunity_statuses FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid() 
    AND role IN ('owner', 'admin')
  )
);