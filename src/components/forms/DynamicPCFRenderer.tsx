import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, CheckCircle, CalendarIcon, User, Mail, Clock, Phone, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Event, ExistingPCF } from '@/hooks/useEvents';
import type { FormFieldConfig } from '@/components/settings/PCFFormBuilder';

interface DynamicPCFRendererProps {
  event: Event;
  closerName: string;
  callType?: string;
  existingPCF?: ExistingPCF | null;
  onSuccess?: () => void;
}

// Dynamic schema builder based on field configs
function buildSchema(fields: FormFieldConfig[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  
  fields.forEach(field => {
    let fieldSchema: z.ZodTypeAny;
    
    switch (field.type) {
      case 'number':
        fieldSchema = field.required 
          ? z.number({ required_error: `${field.label} is required` })
          : z.number().optional();
        break;
      case 'checkbox':
        fieldSchema = z.boolean().optional();
        break;
      case 'date':
        fieldSchema = field.required
          ? z.date({ required_error: `${field.label} is required` })
          : z.date().optional();
        break;
      default:
        fieldSchema = field.required
          ? z.string().min(1, `${field.label} is required`)
          : z.string().optional();
    }
    
    shape[field.id] = fieldSchema;
  });
  
  // Always include notes field
  if (!shape.notes) {
    shape.notes = z.string().max(2000).optional();
  }
  
  return z.object(shape);
}

export function DynamicPCFRenderer({ event, closerName, callType, existingPCF, onSuccess }: DynamicPCFRendererProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCleared, setIsCleared] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch form config for this organization
  const { data: formConfig, isLoading: configLoading } = useQuery({
    queryKey: ['form-config', event.organization_id, 'post_call_form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_configs')
        .select('*')
        .eq('organization_id', event.organization_id)
        .eq('form_type', 'post_call_form')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!event.organization_id,
  });

  // Fetch opportunity statuses for pipeline_status field type
  const { data: opportunityStatuses } = useQuery({
    queryKey: ['opportunity-statuses', event.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('opportunity_statuses')
        .select('*')
        .eq('organization_id', event.organization_id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data;
    },
    enabled: !!event.organization_id,
  });

  // Fetch custom field definitions for PCF fields (to map form field IDs to definition UUIDs)
  const { data: pcfFieldDefinitions } = useQuery({
    queryKey: ['pcf-field-definitions', event.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_field_definitions')
        .select('id, field_slug, field_name')
        .eq('organization_id', event.organization_id)
        .contains('applies_to', ['post_call_forms']);
      if (error) throw error;
      return data;
    },
    enabled: !!event.organization_id,
  });

  // Fetch metric definitions to link customMetricId to pcf_field_id (custom_field_definitions.id)
  const { data: metricDefinitions } = useQuery({
    queryKey: ['metric-definitions-for-pcf', event.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('metric_definitions')
        .select('id, pcf_field_id')
        .eq('organization_id', event.organization_id)
        .eq('data_source', 'pcf_fields')
        .not('pcf_field_id', 'is', null);
      if (error) throw error;
      return data;
    },
    enabled: !!event.organization_id,
  });

  const fields: FormFieldConfig[] = (formConfig?.fields as unknown as FormFieldConfig[]) || [];
  const schema = buildSchema(fields);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {},
  });

  const watchedValues = form.watch();

  // Check if a field should be visible based on conditional logic
  const isFieldVisible = (field: FormFieldConfig): boolean => {
    if (!field.conditionalOn) return true;
    const dependentValue = watchedValues[field.conditionalOn];
    return dependentValue === field.conditionalValue;
  };

  const isEditMode = !!existingPCF && !isCleared;

  const handleClearResponses = async () => {
    if (!existingPCF) return;
    setIsClearing(true);

    try {
      const { error: paymentDeleteError } = await supabase
        .from('payments')
        .delete()
        .eq('event_id', event.id);

      if (paymentDeleteError) throw paymentDeleteError;

      const { error: pcfError } = await supabase
        .from('post_call_forms')
        .delete()
        .eq('id', existingPCF.id);

      if (pcfError) throw pcfError;

      const { error: eventError } = await supabase
        .from('events')
        .update({
          call_status: 'scheduled',
          event_outcome: null,
          pcf_submitted: false,
          pcf_submitted_at: null,
        })
        .eq('id', event.id);

      if (eventError) throw eventError;

      setIsCleared(true);
      form.reset({});

      // Invalidate all relevant queries to refresh data across the app
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['events'] }),
        queryClient.invalidateQueries({ queryKey: ['event', event.id] }),
        queryClient.invalidateQueries({ queryKey: ['existing-pcf', event.id] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['closer-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['custom-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['metric-preview-data'] }),
        queryClient.invalidateQueries({ queryKey: ['custom-metrics-values'] }),
        queryClient.invalidateQueries({ queryKey: ['configurable-metrics'] }),
        queryClient.invalidateQueries({ queryKey: ['rep-stats'] }),
        queryClient.invalidateQueries({ queryKey: ['post-call-forms'] }),
      ]);

      toast({ title: 'Responses Cleared', description: 'The PCF data has been cleared.' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsClearing(false);
    }
  };

  const onSubmit = async (data: FormValues) => {
    if (!user || !profile) {
      toast({ title: 'Error', description: 'You must be logged in', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);

    try {
      // Map form field values to database columns based on mapsToMetric config
      let leadShowed = false;
      let offerMade = false;
      let dealClosed = false;
      let cashCollected = 0;
      let wasRescheduled = false;
      let wasCanceled = false;
      let pipelineStatusId: string | null = null;
      let pcfOutcomeLabel: string | null = null;

      // Process each field's metric mapping
      fields.forEach(field => {
        const value = data[field.id];
        
        switch (field.mapsToMetric) {
          case 'show_rate':
            leadShowed = value === 'yes' || value === true;
            break;
          case 'offer_rate':
            offerMade = value === 'yes' || value === true;
            break;
          case 'close_rate':
            dealClosed = value === 'yes' || value === true;
            break;
          case 'cash_collected':
            cashCollected = typeof value === 'number' ? value : parseFloat(value as string) || 0;
            break;
          case 'reschedule_rate':
            wasRescheduled = value === 'yes' || value === true;
            break;
          case 'cancel_rate':
            wasCanceled = value === 'yes' || value === true;
            break;
        }
        
        // Handle pipeline status field type
        if (field.type === 'pipeline_status') {
          pipelineStatusId = value as string || null;
          // Capture the actual outcome label selected
          const selectedStatus = opportunityStatuses?.find(s => s.id === value);
          if (selectedStatus) {
            pcfOutcomeLabel = selectedStatus.name;
          }
        }
        
        // Also capture outcome label from select fields related to outcome/status
        if (field.type === 'select' && 
            (field.id.toLowerCase().includes('outcome') || 
             field.id.toLowerCase().includes('status') ||
             field.label.toLowerCase().includes('outcome') ||
             field.label.toLowerCase().includes('status'))) {
          const selectedOption = field.options?.find(o => o.value === value);
          if (selectedOption && !pcfOutcomeLabel) {
            pcfOutcomeLabel = selectedOption.label;
          }
        }
      });

      // Fallback: Check for legacy field IDs if no metric mapping found
      if (!fields.some(f => f.mapsToMetric === 'show_rate')) {
        leadShowed = data.lead_showed === 'yes';
      }
      if (!fields.some(f => f.mapsToMetric === 'offer_rate')) {
        offerMade = data.offer_made === 'yes';
      }
      if (!fields.some(f => f.mapsToMetric === 'cash_collected')) {
        cashCollected = typeof data.cash_collected === 'number' ? data.cash_collected : 0;
      }
      if (!pipelineStatusId) {
        pipelineStatusId = (data.pipeline_status || data.opportunity_status_id) as string || null;
      }

      // Pipeline statuses that indicate specific outcomes - order matters for matching priority
      const CLOSED_STATUSES = ['Closed Won', 'Won'];
      const NOT_QUALIFIED_STATUSES = ['Unqualified', 'Not Qualified', 'Disqualified', 'DQ'];
      const LOST_STATUSES = ['Lost'];
      const RESCHEDULED_STATUSES = ['Needs Reschedule', 'Rescheduled', 'Reschedule'];
      const CANCELED_STATUSES = ['Canceled', 'Cancelled', 'Cancel'];
      const NO_SHOW_STATUSES = ['No Show', 'No-Show', 'NoShow', 'DNS', 'Did Not Show'];
      
      // Check if it's a closed deal based on pipeline status (if not already set by close_rate mapping)
      const selectedStatus = pipelineStatusId ? opportunityStatuses?.find(s => s.id === pipelineStatusId) : null;
      const statusName = selectedStatus?.name || '';
      
      if (!fields.some(f => f.mapsToMetric === 'close_rate') && pipelineStatusId) {
        dealClosed = CLOSED_STATUSES.some(s => statusName.toLowerCase() === s.toLowerCase());
      }
      
      // Determine event outcome and call status based on pipeline status first, then mapped values
      let event_outcome: 'no_show' | 'showed_no_offer' | 'showed_offer_no_close' | 'closed' | 'not_qualified' | 'lost' | 'rescheduled' | 'canceled' = 'no_show';
      let call_status = 'no_show';
      
      const statusLower = statusName.toLowerCase();
      
      // Priority order: Check specific status names first
      if (NO_SHOW_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'no_show';
        call_status = 'no_show';
      } else if (wasCanceled || CANCELED_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'canceled';
        call_status = 'canceled';
      } else if (wasRescheduled || RESCHEDULED_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'rescheduled';
        call_status = 'rescheduled';
      } else if (NOT_QUALIFIED_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'not_qualified';
        call_status = 'completed';
      } else if (LOST_STATUSES.some(s => statusLower === s.toLowerCase())) {
        event_outcome = 'lost';
        call_status = 'completed';
      } else if (!leadShowed) {
        // If lead didn't show and no specific status, default to no_show
        event_outcome = 'no_show';
        call_status = 'no_show';
      } else if (dealClosed) {
        event_outcome = 'closed';
        call_status = 'completed';
      } else if (offerMade) {
        event_outcome = 'showed_offer_no_close';
        call_status = 'completed';
      } else {
        event_outcome = 'showed_no_offer';
        call_status = 'completed';
      }

      const pcfData = {
        event_id: event.id,
        closer_id: user.id,
        closer_name: profile.name,
        call_occurred: leadShowed && !wasCanceled && !wasRescheduled,
        lead_showed: leadShowed,
        offer_made: offerMade,
        deal_closed: dealClosed,
        cash_collected: cashCollected,
        payment_type: data.payment_type || null,
        notes: data.notes || null,
        opportunity_status_id: pipelineStatusId,
        close_date: data.close_date instanceof Date ? data.close_date.toISOString() : null,
        organization_id: event.organization_id,
      };

      if (isEditMode && existingPCF) {
        const { error } = await supabase
          .from('post_call_forms')
          .update(pcfData)
          .eq('id', existingPCF.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('post_call_forms').insert(pcfData);
        if (error) throw error;
      }

      const { error: eventError } = await supabase
        .from('events')
        .update({
          call_status,
          event_outcome,
          pcf_submitted: true,
          pcf_submitted_at: new Date().toISOString(),
          pcf_outcome_label: pcfOutcomeLabel,
        })
        .eq('id', event.id);

      if (eventError) throw eventError;

      // Handle payment if deal closed
      if (dealClosed && cashCollected > 0) {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('event_id', event.id)
          .maybeSingle();

        const paymentData = {
          amount: cashCollected,
          payment_type: data.payment_type,
          payment_date: data.close_date instanceof Date ? data.close_date.toISOString() : new Date().toISOString(),
        };

        if (existingPayment) {
          await supabase.from('payments').update(paymentData).eq('id', existingPayment.id);
        } else {
          await supabase.from('payments').insert({
            ...paymentData,
            event_id: event.id,
            organization_id: event.organization_id,
          });
        }
      }

      // CRM Sync: Process fields with crmSync configuration (works with any CRM)
      if (event.organization_id) {
        const noteLines: string[] = [];
        let pipelineStageId: string | null = null;
        let pipelineId: string | null = null;

        // Collect notes and pipeline stage from fields with crmSync config
        fields.forEach(field => {
          const crmSync = (field as any).crmSync;
          if (!crmSync) return;

          const value = data[field.id];
          if (value === undefined || value === null || value === '') return;

          if (crmSync.syncType === 'notes') {
            // Add field label and value to notes
            const displayValue = field.options?.find(o => o.value === value)?.label || String(value);
            noteLines.push(`${field.label}: ${displayValue}`);
          } else if (crmSync.syncType === 'pipeline_stage') {
            // The field value IS the stage ID (since we auto-populated options with stages)
            pipelineStageId = String(value);
            pipelineId = crmSync.pipelineId || null;
          }
        });

        // Also add general notes field if it exists
        const notesField = fields.find(f => f.type === 'textarea' && (f.id === 'notes' || f.label.toLowerCase() === 'notes'));
        if (notesField && data[notesField.id]) {
          const existingNoteIndex = noteLines.findIndex(n => n.startsWith(`${notesField.label}:`));
          if (existingNoteIndex === -1) {
            noteLines.push(`${notesField.label}: ${data[notesField.id]}`);
          }
        }

        // Call unified sync-crm-notes function (auto-detects connected CRM)
        if (noteLines.length > 0 || pipelineStageId) {
          try {
            const syncPayload: Record<string, any> = {
              organization_id: event.organization_id,
              event_id: event.id,
            };

            if (noteLines.length > 0) {
              syncPayload.notes = `📞 Post-Call Form Submitted\n${noteLines.join('\n')}`;
            }

            if (pipelineStageId && pipelineId) {
              syncPayload.pipeline_stage = {
                pipeline_id: pipelineId,
                stage_id: pipelineStageId,
              };
            }

            const { error: syncError } = await supabase.functions.invoke('sync-crm-notes', {
              body: syncPayload,
            });

            if (syncError) {
              console.error('Failed to sync to CRM:', syncError);
            } else {
              console.log('Successfully synced to CRM');
            }
          } catch (syncErr) {
            console.error('Error syncing to CRM:', syncErr);
          }
        }
      }

      // Save custom form field values for metric tracking
      // This saves yes/no field responses so they can be queried for custom metrics
      if (event.organization_id) {
        const yesNoFields = fields.filter(f => f.type === 'yes_no');
        console.log('[PCF Debug] Processing yes/no fields:', yesNoFields.map(f => ({ 
          id: f.id, 
          label: f.label, 
          mapsToMetric: f.mapsToMetric,
          customMetricId: f.customMetricId 
        })));
        console.log('[PCF Debug] Available pcfFieldDefinitions:', pcfFieldDefinitions);
        console.log('[PCF Debug] Available metricDefinitions:', metricDefinitions);
        
        for (const field of yesNoFields) {
          const fieldValue = data[field.id];
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
                  record_id: event.id,
                  record_type: 'post_call_forms',
                  value: { response: booleanValue },
                  organization_id: event.organization_id,
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

      setIsSubmitted(true);
      toast({ title: 'Success!', description: isEditMode ? 'Form updated.' : 'Form submitted.' });
      onSuccess?.();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (configLoading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If no custom config, show message
  if (!formConfig || fields.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No form configuration found. Please set up your PCF in Settings.
        </CardContent>
      </Card>
    );
  }

  if (isSubmitted) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md w-full shadow-subtle border-border/50">
          <CardContent className="pt-12 pb-12 text-center">
            <div className="flex justify-center mb-6">
              <div className="rounded-full bg-primary/10 p-5">
                <CheckCircle className="h-10 w-10 text-primary" />
              </div>
            </div>
            <h3 className="font-display text-2xl font-semibold mb-2">
              {isEditMode ? 'Form Updated' : 'Form Submitted'}
            </h3>
            <p className="text-muted-foreground">
              Your call with <span className="font-medium text-foreground">{event.lead_name}</span> has been logged.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 px-1">
      {isEditMode && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-muted/50 px-3 sm:px-4 py-2 rounded-lg">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Edit className="h-4 w-4" />
            <span>Editing previously submitted PCF</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearResponses}
            disabled={isClearing}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            {isClearing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Clear Responses
          </Button>
        </div>
      )}

      {/* Lead Info */}
      <Card className="shadow-subtle border-border/50 overflow-hidden">
        <div className="bg-foreground text-background px-4 sm:px-6 py-3 sm:py-4">
          <h2 className="font-display text-base sm:text-lg font-semibold">Lead Information</h2>
        </div>
        <CardContent className="p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Name</p>
                <p className="font-medium truncate">{event.lead_name}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                <Mail className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Email</p>
                <p className="font-medium text-sm break-all">{event.lead_email}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-accent/10 p-2 shrink-0">
                <Clock className="h-4 w-4 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Scheduled</p>
                <p className="font-medium text-sm sm:text-base">{format(new Date(event.scheduled_at), 'MMM d, yyyy · h:mm a')}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-accent/10 p-2 shrink-0">
                <Phone className="h-4 w-4 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Call Type</p>
                <p className="font-medium">{callType || 'Sales Call'}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dynamic Form */}
      <Card className="shadow-subtle border-border/50">
        <CardHeader className="border-b border-border/50 pb-4 px-4 sm:px-6">
          <CardTitle className="font-display text-base sm:text-lg">Call Outcome</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6">
              {fields.map((fieldConfig) => {
                if (!isFieldVisible(fieldConfig)) return null;

                return (
                  <FormField
                    key={fieldConfig.id}
                    control={form.control}
                    name={fieldConfig.id}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-base">{fieldConfig.label}</FormLabel>
                        
                        {fieldConfig.type === 'yes_no' && (
                          <div className="flex gap-2 sm:gap-3">
                            <Button
                              type="button"
                              variant={field.value === 'yes' ? 'default' : 'outline'}
                              className={cn("flex-1 h-12 sm:h-10", field.value === 'yes' && "bg-primary hover:bg-primary/90")}
                              onClick={() => field.onChange('yes')}
                            >
                              Yes
                            </Button>
                            <Button
                              type="button"
                              variant={field.value === 'no' ? 'destructive' : 'outline'}
                              className="flex-1 h-12 sm:h-10"
                              onClick={() => field.onChange('no')}
                            >
                              No
                            </Button>
                          </div>
                        )}

                        {fieldConfig.type === 'text' && (
                          <FormControl>
                            <Input
                              {...field}
                              placeholder={fieldConfig.placeholder}
                              className="h-12 sm:h-10"
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === 'number' && (
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder={fieldConfig.placeholder || '0.00'}
                                className="pl-7 h-12 sm:h-10"
                                value={field.value || ''}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </FormControl>
                        )}

                        {fieldConfig.type === 'textarea' && (
                          <FormControl>
                            <Textarea
                              {...field}
                              placeholder={fieldConfig.placeholder}
                              className="min-h-[100px]"
                            />
                          </FormControl>
                        )}

                        {fieldConfig.type === 'select' && (
                          <FormControl>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <SelectTrigger className="h-12 sm:h-10">
                                <SelectValue placeholder={fieldConfig.placeholder || 'Select...'} />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                {fieldConfig.options?.map((option) => (
                                  <SelectItem key={option.value} value={option.value}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                        )}

                        {fieldConfig.type === 'pipeline_status' && (
                          <FormControl>
                            <Select onValueChange={field.onChange} value={field.value || ''}>
                              <SelectTrigger className="h-12 sm:h-10">
                                <SelectValue placeholder="Move to status..." />
                              </SelectTrigger>
                              <SelectContent className="bg-popover z-50">
                                {opportunityStatuses?.map((status) => (
                                  <SelectItem key={status.id} value={status.id}>
                                    {status.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </FormControl>
                        )}

                        {fieldConfig.type === 'date' && (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full h-12 sm:h-10 justify-start text-left font-normal",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value instanceof Date ? format(field.value, 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0 bg-popover z-50">
                              <Calendar
                                mode="single"
                                selected={field.value instanceof Date ? field.value : undefined}
                                onSelect={field.onChange}
                                initialFocus
                              />
                            </PopoverContent>
                          </Popover>
                        )}

                        {fieldConfig.type === 'checkbox' && (
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={!!field.value}
                              onCheckedChange={field.onChange}
                            />
                            <span className="text-sm text-muted-foreground">{fieldConfig.placeholder}</span>
                          </div>
                        )}

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                );
              })}

              <Button type="submit" className="w-full h-12" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {isEditMode ? 'Update Post-Call Form' : 'Submit Post-Call Form'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}