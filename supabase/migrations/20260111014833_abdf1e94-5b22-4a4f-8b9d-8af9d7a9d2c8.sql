-- Allow anyone to insert payments with valid organization (needed for PCF submission)
CREATE POLICY "Anyone can insert payments with valid org" 
ON public.payments 
FOR INSERT 
TO public
WITH CHECK (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);

-- Allow anyone to update payments with valid organization
CREATE POLICY "Anyone can update payments with valid org" 
ON public.payments 
FOR UPDATE 
TO public
USING (
  organization_id IS NOT NULL 
  AND organization_id IN (SELECT id FROM organizations)
);