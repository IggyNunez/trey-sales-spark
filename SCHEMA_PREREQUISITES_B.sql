-- ============================================================================
-- SCHEMA PREREQUISITES - PART B (Run this AFTER Part A succeeds)
-- Uses the enum types created/extended in Part A
-- ============================================================================

-- ============================================================================
-- 1. Missing columns on organization_integrations
-- ============================================================================

ALTER TABLE organization_integrations
ADD COLUMN IF NOT EXISTS primary_crm crm_type DEFAULT 'none',
ADD COLUMN IF NOT EXISTS secondary_crm crm_type DEFAULT NULL,
ADD COLUMN IF NOT EXISTS primary_booking_platform booking_platform_type DEFAULT 'none',
ADD COLUMN IF NOT EXISTS primary_payment_processor payment_processor_type DEFAULT 'none',
ADD COLUMN IF NOT EXISTS stripe_webhook_signing_key TEXT,
ADD COLUMN IF NOT EXISTS ghl_api_key TEXT;

-- ============================================================================
-- 2. Missing column on invitations
-- ============================================================================

ALTER TABLE invitations
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- ============================================================================
-- 3. Missing column on metric_definitions
-- ============================================================================

ALTER TABLE metric_definitions
ADD COLUMN IF NOT EXISTS date_field TEXT DEFAULT 'scheduled_at';

-- ============================================================================
-- 4. Missing email columns on setters and closers (from 20260109212941)
-- ============================================================================

ALTER TABLE public.setters ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.closers ADD COLUMN IF NOT EXISTS email TEXT;

-- ============================================================================
-- 5. calendly_webhook_audit table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.calendly_webhook_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  invitee_email TEXT,
  invitee_uuid TEXT,
  event_uuid TEXT,
  event_name TEXT,
  closer_email TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE,
  booked_at TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  seconds_to_cancel NUMERIC,
  is_instant_cancel BOOLEAN DEFAULT false,
  canceler_type TEXT,
  canceled_by TEXT,
  cancel_reason TEXT,
  scheduling_method TEXT,
  invitee_scheduled_by TEXT,
  routing_form_submission JSONB,
  tracking_params JSONB,
  full_payload JSONB NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  request_headers JSONB,
  user_agent TEXT,
  request_ip TEXT,
  calendly_request_id TEXT,
  rescheduled BOOLEAN,
  new_invitee_uri TEXT,
  old_invitee_uri TEXT,
  event_memberships JSONB,
  questions_and_answers JSONB,
  payment JSONB,
  no_show JSONB,
  status TEXT,
  uri TEXT,
  created_at_ms BIGINT,
  canceled_at_ms BIGINT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_calendly_audit_email ON public.calendly_webhook_audit(invitee_email);
CREATE INDEX IF NOT EXISTS idx_calendly_audit_instant ON public.calendly_webhook_audit(is_instant_cancel) WHERE is_instant_cancel = true;
CREATE INDEX IF NOT EXISTS idx_calendly_audit_org ON public.calendly_webhook_audit(organization_id);
CREATE INDEX IF NOT EXISTS idx_calendly_audit_created ON public.calendly_webhook_audit(created_at DESC);

-- RLS
ALTER TABLE public.calendly_webhook_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their audit logs"
ON public.calendly_webhook_audit FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "Service role can insert audit logs"
ON public.calendly_webhook_audit FOR INSERT
WITH CHECK (true);

-- ============================================================================
-- DONE - Now run POST_SCHEMA_MIGRATIONS.sql
-- ============================================================================
