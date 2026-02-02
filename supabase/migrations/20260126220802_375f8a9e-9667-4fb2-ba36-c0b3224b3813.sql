-- Phase 1: Merge Duplicate Events - Handle PCF references properly
-- First, re-link PCFs from orphans to their matching Calendly events before deletion

-- Step 1: Re-link PCFs from orphan events to matching Calendly events
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, pcf_submitted, event_outcome, notes, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_pairs AS (
  SELECT 
    o.id AS orphan_id,
    c.id AS calendly_id,
    o.lead_email,
    o.organization_id
  FROM orphans o
  JOIN events c ON 
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
)
UPDATE post_call_forms pcf
SET event_id = mp.calendly_id
FROM matching_pairs mp
WHERE pcf.event_id = mp.orphan_id;

-- Step 2: Re-link payments from orphan events to matching Calendly events
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_pairs AS (
  SELECT 
    o.id AS orphan_id,
    c.id AS calendly_id
  FROM orphans o
  JOIN events c ON 
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
)
UPDATE payments p
SET event_id = mp.calendly_id
FROM matching_pairs mp
WHERE p.event_id = mp.orphan_id;

-- Step 3: Now merge event data and delete orphans
WITH orphans AS (
  SELECT id, lead_email, scheduled_at, pcf_submitted, event_outcome, notes, organization_id
  FROM events
  WHERE calendly_invitee_uuid IS NULL
    AND calendly_event_uuid IS NULL
    AND lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
),
matching_calendly AS (
  SELECT 
    o.id AS orphan_id,
    c.id AS calendly_id,
    o.pcf_submitted AS orphan_pcf_submitted,
    o.event_outcome AS orphan_outcome,
    o.notes AS orphan_notes
  FROM orphans o
  JOIN events c ON 
    c.lead_email = o.lead_email
    AND c.organization_id = o.organization_id
    AND c.calendly_invitee_uuid IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM (c.scheduled_at - o.scheduled_at))) < 120
),
do_updates AS (
  UPDATE events e
  SET 
    pcf_submitted = GREATEST(m.orphan_pcf_submitted, e.pcf_submitted),
    event_outcome = COALESCE(m.orphan_outcome, e.event_outcome),
    notes = COALESCE(m.orphan_notes, e.notes),
    updated_at = now()
  FROM matching_calendly m
  WHERE e.id = m.calendly_id
  RETURNING e.id
)
DELETE FROM events
WHERE id IN (SELECT orphan_id FROM matching_calendly);

-- Step 4: Fix multi-scheduled events - mark older ones as rescheduled
WITH scheduled_groups AS (
  SELECT 
    lead_email,
    event_name,
    organization_id,
    id,
    scheduled_at,
    ROW_NUMBER() OVER (
      PARTITION BY lead_email, event_name, organization_id 
      ORDER BY scheduled_at DESC
    ) as rn
  FROM events
  WHERE call_status = 'scheduled'
    AND lead_email IS NOT NULL
    AND event_name IS NOT NULL
)
UPDATE events e
SET 
  call_status = 'rescheduled',
  pcf_submitted = true,
  updated_at = now()
FROM scheduled_groups sg
WHERE e.id = sg.id
  AND sg.rn > 1;