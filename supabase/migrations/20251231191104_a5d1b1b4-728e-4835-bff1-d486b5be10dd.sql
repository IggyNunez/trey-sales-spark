-- Allow sales reps to update their own PCFs
CREATE POLICY "Sales reps can update their own PCFs"
ON public.post_call_forms
FOR UPDATE
USING (auth.uid() = closer_id);

-- Allow public to insert PCFs (for unauthenticated rep portal)
CREATE POLICY "Public can insert PCFs"
ON public.post_call_forms
FOR INSERT
WITH CHECK (true);

-- Allow public to update PCFs by closer_name (for unauthenticated rep portal)
CREATE POLICY "Public can update PCFs by closer name"
ON public.post_call_forms
FOR UPDATE
USING (true);

-- Allow public to view PCFs (for unauthenticated rep portal editing)
CREATE POLICY "Public can view PCFs"
ON public.post_call_forms
FOR SELECT
USING (true);