-- ============================================
-- Multi-Source Real-Time Webhook Dashboard Platform
-- ============================================

-- Enhance webhook_connections with multi-source features
ALTER TABLE public.webhook_connections
ADD COLUMN IF NOT EXISTS icon text,
ADD COLUMN IF NOT EXISTS color text,
ADD COLUMN IF NOT EXISTS description text,
ADD COLUMN IF NOT EXISTS signature_type text DEFAULT 'none' CHECK (signature_type IN ('hmac_sha256', 'header_token', 'none')),
ADD COLUMN IF NOT EXISTS signature_secret_encrypted text,
ADD COLUMN IF NOT EXISTS rate_limit_per_minute integer DEFAULT 60,
ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS dataset_id uuid;

-- Create datasets table (dynamic schema containers)
CREATE TABLE IF NOT EXISTS public.datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  icon text,
  color text,
  retention_days integer DEFAULT 90,
  realtime_enabled boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_fields table (per-dataset field definitions)
CREATE TABLE IF NOT EXISTS public.dataset_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_slug text NOT NULL,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT 'text' CHECK (field_type IN ('text', 'number', 'currency', 'boolean', 'date', 'datetime', 'json', 'array')),
  source_type text NOT NULL DEFAULT 'mapped' CHECK (source_type IN ('mapped', 'calculated', 'enriched')),
  source_config jsonb DEFAULT '{}',
  formula text,
  format text,
  is_visible boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dataset_id, field_slug)
);

-- Create dataset_records table (real-time data storage)
CREATE TABLE IF NOT EXISTS public.dataset_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  webhook_connection_id uuid REFERENCES public.webhook_connections(id) ON DELETE SET NULL,
  raw_payload jsonb NOT NULL,
  extracted_data jsonb DEFAULT '{}',
  processing_status text DEFAULT 'success' CHECK (processing_status IN ('success', 'partial', 'failed')),
  error_message text,
  created_at timestamp with time zone DEFAULT now()
);

-- Create dataset_calculated_fields table
CREATE TABLE IF NOT EXISTS public.dataset_calculated_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_slug text NOT NULL,
  display_name text NOT NULL,
  formula_type text NOT NULL DEFAULT 'expression' CHECK (formula_type IN ('expression', 'aggregation', 'comparison')),
  formula text NOT NULL,
  time_scope text DEFAULT 'all' CHECK (time_scope IN ('all', 'mtd', 'ytd', 'rolling_7d', 'rolling_30d')),
  comparison_period text,
  refresh_mode text DEFAULT 'realtime' CHECK (refresh_mode IN ('realtime', 'hourly', 'daily')),
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(dataset_id, field_slug)
);

-- Create dashboards table
CREATE TABLE IF NOT EXISTS public.webhook_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  is_shared boolean DEFAULT false,
  share_token text UNIQUE,
  layout_config jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dashboard_widgets table
CREATE TABLE IF NOT EXISTS public.dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id uuid NOT NULL REFERENCES public.webhook_dashboards(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  widget_type text NOT NULL DEFAULT 'card' CHECK (widget_type IN ('card', 'line', 'bar', 'pie', 'table', 'number', 'gauge')),
  title text,
  metric_config jsonb DEFAULT '{}',
  chart_config jsonb DEFAULT '{}',
  filters jsonb DEFAULT '[]',
  comparison_enabled boolean DEFAULT false,
  position jsonb DEFAULT '{"x": 0, "y": 0, "w": 1, "h": 1}',
  refresh_interval_seconds integer DEFAULT 30,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_alerts table
CREATE TABLE IF NOT EXISTS public.dataset_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  condition jsonb NOT NULL,
  notification_type text NOT NULL DEFAULT 'in_app' CHECK (notification_type IN ('slack', 'email', 'in_app')),
  notification_config jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  last_triggered_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create dataset_enrichments table
CREATE TABLE IF NOT EXISTS public.dataset_enrichments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  match_field text NOT NULL,
  target_table text NOT NULL CHECK (target_table IN ('leads', 'closers', 'events', 'payments')),
  target_field text NOT NULL,
  auto_create_if_missing boolean DEFAULT false,
  field_mappings jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create webhook_logs table (audit trail)
CREATE TABLE IF NOT EXISTS public.webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES public.webhook_connections(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  dataset_record_id uuid REFERENCES public.dataset_records(id) ON DELETE SET NULL,
  payload_hash text,
  status text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'processing', 'success', 'failed', 'skipped')),
  error_message text,
  processing_time_ms integer,
  ip_address text,
  headers jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Add foreign key for dataset_id in webhook_connections
