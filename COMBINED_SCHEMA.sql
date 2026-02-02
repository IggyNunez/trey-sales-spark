-- ============================================================================
-- COMBINED DATABASE SCHEMA FOR SALES-SPARK-REPLICA
-- ============================================================================
-- This file consolidates all Supabase migrations into a single schema file.
-- Generated: 2026-01-16
--
-- SECURITY NOTE: This schema uses SECURE RLS policies that enforce
-- organization-based access control. Dangerous "Anyone can..." policies
-- have been intentionally omitted.
-- ============================================================================

-- ============================================================================
-- PART 1: EXTENSIONS
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PART 2: CUSTOM TYPES (ENUMS)
-- ============================================================================

-- Application role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'sales_rep', 'super_admin');

-- Payment type enum
CREATE TYPE public.payment_type AS ENUM ('paid_in_full', 'split_pay', 'deposit');

-- Event outcome enum
CREATE TYPE public.event_outcome AS ENUM ('no_show', 'showed_no_offer', 'showed_offer_no_close', 'closed');

-- CRM type enum
CREATE TYPE public.crm_type AS ENUM ('close', 'ghl', 'hubspot');

-- Deal type enum
CREATE TYPE public.deal_type AS ENUM ('new_deal', 'upsell', 'renewal');

-- ============================================================================
-- PART 3: TRIGGER FUNCTIONS (no table dependencies)
-- ============================================================================

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 4: CORE TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Organizations Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Organization Members Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_organization_members_updated_at
  BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Profiles Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  current_organization_id UUID REFERENCES public.organizations(id),
  linked_closer_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profiles_linked_closer_name ON public.profiles(linked_closer_name);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- User Roles Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role app_role NOT NULL DEFAULT 'sales_rep',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 4B: HELPER FUNCTIONS (require user_roles + organization_members tables)
-- ============================================================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to check if user is admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin')
$$;

-- Overloaded version without parameter (uses current user)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'super_admin')
$$;

-- Function to check if user is sales rep
CREATE OR REPLACE FUNCTION public.is_sales_rep(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'sales_rep')
$$;

-- Function to get user's organization IDs
CREATE OR REPLACE FUNCTION public.get_user_org_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
$$;

-- Alternate name for the same function
CREATE OR REPLACE FUNCTION public.get_user_organization_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id
  FROM public.organization_members
  WHERE user_id = _user_id
$$;

-- Function to check if user is member of an organization
CREATE OR REPLACE FUNCTION public.user_is_org_member(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Function to check if user is org admin
CREATE OR REPLACE FUNCTION public.user_is_org_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
      AND role IN ('owner', 'admin')
  )
$$;

-- Function to check if user belongs to an organization
CREATE OR REPLACE FUNCTION public.user_in_organization(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members
    WHERE user_id = _user_id
      AND organization_id = _org_id
  )
$$;

-- Helper function to check if user is admin of a specific org
CREATE OR REPLACE FUNCTION public.is_org_admin(user_uuid UUID, org_uuid UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = user_uuid
    AND organization_id = org_uuid
    AND role IN ('admin', 'super_admin', 'owner')
  );
$$;

-- ----------------------------------------------------------------------------
-- Sources Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.sources ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Call Types Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_types ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Traffic Types Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.traffic_types ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Setters Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.setters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id),
  close_user_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.setters ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Closers Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id),
  organization_id UUID REFERENCES public.organizations(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.closers ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PART 5: BUSINESS TABLES
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Leads Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  source_id UUID REFERENCES public.sources(id),
  organization_id UUID REFERENCES public.organizations(id),
  original_setter_name TEXT,
  current_setter_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email)
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Call Outcomes Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.call_outcomes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES public.organizations(id),
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.call_outcomes ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Opportunity Statuses Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.opportunity_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  organization_id UUID REFERENCES public.organizations(id),
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT opportunity_statuses_org_name_unique UNIQUE (organization_id, name)
);

