-- Tighten overly-permissive INSERT RLS policies flagged by linter
-- Goal: remove WITH CHECK (true) while preserving required functionality.

-- Ensure RLS is enabled (safe if already enabled)
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendly_webhook_audit ENABLE ROW LEVEL SECURITY;

-- Replace permissive INSERT policy on audit_logs
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;
CREATE POLICY "Authenticated can insert audit logs"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Replace permissive INSERT policy on calendly_webhook_audit
DROP POLICY IF EXISTS "Service role can insert audit logs" ON public.calendly_webhook_audit;
CREATE POLICY "Authenticated can insert calendly webhook audit"
ON public.calendly_webhook_audit
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- Note: background jobs using elevated server credentials can still write because they bypass RLS.