ALTER TABLE public.webhook_connections
ADD CONSTRAINT webhook_connections_dataset_id_fkey
FOREIGN KEY (dataset_id) REFERENCES public.datasets(id) ON DELETE SET NULL;

-- Enable RLS on all new tables
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_calculated_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for datasets
CREATE POLICY "Authenticated users can view org datasets"
ON public.datasets FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage datasets"
ON public.datasets FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_fields
CREATE POLICY "Authenticated users can view org dataset_fields"
ON public.dataset_fields FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage dataset_fields"
ON public.dataset_fields FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_records
CREATE POLICY "Authenticated users can view org dataset_records"
ON public.dataset_records FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org members can insert dataset_records"
ON public.dataset_records FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_calculated_fields
CREATE POLICY "Authenticated users can view org calculated_fields"
ON public.dataset_calculated_fields FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage calculated_fields"
ON public.dataset_calculated_fields FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for webhook_dashboards
CREATE POLICY "Authenticated users can view org dashboards"
ON public.webhook_dashboards FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage dashboards"
ON public.webhook_dashboards FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dashboard_widgets
CREATE POLICY "Authenticated users can view org widgets"
ON public.dashboard_widgets FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage widgets"
ON public.dashboard_widgets FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_alerts
CREATE POLICY "Authenticated users can view org alerts"
ON public.dataset_alerts FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage alerts"
ON public.dataset_alerts FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for dataset_enrichments
CREATE POLICY "Authenticated users can view org enrichments"
ON public.dataset_enrichments FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org admins can manage enrichments"
ON public.dataset_enrichments FOR ALL
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
)
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_admin(auth.uid(), organization_id)
  )
);

-- RLS Policies for webhook_logs
CREATE POLICY "Authenticated users can view org webhook_logs"
ON public.webhook_logs FOR SELECT
TO authenticated
USING (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

CREATE POLICY "Org members can insert webhook_logs"
ON public.webhook_logs FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    public.is_super_admin(auth.uid())
    OR public.user_is_org_member(auth.uid(), organization_id)
  )
);

-- Enable Realtime for dataset_records
ALTER PUBLICATION supabase_realtime ADD TABLE public.dataset_records;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_datasets_org_id ON public.datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_dataset_fields_dataset_id ON public.dataset_fields(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_dataset_id ON public.dataset_records(dataset_id);
CREATE INDEX IF NOT EXISTS idx_dataset_records_created_at ON public.dataset_records(created_at);
CREATE INDEX IF NOT EXISTS idx_dataset_records_webhook_connection_id ON public.dataset_records(webhook_connection_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_connection_id ON public.webhook_logs(connection_id);
CREATE INDEX IF NOT EXISTS idx_webhook_logs_created_at ON public.webhook_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_dashboard_widgets_dashboard_id ON public.dashboard_widgets(dashboard_id);

-- Create updated_at triggers for new tables
CREATE TRIGGER update_datasets_updated_at
  BEFORE UPDATE ON public.datasets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_fields_updated_at
  BEFORE UPDATE ON public.dataset_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_calculated_fields_updated_at
  BEFORE UPDATE ON public.dataset_calculated_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_webhook_dashboards_updated_at
  BEFORE UPDATE ON public.webhook_dashboards
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_dataset_alerts_updated_at
  BEFORE UPDATE ON public.dataset_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();