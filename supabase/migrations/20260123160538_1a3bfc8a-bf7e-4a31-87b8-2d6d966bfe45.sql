-- Fix 1: Update dedup index to include webhook_connection_id to allow same payload from different sources
DROP INDEX IF EXISTS idx_dataset_records_dedup;
CREATE UNIQUE INDEX idx_dataset_records_dedup 
ON public.dataset_records(dataset_id, webhook_connection_id, payload_hash) 
WHERE payload_hash IS NOT NULL;

-- Fix 2: Add index for faster orphan queries
CREATE INDEX IF NOT EXISTS idx_dataset_records_null_dataset 
ON public.dataset_records(organization_id) 
WHERE dataset_id IS NULL;

-- Fix 3: Add unique constraint on leads(email, organization_id) for safe UPSERT
-- First check if it exists, create if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'leads_email_org_unique'
  ) THEN
    ALTER TABLE public.leads 
    ADD CONSTRAINT leads_email_org_unique UNIQUE (email, organization_id);
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Constraint may already exist or email column missing: %', SQLERRM;
END $$;