-- Create portal settings table for configuring what sales reps can see
CREATE TABLE public.portal_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  show_booked_calls boolean NOT NULL DEFAULT true,
  show_show_rate boolean NOT NULL DEFAULT true,
  show_close_rate boolean NOT NULL DEFAULT true,
  show_cash_collected boolean NOT NULL DEFAULT true,
  show_upcoming_events boolean NOT NULL DEFAULT true,
  show_overdue_pcfs boolean NOT NULL DEFAULT true,
  show_past_events boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.portal_settings ENABLE ROW LEVEL SECURITY;

-- Admins can manage portal settings
CREATE POLICY "Admins can manage portal settings"
ON public.portal_settings
FOR ALL
USING (is_admin(auth.uid()));

-- Authenticated users can view portal settings
CREATE POLICY "Authenticated users can view portal settings"
ON public.portal_settings
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_portal_settings_updated_at
BEFORE UPDATE ON public.portal_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.portal_settings (id) VALUES (gen_random_uuid());