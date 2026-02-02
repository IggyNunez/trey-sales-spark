-- Create leads table
CREATE TABLE public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  source_id UUID REFERENCES public.sources(id),
  original_setter_name TEXT,
  current_setter_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(email)
);

-- Enable RLS on leads
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Create payment_types enum
CREATE TYPE public.payment_type AS ENUM ('paid_in_full', 'split_pay', 'deposit');

-- Create event_outcome enum
CREATE TYPE public.event_outcome AS ENUM ('no_show', 'showed_no_offer', 'showed_offer_no_close', 'closed');

-- Drop existing events table to recreate with proper structure
DROP TABLE IF EXISTS public.events CASCADE;

-- Recreate events table aligned with new schema
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendly_event_uuid TEXT UNIQUE,
  calendly_invitee_uuid TEXT UNIQUE,
  lead_id UUID REFERENCES public.leads(id),
  call_type_id UUID REFERENCES public.call_types(id),
  source_id UUID REFERENCES public.sources(id),
  traffic_type_id UUID REFERENCES public.traffic_types(id),
  setter_name TEXT,
  closer_id UUID,
  lead_name TEXT NOT NULL,
  lead_email TEXT NOT NULL,
  lead_phone TEXT,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  call_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (call_status IN ('scheduled', 'completed', 'no_show', 'canceled', 'rescheduled')),
  event_outcome event_outcome,
  pcf_submitted BOOLEAN NOT NULL DEFAULT false,
  pcf_submitted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create post_call_forms table
CREATE TABLE public.post_call_forms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id),
  closer_id UUID NOT NULL,
  closer_name TEXT NOT NULL,
  call_occurred BOOLEAN NOT NULL,
  lead_showed BOOLEAN NOT NULL,
  offer_made BOOLEAN NOT NULL,
  deal_closed BOOLEAN NOT NULL,
  cash_collected NUMERIC(12, 2) DEFAULT 0,
  payment_type payment_type,
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on post_call_forms
ALTER TABLE public.post_call_forms ENABLE ROW LEVEL SECURITY;

-- Create payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.events(id),
  lead_id UUID REFERENCES public.leads(id),
  pcf_id UUID REFERENCES public.post_call_forms(id),
  amount NUMERIC(12, 2) NOT NULL,
  payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  refund_amount NUMERIC(12, 2) DEFAULT 0,
  net_revenue NUMERIC(12, 2) GENERATED ALWAYS AS (amount - COALESCE(refund_amount, 0)) STORED,
  payment_type payment_type,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payments
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Create audit_logs table for full auditability
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID,
  user_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for leads
CREATE POLICY "Admins can manage all leads" ON public.leads FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Admins can view all leads" ON public.leads FOR SELECT USING (is_admin(auth.uid()));

-- RLS Policies for events
CREATE POLICY "Admins can manage all events" ON public.events FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Admins can view all events" ON public.events FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Sales reps can view their assigned events" ON public.events FOR SELECT USING (auth.uid() = closer_id);
CREATE POLICY "Sales reps can update their assigned events" ON public.events FOR UPDATE USING (auth.uid() = closer_id);

-- RLS Policies for post_call_forms
CREATE POLICY "Admins can manage all PCFs" ON public.post_call_forms FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Admins can view all PCFs" ON public.post_call_forms FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "Sales reps can view their own PCFs" ON public.post_call_forms FOR SELECT USING (auth.uid() = closer_id);
CREATE POLICY "Sales reps can insert their own PCFs" ON public.post_call_forms FOR INSERT WITH CHECK (auth.uid() = closer_id);

-- RLS Policies for payments
CREATE POLICY "Admins can manage all payments" ON public.payments FOR ALL USING (is_admin(auth.uid()));
CREATE POLICY "Admins can view all payments" ON public.payments FOR SELECT USING (is_admin(auth.uid()));

-- RLS Policies for audit_logs
CREATE POLICY "Admins can view all audit logs" ON public.audit_logs FOR SELECT USING (is_admin(auth.uid()));
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- Create triggers for updated_at
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create audit log trigger function
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

-- Create function to get sales rep role check
CREATE OR REPLACE FUNCTION public.is_sales_rep(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'sales_rep')
$$;

-- Enable realtime for events table
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.post_call_forms;