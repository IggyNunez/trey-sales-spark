import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { toast } from 'sonner';

export type CRMType = 'ghl' | 'close' | 'hubspot' | 'none';
export type BookingPlatformType = 'calendly' | 'calcom' | 'acuity' | 'none';
export type PaymentProcessorType = 'whop' | 'stripe' | 'none';

export interface CRMConfig {
  id: CRMType;
  name: string;
  shortName: string;
  recordIdLabel: string; // "Contact ID" for GHL, "Lead ID" for Close
  userIdLabel: string; // For user mapping
  icon: string;
  color: string;
  apiKeyHelp: string;
}

export const CRM_CONFIGS: Record<Exclude<CRMType, 'none'>, CRMConfig> = {
  ghl: {
    id: 'ghl',
    name: 'Go High Level',
    shortName: 'GHL',
    recordIdLabel: 'Contact ID',
    userIdLabel: 'User ID',
    icon: 'link',
    color: 'orange',
    apiKeyHelp: 'Get your API key from GHL → Settings → Business Profile → API Keys',
  },
  close: {
    id: 'close',
    name: 'Close CRM',
    shortName: 'Close',
    recordIdLabel: 'Lead ID',
    userIdLabel: 'User ID',
    icon: 'link',
    color: 'green',
    apiKeyHelp: 'Get your API key from Close → Settings → API Keys',
  },
  hubspot: {
    id: 'hubspot',
    name: 'HubSpot',
    shortName: 'HubSpot',
    recordIdLabel: 'Contact ID',
    userIdLabel: 'Owner ID',
    icon: 'link',
    color: 'orange',
    apiKeyHelp: 'Go to HubSpot Settings → Account Setup → Integrations → API Key → Personal Access Key → Show → Copy',
  },
};

export const BOOKING_PLATFORM_CONFIGS = {
  calendly: {
    id: 'calendly' as const,
    name: 'Calendly',
    icon: 'calendar',
    color: 'blue',
  },
  calcom: {
    id: 'calcom' as const,
    name: 'Cal.com',
    icon: 'calendar',
    color: 'emerald',
    apiKeyHelp: 'Get your API key from Cal.com → Settings → Developer → API Keys',
  },
  acuity: {
    id: 'acuity' as const,
    name: 'Acuity Scheduling',
    icon: 'calendar',
    color: 'purple',
  },
};

export const PAYMENT_PROCESSOR_CONFIGS = {
  whop: {
    id: 'whop' as const,
    name: 'Whop',
    icon: 'credit-card',
    color: 'purple',
  },
  stripe: {
    id: 'stripe' as const,
    name: 'Stripe',
    icon: 'credit-card',
    color: 'purple',
  },
};

export interface IntegrationSettings {
  id?: string;
  organization_id: string;
  primary_crm: CRMType;
  secondary_crm: CRMType | null;
  primary_booking_platform: BookingPlatformType;
  primary_payment_processor: PaymentProcessorType;
  calendly_api_key: string | null;
  close_api_key: string | null;
  ghl_api_key: string | null;
  ghl_location_id: string | null;
  hubspot_api_key: string | null;
  whop_api_key: string | null;
  whop_company_id: string | null;
  // Encrypted fields
  calendly_api_key_encrypted: string | null;
  calcom_api_key_encrypted: string | null;
  close_api_key_encrypted: string | null;
  ghl_api_key_encrypted: string | null;
  hubspot_api_key_encrypted: string | null;
  whop_api_key_encrypted: string | null;
  stripe_api_key_encrypted: string | null;
  stripe_publishable_key: string | null;
  encryption_version: number | null;
  // Cal.com specific
  calcom_webhook_secret: string | null;
  calcom_organization_id: string | null;
  calcom_webhook_id: string | null;
  calcom_webhook_registered_at: string | null;
  // Cal.com auto-sync settings
  calcom_auto_sync_enabled: boolean | null;
  calcom_excluded_event_type_ids: string[] | null;
  calcom_last_auto_sync_at: string | null;
}

export function useIntegrationConfig() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['org-integrations', orgId],
    queryFn: async () => {
      if (!orgId) return null;
      const { data, error } = await supabase
        .from('organization_integrations')
        .select('*')
        .eq('organization_id', orgId)
        .maybeSingle();
      
      if (error) throw error;
      return data as IntegrationSettings | null;
    },
    enabled: !!orgId,
  });

  const updateIntegrations = useMutation({
    mutationFn: async (updates: Partial<IntegrationSettings>) => {
      if (!orgId) throw new Error('No organization selected');
      
      const { error } = await supabase
        .from('organization_integrations')
        .upsert({
          organization_id: orgId,
          ...updates,
        }, { onConflict: 'organization_id' });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-integrations', orgId] });
      toast.success('Integration settings updated');
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to update settings');
    },
  });

  // Get the active CRM config
  const primaryCRM = integrations?.primary_crm || 'none';
  const secondaryCRM = integrations?.secondary_crm || null;
  const primaryCRMConfig = primaryCRM !== 'none' ? CRM_CONFIGS[primaryCRM] : null;
  const secondaryCRMConfig = secondaryCRM && secondaryCRM !== 'none' ? CRM_CONFIGS[secondaryCRM] : null;

  // Check which integrations are connected (check both plaintext and encrypted keys)
  const hasCalendly = !!integrations?.calendly_api_key || !!integrations?.calendly_api_key_encrypted;
  const hasCalcom = !!integrations?.calcom_api_key_encrypted;
  const hasClose = !!integrations?.close_api_key || !!integrations?.close_api_key_encrypted;
  const hasGHL = !!integrations?.ghl_api_key || !!integrations?.ghl_api_key_encrypted;
  const hasHubSpot = !!integrations?.hubspot_api_key || !!integrations?.hubspot_api_key_encrypted;
  const hasWhop = !!integrations?.whop_api_key || !!integrations?.whop_api_key_encrypted;

  return {
    integrations,
    isLoading,
    updateIntegrations,
    primaryCRM,
    secondaryCRM,
    primaryCRMConfig,
    secondaryCRMConfig,
    hasCalendly,
    hasCalcom,
    hasClose,
    hasGHL,
    hasHubSpot,
    hasWhop,
    orgId,
  };
}

// Helper to get the CRM column label for events table
export function getCRMColumnLabel(primaryCRM: CRMType): string {
  if (primaryCRM === 'none') return '';
  return CRM_CONFIGS[primaryCRM]?.shortName || '';
}

// Helper to get CRM-specific terminology
export function getCRMTerminology(crmType: CRMType) {
  if (crmType === 'none') return null;
  return CRM_CONFIGS[crmType];
}
