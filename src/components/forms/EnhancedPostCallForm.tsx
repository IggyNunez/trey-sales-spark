import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Loader2, CheckCircle, CalendarIcon, User, Mail, Clock, Phone, Edit, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Event, ExistingPCF } from '@/hooks/useEvents';

const pcfSchema = z.object({
  lead_showed: z.string().min(1, 'Required'),
  offer_made: z.string().optional(),
  opportunity_status_id: z.string().optional(),
  notes: z.string().max(2000).optional(),
  close_date: z.date().optional(),
  cash_collected: z.number().min(0).optional(),
  payment_type: z.enum(['paid_in_full', 'split_pay', 'deposit']).optional().nullable(),
});

type PCFFormValues = z.infer<typeof pcfSchema>;

interface EnhancedPostCallFormProps {
  event: Event;
  closerName: string;
  callType?: string;
  existingPCF?: ExistingPCF | null;
  onSuccess?: () => void;
}

// Pipeline statuses that indicate a closed deal
const CLOSED_STATUSES = ['Closed Won', 'Won'];

// Pipeline statuses that indicate specific outcomes - order matters for matching priority
const NOT_QUALIFIED_STATUSES = ['Unqualified', 'Not Qualified', 'Disqualified', 'DQ'];
const LOST_STATUSES = ['Lost'];
const RESCHEDULED_STATUSES = ['Needs Reschedule', 'Rescheduled', 'Reschedule'];
const CANCELED_STATUSES = ['Canceled', 'Cancelled', 'Cancel'];
const NO_SHOW_STATUSES = ['No Show', 'No-Show', 'NoShow', 'DNS', 'Did Not Show'];

