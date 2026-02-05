import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useToast } from './use-toast';

export interface CustomField {
  id: string;
  organization_id: string;
  field_category: string;
  field_value: string;
  field_label: string;
  color?: string;
  icon?: string;
  display_order: number;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type CustomFieldCategory =
  | 'call_outcome'
  | 'call_status'
  | 'source'
  | 'call_type'
  | 'traffic_type'
  | 'opportunity_status';

interface CreateCustomFieldInput {
  field_category: CustomFieldCategory;
  field_value: string;
  field_label: string;
  color?: string;
  icon?: string;
  display_order?: number;
}

interface UpdateCustomFieldInput {
  id: string;
  field_value?: string;
  field_label?: string;
  color?: string;
  icon?: string;
  display_order?: number;
  is_active?: boolean;
}

// Helper to get typed table access (table not yet in generated types)
const getCustomFieldsTable = () => {
  return (supabase as any).from('organization_custom_fields');
};

export function useCustomFields(category?: CustomFieldCategory) {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch custom fields for the current organization
  const {
    data: customFields,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['custom-fields', currentOrganization?.id, category],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      let query = getCustomFieldsTable()
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (category) {
        query = query.eq('field_category', category);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching custom fields:', error);
        throw error;
      }

      return data as CustomField[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Create a new custom field
  const createCustomField = useMutation({
    mutationFn: async (input: CreateCustomFieldInput) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // Get the highest display_order for this category
      const { data: existingFields } = await getCustomFieldsTable()
        .select('display_order')
        .eq('organization_id', currentOrganization.id)
        .eq('field_category', input.field_category)
        .order('display_order', { ascending: false })
        .limit(1);

      const nextOrder = existingFields && existingFields.length > 0
        ? (existingFields[0] as any).display_order + 1
        : 1;

      const { data, error } = await getCustomFieldsTable()
        .insert({
          organization_id: currentOrganization.id,
          field_category: input.field_category,
          field_value: input.field_value,
          field_label: input.field_label,
          color: input.color,
          icon: input.icon,
          display_order: input.display_order ?? nextOrder,
          is_active: true,
          is_default: false,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating custom field:', error);
        throw error;
      }

      return data as CustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields', currentOrganization?.id] });
      toast({
        title: 'Custom field created',
        description: 'The custom field has been created successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error creating custom field',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Update a custom field
  const updateCustomField = useMutation({
    mutationFn: async (input: UpdateCustomFieldInput) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      const { id, ...updates } = input;

      // SECURITY: Include org filter to prevent cross-org updates
      const { data, error } = await getCustomFieldsTable()
        .update(updates)
        .eq('id', id)
        .eq('organization_id', currentOrganization.id)
        .select()
        .single();

      if (error) {
        console.error('Error updating custom field:', error);
        throw error;
      }

      return data as CustomField;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields', currentOrganization?.id] });
      toast({
        title: 'Custom field updated',
        description: 'The custom field has been updated successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error updating custom field',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Delete a custom field (soft delete by setting is_active to false)
  const deleteCustomField = useMutation({
    mutationFn: async (id: string) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // SECURITY: Include org filter to prevent cross-org deletions
      const { error } = await getCustomFieldsTable()
        .update({ is_active: false })
        .eq('id', id)
        .eq('organization_id', currentOrganization.id);

      if (error) {
        console.error('Error deleting custom field:', error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields', currentOrganization?.id] });
      toast({
        title: 'Custom field deleted',
        description: 'The custom field has been deleted successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error deleting custom field',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Reorder custom fields
  const reorderCustomFields = useMutation({
    mutationFn: async (fields: { id: string; display_order: number }[]) => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // SECURITY: Include org filter to prevent cross-org reordering
      const updates = fields.map(field =>
        getCustomFieldsTable()
          .update({ display_order: field.display_order })
          .eq('id', field.id)
          .eq('organization_id', currentOrganization.id)
      );

      const results = await Promise.all(updates);
      const errors = results.filter((r: any) => r.error);

      if (errors.length > 0) {
        console.error('Error reordering custom fields:', errors);
        throw new Error('Failed to reorder some fields');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-fields', currentOrganization?.id] });
      toast({
        title: 'Fields reordered',
        description: 'The custom fields have been reordered successfully.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error reordering fields',
        description: error.message || 'An unexpected error occurred',
        variant: 'destructive',
      });
    },
  });

  // Helper function to get field options for a select dropdown
  const getFieldOptions = (fields?: CustomField[]) => {
    const fieldsToUse = fields || customFields || [];
    return fieldsToUse.map(field => ({
      value: field.field_value,
      label: field.field_label,
      color: field.color,
      icon: field.icon,
    }));
  };

  // Helper function to get a specific field by value
  const getFieldByValue = (value: string) => {
    return customFields?.find(field => field.field_value === value);
  };

  // Helper function to get field label by value
  const getFieldLabel = (value: string) => {
    return customFields?.find(field => field.field_value === value)?.field_label || value;
  };

  return {
    customFields,
    isLoading,
    error,
    refetch,
    createCustomField: createCustomField.mutate,
    createCustomFieldAsync: createCustomField.mutateAsync,
    isCreating: createCustomField.isPending,
    updateCustomField: updateCustomField.mutate,
    updateCustomFieldAsync: updateCustomField.mutateAsync,
    isUpdating: updateCustomField.isPending,
    deleteCustomField: deleteCustomField.mutate,
    deleteCustomFieldAsync: deleteCustomField.mutateAsync,
    isDeleting: deleteCustomField.isPending,
    reorderCustomFields: reorderCustomFields.mutate,
    reorderCustomFieldsAsync: reorderCustomFields.mutateAsync,
    isReordering: reorderCustomFields.isPending,
    getFieldOptions,
    getFieldByValue,
    getFieldLabel,
  };
}

// Hook to fetch custom fields for all categories at once
export function useAllCustomFields() {
  const { currentOrganization } = useOrganization();

  const {
    data: allCustomFields,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['custom-fields-all', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      const { data, error } = await getCustomFieldsTable()
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching all custom fields:', error);
        throw error;
      }

      // Group by category
      const grouped: Record<CustomFieldCategory, CustomField[]> = {
        call_outcome: [],
        call_status: [],
        source: [],
        call_type: [],
        traffic_type: [],
        opportunity_status: [],
      };

      (data as CustomField[]).forEach((field: CustomField) => {
        const category = field.field_category as CustomFieldCategory;
        if (grouped[category]) {
          grouped[category].push(field);
        }
      });

      return grouped;
    },
    enabled: !!currentOrganization?.id,
  });

  return {
    allCustomFields,
    isLoading,
    error,
  };
}
