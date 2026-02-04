-- Backfill events.closer_id from closers table
-- This updates events where closer_id is NULL but closer_name or closer_email matches a closer
-- Priority: email match (more reliable) > name match (case-insensitive)

-- First, update by email match (highest priority)
UPDATE public.events e
SET closer_id = c.id
FROM public.closers c
WHERE e.closer_id IS NULL
  AND e.organization_id = c.organization_id
  AND e.closer_email IS NOT NULL
  AND c.email IS NOT NULL
  AND LOWER(TRIM(e.closer_email)) = LOWER(TRIM(c.email));

-- Then, update by name match for remaining NULL closer_ids
UPDATE public.events e
SET closer_id = c.id
FROM public.closers c
WHERE e.closer_id IS NULL
  AND e.organization_id = c.organization_id
  AND e.closer_name IS NOT NULL
  AND c.name IS NOT NULL
  AND LOWER(TRIM(e.closer_name)) = LOWER(TRIM(c.name));

-- Also try matching against display_name if name match failed
UPDATE public.events e
SET closer_id = c.id
FROM public.closers c
WHERE e.closer_id IS NULL
  AND e.organization_id = c.organization_id
  AND e.closer_name IS NOT NULL
  AND c.display_name IS NOT NULL
  AND LOWER(TRIM(e.closer_name)) = LOWER(TRIM(c.display_name));