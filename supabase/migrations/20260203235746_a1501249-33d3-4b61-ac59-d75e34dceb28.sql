-- =====================================================
-- Email-First Identity Unification for Acquisition Ace
-- Phase 1-4: Backfills + Auto-Resolution Trigger
-- =====================================================

-- Phase 1: Backfill closer emails from events
-- For closers that have events linked by name match but missing email
UPDATE closers c
SET email = LOWER(subq.closer_email)
FROM (
  SELECT DISTINCT ON (e.closer_id) e.closer_id, e.closer_email
  FROM events e
  WHERE e.closer_id IS NOT NULL
    AND e.closer_email IS NOT NULL
    AND e.organization_id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31'
  ORDER BY e.closer_id, e.scheduled_at DESC
) subq
WHERE c.id = subq.closer_id
  AND c.organization_id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31'
  AND (c.email IS NULL OR c.email = '');

-- Phase 2: Create missing lead records from events
-- Insert leads that exist in events but not in leads table
INSERT INTO leads (email, full_name, phone, organization_id, created_at)
SELECT DISTINCT ON (LOWER(e.lead_email))
  LOWER(e.lead_email) as email,
  e.lead_name as full_name,
  e.lead_phone as phone,
  e.organization_id,
  NOW()
FROM events e
LEFT JOIN leads l ON LOWER(e.lead_email) = LOWER(l.email) 
  AND e.organization_id = l.organization_id
WHERE e.organization_id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31'
  AND e.lead_email IS NOT NULL
  AND e.lead_email != ''
  AND l.id IS NULL
ORDER BY LOWER(e.lead_email), e.scheduled_at DESC;

-- Phase 3: Backfill lead_id on events from lead_email
UPDATE events e
SET lead_id = l.id
FROM leads l
WHERE LOWER(e.lead_email) = LOWER(l.email)
  AND e.organization_id = l.organization_id
  AND e.organization_id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31'
  AND e.lead_id IS NULL
  AND e.lead_email IS NOT NULL;

-- Also backfill any missing closer_id from closer_email
UPDATE events e
SET closer_id = c.id
FROM closers c
WHERE LOWER(e.closer_email) = LOWER(c.email)
  AND e.organization_id = c.organization_id
  AND e.organization_id = '74c1d616-43ca-4acc-bd3a-4cefc171fa31'
  AND e.closer_id IS NULL
  AND e.closer_email IS NOT NULL;

-- Phase 4: Create auto-resolution trigger for future events
-- This trigger automatically populates closer_id and lead_id from email matches

CREATE OR REPLACE FUNCTION public.resolve_event_identity()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-resolve closer_id from closer_email if not already set
  IF NEW.closer_email IS NOT NULL AND NEW.closer_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT id INTO NEW.closer_id 
    FROM public.closers 
    WHERE LOWER(email) = LOWER(NEW.closer_email)
      AND organization_id = NEW.organization_id
    LIMIT 1;
  END IF;
  
  -- Auto-resolve lead_id from lead_email if not already set
  IF NEW.lead_email IS NOT NULL AND NEW.lead_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    SELECT id INTO NEW.lead_id 
    FROM public.leads 
    WHERE LOWER(email) = LOWER(NEW.lead_email)
      AND organization_id = NEW.organization_id
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop existing trigger if any, then create
DROP TRIGGER IF EXISTS trg_resolve_event_identity ON public.events;

CREATE TRIGGER trg_resolve_event_identity
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.resolve_event_identity();