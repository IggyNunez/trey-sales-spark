-- Add policy to allow public read access to active closers
-- This is needed for the Rep Portal which uses magic link tokens (no auth session)
CREATE POLICY "Public can view active closers" 
ON public.closers 
FOR SELECT 
USING (is_active = true);

-- Also add policy for opportunity_statuses so the PCF form can load status options
CREATE POLICY "Public can view active opportunity statuses" 
ON public.opportunity_statuses 
FOR SELECT 
USING (is_active = true);