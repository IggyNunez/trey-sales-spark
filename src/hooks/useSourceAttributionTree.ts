import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { useSetterAliasMap } from './useSetterAliases';
import { getCanonicalSource } from '@/lib/trafficSourceNormalization';
import { resolveSetterName } from '@/lib/identityResolver';
import { resolveIgHandle, extractIgHandle } from '@/lib/igHandleResolver';

export type AttributionSource = 'utm' | 'crm' | 'quiz' | 'ighandle' | 'none';

export interface TreeNode {
  id: string;
  label: string;
  level: 'platform' | 'channel' | 'setter' | 'capitalTier';
  total: number;
  showed: number;
  closed: number;
  showRate: number;
  closeRate: number;
  children?: TreeNode[];
  attributionSource?: AttributionSource;
  // For filtering in drill-down
  platform?: string;
  channel?: string;
  setter?: string;
  capitalTier?: string;
}

export interface UseSourceAttributionTreeResult {
  tree: TreeNode[];
  summary: {
    withAttribution: number;
    withoutAttribution: number;
    coveragePercent: number;
    total: number;
  };
  platforms: string[];
  channels: string[];
  setters: string[];
  capitalTiers: string[];
  isLoading: boolean;
}

interface UseSourceAttributionTreeParams {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  platformFilter?: string;
  channelFilter?: string;
  setterFilter?: string;
  capitalTierFilter?: string;
  showCapitalTiers?: boolean;
}

/**
 * Detects if a lead came from the quiz funnel
 */
function detectQuizFunnel(bookingResponses: Record<string, unknown> | null): boolean {
  if (!bookingResponses) return false;
  return !!(bookingResponses.quiz_email || bookingResponses['quiz email'] || bookingResponses.quizEmail);
}

/**
 * Extracts capital tier from booking responses
 */
function extractCapitalTier(bookingResponses: Record<string, unknown> | null): string {
  if (!bookingResponses) return '(unknown)';
  
  const tier = (bookingResponses.capital_question as string) ||
               (bookingResponses['Long capital question'] as string) ||
               (bookingResponses.capitalQuestion as string) ||
               (bookingResponses['Capital Question'] as string);
  
  return tier?.trim() || '(unknown)';
}

