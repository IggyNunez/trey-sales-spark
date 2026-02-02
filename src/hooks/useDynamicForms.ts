import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useToast } from './use-toast';
import type { 
  FormDefinition, 
  FormField, 
  FormSubmission, 
  FormFieldValue,
  FormMetric,
  EntityType,
  RecurrencePattern,
  FieldType,
} from '@/types/dynamicForms';

// Feature flag - only enabled for Data In Motion
const DATA_IN_MOTION_ORG_ID = 'c85abed2-6ae7-4388-806e-3d60a09d558d';

export function useIsDynamicFormsEnabled() {
  const { currentOrganization } = useOrganization();
  return currentOrganization?.id === DATA_IN_MOTION_ORG_ID;
}

// ==========================================
// FORM DEFINITIONS HOOKS
// ==========================================

export function useFormDefinitions() {
  const { currentOrganization } = useOrganization();
  
  return useQuery({
    queryKey: ['form-definitions', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) throw new Error('No organization');
      
      const { data, error } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as FormDefinition[];
    },
    enabled: !!currentOrganization?.id,
  });
}

export function useFormDefinition(formId: string | undefined) {
  return useQuery({
    queryKey: ['form-definition', formId],
    queryFn: async () => {
      if (!formId) throw new Error('No form ID');
      
      const { data, error } = await supabase
        .from('form_definitions')
        .select('*')
        .eq('id', formId)
        .single();
      
      if (error) throw error;
      return data as FormDefinition;
    },
    enabled: !!formId,
  });
}

