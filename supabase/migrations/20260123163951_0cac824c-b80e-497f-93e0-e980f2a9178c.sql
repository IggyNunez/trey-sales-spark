-- Add dataset_id to form_definitions for auto-sync
ALTER TABLE public.form_definitions 
ADD COLUMN dataset_id uuid REFERENCES public.datasets(id) ON DELETE SET NULL;

-- Add index for the foreign key
CREATE INDEX idx_form_definitions_dataset_id ON public.form_definitions(dataset_id);

-- Comment for documentation
COMMENT ON COLUMN public.form_definitions.dataset_id IS 'Optional link to a Dataset for auto-syncing form submissions to dashboard widgets';