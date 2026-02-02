
-- Add refunded_at column to track when refund was initiated
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMP WITH TIME ZONE;

-- Create index for efficient filtering by refund date
CREATE INDEX IF NOT EXISTS idx_payments_refunded_at ON public.payments(refunded_at) WHERE refunded_at IS NOT NULL;
