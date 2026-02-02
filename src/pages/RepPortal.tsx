import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePortalPCF } from '@/hooks/usePortalPCF';
import { 
  Loader2, 
  ClipboardCheck, 
  Calendar, 
  Search, 
  Phone, 
  User, 
  DollarSign, 
  TrendingUp,
  Target,
  CheckCircle,
  XCircle,
  Users,
  FileText
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, isPast, subDays, startOfDay, endOfDay, startOfWeek, endOfWeek } from 'date-fns';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { RepEventsTable } from '@/components/dashboard/RepEventsTable';
import { RepFormsTab } from '@/components/forms/RepFormsTab';
import type { FormFieldConfig } from '@/components/settings/PCFFormBuilder';

interface Event {
  id: string;
  lead_name: string;
  lead_email: string;
  lead_phone: string | null;
  scheduled_at: string;
  created_at: string;
  closer_name: string | null;
  call_status: string;
  pcf_submitted: boolean;
  event_name: string | null;
  event_outcome: string | null;
  setter_name: string | null;
  pcf_outcome_label?: string | null;
  opportunity_status_name?: string | null;
  opportunity_status_color?: string | null;
  close_custom_fields?: Record<string, string> | null;
  booking_platform?: string | null;
}

interface OpportunityStatus {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

interface Closer {
  id: string;
  name: string;
}

type DateRangePreset = 'all_time' | 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';
type PCFStatusFilter = 'all' | 'pending' | 'completed';

interface RepPortalProps {
  embedded?: boolean;
  organizationId?: string;
}

export default function RepPortal({ embedded = false, organizationId: propOrganizationId }: RepPortalProps) {
  const [searchParams] = useSearchParams();
  const [closerName, setCloserName] = useState('');
  const [closerId, setCloserId] = useState<string | undefined>(undefined);
  const [searchSubmitted, setSearchSubmitted] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [pcfDialogOpen, setPcfDialogOpen] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [isUniversalToken, setIsUniversalToken] = useState(false);
  const [activeTab, setActiveTab] = useState('calls');
  const [organizationId, setOrganizationId] = useState<string | null>(propOrganizationId || null);
  const [portalToken, setPortalToken] = useState<string | null>(null);
  
  // Update organizationId when prop changes (for embedded mode)
  useEffect(() => {
    if (propOrganizationId) {
      setOrganizationId(propOrganizationId);
      setTokenValidated(true);
      setIsUniversalToken(true);
    }
  }, [propOrganizationId]);
  
  // Date range state - default to all_time so reps see all calls by default
  const [datePreset, setDatePreset] = useState<DateRangePreset>('all_time');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>();
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>();
  
  // PCF Status filter
  const [pcfStatusFilter, setPcfStatusFilter] = useState<PCFStatusFilter>('all');
  
  // Platform filter
  const [platformFilter, setPlatformFilter] = useState<string>('all');

  // Initialize from URL params - support ?name=, ?token=, and ?org=
  useEffect(() => {
    if (initialized) return;
    
    const rawToken = searchParams.get('token');
    const token = rawToken ? rawToken.replace(/[^a-f0-9]/gi, '') : null;
    const nameFromUrl = searchParams.get('name');
    const orgSlug = searchParams.get('org');
    
    // Track if we need to wait for async operations
    let needsAsyncInit = false;
    
    if (token) {
      needsAsyncInit = true;
      // Validate magic link token using secure backend function
      const validateTokenAsync = async () => {
        try {
          const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

          const response = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=validate_token&token=${encodeURIComponent(token)}`,
            {
              headers: {
                'Content-Type': 'application/json',
                ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
              },
            }
          );
          
          if (!response.ok) {
            console.error('Token validation failed');
            setInitialized(true);
            return;
          }
          
          const result = await response.json();
          
          if (result.valid) {
            setOrganizationId(result.organization_id);
            setTokenValidated(true);
            setPortalToken(token); // Store token for secure edge function calls

            // Check if this is a universal token
            if (result.is_universal) {
              setIsUniversalToken(true);
              // Don't set closerName or searchSubmitted - let user select
            } else {
              setCloserName(result.closer_name);
              setSearchSubmitted(true);
            }
          }
        } catch (error) {
          console.error('Token validation error:', error);
        } finally {
          // Only set initialized after async completes
          setInitialized(true);
        }
      };
      validateTokenAsync();
    } else if (orgSlug) {
      needsAsyncInit = true;
      // Fetch organization by slug and set the organizationId
      const fetchOrgBySlug = async () => {
        try {
          const { data: org } = await supabase
            .from('organizations')
            .select('id')
            .eq('slug', orgSlug)
            .single();
          
          if (org) {
            setOrganizationId(org.id);
            setTokenValidated(true);
            setIsUniversalToken(true); // Let user select from org closers
          }
        } finally {
          setInitialized(true);
        }
      };
      fetchOrgBySlug();
    }
    
    if (nameFromUrl) {
      setCloserName(decodeURIComponent(nameFromUrl));
      setSearchSubmitted(true);
    }
    
    // Only set initialized immediately if no async operations needed
    if (!needsAsyncInit) {
      setInitialized(true);
    }
  }, [searchParams, initialized]);
  
  // PCF Form state - use a dynamic object for all field values
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [existingPcfId, setExistingPcfId] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);

  // Helper to update a specific field value
  const updateFieldValue = (fieldId: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldId]: value }));
  };

  // Check if a field should be visible based on conditional logic
  const isFieldVisible = (field: FormFieldConfig): boolean => {
    if (!field.conditionalOn) return true;
    const dependentValue = formValues[field.conditionalOn];
    return dependentValue === field.conditionalValue || dependentValue === true;
  };

  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Use secure portal PCF hook for all portal operations
  const { fetchEvents, fetchClosers, fetchStatuses, fetchFormConfig, createPCF, updatePCF, deletePCF, fetchPCF, fetchPlatforms } = usePortalPCF(portalToken);

  // Date range calculation
  const getDateRange = () => {
    const today = new Date();
    switch (datePreset) {
      case 'all_time':
        return { startDate: undefined, endDate: undefined };
      case 'today':
        return { startDate: startOfDay(today), endDate: endOfDay(today) };
      case 'yesterday':
        const yesterday = subDays(today, 1);
        return { startDate: startOfDay(yesterday), endDate: endOfDay(yesterday) };
      case 'this_week':
        return { startDate: startOfWeek(today, { weekStartsOn: 1 }), endDate: endOfWeek(today, { weekStartsOn: 1 }) };
      case 'last_week':
        const lastWeekStart = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7);
        const lastWeekEnd = subDays(endOfWeek(today, { weekStartsOn: 1 }), 7);
        return { startDate: lastWeekStart, endDate: lastWeekEnd };
      case 'this_month':
        return { startDate: startOfMonth(today), endDate: endOfMonth(today) };
      case 'last_month':
        const lastMonth = subDays(startOfMonth(today), 1);
        return { startDate: startOfMonth(lastMonth), endDate: endOfMonth(lastMonth) };
      case 'custom':
        return { startDate: customStartDate, endDate: customEndDate };
      default:
        return { startDate: undefined, endDate: undefined };
    }
  };

  const dateRange = getDateRange();

  // Fetch closers for dropdown using secure edge function when using portal token
  const { data: closers } = useQuery({
    queryKey: ['closers-list', organizationId, portalToken],
    queryFn: async () => {
      // If we have a portal token, use the secure edge function
      if (portalToken) {
        return await fetchClosers();
      }
      // Otherwise fall back to direct Supabase for authenticated users
      let query = supabase
        .from('closers')
        .select('id, name')
        .eq('is_active', true);
      
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query.order('name');
      if (error) throw error;
      return data as Closer[];
    },
    enabled: tokenValidated || !isUniversalToken,
  });

  // Fetch available platforms for dropdown
  const { data: platforms } = useQuery({
    queryKey: ['rep-platforms', organizationId, portalToken],
    queryFn: async () => {
      if (portalToken) {
        return await fetchPlatforms();
      }
      // Direct Supabase fallback for authenticated users
      const { data } = await supabase
        .from('events')
        .select('close_custom_fields')
        .eq('organization_id', organizationId!)
        .not('close_custom_fields', 'is', null);
      
      const platformSet = new Set<string>();
      (data || []).forEach((e: any) => {
        if (e.close_custom_fields?.platform) {
          platformSet.add(e.close_custom_fields.platform);
        }
      });
      return Array.from(platformSet).sort();
    },
    enabled: tokenValidated || !!organizationId,
  });

  // Fetch events for the closer using secure edge function when using portal token
  const { data: events, isLoading: eventsLoading } = useQuery({
    queryKey: ['rep-events', closerName, dateRange.startDate?.toISOString(), dateRange.endDate?.toISOString(), portalToken, platformFilter],
    queryFn: async () => {
      const platformValue = platformFilter !== 'all' ? platformFilter : undefined;
      
      // If we have a portal token, use the secure edge function
      if (portalToken) {
        return await fetchEvents(
          closerName,
          dateRange.startDate?.toISOString(),
          dateRange.endDate?.toISOString(),
          platformValue
        );
      }
      // Otherwise fall back to direct Supabase for authenticated users
      let query = supabase
        .from('events')
        .select(`
          id, lead_name, lead_email, lead_phone, scheduled_at, created_at, 
          closer_name, call_status, pcf_submitted, event_name, event_outcome, setter_name, pcf_outcome_label,
          close_custom_fields, booking_platform,
          post_call_forms!left(opportunity_status_id, opportunity_statuses!left(id, name, color))
        `)
        .eq('closer_name', closerName)
        .order('scheduled_at', { ascending: false });

      if (dateRange.startDate) {
        query = query.gte('scheduled_at', dateRange.startDate.toISOString());
      }
      if (dateRange.endDate) {
        query = query.lte('scheduled_at', dateRange.endDate.toISOString());
      }
      if (platformValue) {
        query = query.contains('close_custom_fields', { platform: platformValue });
      }

      const { data, error } = await query.limit(500);
      if (error) throw error;
      
      // Flatten nested PCF data
      return (data || []).map((e: any) => {
        const pcf = Array.isArray(e.post_call_forms) ? e.post_call_forms[0] : e.post_call_forms;
        const status = pcf?.opportunity_statuses;
        return {
          id: e.id,
          lead_name: e.lead_name,
          lead_email: e.lead_email,
          lead_phone: e.lead_phone,
          scheduled_at: e.scheduled_at,
          created_at: e.created_at,
          closer_name: e.closer_name,
          call_status: e.call_status,
          pcf_submitted: e.pcf_submitted,
          event_name: e.event_name,
          event_outcome: e.event_outcome,
          setter_name: e.setter_name,
          pcf_outcome_label: e.pcf_outcome_label || null,
          close_custom_fields: e.close_custom_fields,
          booking_platform: e.booking_platform,
          opportunity_status_name: status?.name || e.pcf_outcome_label || null,
          opportunity_status_color: status?.color || null,
        } as Event;
      });
    },
    enabled: searchSubmitted && closerName.length > 0,
  });

  // Fetch opportunity statuses using secure edge function when using portal token
  const { data: opportunityStatuses } = useQuery({
    queryKey: ['opportunity-statuses', organizationId, portalToken],
    queryFn: async () => {
      // If we have a portal token, use the secure edge function
      if (portalToken) {
        return await fetchStatuses();
      }
      // Otherwise fall back to direct Supabase for authenticated users
      let query = supabase
        .from('opportunity_statuses')
        .select('id, name, description, color')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as OpportunityStatus[];
    },
    enabled: true,
  });

  // Fetch form config for the organization using secure edge function when using portal token
  const { data: formConfig } = useQuery({
    queryKey: ['form-config', organizationId, 'post_call_form', portalToken],
    queryFn: async () => {
      // If we have a portal token, use the secure edge function
      if (portalToken) {
        return await fetchFormConfig();
      }
      // Otherwise fall back to direct Supabase for authenticated users
      const { data, error } = await supabase
        .from('form_configs')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('form_type', 'post_call_form')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId || !!portalToken,
  });

  // Fetch custom field definitions for PCF fields (to map form field IDs to definition UUIDs)
  const { data: pcfFieldDefinitions } = useQuery({
    queryKey: ['pcf-field-definitions', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('id, field_slug, field_name')
        .eq('organization_id', organizationId)
        .contains('applies_to', ['post_call_forms']);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch metric definitions to link customMetricId to pcf_field_id (custom_field_definitions.id)
  const { data: metricDefinitions } = useQuery({
    queryKey: ['metric-definitions-for-pcf', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metric_definitions')
        .select('id, pcf_field_id')
        .eq('organization_id', organizationId)
        .eq('data_source', 'pcf_fields')
        .not('pcf_field_id', 'is', null);
      if (error) throw error;
      return data;
    },
    enabled: !!organizationId,
  });

  // Fetch Cash Collected from payments (match by event_id OR customer_email)
  const { data: cashCollected } = useQuery({
    queryKey: ['rep-cash-collected', closerName, dateRange.startDate?.toISOString(), dateRange.endDate?.toISOString(), organizationId],
    queryFn: async () => {
      if (!events || events.length === 0) return 0;
      
      // Get all event IDs and lead emails for matching
      const eventIds = events.map(e => e.id);
      const leadEmails = events.map(e => e.lead_email?.toLowerCase()).filter(Boolean);
      
      // Query payments matching by event_id
      let query = supabase
        .from('payments')
        .select('amount, net_revenue, event_id, customer_email');
      
      if (organizationId) {
        query = query.eq('organization_id', organizationId);
      }
      
      const { data: payments, error } = await query;
      if (error) throw error;
      
      // Calculate total from payments that match either by event_id or customer_email
      const matchingPayments = (payments || []).filter(p => {
        // Match by event_id if available
        if (p.event_id && eventIds.includes(p.event_id)) return true;
        // Match by customer_email to lead_email
        if (p.customer_email && leadEmails.includes(p.customer_email.toLowerCase())) return true;
        return false;
      });
      
      return matchingPayments.reduce((sum, p) => sum + Number(p.net_revenue || p.amount || 0), 0);
    },
    enabled: !!events && events.length > 0 && !!organizationId,
  });

  // Get dynamic fields from form config, or use default
  const formFields: FormFieldConfig[] = useMemo(() => {
    if (formConfig?.fields && Array.isArray(formConfig.fields)) {
      return formConfig.fields as unknown as FormFieldConfig[];
    }
    // Default fields if no config
    return [
      { id: 'lead_showed', type: 'yes_no', label: 'Did the lead show up?', required: true, mapsToMetric: 'show_rate' },
      { id: 'offer_made', type: 'yes_no', label: 'Was an offer made?', required: true, mapsToMetric: 'offer_rate', conditionalOn: 'lead_showed', conditionalValue: 'yes' },
      { id: 'notes', type: 'textarea', label: 'Notes', required: false, mapsToMetric: 'none' },
    ];
  }, [formConfig]);

  // Filter events by PCF status
  const filteredEvents = useMemo(() => {
    if (!events) return [];
    
    switch (pcfStatusFilter) {
      case 'pending':
        // Show all events that don't have a PCF submitted yet
        return events.filter(e => !e.pcf_submitted);
      case 'completed':
        return events.filter(e => e.pcf_submitted);
      default:
        return events;
    }
  }, [events, pcfStatusFilter]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!events) return null;

    // CRITICAL: Filter out canceled/rescheduled events FIRST for all outcome-based metrics
    // This ensures consistency with Analytics page (CloserMetricsTable.tsx)
    const activeEvents = events.filter(e => 
      e.call_status !== 'canceled' && 
      e.call_status !== 'cancelled' && 
      e.call_status !== 'rescheduled'
    );

    // Booked calls = all active events
    const bookedCalls = activeEvents.length;
    
    // Showed = active events with an outcome that isn't 'no_show'
    const completedCalls = activeEvents.filter(e => 
      e.event_outcome && e.event_outcome !== 'no_show'
    ).length;
    
    // No Shows = active events with 'no_show' outcome
    const noShows = activeEvents.filter(e => e.event_outcome === 'no_show').length;
    
    // Offers Made = active events with offer outcomes
    const offersMade = activeEvents.filter(e => 
      e.event_outcome === 'showed_offer_no_close' || e.event_outcome === 'closed'
    ).length;
    
    // Deals Closed = active events with closed outcome
    const dealsClosed = activeEvents.filter(e => e.event_outcome === 'closed').length;
    
    // Pending PCFs = past active events without PCF
    const pendingPCFs = activeEvents.filter(e => 
      !e.pcf_submitted && 
      isPast(new Date(e.scheduled_at))
    ).length;
    
    const completedPCFs = activeEvents.filter(e => e.pcf_submitted).length;
    
    // Today's scheduled calls (for "Calls on Calendar Today")
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);
    const callsToday = activeEvents.filter(e => {
      const scheduledDate = new Date(e.scheduled_at);
      return scheduledDate >= todayStart && scheduledDate <= todayEnd;
    }).length;
    
    // Show Rate = showed / (showed + no-shows) - only count calls where outcome is determined
    const attendedOrNoShow = completedCalls + noShows;
    const showRate = attendedOrNoShow > 0 ? Math.round((completedCalls / attendedOrNoShow) * 100) : 0;
    const closeRate = completedCalls > 0 ? Math.round((dealsClosed / completedCalls) * 100) : 0;
    const offerRate = completedCalls > 0 ? Math.round((offersMade / completedCalls) * 100) : 0;

    return {
      bookedCalls,
      completedCalls,
      noShows,
      offersMade,
      dealsClosed,
      showRate,
      closeRate,
      offerRate,
      pendingPCFs,
      completedPCFs,
      callsToday,
    };
  }, [events]);

  const handleSearch = (name?: string, id?: string) => {
    const searchName = name || closerName;
    if (searchName.trim()) {
      setCloserName(searchName);
      setCloserId(id);
      setSearchSubmitted(true);
    }
  };

  const handleOpenPCF = async (event: Event) => {
    setSelectedEvent(event);
    setFormValues({});
    setExistingPcfId(null);
    setIsEditMode(false);
    
    // If PCF already submitted, fetch existing data using secure edge function
    if (event.pcf_submitted) {
      try {
        // Use secure edge function for portal users, direct query for authenticated users
        if (portalToken) {
          const result = await fetchPCF(event.id);
          if (result?.pcf) {
            const existingPcf = result.pcf;
            setExistingPcfId(existingPcf.id);
            setIsEditMode(true);
            {
              // Detect pipeline field: either type='pipeline_status' OR a select with crmSync.pipeline_stage
              const pipelineField = formFields.find(f => 
                f.type === 'pipeline_status' || 
                (f.type === 'select' && f.crmSync?.syncType === 'pipeline_stage')
              );
              const pipelineFieldId = pipelineField?.id || 'pipeline_status';
              const nextValues: Record<string, any> = {
                lead_showed: existingPcf.lead_showed ? 'yes' : 'no',
                offer_made: existingPcf.offer_made ? 'yes' : 'no',
                // Backwards-compatible key (older configs / existing code)
                pipeline_status: existingPcf.opportunity_status_id || '',
                notes: existingPcf.notes || '',
                cash_collected: existingPcf.cash_collected || 0,
              };
              // Actual configured field id (can be different than "pipeline_status")
              nextValues[pipelineFieldId] = existingPcf.opportunity_status_id || '';
              setFormValues(nextValues);
            }
          }
        } else {
          // Direct Supabase query for authenticated users
          const { data: existingPcf } = await supabase
            .from('post_call_forms')
            .select('*')
            .eq('event_id', event.id)
            .maybeSingle();
          
          if (existingPcf) {
            setExistingPcfId(existingPcf.id);
            setIsEditMode(true);
            {
              // Detect pipeline field: either type='pipeline_status' OR a select with crmSync.pipeline_stage
              const pipelineField = formFields.find(f => 
                f.type === 'pipeline_status' || 
                (f.type === 'select' && f.crmSync?.syncType === 'pipeline_stage')
              );
              const pipelineFieldId = pipelineField?.id || 'pipeline_status';
              const nextValues: Record<string, any> = {
                lead_showed: existingPcf.lead_showed ? 'yes' : 'no',
                offer_made: existingPcf.offer_made ? 'yes' : 'no',
                // Backwards-compatible key (older configs / existing code)
                pipeline_status: existingPcf.opportunity_status_id || '',
                notes: existingPcf.notes || '',
                cash_collected: existingPcf.cash_collected || 0,
              };
              // Actual configured field id (can be different than "pipeline_status")
              nextValues[pipelineFieldId] = existingPcf.opportunity_status_id || '';
              setFormValues(nextValues);
            }
          }
        }
      } catch (error) {
        console.error('Error fetching existing PCF:', error);
      }
    }
    
    setPcfDialogOpen(true);
  };

  const handleSubmitPCF = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEvent) return;

    setIsSubmitting(true);

    try {
      // Get closer ID from the closers table using the event's closer_name
      const eventCloserName = selectedEvent.closer_name || closerName;
      const { data: closerData } = await supabase
        .from('closers')
        .select('id')
        .eq('name', eventCloserName)
        .maybeSingle();

      const closerId = closerData?.id || '00000000-0000-0000-0000-000000000000';

      // Extract values from dynamic form fields based on metric mappings
      const leadShowed = formValues.lead_showed === 'yes' || formValues.lead_showed === true;
      const offerMade = formValues.offer_made === 'yes' || formValues.offer_made === true;
      const notes = formValues.notes || '';
      // Detect pipeline field: either type='pipeline_status' OR a select with crmSync.pipeline_stage
      const pipelineField = formFields.find(f => 
        f.type === 'pipeline_status' || 
        (f.type === 'select' && f.crmSync?.syncType === 'pipeline_stage')
      );
      const pipelineFieldId = pipelineField?.id || 'pipeline_status';
      const pipelineStatusValue = (formValues[pipelineFieldId] as string) || (formValues.pipeline_status as string) || null;
      const cashCollected = typeof formValues.cash_collected === 'number' ? formValues.cash_collected : 0;

      // Determine deal_closed and event_outcome based on pipeline status
      let dealClosed = false;
      let eventOutcome: 'no_show' | 'showed_no_offer' | 'showed_offer_no_close' | 'closed' | 'not_qualified' | 'lost' | 'rescheduled' | 'canceled' = 'showed_no_offer';
      let callStatus = 'completed';
      let pcfOutcomeLabel: string | null = null;
      
      // Check if pipelineStatusValue is a valid UUID in opportunity_statuses
      let validOpportunityStatusId: string | null = null;
      
      if (pipelineStatusValue) {
        // First check if it's a valid opportunity_statuses.id
        const selectedStatus = opportunityStatuses?.find(s => s.id === pipelineStatusValue);
        if (selectedStatus) {
          validOpportunityStatusId = pipelineStatusValue;
          pcfOutcomeLabel = selectedStatus.name;
        } else if (pipelineField?.options) {
          // It's a static option from form config - get the label
          const staticOption = pipelineField.options.find((opt: any) => opt.value === pipelineStatusValue);
          if (staticOption) {
            pcfOutcomeLabel = staticOption.label;
          }
        }
        
        // Derive outcome from the label
        if (pcfOutcomeLabel) {
          const statusLower = pcfOutcomeLabel.toLowerCase();
          
          if (statusLower.includes('closed') || statusLower.includes('won') || statusLower.includes('paid')) {
            dealClosed = true;
            eventOutcome = 'closed';
          } else if (statusLower.includes('not qualified') || statusLower.includes('not-qualified') || statusLower.includes('unqualified') || statusLower.includes('disqualified') || statusLower.includes('dq')) {
            eventOutcome = 'not_qualified';
          } else if (statusLower.includes('lost') || statusLower.includes('dead')) {
            eventOutcome = 'lost';
          } else if (statusLower.includes('no show') || statusLower.includes('no-show') || statusLower.includes('dns')) {
            eventOutcome = 'no_show';
            callStatus = 'no_show';
          } else if (statusLower.includes('reschedule')) {
            eventOutcome = 'rescheduled';
            callStatus = 'rescheduled';
          } else if (statusLower.includes('cancel')) {
            eventOutcome = 'canceled';
            callStatus = 'canceled';
          } else if (offerMade) {
            eventOutcome = 'showed_offer_no_close';
          }
        }
      } else if (!leadShowed) {
        eventOutcome = 'no_show';
        callStatus = 'no_show';
      } else if (offerMade) {
        eventOutcome = 'showed_offer_no_close';
      }

      // Check if we have a portal token - if so, use edge function; otherwise use direct Supabase
      if (portalToken) {
        if (isEditMode && existingPcfId) {
          // Update existing PCF using secure edge function
          await updatePCF.mutateAsync({
            pcf_id: existingPcfId,
            lead_showed: leadShowed,
            offer_made: offerMade,
            opportunity_status_id: validOpportunityStatusId || undefined,
            notes: notes || undefined,
            cash_collected: cashCollected,
          });
        } else {
          // Create new PCF using secure edge function
          await createPCF.mutateAsync({
            event_id: selectedEvent.id,
            closer_id: closerId,
            closer_name: eventCloserName,
            call_occurred: true,
            lead_showed: leadShowed,
            offer_made: offerMade,
            deal_closed: dealClosed,
            cash_collected: cashCollected,
            opportunity_status_id: validOpportunityStatusId || undefined,
            notes: notes || undefined,
          });
        }
      } else {
        // Direct Supabase fallback for authenticated admin users (no portal token)
        const pcfData = {
          event_id: selectedEvent.id,
          closer_id: closerId,
          closer_name: eventCloserName,
          call_occurred: true,
          lead_showed: leadShowed,
          offer_made: offerMade,
          deal_closed: dealClosed,
          cash_collected: cashCollected,
          opportunity_status_id: validOpportunityStatusId,
          notes: notes || null,
          organization_id: organizationId,
        };

        if (isEditMode && existingPcfId) {
          const { error: pcfError } = await supabase
            .from('post_call_forms')
            .update(pcfData)
            .eq('id', existingPcfId);
          if (pcfError) throw pcfError;
        } else {
          const { error: pcfError } = await supabase
            .from('post_call_forms')
            .insert(pcfData);
          if (pcfError) throw pcfError;
        }

        // Update event status
        const { error: eventError } = await supabase
          .from('events')
          .update({
            call_status: callStatus,
            event_outcome: eventOutcome,
            pcf_submitted: true,
            pcf_submitted_at: new Date().toISOString(),
            pcf_outcome_label: pcfOutcomeLabel,
          })
          .eq('id', selectedEvent.id);

        if (eventError) throw eventError;

        // Invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ['rep-events'] });
        queryClient.invalidateQueries({ queryKey: ['events'] });
        
        toast({
          title: isEditMode ? 'PCF Updated!' : 'PCF Submitted!',
          description: 'Your post-call form has been saved.',
        });
      }

      // Save custom form field values for metric tracking (yes/no fields)
      if (organizationId) {
        const yesNoFields = formFields.filter(f => f.type === 'yes_no');
        console.log('[PCF Debug] Processing yes/no fields:', yesNoFields.map(f => ({ 
          id: f.id, 
          label: f.label, 
          mapsToMetric: f.mapsToMetric,
          customMetricId: f.customMetricId 
        })));
        console.log('[PCF Debug] Available pcfFieldDefinitions:', pcfFieldDefinitions);
        console.log('[PCF Debug] Available metricDefinitions:', metricDefinitions);
        
        for (const field of yesNoFields) {
          const fieldValue = formValues[field.id];
          console.log(`[PCF Debug] Field ${field.id} value:`, fieldValue);
          
          if (fieldValue !== undefined && fieldValue !== null && fieldValue !== '') {
            let fieldDefinitionId: string | null = null;
            
            // Strategy 1: If field has customMetricId, look up the pcf_field_id from metric_definitions
            if (field.customMetricId && metricDefinitions) {
              const metric = metricDefinitions.find(m => m.id === field.customMetricId);
              if (metric?.pcf_field_id) {
                fieldDefinitionId = metric.pcf_field_id;
                console.log(`[PCF Debug] Found via customMetricId: ${field.customMetricId} -> pcf_field_id: ${fieldDefinitionId}`);
              }
            }
            
            // Strategy 2: Fallback to field_slug matching
            if (!fieldDefinitionId && pcfFieldDefinitions) {
              const matchingDef = pcfFieldDefinitions.find(def => 
                def.field_slug.includes(field.id)
              );
              if (matchingDef) {
                fieldDefinitionId = matchingDef.id;
                console.log(`[PCF Debug] Found via field_slug matching: ${field.id} -> ${fieldDefinitionId}`);
              }
            }
            
            console.log(`[PCF Debug] Final fieldDefinitionId for ${field.id}:`, fieldDefinitionId);
            
            if (fieldDefinitionId) {
              const booleanValue = fieldValue === 'yes' || fieldValue === true;
              console.log(`[PCF Debug] Saving custom field value: field_definition_id=${fieldDefinitionId}, response=${booleanValue}`);
              
              const { error: cfvError } = await supabase
                .from('custom_field_values')
                .upsert({
                  field_definition_id: fieldDefinitionId,
                  record_id: selectedEvent.id,
                  record_type: 'post_call_forms',
                  value: { response: booleanValue },
                  organization_id: organizationId,
                }, {
                  onConflict: 'field_definition_id,record_id,record_type',
                });
              
              if (cfvError) {
                console.error('[PCF Debug] Failed to save custom field value:', cfvError);
              } else {
                console.log('[PCF Debug] Successfully saved custom field value for:', field.label);
              }
            } else {
              console.log(`[PCF Debug] No field_definition_id found for field ${field.id} - skipping`);
            }
          }
        }
      }

      // Close dialog and reset state
      setPcfDialogOpen(false);
      setSelectedEvent(null);

    } catch (error: any) {
      console.error('PCF submit error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit PCF',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClearPCF = async () => {
    if (!selectedEvent || !existingPcfId) return;

    setIsSubmitting(true);

    try {
      // Delete PCF using secure edge function
      await deletePCF.mutateAsync(existingPcfId);

      // Close dialog and reset state
      setPcfDialogOpen(false);
      setSelectedEvent(null);

    } catch (error: any) {
      console.error('PCF clear error:', error);
      // Toast is handled by the hook
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-7xl">
      {/* Header */}
      {!embedded && (
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <ClipboardCheck className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Sales Rep Portal</h1>
              <p className="text-sm text-muted-foreground hidden sm:block">View your stats and submit post-call forms</p>
            </div>
          </div>
        </header>
      )}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Find Your Dashboard
            </CardTitle>
            <CardDescription>Select your name and date range to see your stats</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              {/* Name Selector */}
              <div className="flex-1">
                <Label className="mb-2 block">Your Name</Label>
                <Select 
                  value={closerName} 
                  onValueChange={(name) => {
                    const closer = closers?.find(c => c.name === name);
                    handleSearch(name, closer?.id);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select your name..." />
                  </SelectTrigger>
                  <SelectContent>
                    {closers?.map(closer => (
                      <SelectItem key={closer.id} value={closer.name}>
                        {closer.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Range */}
              <div className="flex-1">
                <Label className="mb-2 block">Date Range</Label>
                <div className="flex items-center gap-2">
                  <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DateRangePreset)}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Select date range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_time">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="yesterday">Yesterday</SelectItem>
                      <SelectItem value="this_week">This Week</SelectItem>
                      <SelectItem value="last_week">Last Week</SelectItem>
                      <SelectItem value="this_month">This Month</SelectItem>
                      <SelectItem value="last_month">Last Month</SelectItem>
                      <SelectItem value="custom">Custom Range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* PCF Status Filter */}
              <div className="flex-1">
                <Label className="mb-2 block">PCF Status</Label>
                <Select value={pcfStatusFilter} onValueChange={(v) => setPcfStatusFilter(v as PCFStatusFilter)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Calls</SelectItem>
                    <SelectItem value="pending">Pending PCFs</SelectItem>
                    <SelectItem value="completed">Completed PCFs</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Platform Filter - only show if platforms exist */}
              {platforms && platforms.length > 0 && (
                <div className="flex-1">
                  <Label className="mb-2 block">Platform</Label>
                  <Select value={platformFilter} onValueChange={setPlatformFilter}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="All Platforms" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Platforms</SelectItem>
                      {platforms.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Custom Date Pickers */}
              {datePreset === 'custom' && (
                <div className="flex items-end gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customStartDate ? format(customStartDate, 'MMM d') : 'Start'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customStartDate}
                        onSelect={setCustomStartDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground pb-2">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        {customEndDate ? format(customEndDate, 'MMM d') : 'End'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarComponent
                        mode="single"
                        selected={customEndDate}
                        onSelect={setCustomEndDate}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Dashboard Content */}
        {searchSubmitted && closerName && organizationId && (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="calls" className="flex items-center gap-2">
                <Phone className="h-4 w-4" />
                My Calls
              </TabsTrigger>
              <TabsTrigger value="forms" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                My Forms
              </TabsTrigger>
            </TabsList>

            <TabsContent value="calls" className="space-y-4 sm:space-y-6">
              {eventsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {/* Stats Grid - 2 cols on mobile, 4 on desktop */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                    <StatsCard
                      title="Calls Booked"
                      value={stats?.bookedCalls || 0}
                      icon={<Calendar className="h-4 w-4 sm:h-5 sm:w-5" />}
                      description="In selected period"
                    />
                    <StatsCard
                      title="Show Rate"
                      value={`${stats?.showRate || 0}%`}
                      icon={<Users className="h-4 w-4 sm:h-5 sm:w-5" />}
                      description={`${stats?.completedCalls || 0} showed, ${stats?.noShows || 0} no-shows`}
                    />
                    <StatsCard
                      title="Close Rate"
                      value={`${stats?.closeRate || 0}%`}
                      icon={<TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />}
                      description={`${stats?.dealsClosed || 0} closed / ${stats?.completedCalls || 0} showed`}
                    />
                    <StatsCard
                      title="Pending PCFs"
                      value={stats?.pendingPCFs || 0}
                      icon={<ClipboardCheck className="h-4 w-4 sm:h-5 sm:w-5" />}
                      description="Calls needing PCF"
                      className={stats?.pendingPCFs && stats.pendingPCFs > 0 ? 'border-warning' : ''}
                    />
                  </div>

                  {/* Secondary Stats - 2 cols on mobile, 5 on desktop */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
                    <Card>
                      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-info/10 shrink-0">
                          <Phone className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-info" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl sm:text-2xl font-bold">{stats?.completedCalls || 0}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Show Ups</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-primary/10 shrink-0">
                          <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl sm:text-2xl font-bold">{stats?.offersMade || 0}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Offers Made</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-success/10 shrink-0">
                          <CheckCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl sm:text-2xl font-bold">{stats?.dealsClosed || 0}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Deals Closed</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-success/10 shrink-0">
                          <DollarSign className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-success" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl sm:text-2xl font-bold">
                            ${(cashCollected || 0).toLocaleString()}
                          </p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Cash Collected</p>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
                        <div className="p-1.5 sm:p-2 rounded-lg bg-destructive/10 shrink-0">
                          <XCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-destructive" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xl sm:text-2xl font-bold">{stats?.noShows || 0}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">No Shows</p>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Events Table */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle>Your Calls</CardTitle>
                        {events && events.length >= 500 && (
                          <Badge variant="outline" className="text-warning border-warning">
                            Showing first 500 events
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        {filteredEvents.length} of {events?.length || 0} calls • {pcfStatusFilter === 'pending' ? 'Pending PCFs' : pcfStatusFilter === 'completed' ? 'Completed PCFs' : 'All calls'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <RepEventsTable
                        events={filteredEvents}
                        onSubmitPCF={(event) => handleOpenPCF(event as Event)}
                        showStatusActions
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="forms">
              <RepFormsTab
                closerName={closerName}
                closerId={closerId}
                organizationId={organizationId}
                portalToken={portalToken}
              />
            </TabsContent>
          </Tabs>
        )}

        {/* Empty State */}
        {!searchSubmitted && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-muted mb-4">
              <User className="h-12 w-12 text-muted-foreground" />
            </div>
            <h3 className="text-xl font-medium mb-2">Select Your Name</h3>
            <p className="text-muted-foreground max-w-md">
              Choose your name from the dropdown above to see your stats and submit post-call forms.
            </p>
          </div>
        )}

        {/* PCF Dialog */}
        <Dialog open={pcfDialogOpen} onOpenChange={setPcfDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                {isEditMode ? 'Edit Post-Call Form' : 'Post-Call Form'}
              </DialogTitle>
              <DialogDescription>
                {selectedEvent?.lead_name} - {selectedEvent && format(new Date(selectedEvent.scheduled_at), 'MMM d, yyyy h:mm a')}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmitPCF} className="space-y-4">
              {/* Lead Info */}
              <div className="p-3 rounded-lg bg-muted">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{selectedEvent?.lead_name}</span>
                </div>
                {selectedEvent?.lead_phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3 w-3" />
                    {selectedEvent.lead_phone}
                  </div>
                )}
                {selectedEvent?.event_name && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                    <Calendar className="h-3 w-3" />
                    <span>{selectedEvent.event_name}</span>
                  </div>
                )}
              </div>

              {/* Dynamic Form Fields */}
              {formFields.map((field) => {
                if (!isFieldVisible(field)) return null;

                // Yes/No buttons
                if (field.type === 'yes_no') {
                  const currentValue = formValues[field.id];
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label>{field.label}</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={currentValue === 'yes' ? 'default' : 'outline'}
                          className="flex-1"
                          onClick={() => updateFieldValue(field.id, 'yes')}
                        >
                          Yes
                        </Button>
                        <Button
                          type="button"
                          variant={currentValue === 'no' ? 'destructive' : 'outline'}
                          className="flex-1"
                          onClick={() => updateFieldValue(field.id, 'no')}
                        >
                          No
                        </Button>
                      </div>
                    </div>
                  );
                }

                // Pipeline Status dropdown
                if (field.type === 'pipeline_status') {
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label>{field.label}</Label>
                      <Select 
                        value={formValues[field.id] || ''} 
                        onValueChange={(val) => updateFieldValue(field.id, val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select stage..." />
                        </SelectTrigger>
                        <SelectContent>
                          {opportunityStatuses?.map(status => (
                            <SelectItem key={status.id} value={status.id}>
                              <div className="flex items-center gap-2">
                                <div 
                                  className="w-3 h-3 rounded-full" 
                                  style={{ backgroundColor: status.color || '#6B7280' }}
                                />
                                {status.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                // Textarea
                if (field.type === 'textarea') {
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Textarea
                        id={field.id}
                        placeholder={field.placeholder || 'Enter notes...'}
                        value={formValues[field.id] || ''}
                        onChange={(e) => updateFieldValue(field.id, e.target.value)}
                        rows={3}
                      />
                    </div>
                  );
                }

                // Select dropdown
                if (field.type === 'select') {
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label>{field.label}</Label>
                      <Select 
                        value={formValues[field.id] || ''} 
                        onValueChange={(val) => updateFieldValue(field.id, val)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={field.placeholder || 'Select...'} />
                        </SelectTrigger>
                        <SelectContent className="bg-popover z-50">
                          {field.options?.map(option => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                }

                // Number input
                if (field.type === 'number') {
                  return (
                    <div key={field.id} className="space-y-2">
                      <Label htmlFor={field.id}>{field.label}</Label>
                      <Input
                        id={field.id}
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder={field.placeholder || '0'}
                        value={formValues[field.id] || ''}
                        onChange={(e) => updateFieldValue(field.id, parseFloat(e.target.value) || 0)}
                      />
                    </div>
                  );
                }

                // Text input (fallback)
                return (
                  <div key={field.id} className="space-y-2">
                    <Label htmlFor={field.id}>{field.label}</Label>
                    <Input
                      id={field.id}
                      type="text"
                      placeholder={field.placeholder || ''}
                      value={formValues[field.id] || ''}
                      onChange={(e) => updateFieldValue(field.id, e.target.value)}
                    />
                  </div>
                );
              })}

              <div className="flex gap-2 pt-2">
                {isEditMode && (
                  <Button 
                    type="button"
                    variant="destructive"
                    onClick={handleClearPCF}
                    disabled={isSubmitting}
                  >
                    Clear
                  </Button>
                )}
                <Button 
                  type="button"
                  variant="outline"
                  onClick={() => setPcfDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  className="flex-1"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {isEditMode ? 'Updating...' : 'Submitting...'}
                    </>
                  ) : (
                    isEditMode ? 'Update PCF' : 'Submit PCF'
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Footer */}
        {!embedded && (
          <footer className="text-center text-sm text-muted-foreground mt-8 py-4 border-t">
            © {new Date().getFullYear()} SalesTracker
          </footer>
        )}
      </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-background">
      {content}
    </div>
  );
}
