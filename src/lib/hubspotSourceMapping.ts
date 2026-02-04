/**
 * Maps HubSpot analytics source values to canonical display names
 * that match the existing traffic source normalization system.
 */

// HubSpot hs_analytics_source values -> Display names
const HUBSPOT_SOURCE_MAP: Record<string, string> = {
  // Social sources
  'ORGANIC_SOCIAL': 'Social (Organic)',
  'PAID_SOCIAL': 'Social (Paid)',
  'SOCIAL_MEDIA': 'Social Media',
  
  // Search sources
  'ORGANIC_SEARCH': 'Search (Organic)',
  'PAID_SEARCH': 'Search (Paid)',
  
  // Direct & referral
  'DIRECT_TRAFFIC': 'Direct',
  'REFERRALS': 'Referral',
  
  // Marketing channels
  'EMAIL_MARKETING': 'Email',
  'OTHER_CAMPAIGNS': 'Other Campaign',
  
  // Other
  'OFFLINE': 'Offline',
  'INTEGRATIONS': 'Integration',
  'UNKNOWN': 'Unknown',
};

// HubSpot hs_analytics_source_data_1 values -> Platform names
// These are the detailed source breakdowns
const HUBSPOT_SOURCE_DETAIL_MAP: Record<string, string> = {
  // Social platforms
  'facebook': 'Facebook',
  'instagram': 'Instagram',
  'twitter': 'X',
  'linkedin': 'LinkedIn',
  'youtube': 'YouTube',
  'tiktok': 'TikTok',
  'pinterest': 'Pinterest',
  'reddit': 'Reddit',
  'snapchat': 'Snapchat',
  'whatsapp': 'WhatsApp',
  'threads': 'Threads',
  // Search engines
  'google': 'Google',
  'bing': 'Bing',
  'yahoo': 'Yahoo',
  'duckduckgo': 'DuckDuckGo',
  // Email providers
  'gmail': 'Gmail',
  'outlook': 'Outlook',
  // Ad platforms
  'google ads': 'Google Ads',
  'facebook ads': 'Facebook Ads',
  'meta ads': 'Meta Ads',
};

/**
 * Get canonical source name from HubSpot analytics source
 */
export function mapHubSpotSource(source: string | null | undefined): string | null {
  if (!source) return null;
  
  const normalized = source.toUpperCase().trim();
  return HUBSPOT_SOURCE_MAP[normalized] || source;
}

/**
 * Get platform name from HubSpot source detail
 */
export function mapHubSpotSourceDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  
  const normalized = detail.toLowerCase().trim();
  return HUBSPOT_SOURCE_DETAIL_MAP[normalized] || detail;
}

/**
 * Get the best available source from HubSpot properties
 * Priority: source_data_1 (specific platform) > source (general category)
 */
export function getBestHubSpotSource(
  hubspotFields: {
    hs_analytics_source?: string | null;
    hs_analytics_source_data_1?: string | null;
  } | null | undefined
): string | null {
  if (!hubspotFields) return null;
  
  // Prefer the detailed source (platform-specific)
  if (hubspotFields.hs_analytics_source_data_1) {
    const detail = mapHubSpotSourceDetail(hubspotFields.hs_analytics_source_data_1);
    if (detail) return detail;
  }
  
  // Fall back to general source category
  if (hubspotFields.hs_analytics_source) {
    return mapHubSpotSource(hubspotFields.hs_analytics_source);
  }
  
  return null;
}

/**
 * Format HubSpot lifecycle stage for display
 */
export function formatLifecycleStage(stage: string | null | undefined): string {
  if (!stage) return 'Unknown';
  
  const stageMap: Record<string, string> = {
    'subscriber': 'Subscriber',
    'lead': 'Lead',
    'marketingqualifiedlead': 'Marketing Qualified',
    'salesqualifiedlead': 'Sales Qualified',
    'opportunity': 'Opportunity',
    'customer': 'Customer',
    'evangelist': 'Evangelist',
    'other': 'Other',
  };
  
  return stageMap[stage.toLowerCase()] || stage;
}

/**
 * Format HubSpot lead status for display
 */
export function formatLeadStatus(status: string | null | undefined): string {
  if (!status) return 'Unknown';
  
  const statusMap: Record<string, string> = {
    'new': 'New',
    'open': 'Open',
    'in_progress': 'In Progress',
    'open_deal': 'Open Deal',
    'unqualified': 'Unqualified',
    'attempted_to_contact': 'Attempted Contact',
    'connected': 'Connected',
    'bad_timing': 'Bad Timing',
  };
  
  return statusMap[status.toLowerCase()] || status;
}
