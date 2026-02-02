-- SECURITY FIX: Remove overly permissive public RLS policies
-- Replace with proper organization-scoped access for authenticated users

-- =============================================================================
-- 1. Fix closers table - Remove public SELECT, keep org-member access
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active closers" ON public.closers;

-- Existing "Org members can view their closers" policy already handles authenticated access

-- =============================================================================
-- 2. Fix opportunity_statuses table - Remove public SELECT
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active opportunity statuses" ON public.opportunity_statuses;

-- Existing "Org members can view their opportunity statuses" policy handles authenticated access

-- =============================================================================
-- 3. Fix packages table - Remove public SELECT
-- =============================================================================

-- Drop the overly permissive public policy
DROP POLICY IF EXISTS "Public can view active packages" ON public.packages;

-- Existing "Org members can view their packages" policy handles authenticated access

-- =============================================================================
-- 4. Document the security changes
-- =============================================================================

COMMENT ON POLICY "Org members can view their closers" ON public.closers IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';

COMMENT ON POLICY "Org members can view their opportunity statuses" ON public.opportunity_statuses IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';

COMMENT ON POLICY "Org members can view their packages" ON public.packages IS 
'Security update 2026-01-16: Replaced public access with org-member-only access';