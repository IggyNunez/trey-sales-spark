import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import type { FilterCondition, DataSource } from '@/types/customMetrics';
import { 
  DATA_SOURCE_FIELDS, 
  EVENT_OUTCOME_OPTIONS, 
  PAYMENT_TYPE_OPTIONS,
  CALL_STATUS_OPTIONS,
  BOOLEAN_OPTIONS,
} from '@/types/customMetrics';

interface FilterConditionBuilderProps {
  conditions: FilterCondition[];
  onChange: (conditions: FilterCondition[]) => void;
  dataSource?: DataSource;
  label?: string;
  description?: string;
}

const OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'does not equal' },
  { value: 'in', label: 'is one of' },
];

function getValueOptionsForField(field: string): { value: string; label: string }[] | null {
  switch (field) {
    case 'event_outcome':
      return EVENT_OUTCOME_OPTIONS;
    case 'payment_type':
      return PAYMENT_TYPE_OPTIONS;
    case 'call_status':
      return CALL_STATUS_OPTIONS;
    case 'pcf_submitted':
    case 'lead_showed':
    case 'offer_made':
    case 'deal_closed':
      return BOOLEAN_OPTIONS;
    default:
      return null;
  }
}

function getFieldType(field: string): 'string' | 'boolean' {
  const booleanFields = ['pcf_submitted', 'lead_showed', 'offer_made', 'deal_closed'];
  return booleanFields.includes(field) ? 'boolean' : 'string';
}

export function FilterConditionBuilder({
  conditions,
  onChange,
  dataSource = 'events',
  label = 'Filter Conditions',
  description,
}: FilterConditionBuilderProps) {
  // Include all fields, not just string types
  const fields = DATA_SOURCE_FIELDS[dataSource]?.fields || [];

  const addCondition = () => {
    onChange([
      ...conditions,
      {
        field: fields[0]?.value || 'event_outcome',
        operator: 'equals',
        value: '',
      },
    ]);
  };

  const updateCondition = (index: number, updates: Partial<FilterCondition>) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], ...updates };
    
    // Reset value when changing field
    if (updates.field !== undefined) {
      newConditions[index].value = '';
      // For boolean fields, default to 'equals' operator
      if (getFieldType(updates.field) === 'boolean') {
        newConditions[index].operator = 'equals';
      }
    }
    
    onChange(newConditions);
  };

  const removeCondition = (index: number) => {
    onChange(conditions.filter((_, i) => i !== index));
  };

  // Get available operators based on field type
  const getOperatorsForField = (field: string) => {
    if (getFieldType(field) === 'boolean') {
      return [{ value: 'equals', label: 'equals' }];
    }
    return OPERATORS;
  };

  const renderValueInput = (condition: FilterCondition, index: number) => {
    const valueOptions = getValueOptionsForField(condition.field);
    if (!valueOptions) return null;

    // For 'in' operator, allow multiple selection
    if (condition.operator === 'in') {
      const selectedValues = Array.isArray(condition.value) 
        ? condition.value as string[] 
        : condition.value ? [condition.value as string] : [];

      return (
        <div className="flex flex-wrap gap-1">
          {valueOptions.map((opt) => (
            <Button
              key={opt.value}
              type="button"
              variant={selectedValues.includes(opt.value) ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
              onClick={() => {
                const newValues = selectedValues.includes(opt.value)
                  ? selectedValues.filter(v => v !== opt.value)
                  : [...selectedValues, opt.value];
                updateCondition(index, { value: newValues });
              }}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      );
    }

    // Dropdown for single selection
    return (
      <Select
        value={String(condition.value || '')}
        onValueChange={(v) => updateCondition(index, { value: v })}
      >
        <SelectTrigger className="w-36">
          <SelectValue placeholder="Select..." />
        </SelectTrigger>
        <SelectContent>
          {valueOptions.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-medium">{label}</Label>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
        <Button 
          type="button" 
          variant="outline" 
          size="sm" 
          onClick={addCondition}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Add Filter
        </Button>
      </div>

      {conditions.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2 italic">
          No filters = count all records
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.map((condition, index) => (
            <Card key={index} className="bg-muted/30">
              <CardContent className="p-3 flex items-center gap-2 flex-wrap">
                <Select
                  value={condition.field}
                  onValueChange={(v) => updateCondition(index, { field: v })}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Field..." />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.value} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={condition.operator}
                  onValueChange={(v) => updateCondition(index, { operator: v as FilterCondition['operator'] })}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getOperatorsForField(condition.field).map((op) => (
                      <SelectItem key={op.value} value={op.value}>
                        {op.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {renderValueInput(condition, index)}

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 ml-auto"
                  onClick={() => removeCondition(index)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}