export function EnhancedPostCallForm({ event, closerName, callType, existingPCF, onSuccess }: EnhancedPostCallFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isCleared, setIsCleared] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch opportunity statuses based on the event's organization, not global context
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

  const isEditMode = !!existingPCF && !isCleared;

  const form = useForm<PCFFormValues>({
    resolver: zodResolver(pcfSchema),
    defaultValues: {
      lead_showed: existingPCF ? (existingPCF.lead_showed ? 'yes' : 'no') : '',
      offer_made: existingPCF ? (existingPCF.offer_made ? 'yes' : 'no') : '',
      opportunity_status_id: existingPCF?.opportunity_status_id || '',
      notes: existingPCF?.notes || '',
      close_date: existingPCF?.close_date ? new Date(existingPCF.close_date) : undefined,
      cash_collected: existingPCF?.cash_collected || 0,
      payment_type: existingPCF?.payment_type || null,
    },
  });

  // Reset form when existingPCF changes
  useEffect(() => {
    if (existingPCF) {
      form.reset({
        lead_showed: existingPCF.lead_showed ? 'yes' : 'no',
        offer_made: existingPCF.offer_made ? 'yes' : 'no',
        opportunity_status_id: existingPCF.opportunity_status_id || '',
        notes: existingPCF.notes || '',
        close_date: existingPCF.close_date ? new Date(existingPCF.close_date) : undefined,
        cash_collected: existingPCF.cash_collected || 0,
        payment_type: existingPCF.payment_type || null,
      });
    }
  }, [existingPCF, form]);

  const watchLeadShowed = form.watch('lead_showed');
  const watchOfferMade = form.watch('offer_made');
  const watchOpportunityStatusId = form.watch('opportunity_status_id');

  // Determine if deal is closed based on pipeline status
  const selectedStatus = opportunityStatuses?.find(s => s.id === watchOpportunityStatusId);
  const isClosedDeal = selectedStatus ? CLOSED_STATUSES.includes(selectedStatus.name) : false;

  // Check if Close is configured for this organization
  const { data: orgIntegrations } = useQuery({
    queryKey: ['org-integrations', event.organization_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('close_api_key, ghl_api_key')
        .eq('organization_id', event.organization_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!event.organization_id,
  });

  const syncToClose = async (data: {
    eventId: string;
    leadEmail: string;
    notes?: string;
    pipelineStatus?: string;
    dealClosed: boolean;
    cashCollected?: number;
  }) => {
    if (!event.organization_id) {
      console.error('No organization ID on event for Close sync');
      return;
    }
    // Skip if Close is not configured
    if (!orgIntegrations?.close_api_key) {
      console.log('Close not configured for this organization, skipping sync');
      return;
    }
    try {
      const { error } = await supabase.functions.invoke('sync-close', {
        body: { ...data, organizationId: event.organization_id },
      });
      if (error) {
        console.error('Failed to sync to Close:', error);
      } else {
        console.log('Synced to Close successfully');
      }
    } catch (e) {
      console.error('Error syncing to Close:', e);
    }
  };

  const syncToGHL = async (data: {
    ghlContactId: string;
    organizationId: string;
    pipelineStatus?: string;
    notes?: string;
    leadShowed: boolean;
    offerMade: boolean;
    dealClosed: boolean;
    cashCollected?: number;
  }) => {
    try {
      // Build custom fields based on PCF data
      const customFields: Record<string, any> = {};
      const tags: string[] = [];
      
      // Add tags based on outcome
      if (data.dealClosed) {
        tags.push('Closed Won');
      } else if (data.offerMade) {
        tags.push('Offer Made');
      } else if (data.leadShowed) {
        tags.push('Showed');
      } else {
        tags.push('No Show');
      }

      // Build note from PCF
      const noteLines = [
        `📞 Post-Call Form Submitted`,
        `Lead Showed: ${data.leadShowed ? 'Yes' : 'No'}`,
        `Offer Made: ${data.offerMade ? 'Yes' : 'No'}`,
        `Deal Closed: ${data.dealClosed ? 'Yes' : 'No'}`,
      ];
      if (data.pipelineStatus) {
        noteLines.push(`Pipeline Status: ${data.pipelineStatus}`);
      }
      if (data.cashCollected && data.cashCollected > 0) {
        noteLines.push(`Cash Collected: $${data.cashCollected.toLocaleString()}`);
      }
      if (data.notes) {
        noteLines.push(`Notes: ${data.notes}`);
      }

      const { error } = await supabase.functions.invoke('update-ghl-contact', {
        body: {
          ghl_contact_id: data.ghlContactId,
          organization_id: data.organizationId,
          custom_fields: customFields,
          tags,
          notes: noteLines.join('\n'),
        },
      });
      
      if (error) {
        console.error('Failed to sync to GHL:', error);
      } else {
        console.log('Synced to GHL successfully');
      }
    } catch (e) {
      console.error('Error syncing to GHL:', e);
    }
  };

  const handleClearResponses = async () => {
    if (!existingPCF) return;

    setIsClearing(true);

    try {
      // Delete any associated payment
      const { error: paymentDeleteError } = await supabase
        .from('payments')
        .delete()
        .eq('event_id', event.id);

      if (paymentDeleteError) {
        throw new Error(`Failed to delete payment: ${paymentDeleteError.message}`);
      }

      // Delete the PCF
      const { error: pcfError } = await supabase
        .from('post_call_forms')
        .delete()
        .eq('id', existingPCF.id);

      if (pcfError) throw pcfError;

      // Reset the event
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
      
      // Reset form to blank state
      form.reset({
        lead_showed: '',
        offer_made: '',
        opportunity_status_id: '',
        notes: '',
        close_date: undefined,
        cash_collected: 0,
        payment_type: null,
      });

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

      toast({
        title: 'Responses Cleared',
        description: 'The PCF has been cleared and will no longer factor into stats.',
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to clear responses';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsClearing(false);
    }
  };

  const onSubmit = async (data: PCFFormValues) => {
    if (!user || !profile) {
      toast({
        title: 'Error',
        description: 'You must be logged in to submit a PCF',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const leadShowed = data.lead_showed === 'yes';
      const offerMade = data.offer_made === 'yes';
      const dealClosed = isClosedDeal;

      // Determine event outcome based on pipeline status first, then fall back to boolean logic
      let event_outcome: 'no_show' | 'showed_no_offer' | 'showed_offer_no_close' | 'closed' | 'not_qualified' | 'lost' | 'rescheduled' | 'canceled' = 'no_show';
      let call_status = 'no_show';
      
      // Check pipeline status for specific outcomes
      const statusName = selectedStatus?.name || '';
      const statusLower = statusName.toLowerCase();
      
      // Priority order: Check specific status names first
      if (NO_SHOW_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'no_show';
        call_status = 'no_show';
      } else if (CANCELED_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
        event_outcome = 'canceled';
        call_status = 'canceled';
      } else if (RESCHEDULED_STATUSES.some(s => statusLower === s.toLowerCase() || statusLower.includes(s.toLowerCase()))) {
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
        call_occurred: true,
        lead_showed: leadShowed,
        offer_made: offerMade,
        deal_closed: dealClosed,
        cash_collected: data.cash_collected || 0,
        payment_type: data.payment_type,
        notes: data.notes || null,
        opportunity_status_id: data.opportunity_status_id || null,
        close_date: data.close_date?.toISOString() || null,
        organization_id: event.organization_id,
      };

      if (isEditMode && existingPCF) {
        // Update existing PCF
        const { error: pcfError } = await supabase
          .from('post_call_forms')
          .update(pcfData)
          .eq('id', existingPCF.id);

        if (pcfError) throw pcfError;
      } else {
        // Insert new PCF
        const { error: pcfError } = await supabase.from('post_call_forms').insert(pcfData);
        if (pcfError) throw pcfError;
      }

      const { error: eventError } = await supabase
        .from('events')
        .update({
          call_status,
          event_outcome,
          pcf_submitted: true,
          pcf_submitted_at: new Date().toISOString(),
        })
        .eq('id', event.id);

      if (eventError) throw eventError;

      // Handle payment - only for new deals or updated amounts
      if (dealClosed && data.cash_collected && data.cash_collected > 0) {
        // Check if payment already exists
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id')
          .eq('event_id', event.id)
          .maybeSingle();

        if (existingPayment) {
          const { error: paymentUpdateError } = await supabase
            .from('payments')
            .update({
              amount: data.cash_collected,
              payment_type: data.payment_type,
              payment_date: data.close_date?.toISOString() || new Date().toISOString(),
            })
            .eq('id', existingPayment.id);

          if (paymentUpdateError) {
            throw new Error(`Failed to update payment: ${paymentUpdateError.message}`);
          }
        } else {
          // MUST include organization_id for data isolation
          const { error: paymentInsertError } = await supabase
            .from('payments')
            .insert({
              event_id: event.id,
              amount: data.cash_collected,
              payment_type: data.payment_type,
              payment_date: data.close_date?.toISOString() || new Date().toISOString(),
              organization_id: event.organization_id || undefined,
            });

          if (paymentInsertError) {
            throw new Error(`Failed to create payment: ${paymentInsertError.message}`);
          }
        }
      }

      // Sync to Close CRM
      await syncToClose({
        eventId: event.id,
        leadEmail: event.lead_email,
        notes: data.notes,
        pipelineStatus: selectedStatus?.name,
        dealClosed,
        cashCollected: data.cash_collected,
      });

      // Sync to GHL if contact ID exists and GHL is configured
      if (event.ghl_contact_id && event.organization_id && orgIntegrations?.ghl_api_key) {
        await syncToGHL({
          ghlContactId: event.ghl_contact_id,
          organizationId: event.organization_id,
          pipelineStatus: selectedStatus?.name,
          notes: data.notes,
          leadShowed,
          offerMade,
          dealClosed,
          cashCollected: data.cash_collected,
        });
      }

      setIsSubmitted(true);
      toast({
        title: 'Success!',
        description: isEditMode 
          ? 'Post-call form updated and synced.' 
          : 'Post-call form submitted and synced.',
      });

      onSuccess?.();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit PCF';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

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
              Your call with <span className="font-medium text-foreground">{event.lead_name}</span> has been {isEditMode ? 'updated' : 'logged'} and synced to Close.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4 sm:space-y-6 px-1">
      {/* Edit Mode Badge with Clear Button */}
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
            className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full sm:w-auto"
          >
            {isClearing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            Clear Responses
          </Button>
        </div>
      )}

      {/* Lead Info Card */}
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

      {/* Form */}
      <Card className="shadow-subtle border-border/50">
        <CardHeader className="border-b border-border/50 pb-4 px-4 sm:px-6">
          <CardTitle className="font-display text-base sm:text-lg">Call Outcome</CardTitle>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 sm:space-y-6">
              {/* Lead Showed */}
              <FormField
                control={form.control}
                name="lead_showed"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">Did the lead show up?</FormLabel>
                    <div className="flex gap-2 sm:gap-3">
                      <Button
                        type="button"
                        variant={field.value === 'yes' ? 'default' : 'outline'}
                        className={cn(
                          "flex-1 h-12 sm:h-10 text-sm sm:text-base",
                          field.value === 'yes' && "bg-primary hover:bg-primary/90"
                        )}
                        onClick={() => field.onChange('yes')}
                      >
                        Yes, showed
                      </Button>
                      <Button
                        type="button"
                        variant={field.value === 'no' ? 'destructive' : 'outline'}
                        className="flex-1 h-12 sm:h-10 text-sm sm:text-base"
                        onClick={() => field.onChange('no')}
                      >
                        No show
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Offer Made */}
              {watchLeadShowed === 'yes' && (
                <FormField
                  control={form.control}
                  name="offer_made"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm sm:text-base">Did you make an offer?</FormLabel>
                      <div className="flex gap-2 sm:gap-3">
                        <Button
                          type="button"
                          variant={field.value === 'yes' ? 'default' : 'outline'}
                          className={cn(
                            "flex-1 h-12 sm:h-10 text-sm sm:text-base",
                            field.value === 'yes' && "bg-primary hover:bg-primary/90"
                          )}
                          onClick={() => field.onChange('yes')}
                        >
                          Yes
                        </Button>
                        <Button
                          type="button"
                          variant={field.value === 'no' ? 'secondary' : 'outline'}
                          className="flex-1 h-12 sm:h-10 text-sm sm:text-base"
                          onClick={() => field.onChange('no')}
                        >
                          No
                        </Button>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Pipeline Status */}
              <FormField
                control={form.control}
                name="opportunity_status_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">Pipeline status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || ""}>
                      <SelectTrigger className="bg-background h-12 sm:h-10 text-sm sm:text-base">
                        <SelectValue placeholder="Move to status..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        {opportunityStatuses?.map((status) => (
                          <SelectItem key={status.id} value={status.id} className="text-sm sm:text-base py-3 sm:py-2">
                            {status.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Payment Section - Only if closed (determined by pipeline status) */}
              {isClosedDeal && (
                <div className="space-y-4 p-3 sm:p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <h4 className="font-display font-semibold text-primary text-sm sm:text-base">💰 Deal Closed!</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cash_collected"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Cash Collected</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                              <Input
                                type="number"
                                inputMode="decimal"
                                min="0"
                                step="0.01"
                                placeholder="0.00"
                                className="pl-7 bg-background h-12 sm:h-10 text-base"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                              />
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="payment_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm">Payment Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger className="bg-background h-12 sm:h-10 text-sm sm:text-base">
                                <SelectValue placeholder="Select..." />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent className="bg-popover">
                              <SelectItem value="paid_in_full" className="py-3 sm:py-2">Paid in Full</SelectItem>
                              <SelectItem value="split_pay" className="py-3 sm:py-2">Split Pay</SelectItem>
                              <SelectItem value="deposit" className="py-3 sm:py-2">Deposit</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="close_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm">Close Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal bg-background h-12 sm:h-10 text-sm sm:text-base",
                                  !field.value && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? format(field.value, "PPP") : "Pick a date"}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-popover" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                              className="pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm sm:text-base">Notes</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Add any notes about the call..."
                        className="min-h-[100px] bg-background resize-none text-base"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Submit */}
              <Button type="submit" className="w-full h-12 sm:h-10 text-base" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    {isEditMode ? 'Updating...' : 'Submitting...'}
                  </>
                ) : (
                  isEditMode ? 'Update Post-Call Form' : 'Submit Post-Call Form'
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}