export function useSourceAttributionTree({
  startDate,
  endDate,
  bookingPlatform,
  platformFilter,
  channelFilter,
  setterFilter,
  capitalTierFilter,
  showCapitalTiers = false,
}: UseSourceAttributionTreeParams): UseSourceAttributionTreeResult {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { aliasMap, isLoading: aliasLoading } = useSetterAliasMap();

  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['source-attribution-events', orgId, startDate?.toISOString(), endDate?.toISOString(), bookingPlatform],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`
          id,
          event_outcome,
          booking_metadata,
          booking_responses,
          close_custom_fields,
          setter_name,
          booking_platform,
          scheduled_at
        `)
        .eq('organization_id', orgId!)
        .not('call_status', 'in', '("canceled","rescheduled")');

      if (startDate) query = query.gte('scheduled_at', startDate.toISOString());
      if (endDate) query = query.lte('scheduled_at', endDate.toISOString());
      if (bookingPlatform) query = query.eq('booking_platform', bookingPlatform);

      const { data, error } = await query.limit(5000);
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && !!orgId,
  });

  const result = useMemo(() => {
    if (!events) {
      return {
        tree: [],
        summary: { withAttribution: 0, withoutAttribution: 0, coveragePercent: 0, total: 0 },
        platforms: [],
        channels: [],
        setters: [],
        capitalTiers: [],
      };
    }

    // Extract and aggregate data
    type AggKey = { platform: string; channel: string; setter: string; capitalTier: string; attributionSource: AttributionSource };
    const aggregates = new Map<string, { key: AggKey; total: number; showed: number; closed: number }>();

    const allPlatforms = new Set<string>();
    const allChannels = new Set<string>();
    const allSetters = new Set<string>();
    const allCapitalTiers = new Set<string>();

    let withAttribution = 0;
    let withoutAttribution = 0;

    for (const event of events) {
      const metadata = event.booking_metadata as Record<string, unknown> | null;
      const customFields = event.close_custom_fields as Record<string, unknown> | null;
      const bookingResponses = event.booking_responses as Record<string, unknown> | null;

      // Detect quiz funnel
      const isQuizFunnel = detectQuizFunnel(bookingResponses);
      
      // Extract platform with priority: UTM > Quiz > CRM > None
      const utmPlatform = metadata?.utm_platform as string | undefined;
      const crmPlatform = customFields?.platform as string | undefined;
      
      let platform: string;
      let attributionSource: AttributionSource;
      
      if (utmPlatform) {
        platform = getCanonicalSource(utmPlatform);
        attributionSource = 'utm';
      } else if (isQuizFunnel) {
        platform = 'Quiz Funnel';
        attributionSource = 'quiz';
      } else if (crmPlatform) {
        platform = getCanonicalSource(crmPlatform);
        attributionSource = 'crm';
      } else {
        platform = '(No Attribution)';
        attributionSource = 'none';
      }

      // Extract channel
      const rawChannel = metadata?.utm_channel as string | undefined;
      const channel = rawChannel?.trim() || '(none)';

      // Extract setter with IGHANDLE fallback
      const igHandle = extractIgHandle(bookingResponses);
      const igResolvedSetter = resolveIgHandle(igHandle, aliasMap);
      
      const rawSetter = (metadata?.utm_setter as string) || 
                        event.setter_name || 
                        igResolvedSetter;
      const setter = resolveSetterName(rawSetter, aliasMap) || '(unattributed)';
      
      // Track if setter came from IGHANDLE
      if (!metadata?.utm_setter && !event.setter_name && igResolvedSetter && attributionSource === 'none') {
        attributionSource = 'ighandle';
      }

      // Extract capital tier
      const capitalTier = extractCapitalTier(bookingResponses);

      // Track attribution coverage
      if (platform !== '(No Attribution)') {
        withAttribution++;
      } else {
        withoutAttribution++;
      }

      // Collect unique values for filters
      if (platform !== '(No Attribution)') allPlatforms.add(platform);
      if (channel !== '(none)') allChannels.add(channel);
      if (setter !== '(unattributed)') allSetters.add(setter);
      if (capitalTier !== '(unknown)') allCapitalTiers.add(capitalTier);

      // Build aggregation key
      const keyStr = showCapitalTiers 
        ? `${platform}|${channel}|${setter}|${capitalTier}`
        : `${platform}|${channel}|${setter}`;
      const existing = aggregates.get(keyStr);

      const isShowed = ['showed_no_offer', 'showed_offer_no_close', 'closed'].includes(event.event_outcome || '');
      const isClosed = event.event_outcome === 'closed';

      if (existing) {
        existing.total++;
        if (isShowed) existing.showed++;
        if (isClosed) existing.closed++;
      } else {
        aggregates.set(keyStr, {
          key: { platform, channel, setter, capitalTier, attributionSource },
          total: 1,
          showed: isShowed ? 1 : 0,
          closed: isClosed ? 1 : 0,
        });
      }
    }

    // Build tree structure
    const tree = buildTree(aggregates, {
      platformFilter,
      channelFilter,
      setterFilter,
      capitalTierFilter,
      showCapitalTiers,
    });

    const total = events.length;
    const coveragePercent = total > 0 ? Math.round((withAttribution / total) * 100) : 0;

    return {
      tree,
      summary: { withAttribution, withoutAttribution, coveragePercent, total },
      platforms: Array.from(allPlatforms).sort(),
      channels: Array.from(allChannels).sort(),
      setters: Array.from(allSetters).sort(),
      capitalTiers: Array.from(allCapitalTiers).sort(),
    };
  }, [events, aliasMap, platformFilter, channelFilter, setterFilter, capitalTierFilter, showCapitalTiers]);

  return {
    ...result,
    isLoading: eventsLoading || aliasLoading,
  };
}

interface BuildTreeOptions {
  platformFilter?: string;
  channelFilter?: string;
  setterFilter?: string;
  capitalTierFilter?: string;
  showCapitalTiers?: boolean;
}

