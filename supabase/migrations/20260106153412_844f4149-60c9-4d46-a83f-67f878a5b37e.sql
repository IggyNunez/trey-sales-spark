-- Add public SELECT policy for payout_snapshot_details so token-based access works
CREATE POLICY "Public can view payout snapshot details"
ON public.payout_snapshot_details
FOR SELECT
USING (true);

-- Add public SELECT policy for setters (closers already has one)
CREATE POLICY "Public can view active setters"
ON public.setters
FOR SELECT
USING (is_active = true);

-- Add public SELECT policy for sources
CREATE POLICY "Public can view sources"
ON public.sources
FOR SELECT
USING (true);