import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useToast } from './use-toast';
import { FormFieldConfig } from '@/components/forms/DynamicFormRenderer';

export interface FormConfig {
  id: string;
  organization_id: string;
  form_type: string;
  form_name: string;
  form_description?: string;
  field_config: FormFieldConfig[];
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type FormType = 'post_call_form' | 'lead_form' | 'opportunity_form';

interface CreateFormConfigInput {
  form_type: FormType;
  form_name: string;
  form_description?: string;
  field_config: FormFieldConfig[];
  is_default?: boolean;
}

interface UpdateFormConfigInput {
  id: string;
  form_name?: string;
  form_description?: string;
  field_config?: FormFieldConfig[];
  is_active?: boolean;
  is_default?: boolean;
}

// Helper to get typed table access (table not yet in generated types)
const getFormConfigsTable = () => {
  return (supabase as any).from('organization_form_configs');
};

export function useFormConfig(formType: FormType) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch form configs for the current organization and form type
  const {
    data: formConfigs,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['form-configs', currentOrganization?.id, formType],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      const { data, error } = await getFormConfigsTable()
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('form_type', formType)
        .eq('is_active', true)
        .order('is_default', { ascending: false });

      if (error) {
        console.error('Error fetching form configs:', error);
        throw error;
      }

      return data as FormConfig[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Get the default form config for this type
  const defaultFormConfig = formConfigs?.find(config => config.is_default) || formConfigs?.[0];

  // Create a new form config
  const createFormConfig = useMutation({
    mutationFn: async (input: CreateFormConfigInput) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // If setting as default, unset other defaults first
      if (input.is_default) {
        await getFormConfigsTable()
          .update({ is_default: false })
          .eq('organization_id', currentOrganization.id)
          .eq('form_type', input.form_type);
      }

      const { data, error } = await getFormConfigsTable()
        .insert({
          organization_id: currentOrganization.id,
          form_type: input.form_type,
          form_name: input.form_name,
          form_description: input.form_description,
          field_config: input.field_config as any,
          is_active: true,
          is_default: input.is_default || false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating form config:', error);
        throw error;
      }

      return data as FormConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-configs', currentOrganization?.id, formType] });
      toast({
        title: 'Form configuration created',
        description: 'The form has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error creating form',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Update a form config
  const updateFormConfig = useMutation({
    mutationFn: async (input: UpdateFormConfigInput) => {
      const { id, ...updates } = input;

      // If setting as default, unset other defaults first
      if (updates.is_default && currentOrganization?.id) {
        const { data: currentConfig } = await getFormConfigsTable()
          .select('form_type')
          .eq('id', id)
          .single();

        if (currentConfig) {
          await getFormConfigsTable()
            .update({ is_default: false })
            .eq('organization_id', currentOrganization.id)
            .eq('form_type', (currentConfig as any).form_type)
            .neq('id', id);
        }
      }

      const { data, error } = await getFormConfigsTable()
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error('Error updating form config:', error);
        throw error;
      }

      return data as FormConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-configs', currentOrganization?.id, formType] });
      toast({
        title: 'Form configuration updated',
        description: 'The form has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating form',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Delete a form config (soft delete by setting is_active to false)
  const deleteFormConfig = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await getFormConfigsTable()
        .update({ is_active: false })
        .eq('id', id);

      if (error) {
        console.error('Error deleting form config:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-configs', currentOrganization?.id, formType] });
      toast({
        title: 'Form configuration deleted',
        description: 'The form has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error deleting form',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  return {
    formConfigs,
    defaultFormConfig,
    isLoading,
    error,
    refetch,
    createFormConfig: createFormConfig.mutate,
    createFormConfigAsync: createFormConfig.mutateAsync,
    isCreating: createFormConfig.isPending,
    updateFormConfig: updateFormConfig.mutate,
    updateFormConfigAsync: updateFormConfig.mutateAsync,
    isUpdating: updateFormConfig.isPending,
    deleteFormConfig: deleteFormConfig.mutate,
    deleteFormConfigAsync: deleteFormConfig.mutateAsync,
    isDeleting: deleteFormConfig.isPending,
  };
}
