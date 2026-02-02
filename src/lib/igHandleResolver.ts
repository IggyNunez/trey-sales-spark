/**
 * Instagram Handle Resolution Utility
 * 
 * Cross-references IGHANDLE from booking responses with known setter aliases
 * to provide attribution even when utm_setter is missing.
 */

/**
 * Normalize Instagram handle by removing @ and converting to lowercase
 */
function normalizeHandle(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase().trim();
}

/**
 * Cross-references IGHANDLE with known setter Instagram handles
 * Returns matched setter name or null
 * 
 * @param igHandle - The Instagram handle from booking responses
 * @param setterAliasMap - Map of lowercase alias → canonical name
 * @returns The canonical setter name if matched, null otherwise
 */
export function resolveIgHandle(
  igHandle: string | undefined | null,
  setterAliasMap: Map<string, string>
): string | null {
  if (!igHandle) return null;
  
  const normalized = normalizeHandle(igHandle);
  if (!normalized) return null;
  
  // Direct match against aliases (some orgs add IG handles as aliases)
  if (setterAliasMap.has(normalized)) {
    return setterAliasMap.get(normalized)!;
  }
  
  // Check if any alias contains the handle or vice versa
  for (const [alias, canonical] of setterAliasMap.entries()) {
    const normalizedAlias = alias.toLowerCase();
    if (normalizedAlias.includes(normalized) || normalized.includes(normalizedAlias)) {
      return canonical;
    }
  }
  
  return null;
}

/**
 * Extract IGHANDLE from booking responses with various key formats
 */
export function extractIgHandle(bookingResponses: Record<string, unknown> | null): string | undefined {
  if (!bookingResponses) return undefined;
  
  // Try various key formats Cal.com might use
  const handle = bookingResponses.IGHANDLE || 
                 bookingResponses.ighandle ||
                 bookingResponses['IG Handle'] ||
                 bookingResponses['ig_handle'] ||
                 bookingResponses.instagram_handle;
  
  return typeof handle === 'string' ? handle : undefined;
}