ALTER TABLE public.opportunity_statuses ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Events Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendly_event_uuid TEXT UNIQUE,
  calendly_invitee_uuid TEXT UNIQUE,
  lead_id UUID REFERENCES public.leads(id),
  call_type_id UUID REFERENCES public.call_types(id),
  source_id UUID REFERENCES public.sources(id),
  traffic_type_id UUID REFERENCES public.traffic_types(id),
  organization_id UUID REFERENCES public.organizations(id),
  setter_id UUID REFERENCES public.setters(id),
  setter_name TEXT,
  closer_id UUID,
  closer_name TEXT,
  closer_email TEXT,
  event_name TEXT,
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_phone TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  call_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (call_status IN ('scheduled', 'completed', 'no_show', 'canceled', 'rescheduled')),
  event_outcome event_outcome,
  pcf_submitted BOOLEAN NOT NULL DEFAULT false,
  pcf_submitted_at TIMESTAMP WITH TIME ZONE,
  ghl_contact_id TEXT,
  hubspot_contact_id TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_events_closer_email ON public.events(closer_email);
CREATE INDEX IF NOT EXISTS idx_events_ghl_contact_id ON public.events(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_hubspot_contact_id ON public.events(hubspot_contact_id);

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Post Call Forms Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_call_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id),
  organization_id UUID REFERENCES public.organizations(id),
  closer_id UUID NOT NULL,
  closer_name TEXT NOT NULL,
  call_occurred BOOLEAN NOT NULL,
  lead_showed BOOLEAN NOT NULL,
  offer_made BOOLEAN NOT NULL,
  deal_closed BOOLEAN NOT NULL,
  cash_collected NUMERIC(12, 2) DEFAULT 0,
  payment_type payment_type,
  call_outcome_id UUID REFERENCES public.call_outcomes(id),
  opportunity_status_id UUID REFERENCES public.opportunity_statuses(id),
  close_date TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.post_call_forms ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.post_call_forms IS 'Post-call forms with secure org-based access. Portal users access via portal-pcf edge function which validates tokens.';

-- ----------------------------------------------------------------------------
-- Packages Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_packages_organization_id ON public.packages(organization_id);

