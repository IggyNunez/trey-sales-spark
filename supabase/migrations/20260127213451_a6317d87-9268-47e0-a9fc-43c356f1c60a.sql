-- Phase 1: Cal.com Integration Database Foundation

-- 1.1 Add 'calcom' to booking_platform_type enum
ALTER TYPE booking_platform_type ADD VALUE IF NOT EXISTS 'calcom';

-- 1.2 Add Cal.com fields to organization_integrations
ALTER TABLE organization_integrations 
ADD COLUMN IF NOT EXISTS calcom_api_key_encrypted TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_secret TEXT,
ADD COLUMN IF NOT EXISTS calcom_organization_id TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_id TEXT,
ADD COLUMN IF NOT EXISTS calcom_webhook_registered_at TIMESTAMPTZ;

-- Index for org resolution by Cal.com org ID
CREATE INDEX IF NOT EXISTS idx_org_integrations_calcom_org 
ON organization_integrations(calcom_organization_id) 
WHERE calcom_organization_id IS NOT NULL;

-- 1.3 Add Cal.com fields to events table
ALTER TABLE events 
ADD COLUMN IF NOT EXISTS calcom_booking_uid TEXT,
ADD COLUMN IF NOT EXISTS calcom_event_type_id TEXT,
ADD COLUMN IF NOT EXISTS booking_platform TEXT DEFAULT 'calendly',
ADD COLUMN IF NOT EXISTS meeting_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS meeting_ended_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
ADD COLUMN IF NOT EXISTS recording_url TEXT,
ADD COLUMN IF NOT EXISTS no_show_host BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS no_show_guest BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS no_show_reported_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS rescheduled_from_uid TEXT,
ADD COLUMN IF NOT EXISTS rescheduled_to_uid TEXT,
ADD COLUMN IF NOT EXISTS reschedule_reason TEXT,
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
ADD COLUMN IF NOT EXISTS booking_responses JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS booking_metadata JSONB DEFAULT '{}';

-- Indexes for Cal.com event queries
CREATE INDEX IF NOT EXISTS idx_events_calcom_booking_uid 
ON events(calcom_booking_uid) WHERE calcom_booking_uid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_events_booking_platform 
ON events(booking_platform);

CREATE INDEX IF NOT EXISTS idx_events_rescheduled_from 
ON events(rescheduled_from_uid) WHERE rescheduled_from_uid IS NOT NULL;

-- 1.4 Create Cal.com webhook audit table
CREATE TABLE IF NOT EXISTS calcom_webhook_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  booking_uid TEXT,
  attendee_email TEXT,
  organizer_email TEXT,
  event_type_title TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  reschedule_uid TEXT,
  reschedule_reason TEXT,
  no_show_host BOOLEAN,
  no_show_guest BOOLEAN,
  meeting_started_at TIMESTAMPTZ,
  meeting_ended_at TIMESTAMPTZ,
  recording_url TEXT,
  full_payload JSONB,
  request_headers JSONB,
  request_ip TEXT,
  organization_id UUID REFERENCES organizations(id),
  processing_result TEXT,
  error_message TEXT
);

-- Enable RLS on audit table
ALTER TABLE calcom_webhook_audit ENABLE ROW LEVEL SECURITY;

-- RLS policy for audit table - org members can view their logs
CREATE POLICY "Org members can view their Cal.com audit logs"
  ON calcom_webhook_audit FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM organization_members 
    WHERE user_id = auth.uid()
  ) OR is_super_admin(auth.uid()));

-- Service role can insert audit logs
CREATE POLICY "Service role can insert Cal.com audit logs"
  ON calcom_webhook_audit FOR INSERT
  WITH CHECK (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

-- Indexes for audit table
CREATE INDEX IF NOT EXISTS idx_calcom_audit_booking_uid ON calcom_webhook_audit(booking_uid);
CREATE INDEX IF NOT EXISTS idx_calcom_audit_org ON calcom_webhook_audit(organization_id);
CREATE INDEX IF NOT EXISTS idx_calcom_audit_created ON calcom_webhook_audit(created_at DESC);

-- 1.5 Backfill existing events as Calendly (only if booking_platform is null)
UPDATE events 
SET booking_platform = 'calendly' 
WHERE booking_platform IS NULL 
  AND calendly_event_uuid IS NOT NULL;