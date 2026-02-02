-- Allow authenticated users to view all payments (not just admins)
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;

CREATE POLICY "Authenticated users can view all payments" 
ON public.payments 
FOR SELECT 
USING (auth.uid() IS NOT NULL);