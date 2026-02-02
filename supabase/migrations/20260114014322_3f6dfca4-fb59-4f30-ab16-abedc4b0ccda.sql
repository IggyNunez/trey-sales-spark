-- Create deal_type enum
CREATE TYPE public.deal_type AS ENUM ('new_deal', 'upsell', 'renewal');

-- Create packages table
CREATE TABLE public.packages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_price NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on packages
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

-- RLS policies for packages
CREATE POLICY "Org admins can manage their packages"
ON public.packages
FOR ALL
USING (organization_id IN (
  SELECT organization_id FROM organization_members
  WHERE user_id = auth.uid() AND role = ANY(ARRAY['owner', 'admin'])
));

CREATE POLICY "Org members can view their packages"
ON public.packages
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Public can view active packages"
ON public.packages
FOR SELECT
USING (is_active = true);

-- Add new columns to payments table
ALTER TABLE public.payments 
ADD COLUMN deal_type public.deal_type,
ADD COLUMN package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
ADD COLUMN contract_value NUMERIC,
ADD COLUMN payment_2_due_date DATE,
ADD COLUMN payment_3_due_date DATE;

-- Create index for faster queries
CREATE INDEX idx_payments_deal_type ON public.payments(deal_type);
CREATE INDEX idx_payments_package_id ON public.payments(package_id);
CREATE INDEX idx_packages_organization_id ON public.packages(organization_id);