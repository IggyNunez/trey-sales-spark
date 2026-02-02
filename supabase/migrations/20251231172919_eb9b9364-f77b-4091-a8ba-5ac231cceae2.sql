-- Add closer_email column to events table
ALTER TABLE public.events ADD COLUMN closer_email text;

-- Create index for faster email lookups
CREATE INDEX idx_events_closer_email ON public.events(closer_email);

-- Update RLS policy for sales reps to filter by email match
DROP POLICY IF EXISTS "Sales reps can view their assigned events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can update their assigned events" ON public.events;

-- New policy: Sales reps can view events where their profile email matches closer_email
CREATE POLICY "Sales reps can view their assigned events" 
ON public.events 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.email = events.closer_email
  )
);

-- New policy: Sales reps can update events where their profile email matches closer_email
CREATE POLICY "Sales reps can update their assigned events" 
ON public.events 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND profiles.email = events.closer_email
  )
);