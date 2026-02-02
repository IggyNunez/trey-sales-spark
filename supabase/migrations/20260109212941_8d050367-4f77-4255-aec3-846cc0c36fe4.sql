-- Add email column to setters table
ALTER TABLE public.setters ADD COLUMN email text;

-- Add email column to closers table
ALTER TABLE public.closers ADD COLUMN email text;