// Custom Metrics Types - Simplified

export type FormulaType = 'count' | 'sum' | 'percentage';

export type DataSource = 'events' | 'payments' | 'pcf_fields';

// Date fields for filtering - determines which date is used when applying dashboard date filters
export type DateField = 'scheduled_at' | 'booked_at' | 'payment_date' | 'created_at';

export interface FilterCondition {
  field: string;
  operator: 'equals' | 'not_equals' | 'in';
  value: string | string[] | null;
}

export interface MetricDefinition {
  id: string;
  organization_id: string;
  name: string;
  display_name: string;
  description: string | null;
  formula_type: FormulaType;
  
  // Data source configuration
  data_source?: DataSource;
  
  // Date field for filtering - which date column to use for dashboard date filters
  date_field?: DateField;
  
  // For sum: the field to aggregate
  numerator_field: string | null;
  denominator_field: string | null;
  
  // Filter conditions stored as JSON
  numerator_conditions: FilterCondition[];
  denominator_conditions: FilterCondition[];
  
  // Include toggles (for events only)
  include_no_shows: boolean;
  include_cancels: boolean;
  include_reschedules: boolean;
  
  // Exclude events with overdue PCF (past scheduled date, no PCF submitted)
  exclude_overdue_pcf?: boolean;
  
  // For pcf_fields data source - the form field ID to track
  pcf_field_id?: string;
  
  // Display settings
  icon?: string;
  
  // Ordering and visibility
  sort_order: number;
  is_active: boolean;
  
  created_at: string;
  updated_at: string;
}

export interface MetricValue {
  metricId: string;
  value: number;
  formattedValue: string;
  breakdown?: {
    numerator: number;
    denominator?: number;
  };
}

// Simplified available fields per data source
export const DATA_SOURCE_FIELDS: Record<DataSource, { label: string; fields: { value: string; label: string; type: 'string' | 'number' | 'boolean' }[] }> = {
  events: {
    label: 'Calls/Events',
    fields: [
      { value: 'event_outcome', label: 'Call Outcome', type: 'string' },
      { value: 'call_status', label: 'Call Status', type: 'string' },
      { value: 'pcf_submitted', label: 'PCF Submitted', type: 'boolean' },
      { value: 'lead_showed', label: 'Lead Showed (PCF)', type: 'boolean' },
      { value: 'offer_made', label: 'Offer Made (PCF)', type: 'boolean' },
      { value: 'deal_closed', label: 'Deal Closed (PCF)', type: 'boolean' },
    ]
  },
  payments: {
    label: 'Payments',
    fields: [
      { value: 'amount', label: 'Amount', type: 'number' },
      { value: 'net_revenue', label: 'Net Revenue', type: 'number' },
      { value: 'payment_type', label: 'Payment Type', type: 'string' },
    ]
  },
  pcf_fields: {
    label: 'Form Responses',
    fields: [
      // These will be populated dynamically from form config
      { value: 'response_value', label: 'Response Value', type: 'boolean' },
    ]
  },
};

// Date field options for filtering
export const DATE_FIELD_OPTIONS: { value: DateField; label: string; description: string; dataSource: DataSource }[] = [
  { value: 'scheduled_at', label: 'Scheduled Date', description: 'When the call is scheduled to happen', dataSource: 'events' },
  { value: 'booked_at', label: 'Booked Date', description: 'When the call was booked/created', dataSource: 'events' },
  { value: 'payment_date', label: 'Payment Date', description: 'When the payment was made', dataSource: 'payments' },
  { value: 'created_at', label: 'Created Date', description: 'When the record was created', dataSource: 'events' },
];

// Call outcome options - matches the event_outcome enum
export const EVENT_OUTCOME_OPTIONS = [
  { value: 'no_show', label: 'No Show' },
  { value: 'showed_no_offer', label: 'Showed (No Offer)' },
  { value: 'showed_offer_no_close', label: 'Offered (No Close)' },
  { value: 'closed', label: 'Closed' },
];

// Payment type options
export const PAYMENT_TYPE_OPTIONS = [
  { value: 'paid_in_full', label: 'Paid in Full' },
  { value: 'split_pay', label: 'Split Pay' },
  { value: 'deposit', label: 'Deposit' },
];

// Call status options
export const CALL_STATUS_OPTIONS = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'canceled', label: 'Canceled' },
  { value: 'rescheduled', label: 'Rescheduled' },
];

// Boolean options for PCF fields
export const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Yes' },
  { value: 'false', label: 'No' },
];

// Quick presets for numerator/denominator selection (easier than filter conditions)
export const METRIC_PRESETS = {
  numerator: [
    { 
      value: 'all_scheduled', 
      label: 'All Scheduled Calls', 
      description: 'Every call on the calendar',
      conditions: [] as FilterCondition[],
    },
    { 
      value: 'showed_calls', 
      label: 'Showed Calls', 
      description: 'Lead showed up to the call',
      conditions: [{ field: 'event_outcome', operator: 'not_equals' as const, value: 'no_show' }],
    },
    { 
      value: 'offers_made', 
      label: 'Offers Made', 
      description: 'Closer made an offer',
      conditions: [{ field: 'event_outcome', operator: 'in' as const, value: ['showed_offer_no_close', 'closed'] }],
    },
    { 
      value: 'closed_deals', 
      label: 'Closed Deals', 
      description: 'Deal was closed',
      conditions: [{ field: 'event_outcome', operator: 'equals' as const, value: 'closed' }],
    },
    { 
      value: 'no_shows', 
      label: 'No Shows', 
      description: 'Lead did not show up',
      conditions: [{ field: 'event_outcome', operator: 'equals' as const, value: 'no_show' }],
    },
    { 
      value: 'custom', 
      label: 'Custom Filter', 
      description: 'Build your own filter',
      conditions: [],
    },
  ],
  denominator: [
    { 
      value: 'all_scheduled', 
      label: 'All Scheduled Calls', 
      description: 'Every call on the calendar',
      conditions: [] as FilterCondition[],
    },
    { 
      value: 'showed_calls', 
      label: 'Showed Calls', 
      description: 'Leads who showed up',
      conditions: [{ field: 'event_outcome', operator: 'not_equals' as const, value: 'no_show' }],
    },
    { 
      value: 'offers_made', 
      label: 'Offers Made', 
      description: 'Calls where offer was made',
      conditions: [{ field: 'event_outcome', operator: 'in' as const, value: ['showed_offer_no_close', 'closed'] }],
    },
    { 
      value: 'custom', 
      label: 'Custom Filter', 
      description: 'Build your own filter',
      conditions: [],
    },
  ],
};

