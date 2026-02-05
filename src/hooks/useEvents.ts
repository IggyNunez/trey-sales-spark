import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useOrganization } from './useOrganization';
import { getSourceAliases } from '@/lib/trafficSourceNormalization';

export interface Event {
  id: string;
  calendly_event_uuid: string | null;
  calendly_invitee_uuid: string | null;
  calcom_booking_uid: string | null;
  lead_id: string | null;
  call_type_id: string | null;
  source_id: string | null;
  traffic_type_id: string | null;
  setter_name: string | null;
  closer_id: string | null;
  closer_name: string | null;
  closer_email: string | null;
  lead_name: string;
  lead_email: string;
  lead_phone: string | null;
  scheduled_at: string;
  booked_at: string | null;
  call_status: string;
  event_outcome: string | null;
  pcf_submitted: boolean;
  pcf_submitted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  event_name: string | null;
  organization_id: string | null;
  ghl_contact_id: string | null;
  close_custom_fields: Record<string, string> | null;
  booking_platform: string | null;
  booking_metadata?: {
    utm_platform?: string;
    utm_setter?: string;
    utm_source?: string;
    utm_campaign?: string;
    utm_medium?: string;
    utm_channel?: string;
  } | null;
  booking_responses?: Record<string, unknown> | null;
  source?: { id: string; name: string } | null;
  traffic_type?: { id: string; name: string } | null;
}

export function useEvents(filters?: {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  closerId?: string;
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  callTypeId?: string;
  bookingPlatform?: string;
  trafficSource?: string; // Unified filter: checks both CRM platform AND UTM platform
  closeFieldFilters?: Record<string, string>;
  // UTM field filters for booking_metadata
  utmFilters?: {
    utm_platform?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_channel?: string;
    utm_campaign?: string;
    utm_setter?: string;
  };
  limit?: number;
}) {
  const { user, isAdmin, isCloser, isSetter, isAdminOrAbove, profile } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: [
      'events',
      orgId,
      filters?.startDate?.toISOString(),
      filters?.endDate?.toISOString(),
      filters?.status,
      filters?.closerId,
      filters?.sourceId,
      filters?.sourceIds ? JSON.stringify(filters.sourceIds) : null,
      filters?.trafficTypeId,
      filters?.callTypeId,
      filters?.bookingPlatform,
      filters?.trafficSource,
      filters?.closeFieldFilters ? JSON.stringify(filters.closeFieldFilters) : null,
      filters?.utmFilters ? JSON.stringify(filters.utmFilters) : null,
      filters?.limit,
      user?.id,
      isAdmin,
      isCloser,
      isSetter,
      profile?.linked_closer_name,
      profile?.linked_setter_name,
    ],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select(`
          *,
          source:sources(id, name),
          traffic_type:traffic_types(id, name)
        `)
        .order('scheduled_at', { ascending: false });

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      // Role-based filtering (in addition to RLS at database level)
      // Closers can only see their own events
      if (isCloser && !isAdminOrAbove) {
        const closerName = profile?.linked_closer_name;
        const closerEmail = user?.email;
        if (closerName && closerEmail) {
          query = query.or(`closer_name.eq.${closerName},closer_email.eq.${closerEmail}`);
        } else if (closerName) {
          query = query.eq('closer_name', closerName);
        } else if (closerEmail) {
          query = query.eq('closer_email', closerEmail);
        }
      }

      // Setters can only see events for leads they set
      if (isSetter && !isAdminOrAbove) {
        const setterName = profile?.linked_setter_name;
        if (setterName) {
          query = query.eq('setter_name', setterName);
        }
      }

      // Filter by scheduled_at date range (when the call is slated to take place)
      if (filters?.startDate) {
        query = query.gte('scheduled_at', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        query = query.lte('scheduled_at', filters.endDate.toISOString());
      }
      if (filters?.status) {
        query = query.eq('call_status', filters.status);
      }
      if (filters?.closerId) {
        query = query.eq('closer_id', filters.closerId);
      }
      // Multi-select sources take precedence over single sourceId
      if (filters?.sourceIds && filters.sourceIds.length > 0) {
        query = query.in('source_id', filters.sourceIds);
      } else if (filters?.sourceId) {
        query = query.eq('source_id', filters.sourceId);
      }
      if (filters?.trafficTypeId) {
        query = query.eq('traffic_type_id', filters.trafficTypeId);
      }
      if (filters?.callTypeId) {
        query = query.eq('call_type_id', filters.callTypeId);
      }
      if (filters?.bookingPlatform) {
        query = query.eq('booking_platform', filters.bookingPlatform);
      }
      
      // Apply unified Traffic Source filter - checks BOTH CRM platform AND UTM platform
      // Uses OR logic: matches if either field contains any alias of the selected canonical source
      // Example: selecting "Instagram" matches "ig", "IG", "instagram", "Instagram" in both fields
      if (filters?.trafficSource) {
        const aliases = getSourceAliases(filters.trafficSource);
        
        // Build OR conditions for all aliases across both JSONB fields
        // Using case-insensitive containment by checking all known case variants
        const conditions = aliases.flatMap(alias => [
          // Check exact lowercase match
          `close_custom_fields.cs.{"platform":"${alias}"}`,
          `booking_metadata.cs.{"utm_platform":"${alias}"}`,
          // Check capitalized version (e.g., "Instagram")
          `close_custom_fields.cs.{"platform":"${alias.charAt(0).toUpperCase() + alias.slice(1)}"}`,
          `booking_metadata.cs.{"utm_platform":"${alias.charAt(0).toUpperCase() + alias.slice(1)}"}`,
          // Check uppercase version (e.g., "IG", "X")
          `close_custom_fields.cs.{"platform":"${alias.toUpperCase()}"}`,
          `booking_metadata.cs.{"utm_platform":"${alias.toUpperCase()}"}`
        ]);
        
        query = query.or(conditions.join(','));
      }
      
      // Apply Close CRM custom field filters using JSONB containment operator
      // Skip 'platform' field since it's now handled by trafficSource filter
      if (filters?.closeFieldFilters) {
        Object.entries(filters.closeFieldFilters).forEach(([fieldSlug, value]) => {
          // Skip platform field - it's handled by the unified trafficSource filter
          if (value && fieldSlug !== 'platform') {
            // Use the contains operator for JSONB filtering
            query = query.contains('close_custom_fields', { [fieldSlug]: value });
          }
        });
      }
      
      // Apply UTM field filters on booking_metadata JSONB column
      if (filters?.utmFilters) {
        Object.entries(filters.utmFilters).forEach(([field, value]) => {
          if (value) {
            // Use JSONB containment for exact match on UTM fields
            query = query.contains('booking_metadata', { [field]: value });
          }
        });
      }
      
      // Apply limit if specified, otherwise default to 2000 for performance
      // (Supabase has a 1000 default, but we may need more for accurate counts)
      const effectiveLimit = filters?.limit ?? 2000;
      query = query.limit(effectiveLimit);

      const { data, error } = await query;

      if (error) throw error;
      return data as Event[];
    },
    enabled: !!user && !!orgId,
  });
}

