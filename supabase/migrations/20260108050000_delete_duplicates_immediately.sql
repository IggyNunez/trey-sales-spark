-- Delete duplicate events immediately
-- Keeps oldest event (first created_at) and deletes newer duplicates

-- Show what will be deleted
DO $$
DECLARE
  duplicate_count INT;
  total_to_delete INT;
BEGIN
  SELECT COUNT(DISTINCT (lead_email, scheduled_at, COALESCE(event_name, ''))) INTO duplicate_count
  FROM events
  WHERE lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
  HAVING COUNT(*) > 1;

  SELECT SUM(cnt - 1) INTO total_to_delete
  FROM (
    SELECT COUNT(*) as cnt
    FROM events
    WHERE lead_email IS NOT NULL
      AND scheduled_at IS NOT NULL
    GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
    HAVING COUNT(*) > 1
  ) dups;

  RAISE NOTICE '🔍 Found % duplicate groups', COALESCE(duplicate_count, 0);
  RAISE NOTICE '🗑️  Will delete % duplicate events', COALESCE(total_to_delete, 0);
END $$;

-- Actually delete duplicates
WITH duplicate_groups AS (
  SELECT
    lead_email,
    scheduled_at,
    COALESCE(event_name, '') as event_name_key,
    ARRAY_AGG(id ORDER BY created_at ASC) as event_ids
  FROM events
  WHERE lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
  HAVING COUNT(*) > 1
),
events_to_delete AS (
  SELECT UNNEST(event_ids[2:]) as id_to_delete
  FROM duplicate_groups
)
DELETE FROM events
WHERE id IN (SELECT id_to_delete FROM events_to_delete);

-- Show results
DO $$
BEGIN
  RAISE NOTICE '✅ Duplicate cleanup complete!';
END $$;

-- Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_booking
  ON events (lead_email, scheduled_at, COALESCE(event_name, ''))
  WHERE lead_email IS NOT NULL AND scheduled_at IS NOT NULL;

COMMENT ON INDEX idx_events_unique_booking IS
'Prevents duplicate events with same lead_email, scheduled_at, and event_name';
