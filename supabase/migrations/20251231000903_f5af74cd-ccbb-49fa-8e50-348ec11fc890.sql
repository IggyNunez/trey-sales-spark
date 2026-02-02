-- Create setters table for dropdown management
CREATE TABLE public.setters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create closers table for dropdown management (separate from user profiles for flexibility)
CREATE TABLE public.closers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  profile_id UUID REFERENCES public.profiles(id),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add setter_id to events
ALTER TABLE public.events ADD COLUMN setter_id UUID REFERENCES public.setters(id);

-- Add setter_id and closer_id to payments for direct attribution
ALTER TABLE public.payments ADD COLUMN setter_id UUID REFERENCES public.setters(id);

-- Enable RLS on new tables
ALTER TABLE public.setters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.closers ENABLE ROW LEVEL SECURITY;

-- RLS policies for setters
CREATE POLICY "Admins can manage setters" ON public.setters
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view setters" ON public.setters
FOR SELECT USING (true);

-- RLS policies for closers
CREATE POLICY "Admins can manage closers" ON public.closers
FOR ALL USING (is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view closers" ON public.closers
FOR SELECT USING (true);