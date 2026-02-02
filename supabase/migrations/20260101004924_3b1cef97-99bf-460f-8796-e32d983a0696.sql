-- Allow anyone to delete PCFs (for clearing submitted PCFs from Rep Portal)
CREATE POLICY "Allow PCF deletion" 
ON public.post_call_forms 
FOR DELETE 
USING (true);