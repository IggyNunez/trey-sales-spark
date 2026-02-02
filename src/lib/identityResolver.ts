/**
 * Identity Resolution Utility
 * 
 * Single source of truth for name resolution across the system.
 * Used by:
 * - useSetterLeaderboard (Setter metrics)
 * - useUtmSetterMetrics (Attribution tab)
 * - LeadJourneySheet (Journey path display)
 * - useClosersByPlatform (Closer metrics)
 */

// Patterns to filter as junk data - these are not real setter names
const JUNK_PATTERNS = [
  /^user_[a-zA-Z0-9]+$/i,    // User tokens like "user_3TFV70v3..."
  /^[a-z]{1,2}$/i,            // Single letters like "x", "ig"
  /^[0-9]+$/,                 // Pure numeric IDs
  /^utm_/i,                   // UTM parameter prefixes mistakenly stored
  /^https?:\/\//i,            // URLs
];

/**
 * Check if a setter name is junk data that should be filtered
 */
export function isJunkSetterName(name: string): boolean {
  if (!name || name.trim() === '') return true;
  const trimmed = name.trim();
  return JUNK_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Convert a string to title case (e.g., "jack hanson" -> "Jack Hanson")
 */
export function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Resolve a setter name using the alias map
 * 
 * @param rawName - The raw setter name from the event
 * @param aliases - Map of lowercase alias → canonical name
 * @returns The canonical name, or null if junk data
 */
export function resolveSetterName(
  rawName: string | null | undefined,
  aliases: Map<string, string>
): string | null {
  if (!rawName) return null;
  
  const trimmed = rawName.trim();
  if (!trimmed) return null;
  
  // Step 1: Filter junk data
  if (isJunkSetterName(trimmed)) return null;
  
  const lowerName = trimmed.toLowerCase();
  
  // Step 2: Check alias map
  if (aliases.has(lowerName)) {
    return aliases.get(lowerName)!;
  }
  
  // Step 3: Return original with consistent formatting
  // If no alias exists, return as-is (preserving original casing)
  return trimmed;
}

/**
 * Resolve a closer display name
 * 
 * @param rawName - The raw closer name from the event
 * @param closerDisplayNames - Map of email/name → display_name
 * @returns The display name to show in UI
 */
export function resolveCloserDisplayName(
  rawName: string | null | undefined,
  closerEmail: string | null | undefined,
  closerDisplayNames: Map<string, string>
): string | null {
  if (!rawName && !closerEmail) return null;
  
  // First try email lookup (more reliable)
  if (closerEmail) {
    const displayName = closerDisplayNames.get(closerEmail.toLowerCase());
    if (displayName) return displayName;
  }
  
  // Then try name lookup
  if (rawName) {
    const displayName = closerDisplayNames.get(rawName.toLowerCase());
    if (displayName) return displayName;
  }
  
  // Fallback to raw name
  return rawName || null;
}

/**
 * Build a setter alias map from database records
 */
export function buildAliasMap(
  aliases: Array<{ alias_name: string; canonical_name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const alias of aliases) {
    map.set(alias.alias_name.toLowerCase(), alias.canonical_name);
  }
  return map;
}

/**
 * Build a closer display name map from database records
 */
export function buildCloserDisplayNameMap(
  closers: Array<{ name: string; email?: string | null; display_name?: string | null }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const closer of closers) {
    const displayName = closer.display_name || closer.name;
    // Add by name
    map.set(closer.name.toLowerCase(), displayName);
    // Add by email if available
    if (closer.email) {
      map.set(closer.email.toLowerCase(), displayName);
    }
  }
  return map;
}
