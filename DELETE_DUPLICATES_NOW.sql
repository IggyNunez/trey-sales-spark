-- ==========================================
-- DELETE DUPLICATE EVENTS - RUN THIS NOW
-- ==========================================
-- Copy this entire file and paste into Supabase SQL Editor
-- Then click "Run" to delete duplicates immediately

-- Step 1: Show duplicates before deletion
SELECT
  lead_email,
  scheduled_at,
  event_name,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as all_ids
FROM events
WHERE lead_email IS NOT NULL
  AND scheduled_at IS NOT NULL
GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;

-- Step 2: Delete duplicates (keeps oldest, deletes newer)
WITH duplicate_groups AS (
  SELECT
    lead_email,
    scheduled_at,
    COALESCE(event_name, '') as event_name_key,
    ARRAY_AGG(id ORDER BY created_at ASC) as event_ids
  FROM events
  WHERE lead_email IS NOT NULL AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
  HAVING COUNT(*) > 1
),
events_to_delete AS (
  SELECT UNNEST(event_ids[2:]) as id_to_delete
  FROM duplicate_groups
)
DELETE FROM events
WHERE id IN (SELECT id_to_delete FROM events_to_delete);

-- Step 3: Create unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_unique_booking
  ON events (lead_email, scheduled_at, COALESCE(event_name, ''))
  WHERE lead_email IS NOT NULL AND scheduled_at IS NOT NULL;

-- Step 4: Verify no duplicates remain
SELECT
  lead_email,
  scheduled_at,
  event_name,
  COUNT(*) as count
FROM events
WHERE lead_email IS NOT NULL
  AND scheduled_at IS NOT NULL
GROUP BY lead_email, scheduled_at, COALESCE(event_name, '')
HAVING COUNT(*) > 1;
-- This should return 0 rows if duplicates are gone
