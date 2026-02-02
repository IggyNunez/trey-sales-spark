import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, CheckCircle, Clock, ArrowRight } from 'lucide-react';
import { format, startOfDay } from 'date-fns';
import { RepFormSubmitter } from './RepFormSubmitter';
import type { FormDefinition } from '@/types/dynamicForms';

interface RepFormsTabProps {
  closerName: string;
  closerId?: string;
  organizationId: string;
  portalToken?: string | null;
}

export function RepFormsTab({ closerName, closerId, organizationId, portalToken }: RepFormsTabProps) {
  const [selectedForm, setSelectedForm] = useState<FormDefinition | null>(null);
  const [formDialogOpen, setFormDialogOpen] = useState(false);

  // Helper to build headers for edge function calls
  const getEdgeFunctionHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (portalToken) {
      headers['x-portal-token'] = portalToken;
    }
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
    if (anonKey) {
      headers['apikey'] = anonKey;
      headers['Authorization'] = `Bearer ${anonKey}`;
    }
    return headers;
  };

  // Fetch forms assigned to this closer
  const { data: assignedForms, isLoading: formsLoading } = useQuery({
    queryKey: ['assigned-forms', closerName, organizationId, portalToken],
    queryFn: async () => {
      // Use edge function if portal token is present (magic link flow)
      if (portalToken) {
        const params = new URLSearchParams({
          action: 'get_dynamic_forms',
          closer_name: closerName,
        });
        if (closerId) params.append('closer_id', closerId);

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?${params.toString()}`,
          { headers: getEdgeFunctionHeaders() }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch forms');
        }

        const result = await response.json();
        return result.forms as FormDefinition[];
      }

      // Standard authenticated flow
      const { data, error } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;

      // Filter forms that are either:
      // 1. Assigned to this closer specifically
      // 2. Have no assigned_closers (available to all)
      // 3. Entity type is 'closer' (personal forms)
      return (data as FormDefinition[]).filter(form => {
        const assignedClosers = form.assigned_closers || [];
        const isAssigned = assignedClosers.length === 0 || 
                          assignedClosers.includes(closerName) || 
                          (closerId && assignedClosers.includes(closerId));
        return isAssigned && form.entity_type === 'closer';
      });
    },
    enabled: !!organizationId && !!closerName,
  });

  // Fetch today's submissions for this closer
  const { data: todaySubmissions, refetch: refetchSubmissions } = useQuery({
    queryKey: ['today-submissions', closerName, organizationId, portalToken],
    queryFn: async () => {
      // Use edge function if portal token is present
      if (portalToken) {
        const params = new URLSearchParams({
          action: 'get_today_submissions',
          closer_name: closerName,
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?${params.toString()}`,
          { headers: getEdgeFunctionHeaders() }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch submissions');
        }

        const result = await response.json();
        return result.submissions;
      }

      // Standard authenticated flow
      const today = startOfDay(new Date());
      
      const { data, error } = await supabase
        .from('form_submissions')
        .select('id, form_definition_id, submitted_at')
        .eq('organization_id', organizationId)
        .eq('entity_name', closerName)
        .gte('submitted_at', today.toISOString())
        .order('submitted_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!organizationId && !!closerName,
  });

  const handleFormClick = (form: FormDefinition) => {
    setSelectedForm(form);
    setFormDialogOpen(true);
  };

  const handleFormSubmitted = () => {
    setFormDialogOpen(false);
    setSelectedForm(null);
    refetchSubmissions();
  };

  // Check if a form has been submitted today
  const isFormSubmittedToday = (formId: string) => {
    return todaySubmissions?.some((s: { form_definition_id: string }) => s.form_definition_id === formId);
  };

  // Get the last submission time for a form
  const getLastSubmission = (formId: string) => {
    const submission = todaySubmissions?.find((s: { form_definition_id: string; submitted_at: string }) => s.form_definition_id === formId);
    return submission?.submitted_at;
  };

  if (formsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (!assignedForms || assignedForms.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No forms assigned to you yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        {assignedForms.map(form => {
          const submittedToday = isFormSubmittedToday(form.id);
          const lastSubmissionTime = getLastSubmission(form.id);

          return (
            <Card 
              key={form.id} 
              className={`cursor-pointer transition-all hover:shadow-md ${
                submittedToday ? 'border-green-500/50 bg-green-50/50 dark:bg-green-950/20' : ''
              }`}
              onClick={() => handleFormClick(form)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <FileText className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{form.name}</CardTitle>
                      {form.description && (
                        <CardDescription className="mt-1">{form.description}</CardDescription>
                      )}
                    </div>
                  </div>
                  {submittedToday ? (
                    <Badge variant="secondary" className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Submitted
                    </Badge>
                  ) : form.is_recurring ? (
                    <Badge variant="outline">
                      <Clock className="h-3 w-3 mr-1" />
                      {form.recurrence_pattern === 'daily' ? 'Daily' : 
                       form.recurrence_pattern === 'weekly' ? 'Weekly' : 'Monthly'}
                    </Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  {lastSubmissionTime ? (
                    <span className="text-sm text-muted-foreground">
                      Last submitted: {format(new Date(lastSubmissionTime), 'h:mm a')}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      {form.is_recurring ? 'Not submitted today' : 'Not yet submitted'}
                    </span>
                  )}
                  <Button variant="ghost" size="sm" className="gap-1">
                    {submittedToday && form.is_recurring ? 'Submit Again' : 'Fill Out'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Form Dialog */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedForm?.name}</DialogTitle>
          </DialogHeader>
          {selectedForm && (
            <RepFormSubmitter
              formDefinition={selectedForm}
              closerName={closerName}
              closerId={closerId}
              organizationId={organizationId}
              portalToken={portalToken}
              onSuccess={handleFormSubmitted}
              onCancel={() => setFormDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}