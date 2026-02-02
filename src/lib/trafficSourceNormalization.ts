/**
 * Traffic Source Normalization Utility
 * 
 * Provides centralized alias mapping for traffic sources that come from
 * multiple data sources (CRM platform field, UTM parameters) with inconsistent naming.
 * 
 * Example: "IG", "ig", "Instagram", "instagram" all map to "Instagram"
 */

// Canonical name -> all aliases (lowercase)
export const TRAFFIC_SOURCE_ALIASES: Record<string, string[]> = {
  'Instagram': ['instagram', 'ig'],
  'X': ['x', 'twitter'],
  'Facebook': ['facebook', 'fb'],
  'LinkedIn': ['linkedin'],
  'YouTube': ['youtube', 'yt'],
  'TikTok': ['tiktok'],
  'Newsletter': ['newsletter', 'email'],
  'Organic': ['organic'],
  'Referral': ['referral'],
  'Podcast': ['podcast'],
};

/**
 * Get the canonical (display) name for any raw traffic source value.
 * Case-insensitive matching against known aliases.
 * 
 * @param raw - The raw traffic source value from CRM or UTM
 * @returns The canonical name (e.g., "Instagram" for "ig", "IG", "instagram")
 */
export function getCanonicalSource(raw: string): string {
  const normalized = raw.toLowerCase().trim();
  
  for (const [canonical, aliases] of Object.entries(TRAFFIC_SOURCE_ALIASES)) {
    if (aliases.includes(normalized)) {
      return canonical;
    }
  }
  
  // Unknown source - return original with trimmed whitespace
  // Preserve original casing for unknown sources
  return raw.trim();
}

/**
 * Get all aliases for a canonical source name.
 * Used when filtering to match ALL variants of a platform.
 * 
 * @param canonical - The canonical source name (e.g., "Instagram")
 * @returns Array of all aliases (lowercase) for that source
 */
export function getSourceAliases(canonical: string): string[] {
  return TRAFFIC_SOURCE_ALIASES[canonical] || [canonical.toLowerCase()];
}

/**
 * Check if a raw value matches any alias of a canonical source.
 * Case-insensitive comparison.
 * 
 * @param rawValue - The raw value to check
 * @param canonical - The canonical source to match against
 * @returns true if the raw value is an alias of the canonical source
 */
export function matchesCanonicalSource(rawValue: string | null | undefined, canonical: string): boolean {
  if (!rawValue) return false;
  
  const aliases = getSourceAliases(canonical);
  const normalizedValue = rawValue.toLowerCase().trim();
  
  return aliases.includes(normalizedValue);
}
