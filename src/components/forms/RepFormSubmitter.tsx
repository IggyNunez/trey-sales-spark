import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle } from 'lucide-react';
import type { FormDefinition, FormField, FieldType } from '@/types/dynamicForms';

interface RepFormSubmitterProps {
  formDefinition: FormDefinition;
  closerName: string;
  closerId?: string;
  organizationId: string;
  portalToken?: string | null;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function RepFormSubmitter({
  formDefinition,
  closerName,
  closerId,
  organizationId,
  portalToken,
  onSuccess,
  onCancel,
}: RepFormSubmitterProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const { toast } = useToast();

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

  // Fetch form fields
  const { data: formFields, isLoading: fieldsLoading } = useQuery({
    queryKey: ['form-fields', formDefinition.id, portalToken],
    queryFn: async () => {
      // Use edge function if portal token is present (magic link flow)
      if (portalToken) {
        const params = new URLSearchParams({
          action: 'get_form_fields',
          form_id: formDefinition.id,
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf?${params.toString()}`,
          { headers: getEdgeFunctionHeaders() }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to fetch form fields');
        }

        const result = await response.json();
        return result.fields as FormField[];
      }

      // Standard authenticated flow
      const { data, error } = await supabase
        .from('form_fields')
        .select('*')
        .eq('form_definition_id', formDefinition.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      if (error) throw error;
      return data as unknown as FormField[];
    },
    enabled: !!formDefinition.id,
  });

  const updateFieldValue = (fieldId: string, value: any) => {
    setFormValues(prev => ({ ...prev, [fieldId]: value }));
  };

  // Check if a field should be visible based on conditional logic
  const isFieldVisible = (field: FormField): boolean => {
    if (!field.conditional_logic) return true;
    
    const logic = field.conditional_logic as { field_id?: string; operator?: string; value?: any };
    if (!logic.field_id) return true;
    
    const dependentValue = formValues[logic.field_id];
    
    switch (logic.operator) {
      case 'equals':
        return dependentValue === logic.value;
      case 'not_equals':
        return dependentValue !== logic.value;
      case 'is_true':
        return dependentValue === true;
      case 'is_false':
        return dependentValue === false;
      default:
        return true;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formFields) return;

    // Validate required fields
    const visibleFields = formFields.filter(isFieldVisible);
    const missingRequired = visibleFields.filter(f => 
      f.is_required && 
      (formValues[f.id] === undefined || formValues[f.id] === null || formValues[f.id] === '')
    );

    if (missingRequired.length > 0) {
      toast({
        title: 'Required fields missing',
        description: `Please fill in: ${missingRequired.map(f => f.label).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Use edge function if portal token is present (magic link flow)
      if (portalToken) {
        // Build field values for edge function
        const fieldValueRecords = visibleFields.map(field => {
          const value = formValues[field.id];
          const record: any = {
            field_id: field.id,
          };

          // Set appropriate value column based on field type
          switch (field.field_type) {
            case 'boolean':
              record.value_boolean = value === true;
              break;
            case 'number':
            case 'currency':
              record.value_number = typeof value === 'number' ? value : parseFloat(value) || 0;
              break;
            case 'date':
              record.value_date = value || null;
              break;
            case 'select':
            case 'text':
            case 'textarea':
              record.value_text = value || null;
              break;
            case 'multi_select':
              record.value_json = value || null;
              break;
            default:
              record.value_text = String(value || '');
          }

          return record;
        });

        // Build extracted data for dataset sync
        const extractedData: Record<string, any> = {
          entity_name: closerName,
          submitted_at: new Date().toISOString(),
        };
        visibleFields.forEach(field => {
          extractedData[field.field_slug] = formValues[field.id];
        });

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/portal-pcf`,
          {
            method: 'POST',
            headers: getEdgeFunctionHeaders(),
            body: JSON.stringify({
              action: 'submit_dynamic_form',
              form_definition_id: formDefinition.id,
              closer_name: closerName,
              closer_id: closerId,
              field_values: fieldValueRecords,
              dataset_id: formDefinition.dataset_id,
              extracted_data: formDefinition.dataset_id ? extractedData : undefined,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to submit form');
        }

        setIsSubmitted(true);
        toast({ title: 'Form submitted successfully!' });
        
        setTimeout(() => {
          onSuccess?.();
        }, 1500);
        return;
      }

      // Standard authenticated flow
      // Create submission
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .insert({
          organization_id: organizationId,
          form_definition_id: formDefinition.id,
          entity_type: 'closer',
          entity_id: closerId || null,
          entity_name: closerName,
          submitted_by_name: closerName,
          submitted_at: new Date().toISOString(),
          status: 'submitted',
        })
        .select()
        .single();

      if (submissionError) throw submissionError;

      // Create field values
      const fieldValueRecords = visibleFields.map(field => {
        const value = formValues[field.id];
        const record: any = {
          submission_id: submission.id,
          field_id: field.id,
          organization_id: organizationId,
        };

        // Set appropriate value column based on field type
        switch (field.field_type) {
          case 'boolean':
            record.value_boolean = value === true;
            break;
          case 'number':
          case 'currency':
            record.value_number = typeof value === 'number' ? value : parseFloat(value) || 0;
            break;
          case 'date':
            record.value_date = value || null;
            break;
          case 'select':
          case 'text':
          case 'textarea':
            record.value_text = value || null;
            break;
          case 'multi_select':
            record.value_json = value || null;
            break;
          default:
            record.value_text = String(value || '');
        }

        return record;
      });

      if (fieldValueRecords.length > 0) {
        const { error: valuesError } = await supabase
          .from('form_field_values')
          .insert(fieldValueRecords);

        if (valuesError) throw valuesError;
      }

      // Auto-sync to dataset if linked - with upsert logic for same entity + date
      if (formDefinition.dataset_id) {
        const extractedData: Record<string, any> = {
          form_submission_id: submission.id,
          entity_name: closerName,
          submitted_at: submission.submitted_at,
        };

        // Add each field value using field_slug
        visibleFields.forEach(field => {
          extractedData[field.field_slug] = formValues[field.id];
        });

        // Check for existing record with same entity_name and date
        const dateValue = extractedData.date || extractedData.period_date;
        
        let existingRecordId: string | null = null;
        
        if (dateValue && closerName) {
          const { data: existingRecords } = await supabase
            .from('dataset_records')
            .select('id, extracted_data')
            .eq('dataset_id', formDefinition.dataset_id)
            .eq('organization_id', organizationId);
          
          const matchingRecord = existingRecords?.find(r => {
            const ed = r.extracted_data as Record<string, any>;
            const recordDate = ed?.date || ed?.period_date;
            const recordEntity = ed?.entity_name;
            return recordDate === dateValue && recordEntity === closerName;
          });
          
          if (matchingRecord) {
            existingRecordId = matchingRecord.id;
          }
        }

        if (existingRecordId) {
          await supabase.from('dataset_records')
            .update({
              raw_payload: { source: 'rep_portal', submission_id: submission.id, updated: true },
              extracted_data: extractedData,
            })
            .eq('id', existingRecordId);
        } else {
          await supabase.from('dataset_records').insert({
            organization_id: organizationId,
            dataset_id: formDefinition.dataset_id,
            raw_payload: { source: 'rep_portal', submission_id: submission.id },
            extracted_data: extractedData,
            processing_status: 'success',
          });
        }
      }

      setIsSubmitted(true);
      toast({ title: 'Form submitted successfully!' });
      
      setTimeout(() => {
        onSuccess?.();
      }, 1500);

    } catch (error: any) {
      console.error('Form submission error:', error);
      toast({
        title: 'Failed to submit form',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field: FormField) => {
    if (!isFieldVisible(field)) return null;

    const value = formValues[field.id];
    const options = (field.options as { value: string; label: string }[]) || [];

    switch (field.field_type as FieldType) {
      case 'boolean':
        return (
          <div key={field.id} className="flex items-start space-x-3 py-2">
            <Checkbox
              id={field.id}
              checked={value === true}
              onCheckedChange={(checked) => updateFieldValue(field.id, checked)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor={field.id} className="font-medium cursor-pointer">
                {field.label}
                {field.is_required && <span className="text-destructive ml-1">*</span>}
              </Label>
              {field.help_text && (
                <p className="text-sm text-muted-foreground">{field.help_text}</p>
              )}
            </div>
          </div>
        );

      case 'number':
      case 'currency':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <div className="relative">
              {field.field_type === 'currency' && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              )}
              <Input
                id={field.id}
                type="number"
                value={value || ''}
                onChange={(e) => updateFieldValue(field.id, e.target.value ? parseFloat(e.target.value) : '')}
                placeholder={field.placeholder || ''}
                className={field.field_type === 'currency' ? 'pl-7' : ''}
              />
            </div>
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case 'select':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Select value={value || ''} onValueChange={(v) => updateFieldValue(field.id, v)}>
              <SelectTrigger>
                <SelectValue placeholder={field.placeholder || 'Select an option'} />
              </SelectTrigger>
              <SelectContent>
                {options.filter(opt => opt.value !== '').map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case 'textarea':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Textarea
              id={field.id}
              value={value || ''}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              placeholder={field.placeholder || ''}
              rows={4}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      case 'date':
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="date"
              value={value || ''}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );

      default: // text
        return (
          <div key={field.id} className="space-y-2">
            <Label htmlFor={field.id}>
              {field.label}
              {field.is_required && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id={field.id}
              type="text"
              value={value || ''}
              onChange={(e) => updateFieldValue(field.id, e.target.value)}
              placeholder={field.placeholder || ''}
            />
            {field.help_text && (
              <p className="text-sm text-muted-foreground">{field.help_text}</p>
            )}
          </div>
        );
    }
  };

  if (isSubmitted) {
    return (
      <div className="py-12 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center mb-4">
          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold mb-2">Form Submitted!</h3>
        <p className="text-muted-foreground">Your response has been recorded.</p>
      </div>
    );
  }

  if (fieldsLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formDefinition.description && (
        <p className="text-muted-foreground">{formDefinition.description}</p>
      )}

      <div className="space-y-4">
        {formFields?.map(field => renderField(field))}
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Submitting...
            </>
          ) : (
            'Submit Form'
          )}
        </Button>
      </div>
    </form>
  );
}