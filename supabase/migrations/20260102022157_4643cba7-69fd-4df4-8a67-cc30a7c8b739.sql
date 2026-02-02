-- Create payout snapshots table
CREATE TABLE public.payout_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_revenue numeric NOT NULL DEFAULT 0,
  total_refunds numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  finalized_at timestamp with time zone,
  notes text
);

-- Create snapshot details table (individual payment records)
CREATE TABLE public.payout_snapshot_details (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES public.payout_snapshots(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id),
  customer_email text,
  customer_name text,
  amount numeric NOT NULL DEFAULT 0,
  refund_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  payment_date timestamp with time zone,
  setter_id uuid REFERENCES public.setters(id),
  setter_name text,
  closer_id uuid,
  closer_name text,
  source_id uuid REFERENCES public.sources(id),
  source_name text,
  traffic_type_id uuid REFERENCES public.traffic_types(id),
  traffic_type_name text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create snapshot summaries table (aggregated by setter/closer/source)
CREATE TABLE public.payout_snapshot_summaries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id uuid NOT NULL REFERENCES public.payout_snapshots(id) ON DELETE CASCADE,
  summary_type text NOT NULL, -- 'setter', 'closer', 'source', 'traffic_type'
  entity_id uuid,
  entity_name text NOT NULL,
  total_revenue numeric NOT NULL DEFAULT 0,
  total_refunds numeric NOT NULL DEFAULT 0,
  net_revenue numeric NOT NULL DEFAULT 0,
  payment_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payout_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_snapshot_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_snapshot_summaries ENABLE ROW LEVEL SECURITY;

-- RLS policies for payout_snapshots
CREATE POLICY "Admins can manage payout snapshots" ON public.payout_snapshots
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view payout snapshots" ON public.payout_snapshots
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS policies for payout_snapshot_details
CREATE POLICY "Admins can manage payout snapshot details" ON public.payout_snapshot_details
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view payout snapshot details" ON public.payout_snapshot_details
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- RLS policies for payout_snapshot_summaries
CREATE POLICY "Admins can manage payout snapshot summaries" ON public.payout_snapshot_summaries
  FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view payout snapshot summaries" ON public.payout_snapshot_summaries
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Create indexes for performance
CREATE INDEX idx_payout_snapshot_details_snapshot ON public.payout_snapshot_details(snapshot_id);
CREATE INDEX idx_payout_snapshot_summaries_snapshot ON public.payout_snapshot_summaries(snapshot_id);
CREATE INDEX idx_payout_snapshots_period ON public.payout_snapshots(period_start, period_end);