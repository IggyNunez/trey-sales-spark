/**
 * Unified Source Extraction Utility
 * 
 * Consolidates three different sources of "platform/source" data into one
 * unified value with priority-based fallback:
 * 
 * 1. UTM Platform (booking_metadata.utm_platform) - most accurate, captured at booking
 * 2. CRM Custom Field (close_custom_fields.platform) - from Close CRM sync
 * 3. Source Table (source.name) - only if it matches a known platform name
 */

import { getCanonicalSource, TRAFFIC_SOURCE_ALIASES } from './trafficSourceNormalization';

// Known platforms from the alias mapping
const KNOWN_PLATFORMS = Object.keys(TRAFFIC_SOURCE_ALIASES);

export type SourceOrigin = 'utm' | 'crm_field' | 'crm_source' | null;

export interface UnifiedSource {
  value: string | null;
  origin: SourceOrigin;
}

/**
 * Extract the best available source/platform value from an event,
 * using a priority chain with alias normalization.
 */
export function getUnifiedSource(event: {
  booking_metadata?: { utm_platform?: string } | Record<string, unknown> | null;
  close_custom_fields?: { platform?: string } | Record<string, unknown> | null;
  source?: { name: string } | null;
}): UnifiedSource {
  // Priority 1: UTM platform (most accurate - captured at booking)
  const utmPlatform = (event.booking_metadata as Record<string, unknown> | null)?.utm_platform;
  if (utmPlatform && typeof utmPlatform === 'string' && utmPlatform.trim()) {
    return { value: getCanonicalSource(utmPlatform), origin: 'utm' };
  }
  
  // Priority 2: CRM custom field platform
  const crmPlatform = (event.close_custom_fields as Record<string, unknown> | null)?.platform;
  if (crmPlatform && typeof crmPlatform === 'string' && crmPlatform.trim()) {
    return { value: getCanonicalSource(crmPlatform), origin: 'crm_field' };
  }
  
  // Priority 3: Source table (only if it matches a known platform)
  const sourceName = event.source?.name;
  if (sourceName) {
    const canonical = getCanonicalSource(sourceName);
    // Only use source table if it's a recognized platform name
    if (KNOWN_PLATFORMS.includes(canonical)) {
      return { value: canonical, origin: 'crm_source' };
    }
  }
  
  return { value: null, origin: null };
}

/**
 * Get a human-readable label for the source origin.
 */
export function getOriginLabel(origin: SourceOrigin): string {
  switch (origin) {
    case 'utm': return 'UTM Link';
    case 'crm_field': return 'CRM Field';
    case 'crm_source': return 'Lead Source';
    default: return 'Unknown';
  }
}