export function useCreateFormDefinition() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      slug: string;
      description?: string;
      icon?: string;
      entity_type: EntityType;
      is_recurring?: boolean;
      recurrence_pattern?: RecurrencePattern;
      assigned_closers?: string[];
    }) => {
      if (!currentOrganization?.id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('form_definitions')
        .insert({
          organization_id: currentOrganization.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data as FormDefinition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-definitions'] });
      toast({ title: 'Form created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useUpdateFormDefinition() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormDefinition> & { id: string }) => {
      // Check if we're linking to a dataset
      const isLinkingDataset = 'dataset_id' in updates && updates.dataset_id;
      
      const { data, error } = await supabase
        .from('form_definitions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // If linking to a dataset, auto-create dataset_fields from form fields
      if (isLinkingDataset && currentOrganization?.id) {
        const datasetId = updates.dataset_id as string;
        
        // Fetch form fields
        const { data: formFields } = await supabase
          .from('form_fields')
          .select('*')
          .eq('form_definition_id', id)
          .eq('is_active', true);

        if (formFields && formFields.length > 0) {
          // Map form field types to dataset field types
          const typeMap: Record<string, string> = {
            'boolean': 'boolean',
            'number': 'number',
            'currency': 'number',
            'text': 'text',
            'textarea': 'text',
            'select': 'text',
            'multi_select': 'text',
            'date': 'date',
          };

          // Check existing dataset fields to avoid duplicates
          const { data: existingFields } = await supabase
            .from('dataset_fields')
            .select('field_slug')
            .eq('dataset_id', datasetId);

          const existingSlugs = new Set((existingFields || []).map(f => f.field_slug));

          // Create dataset fields for each form field that doesn't exist
          const newFields = formFields
            .filter(ff => !existingSlugs.has(ff.field_slug))
            .map((ff, index) => ({
              organization_id: currentOrganization.id,
              dataset_id: datasetId,
              field_name: ff.label,
              field_slug: ff.field_slug,
              field_type: typeMap[ff.field_type] || 'text',
              source_type: 'mapped',
              source_config: { form_field_id: ff.id },
              sort_order: existingSlugs.size + index,
            }));

          if (newFields.length > 0) {
            await supabase.from('dataset_fields').insert(newFields);
          }
        }
      }

      return data as FormDefinition;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-definitions'] });
      queryClient.invalidateQueries({ queryKey: ['form-definition', data.id] });
      queryClient.invalidateQueries({ queryKey: ['dataset-fields'] });
      toast({ title: 'Form updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useDeleteFormDefinition() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (formId: string) => {
      const { error } = await supabase
        .from('form_definitions')
        .delete()
        .eq('id', formId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-definitions'] });
      toast({ title: 'Form deleted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to delete form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ==========================================
// FORM FIELDS HOOKS
// ==========================================

export function useFormFields(formDefinitionId: string | undefined) {
  return useQuery({
    queryKey: ['form-fields', formDefinitionId],
    queryFn: async () => {
      if (!formDefinitionId) throw new Error('No form definition ID');
      
      const { data, error } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_definition_id', formDefinitionId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error) throw error;
      return data as unknown as FormField[];
    },
    enabled: !!formDefinitionId,
  });
}

export function useCreateFormField() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      form_definition_id: string;
      field_name: string;
      field_slug: string;
      label: string;
      field_type: FieldType;
      placeholder?: string;
      help_text?: string;
      default_value?: any;
      options?: any;
      is_required?: boolean;
      validation_rules?: any;
      conditional_logic?: any;
      creates_metric?: boolean;
      metric_config?: any;
      sort_order?: number;
      show_in_summary?: boolean;
    }) => {
      if (!currentOrganization?.id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('form_fields')
        .insert({
          organization_id: currentOrganization.id,
          ...input,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as FormField;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-fields', data.form_definition_id] });
      toast({ title: 'Field added successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to add field', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useUpdateFormField() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormField> & { id: string }) => {
      const { data, error } = await supabase
        .from('form_fields')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as FormField;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-fields', data.form_definition_id] });
      toast({ title: 'Field updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update field', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useDeleteFormField() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ fieldId, formDefinitionId }: { fieldId: string; formDefinitionId: string }) => {
      const { error } = await supabase
        .from('form_fields')
        .update({ is_active: false })
        .eq('id', fieldId);

      if (error) throw error;
      return { formDefinitionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-fields', data.formDefinitionId] });
      toast({ title: 'Field removed successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to remove field', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useReorderFormFields() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ formDefinitionId, fieldIds }: { formDefinitionId: string; fieldIds: string[] }) => {
      // Update each field's sort_order
      const updates = fieldIds.map((id, index) => 
        supabase
          .from('form_fields')
          .update({ sort_order: index })
          .eq('id', id)
      );

      await Promise.all(updates);
      return { formDefinitionId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-fields', data.formDefinitionId] });
    },
  });
}

// ==========================================
// FORM SUBMISSIONS HOOKS
// ==========================================

export function useFormSubmissions(formDefinitionId: string | undefined, filters?: {
  entityType?: EntityType;
  entityId?: string;
  startDate?: string;
  endDate?: string;
}) {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['form-submissions', formDefinitionId, filters],
    queryFn: async () => {
      if (!currentOrganization?.id || !formDefinitionId) throw new Error('Missing required params');
      
      let query = supabase
        .from('form_submissions')
        .select(`
          *,
          form_field_values (*)
        `)
        .eq('organization_id', currentOrganization.id)
        .eq('form_definition_id', formDefinitionId)
        .order('submitted_at', { ascending: false });

      if (filters?.entityType) {
        query = query.eq('entity_type', filters.entityType);
      }
      if (filters?.entityId) {
        query = query.eq('entity_id', filters.entityId);
      }
      if (filters?.startDate) {
        query = query.gte('submitted_at', filters.startDate);
      }
      if (filters?.endDate) {
        query = query.lte('submitted_at', filters.endDate);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as (FormSubmission & { form_field_values: FormFieldValue[] })[];
    },
    enabled: !!currentOrganization?.id && !!formDefinitionId,
  });
}

export function useCreateFormSubmission() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      form_definition_id: string;
      entity_type: EntityType;
      entity_id?: string;
      entity_name?: string;
      submitted_by_id?: string;
      submitted_by_name?: string;
      period_date?: string;
      field_values: { field_id: string; field_slug: string; value: any; field_type: FieldType }[];
    }) => {
      if (!currentOrganization?.id) throw new Error('No organization');

      const { field_values, ...submissionData } = input;

      // Get the form definition to check for dataset_id
      const { data: formDef } = await supabase
        .from('form_definitions')
        .select('dataset_id')
        .eq('id', input.form_definition_id)
        .single();

      // Create submission
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .insert({
          organization_id: currentOrganization.id,
          ...submissionData,
        })
        .select()
        .single();

      if (submissionError) throw submissionError;

      // Create field values
      if (field_values.length > 0) {
        const fieldValueRecords = field_values.map(fv => {
          const record: any = {
            submission_id: submission.id,
            field_id: fv.field_id,
            organization_id: currentOrganization.id,
          };

          // Set appropriate value column based on field type
          switch (fv.field_type) {
            case 'boolean':
              record.value_boolean = fv.value;
              break;
            case 'number':
            case 'currency':
              record.value_number = fv.value;
              break;
            case 'date':
              record.value_date = fv.value;
              break;
            case 'select':
            case 'text':
            case 'textarea':
              record.value_text = fv.value;
              break;
            case 'multi_select':
              record.value_json = fv.value;
              break;
            default:
              record.value_text = String(fv.value);
          }

          return record;
        });

        const { error: valuesError } = await supabase
          .from('form_field_values')
          .insert(fieldValueRecords);

        if (valuesError) throw valuesError;
      }

      // Auto-sync to dataset_records if a dataset is linked
      // Uses upsert logic: if a record exists for the same entity_name + date, update it
      if (formDef?.dataset_id) {
        const extractedData: Record<string, any> = {
          form_submission_id: submission.id,
          form_name: submissionData.form_definition_id,
          entity_type: submissionData.entity_type,
          entity_id: submissionData.entity_id || null,
          entity_name: submissionData.entity_name || null,
          submitted_by: submissionData.submitted_by_name || null,
          submitted_at: submission.submitted_at,
        };

        // Add each field value to extracted data using field_slug as key
        field_values.forEach(fv => {
          extractedData[fv.field_slug] = fv.value;
        });

        // Check for existing record with same entity_name and date
        const dateValue = extractedData.date || extractedData.period_date;
        const entityName = extractedData.entity_name;
        
        let existingRecordId: string | null = null;
        
        if (dateValue && entityName) {
          const { data: existingRecords } = await supabase
            .from('dataset_records')
            .select('id, extracted_data')
            .eq('dataset_id', formDef.dataset_id)
            .eq('organization_id', currentOrganization.id);
          
          // Find matching record by entity_name and date in extracted_data
          const matchingRecord = existingRecords?.find(r => {
            const ed = r.extracted_data as Record<string, any>;
            const recordDate = ed?.date || ed?.period_date;
            const recordEntity = ed?.entity_name;
            return recordDate === dateValue && recordEntity === entityName;
          });
          
          if (matchingRecord) {
            existingRecordId = matchingRecord.id;
          }
        }

        if (existingRecordId) {
          // Update existing record
          const { error: datasetError } = await supabase
            .from('dataset_records')
            .update({
              raw_payload: { 
                source: 'dynamic_form', 
                form_definition_id: input.form_definition_id,
                submission_id: submission.id,
                field_values,
                updated: true,
              },
              extracted_data: extractedData,
            })
            .eq('id', existingRecordId);

          if (datasetError) {
            console.error('Failed to update dataset record:', datasetError);
          }
        } else {
          // Insert new record
          const { error: datasetError } = await supabase
            .from('dataset_records')
            .insert({
              organization_id: currentOrganization.id,
              dataset_id: formDef.dataset_id,
              raw_payload: { 
                source: 'dynamic_form', 
                form_definition_id: input.form_definition_id,
                submission_id: submission.id,
                field_values 
              },
              extracted_data: extractedData,
              processing_status: 'success',
            });

          if (datasetError) {
            console.error('Failed to sync to dataset:', datasetError);
          }
        }
      }

      return submission as FormSubmission;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-submissions', data.form_definition_id] });
      queryClient.invalidateQueries({ queryKey: ['dataset-records'] });
      toast({ title: 'Form submitted successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to submit form', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ==========================================
// FORM METRICS HOOKS
// ==========================================

export function useFormMetrics(formDefinitionId?: string) {
  const { currentOrganization } = useOrganization();

  return useQuery({
    queryKey: ['form-metrics', currentOrganization?.id, formDefinitionId],
    queryFn: async () => {
      if (!currentOrganization?.id) throw new Error('No organization');
      
      let query = supabase
        .from('form_metrics')
        .select('*')
        .eq('organization_id', currentOrganization.id)
        .eq('is_active', true)
        .order('dashboard_position', { ascending: true });

      if (formDefinitionId) {
        query = query.eq('form_definition_id', formDefinitionId);
      }

      const { data, error } = await query;
      
      if (error) throw error;
      return data as FormMetric[];
    },
    enabled: !!currentOrganization?.id,
  });
}

export function useCreateFormMetric() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<FormMetric, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => {
      if (!currentOrganization?.id) throw new Error('No organization');

      const { data, error } = await supabase
        .from('form_metrics')
        .insert({
          organization_id: currentOrganization.id,
          ...input,
        })
        .select()
        .single();

      if (error) throw error;
      return data as FormMetric;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-metrics'] });
      toast({ title: 'Metric created successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to create metric', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

export function useUpdateFormMetric() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormMetric> & { id: string }) => {
      const { data, error } = await supabase
        .from('form_metrics')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as FormMetric;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-metrics'] });
      toast({ title: 'Metric updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Failed to update metric', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
