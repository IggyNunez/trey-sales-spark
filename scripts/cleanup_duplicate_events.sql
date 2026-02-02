-- Script to find and delete duplicate events
-- Duplicates are defined as events with the same:
-- - lead_email
-- - scheduled_at (exact same time)
-- - event_name
--
-- This script will keep the OLDEST event (first created) and delete newer duplicates

-- Step 1: Find duplicates
WITH duplicate_groups AS (
  SELECT
    lead_email,
    scheduled_at,
    event_name,
    COUNT(*) as duplicate_count,
    ARRAY_AGG(id ORDER BY created_at ASC) as event_ids,
    MIN(created_at) as first_created
  FROM events
  WHERE lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, event_name
  HAVING COUNT(*) > 1
),
events_to_delete AS (
  SELECT
    UNNEST(event_ids[2:]) as id_to_delete  -- Keep first (oldest), delete rest
  FROM duplicate_groups
)
SELECT
  e.id,
  e.lead_name,
  e.lead_email,
  e.scheduled_at,
  e.event_name,
  e.created_at,
  'DUPLICATE - WILL BE DELETED' as status
FROM events e
INNER JOIN events_to_delete etd ON e.id = etd.id_to_delete
ORDER BY e.lead_email, e.scheduled_at;

-- Step 2: Delete duplicates (UNCOMMENT TO ACTUALLY DELETE)
-- DELETE FROM events
-- WHERE id IN (
--   SELECT UNNEST(event_ids[2:]) as id_to_delete
--   FROM (
--     SELECT
--       ARRAY_AGG(id ORDER BY created_at ASC) as event_ids
--     FROM events
--     WHERE lead_email IS NOT NULL
--       AND scheduled_at IS NOT NULL
--     GROUP BY lead_email, scheduled_at, event_name
--     HAVING COUNT(*) > 1
--   ) duplicate_groups
-- );

-- Show summary of what would be deleted
WITH duplicate_groups AS (
  SELECT
    lead_email,
    scheduled_at,
    event_name,
    COUNT(*) as duplicate_count
  FROM events
  WHERE lead_email IS NOT NULL
    AND scheduled_at IS NOT NULL
  GROUP BY lead_email, scheduled_at, event_name
  HAVING COUNT(*) > 1
)
SELECT
  COUNT(*) as number_of_duplicate_groups,
  SUM(duplicate_count - 1) as total_duplicates_to_delete
FROM duplicate_groups;
