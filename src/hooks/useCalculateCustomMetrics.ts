import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useAuth } from './useAuth';
import { matchesCloseFieldFilters } from '@/lib/closeFieldFiltering';
import type { MetricDefinition, FilterCondition, MetricValue, DateField } from '@/types/customMetrics';

interface CalculateMetricsFilters {
  startDate?: Date;
  endDate?: Date;
  dateType?: 'scheduled' | 'booked';
  sourceId?: string;
  sourceIds?: string[];
  trafficTypeId?: string;
  callTypeId?: string;
  closerId?: string;
  bookingPlatform?: string;
  closeFieldFilters?: Record<string, string | null>;
}

// Derive event_outcome from PCF data for consistent metric calculations
// Note: This is a fallback for events without a stored outcome - now the actual outcome 
// from the events table should be used when available as it reflects pipeline status
function deriveEventOutcome(pcf: { lead_showed: boolean; offer_made: boolean; deal_closed: boolean } | null): string | null {
  if (!pcf) return null;
  if (!pcf.lead_showed) return 'no_show';
  if (pcf.deal_closed) return 'closed';
  if (pcf.offer_made) return 'showed_offer_no_close';
  return 'showed_no_offer';
}

function applyConditionsToData<T extends Record<string, unknown>>(
  data: T[],
  conditions: FilterCondition[]
): T[] {
  if (!conditions || conditions.length === 0) return data;

  return data.filter(item => {
    return conditions.every(condition => {
      const fieldValue = item[condition.field];
      
      // Handle nested PCF fields - they're flattened in enrichedEvents
      // Boolean fields need special handling
      const booleanFields = ['pcf_submitted', 'lead_showed', 'offer_made', 'deal_closed'];
      const isBooleanField = booleanFields.includes(condition.field);
      
      // Convert string 'true'/'false' to boolean for comparison
      let compareValue: string | string[] | boolean | null = condition.value;
      if (isBooleanField && typeof condition.value === 'string') {
        compareValue = condition.value === 'true';
      }
      
      switch (condition.operator) {
        case 'equals':
          // For equals, NULL/undefined should NOT match any value
          if (fieldValue === null || fieldValue === undefined) return false;
          // Handle boolean comparison
          if (isBooleanField) {
            return fieldValue === compareValue;
          }
          return fieldValue === condition.value;
        case 'not_equals':
          // For not_equals, NULL/undefined should NOT automatically match
          if (fieldValue === null || fieldValue === undefined) return false;
          if (isBooleanField) {
            return fieldValue !== compareValue;
          }
          return fieldValue !== condition.value;
        case 'in':
          if (fieldValue === null || fieldValue === undefined) return false;
          return Array.isArray(condition.value) && 
                 condition.value.includes(fieldValue as string);
        default:
          return true;
      }
    });
  });
}