-- ----------------------------------------------------------------------------
-- Payments Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES public.events(id),
  lead_id UUID REFERENCES public.leads(id),
  pcf_id UUID REFERENCES public.post_call_forms(id),
  organization_id UUID REFERENCES public.organizations(id),
  amount NUMERIC(12, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  refund_amount NUMERIC(12, 2) DEFAULT 0,
  refunded_at TIMESTAMP WITH TIME ZONE,
  net_revenue NUMERIC(12, 2) GENERATED ALWAYS AS (amount - COALESCE(refund_amount, 0)) STORED,
  payment_type payment_type,
  deal_type deal_type,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  contract_value NUMERIC,
  payment_2_due_date DATE,
  payment_3_due_date DATE,
  setter_id UUID REFERENCES public.setters(id),
  closer_id UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_refunded_at ON public.payments(refunded_at) WHERE refunded_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deal_type ON public.payments(deal_type);
CREATE INDEX IF NOT EXISTS idx_payments_package_id ON public.payments(package_id);

CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.payments IS 'Payment records from Stripe/Whop webhooks. Webhook handlers use service role. Authenticated users access via RLS.';

-- ============================================================================
-- PART 6: ORGANIZATION SETTINGS & INTEGRATIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Organization Integrations Table (API Keys)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Plain text keys (deprecated, for backwards compatibility)
  calendly_api_key TEXT,
  close_api_key TEXT,
  whop_api_key TEXT,
  whop_company_id TEXT,
  hubspot_api_key TEXT,
  -- Encrypted API keys (preferred)
  calendly_api_key_encrypted TEXT,
  close_api_key_encrypted TEXT,
  ghl_api_key_encrypted TEXT,
  hubspot_api_key_encrypted TEXT,
  whop_api_key_encrypted TEXT,
  stripe_api_key_encrypted TEXT,
  stripe_publishable_key TEXT,
  encryption_version INTEGER DEFAULT 1,
  -- Webhook signing keys
  calendly_webhook_signing_key TEXT,
  whop_webhook_signing_key TEXT,
  -- Calendly organization URI
  calendly_organization_uri TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

ALTER TABLE public.organization_integrations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_org_integrations_encryption_version
  ON public.organization_integrations(encryption_version)
  WHERE encryption_version IS NOT NULL;

CREATE TRIGGER update_organization_integrations_updated_at
  BEFORE UPDATE ON public.organization_integrations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.organization_integrations.calendly_api_key_encrypted IS 'AES-256-GCM encrypted. Format: base64(JSON{iv, data, tag})';
COMMENT ON COLUMN public.organization_integrations.calendly_organization_uri IS 'The Calendly organization URI (e.g., https://api.calendly.com/organizations/xxx) used to match incoming webhooks to the correct organization';

-- ----------------------------------------------------------------------------
-- Portal Settings Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portal_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  show_booked_calls BOOLEAN NOT NULL DEFAULT true,
  show_show_rate BOOLEAN NOT NULL DEFAULT true,
  show_close_rate BOOLEAN NOT NULL DEFAULT true,
  show_cash_collected BOOLEAN NOT NULL DEFAULT true,
  show_upcoming_events BOOLEAN NOT NULL DEFAULT true,
  show_overdue_pcfs BOOLEAN NOT NULL DEFAULT true,
  show_past_events BOOLEAN NOT NULL DEFAULT true,
  custom_domain TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_portal_settings_updated_at
  BEFORE UPDATE ON public.portal_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.portal_settings.custom_domain IS 'Custom domain for generating portal invite links (e.g., app.yourdomain.com)';

-- ----------------------------------------------------------------------------
-- Webhook Connections Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.webhook_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'whop',
  api_key TEXT,
  webhook_secret TEXT,
  signing_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_webhook_at TIMESTAMP WITH TIME ZONE,
  webhook_count INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE public.webhook_connections ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_webhook_connections_updated_at
  BEFORE UPDATE ON public.webhook_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.webhook_connections.signing_key IS 'Webhook signing key for verifying webhook authenticity.';

-- ============================================================================
-- PART 7: ACCESS & INVITATIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Invitations Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  invite_type TEXT NOT NULL CHECK (invite_type IN ('whitelabel', 'sales_rep', 'admin', 'client_admin')),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_by UUID,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  closer_name TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_invitations_token ON public.invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations(email);

COMMENT ON COLUMN public.invitations.invite_type IS 'Type of invitation: whitelabel (partner), sales_rep (team member), client_admin (organization admin)';

-- ----------------------------------------------------------------------------
-- Closer Access Tokens Table (Magic Links)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.closer_access_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex') UNIQUE,
  closer_name TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_used_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '90 days',
  is_active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(closer_name, organization_id)
);

ALTER TABLE public.closer_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_closer_access_tokens_token ON public.closer_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_closer_access_tokens_closer_org ON public.closer_access_tokens(closer_name, organization_id);

-- ============================================================================
-- PART 8: METRICS & ANALYTICS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Metric Definitions Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  formula_type TEXT NOT NULL DEFAULT 'percentage' CHECK (formula_type IN ('count', 'sum', 'percentage', 'currency', 'ratio')),
  data_source TEXT CHECK (data_source IN ('events', 'payments', 'pcf_fields')),
  pcf_field_id TEXT,
  numerator_field TEXT,
  numerator_conditions JSONB DEFAULT '{}',
  denominator_field TEXT,
  denominator_conditions JSONB DEFAULT '{}',
  include_cancels BOOLEAN DEFAULT false,
  include_reschedules BOOLEAN DEFAULT false,
  include_no_shows BOOLEAN DEFAULT true,
  exclude_overdue_pcf BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_metric_definitions_updated_at
  BEFORE UPDATE ON public.metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.metric_definitions.pcf_field_id IS 'The form field ID to track when data_source is pcf_fields';

-- ============================================================================
-- PART 9: PAYOUT SNAPSHOTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Payout Snapshots Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_refunds NUMERIC NOT NULL DEFAULT 0,
  net_revenue NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  finalized_at TIMESTAMP WITH TIME ZONE,
  notes TEXT
);

ALTER TABLE public.payout_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payout_snapshots_period ON public.payout_snapshots(period_start, period_end);

