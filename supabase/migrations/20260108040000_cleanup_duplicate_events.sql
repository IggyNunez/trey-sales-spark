-- Migration: Cleanup Duplicate Events
-- Removes duplicate events that have the same lead_email, scheduled_at, and event_name
-- Keeps the oldest event (first created_at) and deletes newer duplicates

-- First, let's see what we're dealing with (informational)
DO $$
DECLARE
  duplicate_count INT;
  events_to_delete INT;
BEGIN
  -- Count duplicate groups
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT
      lead_email,
      scheduled_at,
      COALESCE(event_name, 'NULL') as event_name_key,
      COUNT(*) as cnt
    FROM events
    WHERE lead_email IS NOT NULL
      AND scheduled_at IS NOT NULL
    GROUP BY lead_email, scheduled_at, COALESCE(event_name, 'NULL')
    HAVING COUNT(*) > 1
  ) dups;

  -- Count total events to delete
  SELECT SUM(cnt - 1) INTO events_to_delete
  FROM (
    SELECT
      COUNT(*) as cnt
    FROM events
    WHERE lead_email IS NOT NULL
      AND scheduled_at IS NOT NULL
    GROUP BY lead_email, scheduled_at, COALESCE(event_name, 'NULL')
    HAVING COUNT(*) > 1
  ) dups;

  RAISE NOTICE 'Found % duplicate groups', duplicate_count;
  RAISE NOTICE 'Will delete % duplicate events', events_to_delete;
END $$;

-- Delete duplicates - keeps the OLDEST event (lowest created_at)
WITH duplicate_groups AS (
  SELECT
    lead_email,
    scheduled_at,
    COALESCE(event_name, 'NULL') as event_name_key,
    ARRAY_AGG(id ORDER BY created_at ASC) as event_ids
  FROM events
  WHERE lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, COALESCE(event_name, 'NULL')
  HAVING COUNT(*) > 1
),
events_to_delete AS (
  SELECT UNNEST(event_ids[2:]) as id_to_delete
  FROM duplicate_groups
)
DELETE FROM events
WHERE id IN (SELECT id_to_delete FROM events_to_delete);

-- Log the cleanup
DO $$
BEGIN
  RAISE NOTICE 'Duplicate event cleanup completed';
END $$;

-- Create a unique constraint to prevent future duplicates
-- Note: This will prevent exact duplicates from being created
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_booking
  ON events (lead_email, scheduled_at, COALESCE(event_name, ''))
  WHERE lead_email IS NOT NULL AND scheduled_at IS NOT NULL;

COMMENT ON INDEX idx_events_unique_booking IS
'Prevents duplicate events with same lead_email, scheduled_at, and event_name. Allows NULL values.';