export function useEvent(eventId: string) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['event', eventId, orgId],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('*')
        .eq('id', eventId);

      // CRITICAL: Filter by organization for data isolation
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data as Event | null;
    },
    enabled: !!eventId && !!orgId,
  });
}

export interface ExistingPCF {
  id: string;
  event_id: string;
  closer_id: string;
  closer_name: string;
  lead_showed: boolean;
  offer_made: boolean;
  deal_closed: boolean;
  cash_collected: number | null;
  payment_type: 'paid_in_full' | 'split_pay' | 'deposit' | null;
  notes: string | null;
  opportunity_status_id: string | null;
  close_date: string | null;
}

export function useExistingPCF(eventId: string) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['pcf', eventId, orgId],
    queryFn: async () => {
      let query = supabase
        .from('post_call_forms')
        .select('*')
        .eq('event_id', eventId);

      // CRITICAL: Filter by organization for data isolation
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data, error } = await query.maybeSingle();

      if (error) throw error;
      return data as ExistingPCF | null;
    },
    enabled: !!eventId && !!orgId,
  });
}

export function useMyEvents() {
  const { user, profile, isCloser, isSetter, isAdminOrAbove } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  return useQuery({
    queryKey: ['my-events', user?.id, profile?.email, profile?.linked_closer_name, profile?.linked_setter_name, orgId, isCloser, isSetter],
    queryFn: async () => {
      let query = supabase
        .from('events')
        .select('*')
        .order('scheduled_at', { ascending: false });

      // CRITICAL: Filter by organization for data isolation
      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      // Role-based filtering
      // For closers: filter by closer_name or closer_email
      if (isCloser && !isAdminOrAbove) {
        const closerName = profile?.linked_closer_name;
        const closerEmail = user?.email;
        if (closerName && closerEmail) {
          query = query.or(`closer_name.eq.${closerName},closer_email.eq.${closerEmail}`);
        } else if (closerName) {
          query = query.eq('closer_name', closerName);
        } else if (closerEmail) {
          query = query.eq('closer_email', closerEmail);
        }
      }

      // For setters: filter by setter_name
      if (isSetter && !isAdminOrAbove) {
        const setterName = profile?.linked_setter_name;
        if (setterName) {
          query = query.eq('setter_name', setterName);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Event[];
    },
    enabled: !!user && !!orgId,
  });
}