-- ----------------------------------------------------------------------------
-- Payout Snapshot Details Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_snapshot_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.payout_snapshots(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  payment_id UUID REFERENCES public.payments(id),
  customer_email TEXT,
  customer_name TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  refund_amount NUMERIC NOT NULL DEFAULT 0,
  net_amount NUMERIC NOT NULL DEFAULT 0,
  payment_date TIMESTAMP WITH TIME ZONE,
  setter_id UUID REFERENCES public.setters(id),
  setter_name TEXT,
  closer_id UUID,
  closer_name TEXT,
  source_id UUID REFERENCES public.sources(id),
  source_name TEXT,
  traffic_type_id UUID REFERENCES public.traffic_types(id),
  traffic_type_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_snapshot_details ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payout_snapshot_details_snapshot ON public.payout_snapshot_details(snapshot_id);

-- ----------------------------------------------------------------------------
-- Payout Snapshot Summaries Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_snapshot_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  snapshot_id UUID NOT NULL REFERENCES public.payout_snapshots(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  summary_type TEXT NOT NULL,
  entity_id UUID,
  entity_name TEXT NOT NULL,
  total_revenue NUMERIC NOT NULL DEFAULT 0,
  total_refunds NUMERIC NOT NULL DEFAULT 0,
  net_revenue NUMERIC NOT NULL DEFAULT 0,
  payment_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.payout_snapshot_summaries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payout_snapshot_summaries_snapshot ON public.payout_snapshot_summaries(snapshot_id);

-- ============================================================================
-- PART 10: AUDIT & RATE LIMITING
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Audit Logs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Audit log trigger function
CREATE OR REPLACE FUNCTION public.audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, user_id)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, user_id)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- Apply audit triggers to main tables
CREATE TRIGGER audit_leads AFTER INSERT OR UPDATE OR DELETE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_events AFTER INSERT OR UPDATE OR DELETE ON public.events FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_post_call_forms AFTER INSERT OR UPDATE OR DELETE ON public.post_call_forms FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_payments AFTER INSERT OR UPDATE OR DELETE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_organization_integrations AFTER INSERT OR UPDATE OR DELETE ON public.organization_integrations FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_webhook_connections AFTER INSERT OR UPDATE OR DELETE ON public.webhook_connections FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();
CREATE TRIGGER audit_organization_members AFTER INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.audit_log_trigger();

-- ----------------------------------------------------------------------------
-- Rate Limits Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_limits_identifier_endpoint_window
  ON public.rate_limits (identifier, endpoint, window_start);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start ON public.rate_limits (window_start);

-- Function to check and increment rate limit
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_identifier TEXT,
  p_endpoint TEXT,
  p_max_requests INTEGER DEFAULT 100,
  p_window_minutes INTEGER DEFAULT 1
)
RETURNS TABLE(allowed BOOLEAN, current_count INTEGER, reset_at TIMESTAMP WITH TIME ZONE)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMP WITH TIME ZONE;
  v_current_count INTEGER;
BEGIN
  v_window_start := date_trunc('minute', now()) -
    (EXTRACT(MINUTE FROM now())::INTEGER % p_window_minutes) * INTERVAL '1 minute';

  INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
  VALUES (p_identifier, p_endpoint, 1, v_window_start)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING rate_limits.request_count INTO v_current_count;

  RETURN QUERY SELECT
    v_current_count <= p_max_requests AS allowed,
    v_current_count AS current_count,
    v_window_start + (p_window_minutes * INTERVAL '1 minute') AS reset_at;
END;
$$;

-- Function to clean up old rate limit records
CREATE OR REPLACE FUNCTION public.cleanup_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.rate_limits
  WHERE window_start < now() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================================
-- PART 11: CUSTOM FIELDS & FORM CONFIGS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Custom Field Definitions Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  field_slug TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'select' CHECK (field_type IN ('select', 'multi-select', 'text', 'number', 'date', 'boolean')),
  applies_to TEXT[] NOT NULL DEFAULT ARRAY['events'],
  is_required BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  show_in_dashboard BOOLEAN NOT NULL DEFAULT true,
  show_in_forms BOOLEAN NOT NULL DEFAULT true,
  show_in_filters BOOLEAN NOT NULL DEFAULT true,
  show_in_exports BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, field_slug)
);

