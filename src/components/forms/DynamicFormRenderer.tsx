import { useFormContext } from 'react-hook-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useCustomFields } from '@/hooks/useCustomFields';

export interface FormFieldConfig {
  id: string;
  type: 'text' | 'number' | 'email' | 'tel' | 'date' | 'datetime' | 'select' | 'textarea' | 'checkbox';
  label: string;
  fieldName: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  prefix?: string;
  suffix?: string;
  order: number;
  useCustomFields?: boolean;
  customFieldCategory?: string;
  options?: Array<{ value: string; label: string }>;
  conditional?: {
    showWhen: {
      field: string;
      operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
      value: any;
    };
  };
}

interface DynamicFormFieldProps {
  field: FormFieldConfig;
  watchValues?: Record<string, any>;
}

export function DynamicFormField({ field, watchValues = {} }: DynamicFormFieldProps) {
  const form = useFormContext();

  // Check conditional rendering
  if (field.conditional) {
    const { field: watchField, operator, value } = field.conditional.showWhen;
    const watchedValue = watchValues[watchField];

    let shouldShow = false;
    switch (operator) {
      case 'equals':
        shouldShow = watchedValue === value;
        break;
      case 'not_equals':
        shouldShow = watchedValue !== value;
        break;
      case 'contains':
        shouldShow = String(watchedValue || '').includes(value);
        break;
      case 'not_contains':
        shouldShow = !String(watchedValue || '').includes(value);
        break;
    }

    if (!shouldShow) {
      return null;
    }
  }

  // Use custom fields for dropdown options
  const { customFields } = useCustomFields(
    field.useCustomFields && field.customFieldCategory
      ? field.customFieldCategory as any
      : undefined
  );

  const options = field.useCustomFields && customFields
    ? customFields.map(cf => ({ value: cf.field_value, label: cf.field_label }))
    : field.options || [];

  const renderField = () => {
    switch (field.type) {
      case 'select':
        return (
          <Select
            value={form.watch(field.fieldName)}
            onValueChange={(value) => form.setValue(field.fieldName, value)}
          >
            <SelectTrigger>
              <SelectValue placeholder={field.placeholder} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'textarea':
        return (
          <Textarea
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
            rows={field.rows || 4}
          />
        );

      case 'checkbox':
        return (
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={form.watch(field.fieldName)}
              onCheckedChange={(checked) => form.setValue(field.fieldName, checked)}
            />
            <label
              htmlFor={field.id}
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              {field.label}
            </label>
          </div>
        );

      case 'number':
        return (
          <div className="relative">
            {field.prefix && (
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {field.prefix}
              </span>
            )}
            <Input
              type="number"
              {...form.register(field.fieldName, {
                required: field.required,
                valueAsNumber: true,
              })}
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.step || 1}
              className={field.prefix ? 'pl-8' : ''}
            />
            {field.suffix && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {field.suffix}
              </span>
            )}
          </div>
        );

      case 'date':
        return (
          <Input
            type="date"
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
          />
        );

      case 'datetime':
        return (
          <Input
            type="datetime-local"
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
          />
        );

      case 'email':
        return (
          <Input
            type="email"
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
          />
        );

      case 'tel':
        return (
          <Input
            type="tel"
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
          />
        );

      default:
        return (
          <Input
            type="text"
            {...form.register(field.fieldName, { required: field.required })}
            placeholder={field.placeholder}
          />
        );
    }
  };

  // For checkbox, the label is rendered inline
  if (field.type === 'checkbox') {
    return <div>{renderField()}</div>;
  }

  return (
    <div className="space-y-2">
      <Label htmlFor={field.id}>
        {field.label}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {renderField()}
      {form.formState.errors[field.fieldName] && (
        <p className="text-sm text-destructive">
          {form.formState.errors[field.fieldName]?.message as string || 'This field is required'}
        </p>
      )}
    </div>
  );
}

interface DynamicFormRendererProps {
  fields: FormFieldConfig[];
  watchValues?: Record<string, any>;
}

export function DynamicFormRenderer({ fields, watchValues = {} }: DynamicFormRendererProps) {
  // Sort fields by order
  const sortedFields = [...fields].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-4">
      {sortedFields.map((field) => (
        <DynamicFormField key={field.id} field={field} watchValues={watchValues} />
      ))}
    </div>
  );
}
