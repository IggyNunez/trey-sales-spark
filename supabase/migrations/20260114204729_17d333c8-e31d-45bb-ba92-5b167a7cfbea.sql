-- Remove the dangerous public SELECT policy on post_call_forms
DROP POLICY IF EXISTS "Public can view PCFs" ON public.post_call_forms;