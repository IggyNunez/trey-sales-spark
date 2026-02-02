-- Add more columns to capture potential automation indicators
ALTER TABLE public.calendly_webhook_audit 
ADD COLUMN request_headers JSONB,
ADD COLUMN user_agent TEXT,
ADD COLUMN request_ip TEXT,
ADD COLUMN calendly_request_id TEXT,
ADD COLUMN rescheduled BOOLEAN,
ADD COLUMN new_invitee_uri TEXT,
ADD COLUMN old_invitee_uri TEXT,
ADD COLUMN event_memberships JSONB,
ADD COLUMN questions_and_answers JSONB,
ADD COLUMN payment JSONB,
ADD COLUMN no_show JSONB,
ADD COLUMN status TEXT,
ADD COLUMN uri TEXT,
ADD COLUMN created_at_ms BIGINT,
ADD COLUMN canceled_at_ms BIGINT;