function calculateMetricValue(
  metric: MetricDefinition,
  eventsData: Record<string, unknown>[],
  paymentsData: Record<string, unknown>[]
): MetricValue {
  // Determine the data source from the metric definition
  const isPaymentMetric = metric.data_source === 'payments';
  const sourceData = isPaymentMetric ? paymentsData : eventsData;
  
  // Apply status filters for events FIRST (filter out canceled/rescheduled based on toggles)
  let filteredData = [...sourceData];
  if (!isPaymentMetric) {
    // Always filter out canceled unless explicitly included
    if (!metric.include_cancels) {
      filteredData = filteredData.filter(e => e.call_status !== 'canceled');
    }
    // Always filter out rescheduled unless explicitly included
    if (!metric.include_reschedules) {
      filteredData = filteredData.filter(e => e.call_status !== 'rescheduled');
    }
    // Filter out overdue PCF events if exclude_overdue_pcf is enabled
    if (metric.exclude_overdue_pcf) {
      const now = new Date();
      filteredData = filteredData.filter(e => {
        const scheduledAt = e.scheduled_at ? new Date(e.scheduled_at as string) : null;
        const pcfSubmitted = e.pcf_submitted as boolean;
        // Exclude if: scheduled in the past AND no PCF submitted
        if (scheduledAt && scheduledAt < now && !pcfSubmitted) {
          return false;
        }
        return true;
      });
    }
  }

  let value = 0;
  let numerator = 0;
  let denominator = 0;

  switch (metric.formula_type) {
    case 'count': {
      const countData = applyConditionsToData(filteredData, metric.numerator_conditions);
      value = countData.length;
      numerator = value;
      break;
    }
    
    case 'sum': {
      const sumData = applyConditionsToData(filteredData, metric.numerator_conditions);
      if (metric.numerator_field) {
        value = sumData.reduce((sum, item) => {
          const fieldValue = item[metric.numerator_field!];
          const numValue = typeof fieldValue === 'number' ? fieldValue : 
                          typeof fieldValue === 'string' ? parseFloat(fieldValue) || 0 : 0;
          return sum + numValue;
        }, 0);
        // Fix floating-point precision errors by rounding to 2 decimal places
        value = Math.round(value * 100) / 100;
      }
      numerator = Math.round(value * 100) / 100;
      break;
    }
    
    case 'percentage': {
      // Check what type of conditions we have
      const hasEventOutcomeCondition = (conditions: FilterCondition[]) => 
        conditions?.some(c => c.field === 'event_outcome');
      
      const hasCallStatusCondition = (conditions: FilterCondition[]) => 
        conditions?.some(c => c.field === 'call_status');
      
      const numeratorUsesOutcome = hasEventOutcomeCondition(metric.numerator_conditions);
      const numeratorUsesCallStatus = hasCallStatusCondition(metric.numerator_conditions);
      const denominatorUsesOutcome = hasEventOutcomeCondition(metric.denominator_conditions);
      const denominatorIsEmpty = !metric.denominator_conditions || 
        metric.denominator_conditions.length === 0 ||
        (typeof metric.denominator_conditions === 'object' && Object.keys(metric.denominator_conditions).length === 0);
      const numeratorIsEmpty = !metric.numerator_conditions || 
        metric.numerator_conditions.length === 0 ||
        (typeof metric.numerator_conditions === 'object' && Object.keys(metric.numerator_conditions).length === 0);
      
      let numeratorPool = filteredData;
      let denominatorPool = filteredData;
      
      if (numeratorUsesCallStatus) {
        // For call_status metrics (cancel/reschedule rate), use ALL source data
        numeratorPool = [...sourceData];
        denominatorPool = [...sourceData];
      } else {
        // For outcome-based percentage metrics:
        // 1. Filter to events that have a recorded outcome (either from PCF or stored)
        // 2. Apply include_no_shows filtering
        
        // Get events with recorded outcomes (these are the only events we can calculate rates on)
        const eventsWithOutcome = filteredData.filter(e => 
          e.event_outcome !== null && e.event_outcome !== undefined
        );
        
        // For numerator: start with events that have outcomes
        if (numeratorUsesOutcome || numeratorIsEmpty) {
          numeratorPool = [...eventsWithOutcome];
          // Apply include_no_shows - if false, exclude no_shows from numerator
          if (!metric.include_no_shows) {
            numeratorPool = numeratorPool.filter(e => e.event_outcome !== 'no_show');
          }
        }
        
        // For denominator: 
        // - If it has outcome conditions, use events with outcomes
        // - If it's empty (calculating rate against "all relevant events"), 
        //   use events with outcomes as the base (showed + no-shows)
        if (denominatorUsesOutcome || denominatorIsEmpty) {
          denominatorPool = [...eventsWithOutcome];
          // Only filter no-shows from denominator if include_no_shows=false AND there are conditions
          // For empty denominator (rate against total), keep no-shows in denominator
          if (!metric.include_no_shows && !denominatorIsEmpty) {
            denominatorPool = denominatorPool.filter(e => e.event_outcome !== 'no_show');
          }
        }
      }
      
      const numeratorData = applyConditionsToData(numeratorPool, metric.numerator_conditions);
      const denominatorData = denominatorIsEmpty 
        ? denominatorPool  // Use all filtered data when no conditions
        : applyConditionsToData(denominatorPool, metric.denominator_conditions);
      
      numerator = numeratorData.length;
      denominator = denominatorData.length;
      value = denominator > 0 ? (numerator / denominator) * 100 : 0;
      break;
    }
  }


  // Format value - fix floating-point precision errors
  // Round values to avoid JavaScript floating-point issues (e.g., 5894729.970000001)
  const roundedValue = Math.round(value * 100) / 100;
  
  let formattedValue: string;
  switch (metric.formula_type) {
    case 'sum':
      if (metric.numerator_field && ['amount', 'net_revenue'].includes(metric.numerator_field)) {
        formattedValue = new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(roundedValue);
      } else {
        // Format with proper comma separators and max 2 decimals
        formattedValue = new Intl.NumberFormat('en-US', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(roundedValue);
      }
      break;
    case 'percentage':
      // Ensure percentage doesn't show NaN or Infinity
      const safePercentage = isNaN(value) || !isFinite(value) ? 0 : Math.round(value);
      formattedValue = `${safePercentage}%`;
      break;
    default:
      formattedValue = new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(Math.round(roundedValue));
  }

  return {
    metricId: metric.id,
    value: roundedValue,
    formattedValue,
    breakdown: {
      numerator: Math.round(numerator),
      denominator: metric.formula_type === 'percentage' ? denominator : undefined,
    },
  };
}

// Helper to filter data by date field
function filterDataByDateField(
  data: Record<string, unknown>[],
  dateField: DateField,
  startDate?: Date,
  endDate?: Date
): Record<string, unknown>[] {
  if (!startDate && !endDate) return data;
  
  return data.filter(item => {
    const dateValue = item[dateField] as string | null;
    if (!dateValue) return false;
    
    const itemDate = new Date(dateValue);
    
    // Use getTime() for more reliable date comparison
    if (startDate && itemDate.getTime() < startDate.getTime()) return false;
    if (endDate && itemDate.getTime() > endDate.getTime()) return false;
    return true;
  });
}

export function useCalculateCustomMetrics(
  metrics: MetricDefinition[],
  filters?: CalculateMetricsFilters
) {
  const { user } = useAuth();
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  // Create a stable hash of metrics to ensure refetch when definitions change
  const metricsHash = metrics.map(m => 
    `${m.id}:${m.formula_type}:${m.date_field}:${m.include_no_shows}:${m.include_cancels}:${m.include_reschedules}:${m.exclude_overdue_pcf}:${m.pcf_field_id}:${JSON.stringify(m.numerator_conditions)}:${JSON.stringify(m.denominator_conditions)}`
  ).join('|');
  
  // Check if any metric uses pcf_fields data source
  const hasPcfFieldMetrics = metrics.some(m => m.data_source === 'pcf_fields' && m.pcf_field_id);

  return useQuery({
    queryKey: [
      'custom-metrics-values',
      orgId,
      metricsHash, // Use full hash instead of just IDs
      filters?.startDate?.toISOString(),
      filters?.endDate?.toISOString(),
      filters?.dateType,
      filters?.sourceId,
      filters?.sourceIds?.length ? filters.sourceIds.join(',') : null,
      filters?.trafficTypeId,
      filters?.callTypeId,
      filters?.closerId,
      filters?.bookingPlatform,
      filters?.closeFieldFilters ? JSON.stringify(filters.closeFieldFilters) : null,
    ],
    queryFn: async () => {
      if (!metrics || metrics.length === 0) return {};

      // Fetch ALL events and payments, then filter per-metric based on date_field
      // This allows different metrics to use different date fields
      let eventsQuery = supabase.from('events').select(`
        *,
        post_call_forms (
          id,
          lead_showed,
          offer_made,
          deal_closed,
          call_occurred
        )
      `);
      if (orgId) eventsQuery = eventsQuery.eq('organization_id', orgId);
      if (filters?.sourceIds && filters.sourceIds.length > 0) {
        eventsQuery = eventsQuery.in('source_id', filters.sourceIds);
      } else if (filters?.sourceId) {
        eventsQuery = eventsQuery.eq('source_id', filters.sourceId);
      }
      if (filters?.trafficTypeId) eventsQuery = eventsQuery.eq('traffic_type_id', filters.trafficTypeId);
      if (filters?.callTypeId) eventsQuery = eventsQuery.eq('call_type_id', filters.callTypeId);
      if (filters?.closerId) eventsQuery = eventsQuery.eq('closer_id', filters.closerId);
      if (filters?.bookingPlatform) eventsQuery = eventsQuery.eq('booking_platform', filters.bookingPlatform);
      
      // CRITICAL: Set a high limit to fetch all events (Supabase defaults to 1000)
      eventsQuery = eventsQuery.limit(10000);

      const { data: eventsData, error: eventsError } = await eventsQuery;
      if (eventsError) throw eventsError;
      
      console.log('[Metrics Debug] Events fetched:', eventsData?.length || 0);

      // Enrich events with derived event_outcome from PCF data and flatten PCF fields
      let enrichedEvents = (eventsData || []).map(event => {
        const pcfs = event.post_call_forms as Array<{ lead_showed: boolean; offer_made: boolean; deal_closed: boolean }> | null;
        const pcf = pcfs && pcfs.length > 0 ? pcfs[0] : null;
        let derivedOutcome = deriveEventOutcome(pcf);
        
        // Cal.com no-show detection: check explicit no_show_guest flag only
        const noShowGuest = event.no_show_guest as boolean | null;
        const meetingStartedAt = event.meeting_started_at as string | null;
        
        // If no PCF outcome but we have EXPLICIT Cal.com indicators, use them
        // Do NOT assume events without data are no-shows
        if (!derivedOutcome && !event.event_outcome) {
          if (noShowGuest === true) {
            // Explicit no-show from Cal.com webhook
            derivedOutcome = 'no_show';
          } else if (meetingStartedAt) {
            // Meeting started = they showed (at minimum)
            derivedOutcome = 'showed_no_offer';
          }
          // Otherwise leave as null - don't assume!
        }
        
        return {
          ...event,
          // Use PCF-derived outcome if available, then Cal.com derived, then stored event_outcome
          event_outcome: derivedOutcome || event.event_outcome,
          has_pcf: !!pcf,
          // Flatten PCF fields for condition filtering
          lead_showed: pcf?.lead_showed ?? (meetingStartedAt ? true : false),
          offer_made: pcf?.offer_made ?? false,
          deal_closed: pcf?.deal_closed ?? false,
        };
      });
      
      // Apply Close CRM custom field filters client-side using shared utility
      // This ensures consistent handling of __MISSING__ values across all metrics
      enrichedEvents = enrichedEvents.filter(event => 
        matchesCloseFieldFilters(
          event.close_custom_fields as Record<string, unknown> | null,
          filters?.closeFieldFilters
        )
      );
      
      // Track event IDs that match Close filters for payment filtering
      const filteredEventIds = new Set(enrichedEvents.map(e => e.id as string));

      // Fetch payments - use large limit to avoid Supabase's 1000 row default
      let paymentsQuery = supabase.from('payments').select('*');
      if (orgId) paymentsQuery = paymentsQuery.eq('organization_id', orgId);
      if (filters?.sourceIds && filters.sourceIds.length > 0) {
        paymentsQuery = paymentsQuery.in('source_id', filters.sourceIds);
      } else if (filters?.sourceId) {
        paymentsQuery = paymentsQuery.eq('source_id', filters.sourceId);
      }
      if (filters?.trafficTypeId) paymentsQuery = paymentsQuery.eq('traffic_type_id', filters.trafficTypeId);
      
      // Apply date range filter server-side when dates are provided
      if (filters?.startDate) {
        paymentsQuery = paymentsQuery.gte('payment_date', filters.startDate.toISOString());
      }
      if (filters?.endDate) {
        paymentsQuery = paymentsQuery.lte('payment_date', filters.endDate.toISOString());
      }
      
      // CRITICAL: Set a high limit to fetch all payments (Supabase defaults to 1000)
      paymentsQuery = paymentsQuery.limit(10000);

      const { data: paymentsData, error: paymentsError } = await paymentsQuery;
      if (paymentsError) throw paymentsError;
      
      // Filter payments to only include those linked to filtered events (respects Close filters)
      let filteredPaymentsData = paymentsData || [];
      if (filters?.closeFieldFilters) {
        const activeFilters = Object.entries(filters.closeFieldFilters).filter(([_, v]) => v !== null);
        if (activeFilters.length > 0) {
          // Only include payments for events that match the Close filters
          filteredPaymentsData = filteredPaymentsData.filter(payment => {
            const eventId = payment.event_id as string | null;
            // Include payment if it has no event_id OR if its event matches the filters
            return !eventId || filteredEventIds.has(eventId);
          });
        }
      }

      // Debug: log the filter dates and payment count
      console.log('[Metrics Debug] Filter dates:', {
        startDate: filters?.startDate?.toISOString(),
        endDate: filters?.endDate?.toISOString(),
        totalPaymentsFetched: paymentsData?.length || 0,
        filteredPayments: filteredPaymentsData.length,
        closeFiltersActive: Object.values(filters?.closeFieldFilters || {}).some(v => v !== null),
      });

      // Fetch custom field values if needed for pcf_fields metrics
      let pcfFieldValues: Record<string, { response: boolean }[]> = {};
      if (hasPcfFieldMetrics) {
        const pcfFieldIds = metrics
          .filter(m => m.data_source === 'pcf_fields' && m.pcf_field_id)
          .map(m => m.pcf_field_id!);
        
        const { data: cfvData } = await supabase
          .from('custom_field_values')
          .select('field_definition_id, value, record_id')
          .eq('organization_id', orgId)
          .eq('record_type', 'post_call_forms')
          .in('field_definition_id', pcfFieldIds);
        
        // Group by field_definition_id
        (cfvData || []).forEach(cfv => {
          if (!pcfFieldValues[cfv.field_definition_id]) {
            pcfFieldValues[cfv.field_definition_id] = [];
          }
          pcfFieldValues[cfv.field_definition_id].push(cfv.value as { response: boolean });
        });
      }

      // Calculate each metric with its own date_field filtering
      const results: Record<string, MetricValue> = {};
      for (const metric of metrics) {
        // Handle pcf_fields data source
        if (metric.data_source === 'pcf_fields' && metric.pcf_field_id) {
          const fieldResponses = pcfFieldValues[metric.pcf_field_id] || [];
          const totalResponses = fieldResponses.length;
          const yesResponses = fieldResponses.filter(r => r.response === true).length;
          const rate = totalResponses > 0 ? (yesResponses / totalResponses) * 100 : 0;
          
          results[metric.id] = {
            metricId: metric.id,
            value: rate,
            formattedValue: `${Math.round(rate)}%`,
            breakdown: {
              numerator: yesResponses,
              denominator: totalResponses,
            },
          };
          continue;
        }
        
        // Determine which date field to use for this metric
        const metricDateField = metric.date_field || 
          (metric.data_source === 'payments' ? 'payment_date' : 'scheduled_at');
        
        // Filter data by the metric's specific date field
        const filteredEvents = filterDataByDateField(
          enrichedEvents as Record<string, unknown>[],
          metricDateField as DateField,
          filters?.startDate,
          filters?.endDate
        );
        
        // Use the Close-filtered payments data
        const filteredPayments = filterDataByDateField(
          filteredPaymentsData as Record<string, unknown>[],
          metricDateField as DateField,
          filters?.startDate,
          filters?.endDate
        );
        
        results[metric.id] = calculateMetricValue(
          metric,
          filteredEvents,
          filteredPayments
        );
      }

      return results;
    },
    enabled: !!user && !!orgId && metrics.length > 0,
    // Keep data fresh
    staleTime: 0,
    refetchOnMount: true,
  });
}
