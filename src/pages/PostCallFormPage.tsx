import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { EnhancedPostCallForm } from '@/components/forms/EnhancedPostCallForm';
import { DynamicPCFRenderer } from '@/components/forms/DynamicPCFRenderer';
import { useEvent, useExistingPCF } from '@/hooks/useEvents';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export default function PostCallFormPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: event, isLoading, error } = useEvent(eventId || '');
  const { data: existingPCF, isLoading: pcfLoading } = useExistingPCF(eventId || '');

  // Check if there's a custom form config for this organization
  const { data: formConfig, isLoading: configLoading } = useQuery({
    queryKey: ['form-config', event?.organization_id, 'post_call_form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_configs')
        .select('*')
        .eq('organization_id', event?.organization_id)
        .eq('form_type', 'post_call_form')
        .eq('is_active', true)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
    enabled: !!event?.organization_id,
  });

  const handleSuccess = () => {
    setTimeout(() => {
      navigate('/');
    }, 2000);
  };

  const isLoadingAll = isLoading || pcfLoading || configLoading;

  // Check if form config has fields
  const hasCustomForm = formConfig?.fields && Array.isArray(formConfig.fields) && formConfig.fields.length > 0;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>

        {isLoadingAll && (
          <Card>
            <CardContent className="p-8">
              <Skeleton className="h-8 w-48 mb-4" />
              <Skeleton className="h-4 w-64 mb-8" />
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            </CardContent>
          </Card>
        )}

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error Loading Event</h3>
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : 'Failed to load event details'}
              </p>
              <Button variant="outline" onClick={() => navigate('/')} className="mt-4">
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoadingAll && !event && !error && (
          <Card className="border-warning/50">
            <CardContent className="p-8 text-center">
              <AlertCircle className="h-12 w-12 text-warning mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Event Not Found</h3>
              <p className="text-muted-foreground">
                The event you're looking for doesn't exist or you don't have access to it.
              </p>
              <Button variant="outline" onClick={() => navigate('/')} className="mt-4">
                Return to Dashboard
              </Button>
            </CardContent>
          </Card>
        )}

        {event && !isLoadingAll && (
          hasCustomForm ? (
            <DynamicPCFRenderer
              event={event}
              closerName={profile?.name || 'Unknown'}
              existingPCF={existingPCF}
              onSuccess={handleSuccess}
            />
          ) : (
            <EnhancedPostCallForm
              event={event}
              closerName={profile?.name || 'Unknown'}
              existingPCF={existingPCF}
              onSuccess={handleSuccess}
            />
          )
        )}
      </div>
    </AppLayout>
  );
}