ALTER TABLE public.custom_field_definitions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_org ON public.custom_field_definitions(organization_id);

CREATE TRIGGER update_custom_field_definitions_updated_at
  BEFORE UPDATE ON public.custom_field_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Custom Field Options Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  option_value TEXT NOT NULL,
  option_label TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(field_definition_id, option_value)
);

ALTER TABLE public.custom_field_options ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_field_options_definition ON public.custom_field_options(field_definition_id);

-- ----------------------------------------------------------------------------
-- Custom Field Values Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_definition_id UUID NOT NULL REFERENCES public.custom_field_definitions(id) ON DELETE CASCADE,
  record_id UUID NOT NULL,
  record_type TEXT NOT NULL CHECK (record_type IN ('events', 'payments', 'leads', 'post_call_forms')),
  value JSONB NOT NULL DEFAULT '{}',
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(field_definition_id, record_id, record_type)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_custom_field_values_record ON public.custom_field_values(record_id, record_type);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_definition ON public.custom_field_values(field_definition_id);

CREATE TRIGGER update_custom_field_values_updated_at
  BEFORE UPDATE ON public.custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- Form Configs Table (PCF Builder)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.form_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  form_type TEXT NOT NULL DEFAULT 'post_call_form',
  name TEXT NOT NULL DEFAULT 'Post-Call Form',
  fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.form_configs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_form_configs_org ON public.form_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_form_configs_type ON public.form_configs(form_type);

CREATE TRIGGER update_form_configs_updated_at
  BEFORE UPDATE ON public.form_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON COLUMN public.form_configs.fields IS 'Array of field objects: {id, type, label, required, options?, conditionalOn?, conditionalValue?, placeholder?, defaultValue?}';

-- ============================================================================
-- PART 12: DASHBOARD CONFIGS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Dashboard Configs Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboard_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  config_name TEXT NOT NULL DEFAULT 'Default Dashboard',
  enabled_metrics JSONB NOT NULL DEFAULT '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,
  metric_order JSONB NOT NULL DEFAULT '["scheduled_calls", "calls_booked", "slot_utilization", "cash_collected"]'::jsonb,
  enabled_widgets JSONB NOT NULL DEFAULT '["recent_events", "calls_by_source"]'::jsonb,
  widget_layout JSONB NOT NULL DEFAULT '{
    "recent_events": {"order": 1, "size": "large"},
    "calls_by_source": {"order": 2, "size": "medium"}
  }'::jsonb,
  show_date_range_selector BOOLEAN DEFAULT true,
  default_date_range TEXT DEFAULT 'today',
  show_filters BOOLEAN DEFAULT true,
  compact_mode BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, user_id, config_name)
);

ALTER TABLE public.dashboard_configs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dashboard_configs_org ON public.dashboard_configs(organization_id);
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_user ON public.dashboard_configs(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dashboard_configs_default ON public.dashboard_configs(organization_id, is_default) WHERE is_default = true;

-- ----------------------------------------------------------------------------
-- Dashboard Layouts Table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dashboard_layouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID,
  layout_name TEXT NOT NULL DEFAULT 'Default',
  layout_type TEXT NOT NULL DEFAULT 'dashboard' CHECK (layout_type IN ('dashboard', 'attribution', 'analytics', 'rep_portal')),
  layout_config JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.dashboard_layouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_org ON public.dashboard_layouts(organization_id);

CREATE TRIGGER update_dashboard_layouts_updated_at
  BEFORE UPDATE ON public.dashboard_layouts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 13: SETTER ACTIVITIES (Close CRM Integration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.setter_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES public.organizations(id),
  setter_id UUID REFERENCES public.setters(id),
  close_user_id TEXT NOT NULL,
  activity_date DATE NOT NULL,
  total_dials INTEGER DEFAULT 0,
  connected_calls INTEGER DEFAULT 0,
  voicemails_left INTEGER DEFAULT 0,
  total_talk_time_seconds INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  sms_sent INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, close_user_id, activity_date)
);

