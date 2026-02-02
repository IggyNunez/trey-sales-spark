-- Allow anyone to update specific event fields when submitting a PCF
-- This is needed for the Rep Portal where closers use magic links
CREATE POLICY "Allow PCF submission updates to events" 
ON public.events 
FOR UPDATE 
USING (true)
WITH CHECK (true);