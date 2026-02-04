/**
 * Shared event filtering utilities to ensure consistent filter behavior across hooks
 * 
 * Key pattern: Use OR fallback for closer filtering (id OR name) to handle
 * the fact that closer_id is often null while closer_name is populated
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface CloserFilter {
  id: string;
  name: string;
}

export interface EventFilterParams {
  startDate?: Date;
  endDate?: Date;
  status?: string;
  closerId?: string;
  closerName?: string;
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  callTypeId?: string;
  bookingPlatform?: string;
}

/**
 * Apply standard event filters to a Supabase query
 * Uses OR fallback for closer filtering when both id and name are provided
 */
export function applyEventFilters<T extends { eq: Function; in: Function; gte: Function; lte: Function; or: Function; ilike: Function }>(
  query: T,
  params: EventFilterParams
): T {
  let q = query;

  // Date range filters
  if (params.startDate) {
    q = q.gte('scheduled_at', params.startDate.toISOString());
  }
  if (params.endDate) {
    q = q.lte('scheduled_at', params.endDate.toISOString());
  }

  // Status filter
  if (params.status) {
    q = q.eq('call_status', params.status);
  }

  // CLOSER FILTER: Use OR fallback (id OR name) to handle null closer_id rows
  // This is the key fix - we match on EITHER closer_id OR closer_name
  if (params.closerId && params.closerName) {
    // If we have both, use OR logic to catch rows with null closer_id
    q = q.or(`closer_id.eq.${params.closerId},closer_name.ilike.${params.closerName}`);
  } else if (params.closerId) {
    // Fallback to id-only if name not provided
    q = q.eq('closer_id', params.closerId);
  } else if (params.closerName) {
    // Fallback to name-only if id not provided
    q = q.ilike('closer_name', params.closerName);
  }

  // Multi-select sources - only apply if array has items
  if (params.sourceIds && params.sourceIds.length > 0) {
    q = q.in('source_id', params.sourceIds);
  } else if (params.sourceId && params.sourceId !== 'all') {
    q = q.eq('source_id', params.sourceId);
  }

  // Traffic type filter
  if (params.trafficTypeId && params.trafficTypeId !== 'all') {
    q = q.eq('traffic_type_id', params.trafficTypeId);
  }

  // Call type filter
  if (params.callTypeId && params.callTypeId !== 'all') {
    q = q.eq('call_type_id', params.callTypeId);
  }

  // Booking platform filter
  if (params.bookingPlatform && params.bookingPlatform !== 'all') {
    q = q.eq('booking_platform', params.bookingPlatform);
  }

  return q;
}

/**
 * Generate query key array for event-based hooks
 * Ensures consistent cache invalidation when filters change
 */
export function getEventQueryKey(
  prefix: string,
  orgId: string | undefined,
  params: EventFilterParams,
  additionalKeys: unknown[] = []
): unknown[] {
  return [
    prefix,
    orgId,
    params.startDate?.toISOString(),
    params.endDate?.toISOString(),
    params.status,
    params.closerId,
    params.closerName,
    params.sourceId,
    params.sourceIds?.length ? params.sourceIds.join(',') : null,
    params.trafficTypeId,
    params.callTypeId,
    params.bookingPlatform,
    ...additionalKeys,
  ];
}