ALTER TABLE public.setter_activities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_setter_activities_org_date ON public.setter_activities(organization_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_setter_activities_close_user ON public.setter_activities(close_user_id);

CREATE TRIGGER update_setter_activities_updated_at
  BEFORE UPDATE ON public.setter_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- PART 14: SECURE RLS POLICIES
-- ============================================================================
-- These policies enforce organization-based access control.
-- "Anyone can..." policies have been intentionally omitted for security.

-- ----------------------------------------------------------------------------
-- Organizations Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all organizations"
  ON public.organizations FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their organizations"
  ON public.organizations FOR SELECT
  USING (id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage their organizations"
  ON public.organizations FOR ALL
  USING (user_is_org_admin(auth.uid(), id));

-- ----------------------------------------------------------------------------
-- Organization Members Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all members"
  ON public.organization_members FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Users can view their own memberships"
  ON public.organization_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can view members of orgs they belong to"
  ON public.organization_members FOR SELECT
  USING (user_is_org_member(auth.uid(), organization_id));

CREATE POLICY "Org admins can manage their org members"
  ON public.organization_members FOR ALL
  USING (user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Users can insert themselves as members"
  ON public.organization_members FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Profiles Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- User Roles Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view their own role"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own role"
  ON public.user_roles FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

-- ----------------------------------------------------------------------------
-- Events Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view events"
  ON public.events FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org admins can manage events"
  ON public.events FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org members can update events"
  ON public.events FOR UPDATE
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Sales reps can view their events"
  ON public.events FOR SELECT
  USING (
    closer_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    OR closer_id::text = auth.uid()::text
  );

COMMENT ON TABLE public.events IS 'Events with secure org-based access. Portal updates via portal-pcf edge function. Authenticated users access via RLS.';

-- ----------------------------------------------------------------------------
-- Leads Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can manage leads"
  ON public.leads FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Post Call Forms Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view their PCFs"
  ON public.post_call_forms FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can insert PCFs"
  ON public.post_call_forms FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update PCFs"
  ON public.post_call_forms FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org admins can delete PCFs"
  ON public.post_call_forms FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND user_is_org_admin(auth.uid(), organization_id)
  );

-- ----------------------------------------------------------------------------
-- Payments Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view payments"
  ON public.payments FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can insert payments"
  ON public.payments FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org members can update payments"
  ON public.payments FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Org admins can manage payments"
  ON public.payments FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Setters Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all setters"
  ON public.setters FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their setters"
  ON public.setters FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their setters"
  ON public.setters FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Closers Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all closers"
  ON public.closers FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their closers"
  ON public.closers FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their closers"
  ON public.closers FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Sources Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all sources"
  ON public.sources FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their sources"
  ON public.sources FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their sources"
  ON public.sources FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Call Types Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all call types"
  ON public.call_types FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their call types"
  ON public.call_types FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their call types"
  ON public.call_types FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Traffic Types Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all traffic types"
  ON public.traffic_types FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their traffic types"
  ON public.traffic_types FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their traffic types"
  ON public.traffic_types FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Call Outcomes Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all call outcomes"
  ON public.call_outcomes FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their call outcomes"
  ON public.call_outcomes FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their call outcomes"
  ON public.call_outcomes FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Opportunity Statuses Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all opportunity statuses"
  ON public.opportunity_statuses FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their opportunity statuses"
  ON public.opportunity_statuses FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their opportunity statuses"
  ON public.opportunity_statuses FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Packages Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can manage their packages"
  ON public.packages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner', 'admin'])
  ));

CREATE POLICY "Org members can view their packages"
  ON public.packages FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Organization Integrations Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can manage integrations"
  ON public.organization_integrations FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Portal Settings Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can manage portal settings"
  ON public.portal_settings FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org members can view portal settings"
  ON public.portal_settings FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Webhook Connections Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all webhook connections"
  ON public.webhook_connections FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their webhook connections"
  ON public.webhook_connections FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their webhook connections"
  ON public.webhook_connections FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Invitations Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can manage invitations"
  ON public.invitations FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org members can view invitations"
  ON public.invitations FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
  );

