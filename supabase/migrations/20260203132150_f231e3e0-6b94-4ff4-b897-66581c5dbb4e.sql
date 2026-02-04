-- Create ai_agent_trials table for tracking trial periods and API keys
CREATE TABLE public.ai_agent_trials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  trial_started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  trial_ends_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + INTERVAL '15 days'),
  custom_api_key_encrypted TEXT,
  preferred_provider TEXT CHECK (preferred_provider IN ('openai', 'gemini', 'claude', NULL)),
  api_calls_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Enable RLS
ALTER TABLE public.ai_agent_trials ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only admin/super_admin can access their own trial records
CREATE POLICY "Users can view their own trial record"
ON public.ai_agent_trials
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid() AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Users can insert their own trial record"
ON public.ai_agent_trials
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid() AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Users can update their own trial record"
ON public.ai_agent_trials
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid() AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  user_id = auth.uid() AND
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
);

-- Trigger for updated_at
CREATE TRIGGER update_ai_agent_trials_updated_at
BEFORE UPDATE ON public.ai_agent_trials
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Index for faster lookups
CREATE INDEX idx_ai_agent_trials_org_user ON public.ai_agent_trials(organization_id, user_id);