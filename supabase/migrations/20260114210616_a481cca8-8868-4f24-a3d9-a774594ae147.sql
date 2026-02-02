-- Fix dangerous RLS policies - Drop public access policies

-- 1. Drop the dangerous "Anyone can validate tokens" policy on closer_access_tokens
DROP POLICY IF EXISTS "Anyone can validate tokens" ON public.closer_access_tokens;

-- 2. Drop the dangerous "Public can view active setters" policy
DROP POLICY IF EXISTS "Public can view active setters" ON public.setters;

-- 3. Drop the "Public can view sources" policy as sources shouldn't be public
DROP POLICY IF EXISTS "Public can view sources" ON public.sources;