function buildTree(
  aggregates: Map<string, { key: { platform: string; channel: string; setter: string; capitalTier: string; attributionSource: AttributionSource }; total: number; showed: number; closed: number }>,
  options: BuildTreeOptions
): TreeNode[] {
  const { platformFilter, channelFilter, setterFilter, capitalTierFilter, showCapitalTiers } = options;

  // Build hierarchical map: platform -> channel -> setter -> capitalTier
  type CapitalTierData = { total: number; showed: number; closed: number; attributionSource: AttributionSource };
  type SetterMap = Map<string, Map<string, CapitalTierData>>;
  type ChannelMap = Map<string, SetterMap>;
  type PlatformMap = Map<string, { channels: ChannelMap; attributionSource: AttributionSource }>;

  const platformMap: PlatformMap = new Map();

  for (const agg of aggregates.values()) {
    const { platform, channel, setter, capitalTier, attributionSource } = agg.key;

    if (!platformMap.has(platform)) {
      platformMap.set(platform, { channels: new Map(), attributionSource });
    }
    const platformData = platformMap.get(platform)!;
    const channelMap = platformData.channels;

    if (!channelMap.has(channel)) {
      channelMap.set(channel, new Map());
    }
    const setterMap = channelMap.get(channel)!;

    if (!setterMap.has(setter)) {
      setterMap.set(setter, new Map());
    }
    const tierMap = setterMap.get(setter)!;

    tierMap.set(capitalTier, { 
      total: agg.total, 
      showed: agg.showed, 
      closed: agg.closed,
      attributionSource,
    });
  }

  // Convert to tree nodes
  const tree: TreeNode[] = [];

  for (const [platform, platformData] of platformMap.entries()) {
    // Apply platform filter
    if (platformFilter && platformFilter !== 'all' && platform !== platformFilter) continue;

    const platformNode: TreeNode = {
      id: `platform-${platform}`,
      label: platform,
      level: 'platform',
      total: 0,
      showed: 0,
      closed: 0,
      showRate: 0,
      closeRate: 0,
      platform,
      attributionSource: platformData.attributionSource,
      children: [],
    };

    for (const [channel, setterMap] of platformData.channels.entries()) {
      // Apply channel filter
      if (channelFilter && channelFilter !== 'all' && channel !== channelFilter) continue;

      const channelNode: TreeNode = {
        id: `channel-${platform}-${channel}`,
        label: channel,
        level: 'channel',
        total: 0,
        showed: 0,
        closed: 0,
        showRate: 0,
        closeRate: 0,
        platform,
        channel,
        children: [],
      };

      for (const [setter, tierMap] of setterMap.entries()) {
        // Apply setter filter
        if (setterFilter && setterFilter !== 'all' && setter !== setterFilter) continue;

        const setterNode: TreeNode = {
          id: `setter-${platform}-${channel}-${setter}`,
          label: setter,
          level: 'setter',
          total: 0,
          showed: 0,
          closed: 0,
          showRate: 0,
          closeRate: 0,
          platform,
          channel,
          setter,
          children: showCapitalTiers ? [] : undefined,
        };

        for (const [capitalTier, metrics] of tierMap.entries()) {
          // Apply capital tier filter
          if (capitalTierFilter && capitalTierFilter !== 'all' && capitalTier !== capitalTierFilter) continue;

          if (showCapitalTiers) {
            const tierNode: TreeNode = {
              id: `tier-${platform}-${channel}-${setter}-${capitalTier}`,
              label: capitalTier,
              level: 'capitalTier',
              total: metrics.total,
              showed: metrics.showed,
              closed: metrics.closed,
              showRate: metrics.total > 0 ? Math.round((metrics.showed / metrics.total) * 100) : 0,
              closeRate: metrics.showed > 0 ? Math.round((metrics.closed / metrics.showed) * 100) : 0,
              platform,
              channel,
              setter,
              capitalTier,
            };

            setterNode.children!.push(tierNode);
          }

          setterNode.total += metrics.total;
          setterNode.showed += metrics.showed;
          setterNode.closed += metrics.closed;
        }

        // Skip empty setter nodes after filtering
        if (showCapitalTiers && setterNode.children!.length === 0) continue;
        if (!showCapitalTiers && setterNode.total === 0) continue;

        // Sort capital tiers by total descending
        if (showCapitalTiers) {
          setterNode.children!.sort((a, b) => b.total - a.total);
        }

        // Calculate setter rates
        setterNode.showRate = setterNode.total > 0 ? Math.round((setterNode.showed / setterNode.total) * 100) : 0;
        setterNode.closeRate = setterNode.showed > 0 ? Math.round((setterNode.closed / setterNode.showed) * 100) : 0;

        channelNode.children!.push(setterNode);
        channelNode.total += setterNode.total;
        channelNode.showed += setterNode.showed;
        channelNode.closed += setterNode.closed;
      }

      // Skip empty channel nodes after filtering
      if (channelNode.children!.length === 0) continue;

      // Sort setters by total descending
      channelNode.children!.sort((a, b) => b.total - a.total);

      // Calculate channel rates
      channelNode.showRate = channelNode.total > 0 ? Math.round((channelNode.showed / channelNode.total) * 100) : 0;
      channelNode.closeRate = channelNode.showed > 0 ? Math.round((channelNode.closed / channelNode.showed) * 100) : 0;

      platformNode.children!.push(channelNode);
      platformNode.total += channelNode.total;
      platformNode.showed += channelNode.showed;
      platformNode.closed += channelNode.closed;
    }

    // Skip empty platform nodes after filtering
    if (platformNode.children!.length === 0) continue;

    // Sort channels - (none) at bottom
    platformNode.children!.sort((a, b) => {
      if (a.label === '(none)') return 1;
      if (b.label === '(none)') return -1;
      return b.total - a.total;
    });

    // Calculate platform rates
    platformNode.showRate = platformNode.total > 0 ? Math.round((platformNode.showed / platformNode.total) * 100) : 0;
    platformNode.closeRate = platformNode.showed > 0 ? Math.round((platformNode.closed / platformNode.showed) * 100) : 0;

    tree.push(platformNode);
  }

  // Sort platforms by total descending, special entries at bottom
  tree.sort((a, b) => {
    if (a.label === '(No Attribution)') return 1;
    if (b.label === '(No Attribution)') return -1;
    if (a.label === 'Quiz Funnel') return -0.5; // Quiz funnel near top but after main sources
    if (b.label === 'Quiz Funnel') return 0.5;
    return b.total - a.total;
  });

  return tree;
}