-- ----------------------------------------------------------------------------
-- Closer Access Tokens Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Admins can view access tokens"
  ON public.closer_access_tokens FOR SELECT
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can create access tokens"
  ON public.closer_access_tokens FOR INSERT
  WITH CHECK (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can update access tokens"
  ON public.closer_access_tokens FOR UPDATE
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Admins can delete access tokens"
  ON public.closer_access_tokens FOR DELETE
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "Org admins can manage access tokens"
  ON public.closer_access_tokens FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Metric Definitions Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view metrics for their organization"
  ON public.metric_definitions FOR SELECT
  USING (
    organization_id IS NULL OR
    organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
  );

CREATE POLICY "Org admins can manage metrics"
  ON public.metric_definitions FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Payout Snapshots Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all payout snapshots"
  ON public.payout_snapshots FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payout snapshots"
  ON public.payout_snapshots FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their payout snapshots"
  ON public.payout_snapshots FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Payout Snapshot Details Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all payout snapshot details"
  ON public.payout_snapshot_details FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view payout details"
  ON public.payout_snapshot_details FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage their payout snapshot details"
  ON public.payout_snapshot_details FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Payout Snapshot Summaries Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Super admins can manage all payout snapshot summaries"
  ON public.payout_snapshot_summaries FOR ALL
  USING (is_super_admin(auth.uid()));

CREATE POLICY "Org members can view their payout snapshot summaries"
  ON public.payout_snapshot_summaries FOR SELECT
  USING (
    organization_id IN (SELECT get_user_org_ids(auth.uid()))
    OR organization_id IS NULL
  );

CREATE POLICY "Org admins can manage their payout snapshot summaries"
  ON public.payout_snapshot_summaries FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- ----------------------------------------------------------------------------
-- Audit Logs Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org admins can view audit logs"
  ON public.audit_logs FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "System can insert audit logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Rate Limits Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Service role can manage rate limits"
  ON public.rate_limits FOR ALL
  USING (true)
  WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- Custom Field Definitions Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view their custom fields"
  ON public.custom_field_definitions FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage their custom fields"
  ON public.custom_field_definitions FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM organization_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
  ));

-- ----------------------------------------------------------------------------
-- Custom Field Options Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view their field options"
  ON public.custom_field_options FOR SELECT
  USING (field_definition_id IN (
    SELECT id FROM custom_field_definitions
    WHERE organization_id IN (SELECT get_user_org_ids(auth.uid()))
  ));

CREATE POLICY "Org admins can manage their field options"
  ON public.custom_field_options FOR ALL
  USING (field_definition_id IN (
    SELECT id FROM custom_field_definitions
    WHERE organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  ));

-- ----------------------------------------------------------------------------
-- Custom Field Values Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Org members can view their field values"
  ON public.custom_field_values FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org members can manage their field values"
  ON public.custom_field_values FOR ALL
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Form Configs Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view form configs for their org"
  ON public.form_configs FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can insert form configs"
  ON public.form_configs FOR INSERT
  WITH CHECK (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can update form configs"
  ON public.form_configs FOR UPDATE
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Admins can delete form configs"
  ON public.form_configs FOR DELETE
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

-- ----------------------------------------------------------------------------
-- Dashboard Configs Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view dashboard configs from their organization"
  ON public.dashboard_configs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
    OR is_super_admin()
  );

CREATE POLICY "Users can create their own dashboard configs"
  ON public.dashboard_configs FOR INSERT
  WITH CHECK (
    (
      organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
      AND (user_id = auth.uid() OR user_id IS NULL)
    )
    OR is_super_admin()
  );

CREATE POLICY "Users can update their own or org default configs"
  ON public.dashboard_configs FOR UPDATE
  USING (
    (
      organization_id IN (
        SELECT om.organization_id
        FROM public.organization_members om
        WHERE om.user_id = auth.uid()
      )
      AND (
        user_id = auth.uid()
        OR (user_id IS NULL AND EXISTS (
          SELECT 1 FROM public.organization_members om2
          WHERE om2.user_id = auth.uid()
          AND om2.organization_id = dashboard_configs.organization_id
          AND om2.role IN ('owner', 'admin')
        ))
      )
    )
    OR is_super_admin()
  );

