-- Create rate limits tracking table
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL, -- IP address, org_id, or API key
  endpoint TEXT NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique index for upsert operations
CREATE UNIQUE INDEX idx_rate_limits_identifier_endpoint_window 
ON public.rate_limits (identifier, endpoint, window_start);

-- Create index for cleanup queries
CREATE INDEX idx_rate_limits_window_start ON public.rate_limits (window_start);

-- Enable RLS but allow service role full access
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Policy for service role (edge functions use service role)
CREATE POLICY "Service role can manage rate limits"
ON public.rate_limits
FOR ALL
USING (true)
WITH CHECK (true);

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
  -- Calculate the start of the current time window
  v_window_start := date_trunc('minute', now()) - 
    (EXTRACT(MINUTE FROM now())::INTEGER % p_window_minutes) * INTERVAL '1 minute';
  
  -- Upsert the rate limit record
  INSERT INTO public.rate_limits (identifier, endpoint, request_count, window_start)
  VALUES (p_identifier, p_endpoint, 1, v_window_start)
  ON CONFLICT (identifier, endpoint, window_start)
  DO UPDATE SET request_count = rate_limits.request_count + 1
  RETURNING rate_limits.request_count INTO v_current_count;
  
  -- Return result
  RETURN QUERY SELECT 
    v_current_count <= p_max_requests AS allowed,
    v_current_count AS current_count,
    v_window_start + (p_window_minutes * INTERVAL '1 minute') AS reset_at;
END;
$$;

-- Function to clean up old rate limit records (run periodically)
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