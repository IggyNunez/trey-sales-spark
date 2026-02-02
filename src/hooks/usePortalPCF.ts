import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PCFPayload {
  event_id: string;
  closer_id: string;
  closer_name: string;
  call_occurred: boolean;
  lead_showed: boolean;
  offer_made: boolean;
  deal_closed: boolean;
  cash_collected?: number;
  opportunity_status_id?: string;
  notes?: string;
}

interface PCFUpdatePayload {
  pcf_id: string;
  lead_showed?: boolean;
  offer_made?: boolean;
  opportunity_status_id?: string;
  notes?: string;
  cash_collected?: number;
}

interface PortalEvent {
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
  // Close CRM custom fields (including platform)
  close_custom_fields?: Record<string, string> | null;
  // Exact label from the rep's dropdown selection (preferred for UI badges)
  pcf_outcome_label?: string | null;
  // Flattened from joined post_call_forms -> opportunity_statuses
  opportunity_status_name?: string | null;
  opportunity_status_color?: string | null;
}

interface PortalCloser {
  id: string;
  name: string;
}

interface OpportunityStatus {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
}

/**
 * Hook for portal-based PCF operations using secure edge function
 * This bypasses direct Supabase client calls and validates tokens server-side
 */
export function usePortalPCF(portalToken: string | null) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const getHeaders = async () => {
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Required for calling backend functions directly via fetch
    if (anonKey) {
      headers['apikey'] = anonKey;
    }

    // Add portal token if available
    if (portalToken) {
      headers['x-portal-token'] = portalToken;
    }

    // Add auth token if user is logged in, otherwise fall back to anon key
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    } else if (anonKey) {
      headers['Authorization'] = `Bearer ${anonKey}`;
    }

    return headers;
  };

  // Validate a portal token (no auth required for this one)
  const validateToken = async (token: string): Promise<{
    valid: boolean;
    organization_id?: string;
    closer_name?: string;
    is_universal?: boolean;
    error?: string;
  }> => {
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
      return { valid: false, error: 'Failed to validate token' };
    }

    return response.json();
  };

  // Fetch events for a closer
  const fetchEvents = async (closerName: string, startDate?: string, endDate?: string, platform?: string): Promise<PortalEvent[]> => {
    const headers = await getHeaders();
    
    let url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=get_events&closer_name=${encodeURIComponent(closerName)}`;
    if (startDate) url += `&start_date=${encodeURIComponent(startDate)}`;
    if (endDate) url += `&end_date=${encodeURIComponent(endDate)}`;
    if (platform) url += `&platform=${encodeURIComponent(platform)}`;

    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch events');
    }

    const data = await response.json();
    return data.events || [];
  };

  // Fetch available platforms for dropdown
  const fetchPlatforms = async (): Promise<string[]> => {
    const headers = await getHeaders();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=get_platforms`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch platforms');
    }

    const data = await response.json();
    return data.platforms || [];
  };

  // Fetch closers list
  const fetchClosers = async (): Promise<PortalCloser[]> => {
    const headers = await getHeaders();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=get_closers`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch closers');
    }

    const data = await response.json();
    return data.closers || [];
  };

  // Fetch opportunity statuses
  const fetchStatuses = async (): Promise<OpportunityStatus[]> => {
    const headers = await getHeaders();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=get_statuses`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch statuses');
    }

    const data = await response.json();
    return data.statuses || [];
  };

  // Fetch form config
  const fetchFormConfig = async () => {
    const headers = await getHeaders();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?action=get_form_config`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch form config');
    }

    const data = await response.json();
    return data.formConfig;
  };

  const fetchPCF = async (eventId: string) => {
    const headers = await getHeaders();
    
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?event_id=${eventId}`,
      { headers }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to fetch PCF');
    }

    return response.json();
  };

  const createPCF = useMutation({
    mutationFn: async (payload: PCFPayload) => {
      const headers = await getHeaders();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create PCF');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rep-events'] });
      toast({
        title: 'PCF Submitted!',
        description: 'Your post-call form has been saved.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updatePCF = useMutation({
    mutationFn: async (payload: PCFUpdatePayload) => {
      const headers = await getHeaders();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update PCF');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rep-events'] });
      toast({
        title: 'PCF Updated!',
        description: 'Your changes have been saved.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deletePCF = useMutation({
    mutationFn: async (pcfId: string) => {
      const headers = await getHeaders();
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?pcf_id=${pcfId}`,
        {
          method: 'DELETE',
          headers,
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete PCF');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rep-events'] });
      toast({
        title: 'PCF Cleared',
        description: 'The post-call form has been removed.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    validateToken,
    fetchEvents,
    fetchClosers,
    fetchStatuses,
    fetchFormConfig,
    fetchPCF,
    fetchPlatforms,
    createPCF,
    updatePCF,
    deletePCF,
  };
}
