-- 1. Add cooldown_minutes column to dataset_alerts
ALTER TABLE public.dataset_alerts 
ADD COLUMN IF NOT EXISTS cooldown_minutes integer DEFAULT 5;

-- 2. Add foreign key constraints with ON DELETE SET NULL for dataset_records
ALTER TABLE public.dataset_records
DROP CONSTRAINT IF EXISTS dataset_records_dataset_id_fkey,
DROP CONSTRAINT IF EXISTS dataset_records_webhook_connection_id_fkey;

ALTER TABLE public.dataset_records
ADD CONSTRAINT dataset_records_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE SET NULL,
ADD CONSTRAINT dataset_records_webhook_connection_id_fkey 
  FOREIGN KEY (webhook_connection_id) REFERENCES public.webhook_connections(id) ON DELETE SET NULL;

-- 3. Add foreign key constraint for dataset_calculated_fields
ALTER TABLE public.dataset_calculated_fields
DROP CONSTRAINT IF EXISTS dataset_calculated_fields_dataset_id_fkey;

ALTER TABLE public.dataset_calculated_fields
ADD CONSTRAINT dataset_calculated_fields_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 4. Add foreign key constraint for dataset_fields
ALTER TABLE public.dataset_fields
DROP CONSTRAINT IF EXISTS dataset_fields_dataset_id_fkey;

ALTER TABLE public.dataset_fields
ADD CONSTRAINT dataset_fields_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 5. Add foreign key constraint for dataset_alerts
ALTER TABLE public.dataset_alerts
DROP CONSTRAINT IF EXISTS dataset_alerts_dataset_id_fkey;

ALTER TABLE public.dataset_alerts
ADD CONSTRAINT dataset_alerts_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 6. Add foreign key constraint for dataset_enrichments
ALTER TABLE public.dataset_enrichments
DROP CONSTRAINT IF EXISTS dataset_enrichments_dataset_id_fkey;

ALTER TABLE public.dataset_enrichments
ADD CONSTRAINT dataset_enrichments_dataset_id_fkey 
  FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE CASCADE;

-- 7. Add foreign key constraint for webhook_logs
ALTER TABLE public.webhook_logs
DROP CONSTRAINT IF EXISTS webhook_logs_connection_id_fkey;

ALTER TABLE public.webhook_logs
ADD CONSTRAINT webhook_logs_connection_id_fkey 
  FOREIGN KEY (connection_id) REFERENCES public.webhook_connections(id) ON DELETE SET NULL;

-- 8. Add payload_hash column to dataset_records for deduplication
ALTER TABLE public.dataset_records 
ADD COLUMN IF NOT EXISTS payload_hash text;

-- 9. Create unique index for deduplication (dataset_id + payload_hash)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dataset_records_dedup 
ON public.dataset_records(dataset_id, payload_hash) 
WHERE payload_hash IS NOT NULL;

-- 10. Add index on webhook_connection_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_dataset_records_connection 
ON public.dataset_records(webhook_connection_id);

-- 11. Add index on dataset_id for faster filtering
CREATE INDEX IF NOT EXISTS idx_dataset_records_dataset 
ON public.dataset_records(dataset_id);

-- 12. Make dataset_id nullable for ON DELETE SET NULL to work
ALTER TABLE public.dataset_records 
ALTER COLUMN dataset_id DROP NOT NULL;