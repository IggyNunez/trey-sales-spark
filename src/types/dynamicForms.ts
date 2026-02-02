// Dynamic Form System Types

export type EntityType = 'closer' | 'lead' | 'event' | 'standalone';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'per_event' | null;
export type FieldType = 'boolean' | 'number' | 'currency' | 'text' | 'textarea' | 'select' | 'multi_select' | 'date';
export type FormulaType = 'count' | 'sum' | 'average' | 'percentage' | 'custom';
export type AggregateBy = 'total' | 'closer' | 'day' | 'week' | 'month';
export type ValueFormat = 'number' | 'currency' | 'percentage';

// Conditional Logic
export interface ConditionalRule {
  field_slug: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains' | 'is_empty' | 'is_not_empty';
  value: any;
}

export interface ConditionalLogic {
  conditions: ConditionalRule[];
  logic: 'AND' | 'OR';
}

// Field Options (for select/multi_select)
export interface FieldOption {
  value: string;
  label: string;
  color?: string;
}

// Validation Rules
export interface ValidationRules {
  min?: number;
  max?: number;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
}

// Metric Configuration
export interface MetricConfig {
  metric_type: FormulaType;
  display_name: string;
  format: ValueFormat;
  icon?: string;
  // For percentage calculations
  numerator_field?: string;
  denominator_field?: string;
  // Aggregation
  aggregate_by?: AggregateBy;
}

// Form Definition
export interface FormDefinition {
  id: string;
  organization_id: string;
  name: string;
  slug: string;
  description?: string;
  icon: string;
  entity_type: EntityType;
  is_recurring: boolean;
  recurrence_pattern: RecurrencePattern;
  assigned_closers: string[];
  is_active: boolean;
  sort_order: number;
  dataset_id?: string; // Optional link to a Dataset for auto-syncing to dashboard widgets
  created_at: string;
  updated_at: string;
}

// Form Field
export interface FormField {
  id: string;
  form_definition_id: string;
  organization_id: string;
  field_name: string;
  field_slug: string;
  label: string;
  field_type: FieldType;
  placeholder?: string;
  help_text?: string;
  default_value?: any;
  options?: FieldOption[];
  is_required: boolean;
  validation_rules: ValidationRules;
  conditional_logic?: ConditionalLogic;
  creates_metric: boolean;
  metric_config?: MetricConfig;
  sort_order: number;
  is_active: boolean;
  show_in_summary: boolean;
  created_at: string;
  updated_at: string;
}

// Form Submission
export interface FormSubmission {
  id: string;
  organization_id: string;
  form_definition_id: string;
  entity_type: EntityType;
  entity_id?: string;
  entity_name?: string;
  submitted_by_id?: string;
  submitted_by_name?: string;
  period_date?: string;
  status: 'draft' | 'submitted' | 'reviewed';
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

// Form Field Value
export interface FormFieldValue {
  id: string;
  submission_id: string;
  field_id: string;
  organization_id: string;
  value_text?: string;
  value_number?: number;
  value_boolean?: boolean;
  value_date?: string;
  value_json?: any;
  created_at: string;
  updated_at: string;
}

// Form Metric
export interface FormMetric {
  id: string;
  organization_id: string;
  form_definition_id: string;
  field_id?: string;
  name: string;
  display_name: string;
  description?: string;
  icon: string;
  formula_type: FormulaType;
  formula_config?: any;
  aggregate_by: AggregateBy;
  format: ValueFormat;
  color?: string;
  show_on_dashboard: boolean;
  dashboard_position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Helper constants
export const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string; description: string }[] = [
  { value: 'closer', label: 'Closer', description: 'Form is filled out by/for closers (e.g., EOD Report)' },
  { value: 'lead', label: 'Lead', description: 'Form is attached to leads (e.g., Qualification Form)' },
  { value: 'event', label: 'Event', description: 'Form is attached to events (e.g., Post-Call Form)' },
  { value: 'standalone', label: 'Standalone', description: 'Form is not linked to any entity' },
];

export const RECURRENCE_OPTIONS: { value: RecurrencePattern; label: string }[] = [
  { value: null, label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'per_event', label: 'Per Event' },
];

export const FIELD_TYPE_OPTIONS: { value: FieldType; label: string; icon: string }[] = [
  { value: 'boolean', label: 'Yes/No Toggle', icon: 'toggle-left' },
  { value: 'number', label: 'Number', icon: 'hash' },
  { value: 'currency', label: 'Currency', icon: 'dollar-sign' },
  { value: 'text', label: 'Short Text', icon: 'type' },
  { value: 'textarea', label: 'Long Text', icon: 'align-left' },
  { value: 'select', label: 'Dropdown', icon: 'chevron-down' },
  { value: 'multi_select', label: 'Multi-Select', icon: 'check-square' },
  { value: 'date', label: 'Date', icon: 'calendar' },
];

export const FORMULA_TYPE_OPTIONS: { value: FormulaType; label: string; description: string }[] = [
  { value: 'count', label: 'Count', description: 'Count number of submissions' },
  { value: 'sum', label: 'Sum', description: 'Sum all values' },
  { value: 'average', label: 'Average', description: 'Calculate average' },
  { value: 'percentage', label: 'Percentage', description: 'Calculate percentage (requires numerator/denominator)' },
  { value: 'custom', label: 'Custom Formula', description: 'Define custom calculation' },
];

export const ICON_OPTIONS = [
  'clipboard-list', 'file-text', 'check-circle', 'bar-chart', 'trending-up',
  'dollar-sign', 'users', 'phone', 'calendar', 'star', 'target', 'award',
  'briefcase', 'pie-chart', 'activity', 'zap', 'heart', 'flag', 'bookmark',
];
