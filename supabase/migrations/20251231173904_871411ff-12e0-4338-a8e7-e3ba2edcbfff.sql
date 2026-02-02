-- Add linked_closer_name to profiles for matching sales reps to their events
ALTER TABLE public.profiles ADD COLUMN linked_closer_name text;

-- Create index for faster lookups
CREATE INDEX idx_profiles_linked_closer_name ON public.profiles(linked_closer_name);

-- Add closer_name to invitations so we can set it when they accept
ALTER TABLE public.invitations ADD COLUMN closer_name text;

-- Update RLS policy to also match by linked_closer_name
DROP POLICY IF EXISTS "Sales reps can view their assigned events" ON public.events;
DROP POLICY IF EXISTS "Sales reps can update their assigned events" ON public.events;

-- New policy: Sales reps can view events matching their email OR linked closer name
CREATE POLICY "Sales reps can view their assigned events" 
ON public.events 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND (
      profiles.email = events.closer_email 
      OR profiles.linked_closer_name = events.closer_name
    )
  )
);

-- New policy: Sales reps can update events matching their email OR linked closer name
CREATE POLICY "Sales reps can update their assigned events" 
ON public.events 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE profiles.user_id = auth.uid() 
    AND (
      profiles.email = events.closer_email 
      OR profiles.linked_closer_name = events.closer_name
    )
  )
);