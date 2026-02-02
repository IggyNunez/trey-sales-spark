
-- =====================================================
-- DYNAMIC FORM SYSTEM
-- Allows unlimited custom forms with dynamic fields
-- =====================================================

-- Form Definitions: The form templates (EOD Report, Intake Form, etc.)
CREATE TABLE public.form_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Form identity
  name TEXT NOT NULL,                           -- "End of Day Report", "Lead Intake"
  slug TEXT NOT NULL,                           -- "eod_report", "lead_intake"
  description TEXT,
  icon TEXT DEFAULT 'clipboard-list',
  
  -- Relationship configuration
  entity_type TEXT NOT NULL DEFAULT 'standalone', -- 'closer', 'lead', 'event', 'standalone'
  
  -- Scheduling for recurring forms
  is_recurring BOOLEAN DEFAULT false,
  recurrence_pattern TEXT,                       -- 'daily', 'weekly', 'monthly', 'per_event'
  
  -- Access control
  assigned_closers TEXT[] DEFAULT '{}',          -- specific closer IDs, empty = all closers
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(organization_id, slug)
);

-- Form Fields: The individual fields within each form
CREATE TABLE public.form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Field identity
  field_name TEXT NOT NULL,                      -- Internal name
  field_slug TEXT NOT NULL,                      -- URL-safe identifier
  label TEXT NOT NULL,                           -- Display label
  
  -- Field configuration
  field_type TEXT NOT NULL DEFAULT 'text',       -- 'boolean', 'number', 'currency', 'text', 'textarea', 'select', 'multi_select', 'date'
  placeholder TEXT,
  help_text TEXT,
  default_value JSONB,
  
  -- Options for select/multi_select fields
  options JSONB,                                  -- [{value: 'opt1', label: 'Option 1', color: '#fff'}]
  
  -- Validation
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB DEFAULT '{}',           -- {min: 0, max: 100, pattern: '...'}
  
  -- Conditional logic
  conditional_logic JSONB,                        -- {conditions: [...], logic: 'AND'|'OR'}
  
  -- Metric configuration
  creates_metric BOOLEAN DEFAULT false,
  metric_config JSONB,                            -- {metric_type, display_name, format, formula, ...}
  
  -- Display
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  show_in_summary BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(form_definition_id, field_slug)
);

-- Form Submissions: Each time a form is filled out
CREATE TABLE public.form_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  
  -- Dynamic entity relationship
  entity_type TEXT NOT NULL,                      -- 'closer', 'lead', 'event', 'standalone'
  entity_id UUID,                                 -- ID of related record (null for standalone)
  entity_name TEXT,                               -- Denormalized name for quick display
  
  -- Submitter info
  submitted_by_id UUID,                           -- User or closer ID
  submitted_by_name TEXT,
  
  -- For recurring forms
  period_date DATE,                               -- The date this submission covers
  
  -- Status
  status TEXT DEFAULT 'submitted',                -- 'draft', 'submitted', 'reviewed'
  
  submitted_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Form Field Values: The actual values for each submission
CREATE TABLE public.form_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.form_submissions(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.form_fields(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Flexible value storage (use appropriate column based on field_type)
  value_text TEXT,
  value_number NUMERIC,
  value_boolean BOOLEAN,
  value_date DATE,
  value_json JSONB,                               -- For complex values like multi_select
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(submission_id, field_id)
);

-- Form Metrics: Auto-generated metrics from form fields
CREATE TABLE public.form_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_definition_id UUID NOT NULL REFERENCES public.form_definitions(id) ON DELETE CASCADE,
  field_id UUID REFERENCES public.form_fields(id) ON DELETE SET NULL,
  
  -- Metric identity
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'bar-chart',
  
  -- Formula configuration
  formula_type TEXT NOT NULL DEFAULT 'sum',       -- 'count', 'sum', 'average', 'percentage', 'custom'
  formula_config JSONB,                           -- {numerator_field, denominator_field, ...}
  
  -- Aggregation
  aggregate_by TEXT DEFAULT 'total',              -- 'total', 'closer', 'day', 'week', 'month'
  
  -- Display
  format TEXT DEFAULT 'number',                   -- 'number', 'currency', 'percentage'
  color TEXT,
  
  -- Dashboard visibility
  show_on_dashboard BOOLEAN DEFAULT true,
  dashboard_position INTEGER DEFAULT 0,
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- INDEXES
-- =====================================================

CREATE INDEX idx_form_definitions_org ON public.form_definitions(organization_id);
CREATE INDEX idx_form_definitions_entity_type ON public.form_definitions(entity_type);
CREATE INDEX idx_form_fields_form ON public.form_fields(form_definition_id);
CREATE INDEX idx_form_fields_org ON public.form_fields(organization_id);
CREATE INDEX idx_form_submissions_org ON public.form_submissions(organization_id);
CREATE INDEX idx_form_submissions_form ON public.form_submissions(form_definition_id);
CREATE INDEX idx_form_submissions_entity ON public.form_submissions(entity_type, entity_id);
CREATE INDEX idx_form_submissions_period ON public.form_submissions(period_date);
CREATE INDEX idx_form_field_values_submission ON public.form_field_values(submission_id);
CREATE INDEX idx_form_field_values_field ON public.form_field_values(field_id);
CREATE INDEX idx_form_metrics_org ON public.form_metrics(organization_id);
CREATE INDEX idx_form_metrics_form ON public.form_metrics(form_definition_id);

-- =====================================================
-- ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.form_metrics ENABLE ROW LEVEL SECURITY;

-- Form Definitions policies
CREATE POLICY "Users can view form definitions in their org"
ON public.form_definitions FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form definitions"
ON public.form_definitions FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- Form Fields policies
CREATE POLICY "Users can view form fields in their org"
ON public.form_fields FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form fields"
ON public.form_fields FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- Form Submissions policies
CREATE POLICY "Users can view submissions in their org"
ON public.form_submissions FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can create submissions in their org"
ON public.form_submissions FOR INSERT
TO authenticated
WITH CHECK (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can update their own submissions"
ON public.form_submissions FOR UPDATE
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

-- Form Field Values policies
CREATE POLICY "Users can view field values in their org"
ON public.form_field_values FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Users can manage field values in their org"
ON public.form_field_values FOR ALL
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_member(auth.uid(), organization_id));

-- Form Metrics policies
CREATE POLICY "Users can view form metrics in their org"
ON public.form_metrics FOR SELECT
TO authenticated
USING (public.user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Admins can manage form metrics"
ON public.form_metrics FOR ALL
TO authenticated
USING (public.user_is_org_admin(auth.uid(), organization_id))
WITH CHECK (public.user_is_org_admin(auth.uid(), organization_id));

-- =====================================================
-- TRIGGERS FOR updated_at
-- =====================================================

CREATE TRIGGER update_form_definitions_updated_at
  BEFORE UPDATE ON public.form_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_fields_updated_at
  BEFORE UPDATE ON public.form_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_submissions_updated_at
  BEFORE UPDATE ON public.form_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_field_values_updated_at
  BEFORE UPDATE ON public.form_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_form_metrics_updated_at
  BEFORE UPDATE ON public.form_metrics
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
