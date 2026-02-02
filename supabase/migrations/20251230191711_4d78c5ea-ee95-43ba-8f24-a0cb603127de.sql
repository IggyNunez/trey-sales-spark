-- Create call_outcomes reference table for dropdown options
CREATE TABLE public.call_outcomes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_outcomes ENABLE ROW LEVEL SECURITY;

-- RLS policies for call_outcomes
CREATE POLICY "Admins can manage call outcomes" ON public.call_outcomes FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated users can view call outcomes" ON public.call_outcomes FOR SELECT USING (true);

-- Insert default call outcomes
INSERT INTO public.call_outcomes (name, description, sort_order) VALUES
  ('Closed - Paid in Full', 'Deal closed with full payment collected', 1),
  ('Closed - Split Pay', 'Deal closed with payment plan', 2),
  ('Closed - Deposit', 'Deal closed with deposit collected', 3),
  ('Reschedule Requested', 'Lead requested to reschedule', 4),
  ('Not Interested', 'Lead is not interested', 5),
  ('Needs Follow-up', 'Lead needs additional follow-up', 6),
  ('Wrong Fit', 'Lead is not the right fit for the offer', 7),
  ('No Budget', 'Lead cannot afford the offer', 8),
  ('Spouse/Partner Consultation', 'Lead needs to consult with partner', 9),
  ('Ghosted/No Response', 'Lead stopped responding', 10),
  ('Technical Issues', 'Call had technical difficulties', 11);

-- Create opportunity_statuses reference table
CREATE TABLE public.opportunity_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text,
  color text DEFAULT '#6B7280',
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.opportunity_statuses ENABLE ROW LEVEL SECURITY;

-- RLS policies for opportunity_statuses
CREATE POLICY "Admins can manage opportunity statuses" ON public.opportunity_statuses FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Authenticated users can view opportunity statuses" ON public.opportunity_statuses FOR SELECT USING (true);

-- Insert default opportunity statuses
INSERT INTO public.opportunity_statuses (name, description, color, sort_order) VALUES
  ('Hot Lead', 'High priority, ready to close', '#EF4444', 1),
  ('Warm Lead', 'Interested, needs follow-up', '#F59E0B', 2),
  ('Cold Lead', 'Low priority, may revisit later', '#6B7280', 3),
  ('Nurture', 'Long-term nurture sequence', '#3B82F6', 4),
  ('Dead', 'No longer pursuing', '#1F2937', 5),
  ('Won', 'Closed deal', '#10B981', 6),
  ('Lost', 'Deal lost to competitor or other', '#DC2626', 7);

-- Add new columns to post_call_forms table
ALTER TABLE public.post_call_forms 
ADD COLUMN IF NOT EXISTS call_outcome_id uuid REFERENCES public.call_outcomes(id),
ADD COLUMN IF NOT EXISTS opportunity_status_id uuid REFERENCES public.opportunity_statuses(id),
ADD COLUMN IF NOT EXISTS close_date timestamp with time zone;

-- Create organizations table for multi-team support
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Create organization_members table
CREATE TABLE public.organization_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for organizations
CREATE POLICY "Users can view their organizations" ON public.organizations 
FOR SELECT USING (
  id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org admins can manage their organizations" ON public.organizations 
FOR ALL USING (
  id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- RLS policies for organization_members
CREATE POLICY "Users can view members of their organizations" ON public.organization_members 
FOR SELECT USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org admins can manage members" ON public.organization_members 
FOR ALL USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

CREATE POLICY "Users can insert themselves as members" ON public.organization_members 
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Add organization_id to relevant tables
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS current_organization_id uuid REFERENCES public.organizations(id);

-- Create metric_definitions table for customizable metrics
CREATE TABLE public.metric_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id),
  name text NOT NULL,
  display_name text NOT NULL,
  description text,
  formula_type text NOT NULL DEFAULT 'percentage' CHECK (formula_type IN ('count', 'percentage', 'currency', 'ratio')),
  numerator_field text,
  numerator_conditions jsonb DEFAULT '{}',
  denominator_field text,
  denominator_conditions jsonb DEFAULT '{}',
  include_cancels boolean DEFAULT false,
  include_reschedules boolean DEFAULT false,
  include_no_shows boolean DEFAULT true,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.metric_definitions ENABLE ROW LEVEL SECURITY;

-- RLS policies for metric_definitions
CREATE POLICY "Users can view metrics for their organization" ON public.metric_definitions 
FOR SELECT USING (
  organization_id IS NULL OR 
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid())
);

CREATE POLICY "Org admins can manage metrics" ON public.metric_definitions 
FOR ALL USING (
  organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))
);

-- Insert default metric definitions (global, no org)
INSERT INTO public.metric_definitions (name, display_name, description, formula_type, include_cancels, include_reschedules, include_no_shows, sort_order) VALUES
  ('show_rate', 'Show Rate', 'Percentage of scheduled calls where the lead showed up', 'percentage', false, false, true, 1),
  ('close_rate', 'Close Rate', 'Percentage of showed calls that resulted in a closed deal', 'percentage', false, false, false, 2),
  ('offer_rate', 'Offer Rate', 'Percentage of showed calls where an offer was made', 'percentage', false, false, false, 3),
  ('scheduled_calls', 'Scheduled Calls', 'Total calls scheduled for the selected period', 'count', true, true, true, 4),
  ('booked_calls', 'Calls Booked', 'Total calls booked (by creation date) for the selected period', 'count', true, true, true, 5);

-- Create trigger for updated_at on new tables
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_organization_members_updated_at BEFORE UPDATE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_metric_definitions_updated_at BEFORE UPDATE ON public.metric_definitions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();