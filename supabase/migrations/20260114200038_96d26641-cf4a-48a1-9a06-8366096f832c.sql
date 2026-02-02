-- ============================================
-- FIX: Remove overly permissive public access policies
-- Date: 2026-01-14
-- Issue: Commission/revenue data exposed to public internet
-- ============================================

-- 1. DROP the dangerous public access policies on payout tables
DROP POLICY IF EXISTS "Public can view payout snapshot details" ON public.payout_snapshot_details;

-- 2. DROP the dangerous public access policy on payments
DROP POLICY IF EXISTS "Public can view payments for commissions" ON public.payments;

-- 3. Add comments documenting the security fix
COMMENT ON TABLE public.payout_snapshot_details IS 
  'Payout details with org-scoped RLS. Public policy removed 2026-01-14 for security.';

COMMENT ON TABLE public.payments IS 
  'Payment records with org-scoped RLS. Public policy removed 2026-01-14 for security.';