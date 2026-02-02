-- Create webhook_connections table for managing multiple payment processors and integrations
CREATE TABLE public.webhook_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  connection_type TEXT NOT NULL DEFAULT 'whop', -- 'whop', 'stripe', 'calendly', 'crm', 'generic'
  api_key TEXT, -- Optional API key for connections that need it
  webhook_secret TEXT, -- Optional webhook secret for signature verification
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_webhook_at TIMESTAMP WITH TIME ZONE,
  webhook_count INTEGER NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.webhook_connections ENABLE ROW LEVEL SECURITY;

-- Admins can manage connections
CREATE POLICY "Admins can manage webhook connections"
  ON public.webhook_connections
  FOR ALL
  USING (is_admin(auth.uid()));

-- Add updated_at trigger
CREATE TRIGGER update_webhook_connections_updated_at
  BEFORE UPDATE ON public.webhook_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();