// Icon options for metrics
export const METRIC_ICONS = [
  { value: 'dollar-sign', label: 'Dollar Sign' },
  { value: 'users', label: 'Users' },
  { value: 'phone', label: 'Phone' },
  { value: 'check-circle', label: 'Check' },
  { value: 'target', label: 'Target' },
  { value: 'percent', label: 'Percent' },
  { value: 'trending-up', label: 'Trending Up' },
];

// Simplified preset templates - focused on core metrics
export const METRIC_TEMPLATES: Partial<MetricDefinition>[] = [
  // Core rate metrics
  {
    name: 'show_rate',
    display_name: 'Show Rate',
    description: 'Leads who showed ÷ Total scheduled calls',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'not_equals', value: 'no_show' }],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: false,
    include_reschedules: false,
    icon: 'users',
  },
  {
    name: 'offer_rate',
    display_name: 'Offer Rate',
    description: 'Offers made ÷ Leads who showed',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'in', value: ['showed_offer_no_close', 'closed'] }],
    denominator_conditions: [{ field: 'event_outcome', operator: 'not_equals', value: 'no_show' }],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'percent',
  },
  // Close Rate variants
  {
    name: 'close_rate_showed',
    display_name: 'Close Rate (Showed → Closed)',
    description: 'Deals closed ÷ Leads who showed',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'equals', value: 'closed' }],
    denominator_conditions: [{ field: 'event_outcome', operator: 'not_equals', value: 'no_show' }],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'target',
  },
  {
    name: 'close_rate_offered',
    display_name: 'Close Rate (Offered → Closed)',
    description: 'Deals closed ÷ Offers made',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'equals', value: 'closed' }],
    denominator_conditions: [{ field: 'event_outcome', operator: 'in', value: ['showed_offer_no_close', 'closed'] }],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'target',
  },
  // Cash metrics
  {
    name: 'cash_collected',
    display_name: 'Cash Collected',
    description: 'Total net revenue collected (amount minus refunds)',
    formula_type: 'sum',
    data_source: 'payments',
    numerator_field: 'net_revenue',
    numerator_conditions: [],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: true,
    include_reschedules: true,
    icon: 'dollar-sign',
  },
  // Count metrics
  {
    name: 'calls_scheduled',
    display_name: 'Scheduled Calls',
    description: 'Calls happening in the selected date range (by scheduled date)',
    formula_type: 'count',
    data_source: 'events',
    date_field: 'scheduled_at',
    numerator_conditions: [],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: false,
    include_reschedules: false,
    icon: 'phone',
  },
  {
    name: 'calls_booked',
    display_name: 'Calls Booked',
    description: 'Calls booked/created in the selected date range (by booked date)',
    formula_type: 'count',
    data_source: 'events',
    date_field: 'booked_at',
    numerator_conditions: [],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: true,
    include_reschedules: true,
    icon: 'phone',
  },
  {
    name: 'calls_showed',
    display_name: 'Calls Showed',
    description: 'Number of calls where lead showed up',
    formula_type: 'count',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'not_equals', value: 'no_show' }],
    denominator_conditions: [],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'phone',
  },
  {
    name: 'offers_made',
    display_name: 'Offers Made',
    description: 'Number of offers presented',
    formula_type: 'count',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'in', value: ['showed_offer_no_close', 'closed'] }],
    denominator_conditions: [],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'percent',
  },
  {
    name: 'deals_closed',
    display_name: 'Deals Closed',
    description: 'Number of closed deals',
    formula_type: 'count',
    data_source: 'events',
    numerator_conditions: [{ field: 'event_outcome', operator: 'equals', value: 'closed' }],
    denominator_conditions: [],
    include_no_shows: false,
    include_cancels: false,
    include_reschedules: false,
    icon: 'check-circle',
  },
  // Reschedule and Cancel Rate metrics
  {
    name: 'reschedule_rate',
    display_name: 'Reschedule Rate',
    description: 'Rescheduled calls ÷ Total scheduled calls',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'call_status', operator: 'equals', value: 'rescheduled' }],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: true,
    include_reschedules: true,
    icon: 'trending-up',
  },
  {
    name: 'cancel_rate',
    display_name: 'Cancel Rate',
    description: 'Canceled calls ÷ Total scheduled calls',
    formula_type: 'percentage',
    data_source: 'events',
    numerator_conditions: [{ field: 'call_status', operator: 'equals', value: 'canceled' }],
    denominator_conditions: [],
    include_no_shows: true,
    include_cancels: true,
    include_reschedules: true,
    icon: 'trending-up',
  },
];
