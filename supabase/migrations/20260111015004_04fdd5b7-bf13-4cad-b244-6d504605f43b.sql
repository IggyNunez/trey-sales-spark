-- Drop the org-restricted policies
DROP POLICY IF EXISTS "Anyone can insert PCFs with valid org" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update PCFs with valid org" ON public.post_call_forms;
DROP POLICY IF EXISTS "Anyone can update events with valid org" ON public.events;
DROP POLICY IF EXISTS "Anyone can insert payments with valid org" ON public.payments;
DROP POLICY IF EXISTS "Anyone can update payments with valid org" ON public.payments;

-- Create fully open policies for form submission
CREATE POLICY "Anyone can insert PCFs" 
ON public.post_call_forms 
FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can update PCFs" 
ON public.post_call_forms 
FOR UPDATE 
TO public
USING (true);

CREATE POLICY "Anyone can update events" 
ON public.events 
FOR UPDATE 
TO public
USING (true);

CREATE POLICY "Anyone can insert payments" 
ON public.payments 
FOR INSERT 
TO public
WITH CHECK (true);

CREATE POLICY "Anyone can update payments" 
ON public.payments 
FOR UPDATE 
TO public
USING (true);