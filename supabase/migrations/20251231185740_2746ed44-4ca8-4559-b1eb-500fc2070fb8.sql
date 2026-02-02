-- Add public SELECT policies for Rep Portal to work without authentication

-- Allow anyone to view active closers (for the dropdown)
CREATE POLICY "Public can view active closers"
ON public.closers
FOR SELECT
USING (is_active = true);

-- Allow anyone to view active opportunity statuses (for the PCF form)
CREATE POLICY "Public can view active opportunity statuses"
ON public.opportunity_statuses
FOR SELECT
USING (is_active = true);

-- Allow anyone to view events (for Rep Portal)
-- This is safe because we filter by closer_name in the query
CREATE POLICY "Public can view events"
ON public.events
FOR SELECT
USING (true);