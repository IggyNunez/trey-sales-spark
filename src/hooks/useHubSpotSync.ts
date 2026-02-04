import { useOrganization } from './useOrganization';

// Trenton organization ID - only org enabled for HubSpot sync
const TRENTON_ORG_ID = 'c208c810-fb8d-4d7a-b592-db2d2868d8ed';

/**
 * Feature flag hook to check if HubSpot sync is enabled for the current organization.
 * Currently only enabled for Trenton organization.
 */
export function useIsHubSpotSyncEnabled(): boolean {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id === TRENTON_ORG_ID;
}

/**
 * Check if an organization ID matches Trenton (for use in non-hook contexts)
 */
export function isHubSpotSyncEnabledForOrg(orgId: string | undefined | null): boolean {
  return orgId === TRENTON_ORG_ID;
}