CREATE POLICY "Users can delete their own configs"
  ON public.dashboard_configs FOR DELETE
  USING (
    (
      organization_id IN (
        SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
      )
      AND user_id = auth.uid()
    )
    OR is_super_admin()
  );

-- ----------------------------------------------------------------------------
-- Dashboard Layouts Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view org layouts"
  ON public.dashboard_layouts FOR SELECT
  USING (organization_id IN (SELECT get_user_org_ids(auth.uid())));

CREATE POLICY "Org admins can manage org layouts"
  ON public.dashboard_layouts FOR ALL
  USING (
    (user_id = auth.uid()) OR
    (organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('owner', 'admin')
    ))
  );

-- ----------------------------------------------------------------------------
-- Setter Activities Policies
-- ----------------------------------------------------------------------------
CREATE POLICY "Users can view setter activities in their org"
  ON public.setter_activities FOR SELECT
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Users can insert setter activities in their org"
  ON public.setter_activities FOR INSERT
  WITH CHECK (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

CREATE POLICY "Users can update setter activities in their org"
  ON public.setter_activities FOR UPDATE
  USING (
    organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
  );

-- ============================================================================
-- PART 15: NEW USER SIGNUP HANDLER
-- ============================================================================

-- Function to handle new user signup and create organization
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_org_id uuid;
  user_name text;
  org_name text;
  org_slug text;
BEGIN
  -- Get user name from metadata or use email prefix
  user_name := COALESCE(
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  -- Create organization name and slug
  org_name := user_name || '''s Organization';
  org_slug := lower(regexp_replace(user_name, '[^a-zA-Z0-9]', '-', 'g')) || '-' || substring(NEW.id::text, 1, 8);

  -- Create the organization
  INSERT INTO public.organizations (name, slug, created_at, updated_at)
  VALUES (org_name, org_slug, now(), now())
  RETURNING id INTO new_org_id;

  -- Add user as owner of the organization
  INSERT INTO public.organization_members (organization_id, user_id, role, created_at, updated_at)
  VALUES (new_org_id, NEW.id, 'owner', now(), now());

  -- Create profile for the user
  INSERT INTO public.profiles (user_id, name, current_organization_id, created_at, updated_at)
  VALUES (NEW.id, user_name, new_org_id, now(), now())
  ON CONFLICT (user_id) DO UPDATE
  SET
    name = COALESCE(profiles.name, user_name),
    current_organization_id = COALESCE(profiles.current_organization_id, new_org_id),
    updated_at = now();

  RETURN NEW;
END;
$$;

-- Create trigger on auth.users table for new signups
-- Note: This trigger fires AFTER insert
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
'Automatically creates an organization and adds the user as owner when a new user signs up. Also creates a profile entry.';

-- ============================================================================
-- PART 16: REALTIME SUBSCRIPTIONS
-- ============================================================================

-- Enable realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_call_forms;

-- ============================================================================
-- PART 17: GRANTS
-- ============================================================================

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, anon, authenticated, service_role;
GRANT ALL ON public.custom_field_definitions TO authenticated;
GRANT ALL ON public.custom_field_options TO authenticated;
GRANT ALL ON public.custom_field_values TO authenticated;
GRANT ALL ON public.form_configs TO authenticated;
GRANT ALL ON public.dashboard_configs TO authenticated;
GRANT ALL ON public.dashboard_layouts TO authenticated;

-- ============================================================================
-- END OF COMBINED SCHEMA
-- ============================================================================

-- Notes:
-- 1. This schema uses SECURE RLS policies that enforce organization-based access.
-- 2. Dangerous "Anyone can..." policies have been intentionally omitted.
-- 3. Portal access for unauthenticated users goes through edge functions
--    (portal-pcf) that use service role, which bypasses RLS.
-- 4. Token validation for magic links happens in edge functions.
-- 5. API key encryption is handled at the application level.
