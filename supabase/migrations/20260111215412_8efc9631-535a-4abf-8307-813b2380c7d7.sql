-- Create table to store setter activity aggregates from Close CRM
CREATE TABLE public.setter_activities (
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

-- Enable RLS
ALTER TABLE public.setter_activities ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view setter activities in their org"
ON public.setter_activities
FOR SELECT
USING (
  organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
);

CREATE POLICY "Users can insert setter activities in their org"
ON public.setter_activities
FOR INSERT
WITH CHECK (
  organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
);

CREATE POLICY "Users can update setter activities in their org"
ON public.setter_activities
FOR UPDATE
USING (
  organization_id IN (SELECT public.get_user_org_ids(auth.uid()))
);

-- Add trigger for updated_at
CREATE TRIGGER update_setter_activities_updated_at
BEFORE UPDATE ON public.setter_activities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for common queries
CREATE INDEX idx_setter_activities_org_date ON public.setter_activities(organization_id, activity_date);
CREATE INDEX idx_setter_activities_close_user ON public.setter_activities(close_user_id);

-- Also add close_user_id to setters table to map Close users to setters
ALTER TABLE public.setters ADD COLUMN IF NOT EXISTS close_user_id TEXT;