-- Create table to store raw Calendly webhook payloads for debugging
CREATE TABLE public.calendly_webhook_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL, -- invitee.created, invitee.canceled
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
  canceler_type TEXT, -- host, invitee
  canceled_by TEXT,
  cancel_reason TEXT,
  scheduling_method TEXT,
  invitee_scheduled_by TEXT,
  routing_form_submission JSONB,
  tracking_params JSONB,
  full_payload JSONB NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Index for quick lookups
CREATE INDEX idx_calendly_audit_email ON public.calendly_webhook_audit(invitee_email);
CREATE INDEX idx_calendly_audit_instant ON public.calendly_webhook_audit(is_instant_cancel) WHERE is_instant_cancel = true;
CREATE INDEX idx_calendly_audit_org ON public.calendly_webhook_audit(organization_id);
CREATE INDEX idx_calendly_audit_created ON public.calendly_webhook_audit(created_at DESC);

-- Enable RLS
ALTER TABLE public.calendly_webhook_audit ENABLE ROW LEVEL SECURITY;

-- Only org members can view audit logs
CREATE POLICY "Org members can view their audit logs"
ON public.calendly_webhook_audit FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  OR public.is_super_admin(auth.uid())
);

-- Allow insert from edge functions (service role)
CREATE POLICY "Service role can insert audit logs"
ON public.calendly_webhook_audit FOR INSERT
WITH CHECK (true);