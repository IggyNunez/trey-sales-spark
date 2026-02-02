
-- Add missing columns to webhook_logs table for full Layer 4 support
-- This includes raw_payload and extracted_data for storing webhook data

-- Add raw_payload column to store the original webhook payload
ALTER TABLE public.webhook_logs 
ADD COLUMN IF NOT EXISTS raw_payload jsonb;

-- Add extracted_data column to store processed/normalized data
ALTER TABLE public.webhook_logs 
ADD COLUMN IF NOT EXISTS extracted_data jsonb;

-- Add index on connection_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_webhook_logs_connection_id 
ON public.webhook_logs(connection_id);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_webhook_logs_status 
ON public.webhook_logs(status);

-- Add composite index for organization + created_at for efficient queries
CREATE INDEX IF NOT EXISTS idx_webhook_logs_org_created 
ON public.webhook_logs(organization_id, created_at DESC);

-- Add index on dataset_records for organization + dataset + created_at
CREATE INDEX IF NOT EXISTS idx_dataset_records_org_dataset_created 
ON public.dataset_records(organization_id, dataset_id, created_at DESC);

-- Add foreign key constraint for webhook_connection_id on dataset_records if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'dataset_records_webhook_connection_id_fkey'
  ) THEN
    ALTER TABLE public.dataset_records 
    ADD CONSTRAINT dataset_records_webhook_connection_id_fkey 
    FOREIGN KEY (webhook_connection_id) 
    REFERENCES public.webhook_connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add foreign key constraint for connection_id on webhook_logs if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'webhook_logs_connection_id_fkey'
  ) THEN
    ALTER TABLE public.webhook_logs 
    ADD CONSTRAINT webhook_logs_connection_id_fkey 
    FOREIGN KEY (connection_id) 
    REFERENCES public.webhook_connections(id) ON DELETE SET NULL;
  END IF;
END $$;
