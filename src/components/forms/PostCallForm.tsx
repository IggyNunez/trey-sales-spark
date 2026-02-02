import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Loader2, CheckCircle } from 'lucide-react';

const pcfSchema = z.object({
  call_occurred: z.boolean(),
  lead_showed: z.boolean(),
  offer_made: z.boolean(),
  deal_closed: z.boolean(),
  cash_collected: z.number().min(0).optional(),
  payment_type: z.enum(['paid_in_full', 'split_pay', 'deposit']).optional().nullable(),
  notes: z.string().max(2000).optional(),
});

type PCFFormValues = z.infer<typeof pcfSchema>;

interface PostCallFormProps {
  eventId: string;
  leadName: string;
  scheduledAt: string;
  onSuccess?: () => void;
}

export function PostCallForm({ eventId, leadName, scheduledAt, onSuccess }: PostCallFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { user, profile } = useAuth();
  const { toast } = useToast();

  const form = useForm<PCFFormValues>({
    resolver: zodResolver(pcfSchema),
    defaultValues: {
      call_occurred: true,
      lead_showed: true,
      offer_made: false,
      deal_closed: false,
      cash_collected: 0,
      payment_type: null,
      notes: '',
    },
  });

  const watchLeadShowed = form.watch('lead_showed');
  const watchDealClosed = form.watch('deal_closed');

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
      // CRITICAL: First fetch the event to get its organization_id for data isolation
      const { data: eventData, error: eventFetchError } = await supabase
        .from('events')
        .select('organization_id')
        .eq('id', eventId)
        .single();

      if (eventFetchError) throw eventFetchError;

      const organizationId = eventData?.organization_id;

      // Determine event outcome
      let event_outcome: 'no_show' | 'showed_no_offer' | 'showed_offer_no_close' | 'closed' = 'no_show';
      if (data.lead_showed) {
        if (data.deal_closed) {
          event_outcome = 'closed';
        } else if (data.offer_made) {
          event_outcome = 'showed_offer_no_close';
        } else {
          event_outcome = 'showed_no_offer';
        }
      }

      // Insert PCF record - MUST include organization_id for data isolation
      const { error: pcfError } = await supabase.from('post_call_forms').insert({
        event_id: eventId,
        closer_id: user.id,
        closer_name: profile.name,
        call_occurred: data.call_occurred,
        lead_showed: data.lead_showed,
        offer_made: data.offer_made,
        deal_closed: data.deal_closed,
        cash_collected: data.cash_collected || 0,
        payment_type: data.payment_type,
        notes: data.notes || null,
        organization_id: organizationId || undefined,
      });

      if (pcfError) throw pcfError;

      // Update event status
      const { error: eventError } = await supabase
        .from('events')
        .update({
          call_status: data.lead_showed ? 'completed' : 'no_show',
          event_outcome,
          pcf_submitted: true,
          pcf_submitted_at: new Date().toISOString(),
        })
        .eq('id', eventId);

      if (eventError) throw eventError;

      // Create payment record if deal was closed - MUST include organization_id
      if (data.deal_closed && data.cash_collected && data.cash_collected > 0) {
        const { error: paymentError } = await supabase.from('payments').insert({
          event_id: eventId,
          amount: data.cash_collected,
          payment_type: data.payment_type,
          organization_id: organizationId || undefined,
        });

        if (paymentError) throw paymentError;
      }

      setIsSubmitted(true);
      toast({
        title: 'PCF Submitted',
        description: 'Your post-call form has been recorded successfully.',
      });

      onSuccess?.();
    } catch (error: any) {
      toast({
        title: 'Submission Failed',
        description: error.message || 'Failed to submit PCF',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="pt-12 pb-12 text-center">
          <div className="flex justify-center mb-4">
            <div className="rounded-full bg-success/10 p-4">
              <CheckCircle className="h-12 w-12 text-success" />
            </div>
          </div>
          <h3 className="text-xl font-semibold mb-2">PCF Submitted Successfully</h3>
          <p className="text-muted-foreground">
            Your post-call form for {leadName} has been recorded.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Post-Call Form</CardTitle>
        <CardDescription>
          Recording call outcome for <span className="font-medium text-foreground">{leadName}</span>
          <br />
          <span className="text-xs">Scheduled: {new Date(scheduledAt).toLocaleString()}</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="call_occurred"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Call Occurred?</FormLabel>
                      <FormDescription>Did the call take place?</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="lead_showed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Lead Showed?</FormLabel>
                      <FormDescription>Did the lead attend?</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {watchLeadShowed && (
              <div className="grid gap-6 sm:grid-cols-2 animate-fade-in">
                <FormField
                  control={form.control}
                  name="offer_made"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Offer Made?</FormLabel>
                        <FormDescription>Did you make an offer?</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="deal_closed"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Deal Closed?</FormLabel>
                        <FormDescription>Was the deal closed?</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
            )}

            {watchDealClosed && (
              <div className="grid gap-6 sm:grid-cols-2 animate-fade-in">
                <FormField
                  control={form.control}
                  name="cash_collected"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cash Collected ($)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          {...field}
                          onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                        />
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
                      <FormLabel>Payment Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select payment type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="paid_in_full">Paid in Full</SelectItem>
                          <SelectItem value="split_pay">Split Pay</SelectItem>
                          <SelectItem value="deposit">Deposit</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Add any additional notes about the call..."
                      className="min-h-[100px] resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>Optional notes about the call outcome</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Post-Call Form'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}