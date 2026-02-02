import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { 
  MoreVertical, 
  Pencil, 
  Trash2, 
  TrendingUp, 
  TrendingDown, 
  Minus,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Maximize2,
  Columns,
  LayoutGrid,
  ArrowUpDown,
  User,
  Calendar,
  FileText,
} from 'lucide-react';
import { DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  PieChart, 
  Pie, 
  Cell, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DashboardWidget, useDatasetRecords, useDatasetFields } from '@/hooks/useWebhookDashboard';
import { useCalculatedFields } from '@/hooks/useCalculatedFields';
import { calculateFieldValue } from '@/lib/calculationEngine';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';

const CHART_COLORS = [
  '#22d3ee', // cyan-400
  '#06b6d4', // cyan-500
  '#a78bfa', // violet-400
  '#8b5cf6', // violet-500
  '#60a5fa', // blue-400
  '#3b82f6', // blue-500
  '#34d399', // emerald-400
  '#10b981', // emerald-500
];

interface GlobalFilter {
  field: string;
  op: string;
  value: any;
}

interface WidgetRendererProps {
  widget: DashboardWidget;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onResize?: (size: 'full' | 'half' | 'third') => void;
  onResizeHeight?: (height: 'small' | 'medium' | 'large') => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  globalFilters?: GlobalFilter[];
}

export function WidgetRenderer({ 
  widget, 
  onEdit, 
  onDelete, 
  onMoveUp,
  onMoveDown,
  onResize,
  onResizeHeight,
  canMoveUp = true,
  canMoveDown = true,
  globalFilters = [] 
}: WidgetRendererProps) {
  const { data: records, isLoading, refetch } = useDatasetRecords(widget.dataset_id, 1000);
  const { data: datasetFields } = useDatasetFields(widget.dataset_id);
  const { data: calculatedFields } = useCalculatedFields(widget.dataset_id);

  // Apply filters to records (both widget-level and global)
  const filteredRecords = useMemo(() => {
    if (!records) return [];
    
    let filtered = records;
    
    // Combine widget filters with global filters
    const widgetFilters = widget.metric_config?.filters || [];
    const allFilters = [...widgetFilters, ...globalFilters];
    
    for (const filter of allFilters) {
      filtered = filtered.filter(record => {
        const value = record.extracted_data?.[filter.field];
        switch (filter.op) {
          case '=': return String(value) === String(filter.value);
          case '!=': return String(value) !== String(filter.value);
          case '>': return Number(value) > Number(filter.value);
          case '<': return Number(value) < Number(filter.value);
          case '>=': 
            // Handle date comparison
            if (filter.field === 'date' && typeof value === 'string') {
              return value >= filter.value;
            }
            return Number(value) >= Number(filter.value);
          case '<=': 
            // Handle date comparison
            if (filter.field === 'date' && typeof value === 'string') {
              return value <= filter.value;
            }
            return Number(value) <= Number(filter.value);
          case 'contains': return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
          default: return true;
        }
      });
    }
    
    return filtered;
  }, [records, widget.metric_config?.filters, globalFilters]);

  // Get field value (supports calculated fields)
  const getFieldValue = (record: any, fieldSlug: string): number | null => {
    // Check if it's a calculated field
    const calcField = calculatedFields?.find(f => f.field_slug === fieldSlug && f.is_active);
    if (calcField) {
      const result = calculateFieldValue(calcField, record.extracted_data, records?.map(r => r.extracted_data) || []);
      return typeof result === 'number' ? result : null;
    }
    
    // Regular field
    const value = record.extracted_data?.[fieldSlug];
    return typeof value === 'number' ? value : parseFloat(value) || null;
  };

  // Calculate aggregation
  const calculateAggregation = (recs: typeof filteredRecords, fieldSlug: string, aggType: string) => {
    if (!recs.length) return 0;
    
    const values = recs.map(r => getFieldValue(r, fieldSlug)).filter((v): v is number => v !== null);
    if (!values.length) return 0;

    switch (aggType) {
      case 'SUM': return values.reduce((a, b) => a + b, 0);
      case 'COUNT': return recs.length;
      case 'AVG': return values.reduce((a, b) => a + b, 0) / values.length;
      case 'MIN': return Math.min(...values);
      case 'MAX': return Math.max(...values);
      default: return 0;
    }
  };

  // Group data for charts
  const groupedData = useMemo(() => {
    const groupBy = widget.metric_config?.groupBy;
    const field = widget.metric_config?.field;
    const aggregation = widget.metric_config?.aggregation || 'SUM';
    
    if (!groupBy || !field || !filteredRecords.length) return [];

    const groups: Record<string, typeof filteredRecords> = {};
    
    filteredRecords.forEach(record => {
      let key: string;
      
      if (groupBy === 'date') {
        key = format(new Date(record.created_at), 'MMM dd');
      } else if (groupBy === 'week') {
        key = format(new Date(record.created_at), "'W'w yyyy");
      } else if (groupBy === 'month') {
        key = format(new Date(record.created_at), 'MMM yyyy');
      } else {
        key = String(record.extracted_data?.[groupBy] || 'Unknown');
      }
      
      if (!groups[key]) groups[key] = [];
      groups[key].push(record);
    });

    return Object.entries(groups).map(([name, recs]) => ({
      name,
      value: calculateAggregation(recs, field, aggregation),
    })).sort((a, b) => {
      // Sort by date if applicable
      if (groupBy === 'date' || groupBy === 'week' || groupBy === 'month') {
        return 0; // Keep chronological order
      }
      return b.value - a.value;
    });
  }, [filteredRecords, widget.metric_config, calculatedFields]);

  // Calculate main value and comparison
  const mainValue = useMemo(() => {
    const field = widget.metric_config?.field;
    const aggregation = widget.metric_config?.aggregation || 'SUM';
    if (!field) return 0;
    return calculateAggregation(filteredRecords, field, aggregation);
  }, [filteredRecords, widget.metric_config]);

  // Comparison with previous period (last 7 days vs prior 7 days)
  const comparisonData = useMemo(() => {
    if (!widget.comparison_enabled) return null;
    
    const field = widget.metric_config?.field;
    const aggregation = widget.metric_config?.aggregation || 'SUM';
    if (!field || !records) return null;

    const now = new Date();
    const weekAgo = subDays(now, 7);
    const twoWeeksAgo = subDays(now, 14);

    const currentPeriod = filteredRecords.filter(r => {
      const date = new Date(r.created_at);
      return date >= startOfDay(weekAgo) && date <= endOfDay(now);
    });

    const previousPeriod = filteredRecords.filter(r => {
      const date = new Date(r.created_at);
      return date >= startOfDay(twoWeeksAgo) && date < startOfDay(weekAgo);
    });

    const currentValue = calculateAggregation(currentPeriod, field, aggregation);
    const previousValue = calculateAggregation(previousPeriod, field, aggregation);
    
    if (previousValue === 0) return { change: 0, isPositive: true };
    
    const change = ((currentValue - previousValue) / previousValue) * 100;
    return { change, isPositive: change >= 0 };
  }, [filteredRecords, records, widget.comparison_enabled, widget.metric_config]);

  // Format number for display
  const formatValue = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toFixed(value % 1 === 0 ? 0 : 2);
  };

  // Get dynamic height for charts and tables based on widget position.h
  const getContentHeight = () => {
    const h = widget.position?.h || 2;
    if (h >= 6) return 450;  // Large
    if (h >= 4) return 280;  // Medium
    return 150;              // Small
  };

  // Get max rows for tables based on height
  const getMaxRows = () => {
    const h = widget.position?.h || 2;
    if (h >= 6) return 20;   // Large
    if (h >= 4) return 12;   // Medium
    return 6;                // Small
  };

  const contentHeight = getContentHeight();
  const maxRows = getMaxRows();

  // Loading state
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Render based on widget type
  const renderContent = () => {
    switch (widget.widget_type) {
      case 'card':
      case 'number':
        return (
          <div className="flex flex-col items-center justify-center w-full py-4">
            <span className="text-6xl font-bold text-foreground tracking-tight">
              {formatValue(mainValue)}
            </span>
            {comparisonData && (
              <div className={`flex items-center gap-1.5 mt-3 text-sm font-medium ${
                comparisonData.change === 0 
                  ? 'text-muted-foreground' 
                  : comparisonData.isPositive 
                    ? 'text-emerald-500' 
                    : 'text-rose-500'
              }`}>
                {comparisonData.change !== 0 && (
                  comparisonData.isPositive ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )
                )}
                <span>
                  {comparisonData.change === 0 ? '—' : `${comparisonData.isPositive ? '↑' : '↓'} ${Math.abs(comparisonData.change).toFixed(2)}%`}
                </span>
                <span className="text-muted-foreground font-normal">vs Last 31 Days</span>
              </div>
            )}
          </div>
        );

      case 'line':
        if (!groupedData.length) {
          return <div className="text-muted-foreground text-sm">No data to display. Add a groupBy field.</div>;
        }
        return (
          <ResponsiveContainer width="100%" height={contentHeight}>
            <LineChart data={groupedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'bar':
        if (!groupedData.length) {
          return <div className="text-muted-foreground text-sm">No data to display. Add a groupBy field.</div>;
        }
        return (
          <ResponsiveContainer width="100%" height={contentHeight}>
            <BarChart data={groupedData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'hsl(var(--background))', 
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );

      case 'pie':
        if (!groupedData.length) {
          return <div className="text-muted-foreground text-sm">No data to display. Add a groupBy field.</div>;
        }
        const pieTotal = groupedData.reduce((sum, item) => sum + item.value, 0);
        return (
          <div className="flex items-center justify-between w-full gap-4">
            {/* Donut Chart with center total */}
            <div className="relative flex-shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={groupedData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={70}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {groupedData.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--background))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Center total */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-2xl font-bold text-foreground">{formatValue(pieTotal)}</span>
              </div>
            </div>
            
            {/* Legend on the right */}
            <div className="flex flex-col gap-1.5 text-sm overflow-hidden">
              {groupedData.slice(0, 6).map((item, index) => (
                <div key={item.name} className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-sm flex-shrink-0" 
                    style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} 
                  />
                  <span className="text-muted-foreground truncate max-w-[100px]">{item.name}</span>
                  <span className="font-medium text-foreground">- {formatValue(item.value)}</span>
                </div>
              ))}
              {groupedData.length > 6 && (
                <span className="text-xs text-muted-foreground">+{groupedData.length - 6} more</span>
              )}
            </div>
          </div>
        );

      case 'table':
        if (!filteredRecords.length) {
          return <div className="text-muted-foreground text-sm">No records to display.</div>;
        }
        return (
          <div className="overflow-auto w-full" style={{ maxHeight: contentHeight }}>
            <Table>
              <TableHeader>
                <TableRow>
                  {datasetFields?.slice(0, 4).map(f => (
                    <TableHead key={f.id} className="text-xs">{f.field_name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRecords.slice(0, maxRows).map((record) => (
                  <TableRow key={record.id}>
                    {datasetFields?.slice(0, 4).map(f => (
                      <TableCell key={f.id} className="text-xs py-1">
                        {String(record.extracted_data?.[f.field_slug] ?? '-')}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );

      case 'multi-bar':
        // Multi-metric bar chart: shows all numeric fields as bars
        const numericFields = datasetFields?.filter(f => f.field_type === 'number') || [];
        if (!numericFields.length) {
          return <div className="text-muted-foreground text-sm">No numeric fields found.</div>;
        }
        
        const multiBarData = numericFields.map(field => {
          const values = filteredRecords.map(r => {
            const val = r.extracted_data?.[field.field_slug];
            return typeof val === 'number' ? val : parseFloat(val) || 0;
          });
          const sum = values.reduce((a, b) => a + b, 0);
          return {
            name: field.field_name,
            value: sum,
            field_slug: field.field_slug,
          };
        });

        return (
          <div className="w-full h-full">
            <ResponsiveContainer width="100%" height={contentHeight}>
              <BarChart data={multiBarData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  tick={{ fontSize: 11 }} 
                  width={75}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => [formatValue(value), 'Total']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {multiBarData.map((_, index) => (
                    <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        );

      case 'summary':
        // Summary table: shows aggregated totals for all numeric fields
        const summaryFields = datasetFields?.filter(f => f.field_type === 'number') || [];
        if (!summaryFields.length) {
          return <div className="text-muted-foreground text-sm">No numeric fields found.</div>;
        }
        
        const summaryData = summaryFields.map(field => {
          const values = filteredRecords.map(r => {
            const val = r.extracted_data?.[field.field_slug];
            return typeof val === 'number' ? val : parseFloat(val) || 0;
          });
          const sum = values.reduce((a, b) => a + b, 0);
          const avg = values.length > 0 ? sum / values.length : 0;
          const max = values.length > 0 ? Math.max(...values) : 0;
          const min = values.length > 0 ? Math.min(...values) : 0;
          return {
            name: field.field_name,
            sum,
            avg,
            max,
            min,
            count: values.length,
          };
        });

        return (
          <div className="overflow-auto w-full" style={{ maxHeight: contentHeight }}>
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-semibold">Metric</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Total</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Avg</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Max</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Min</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryData.map((row, idx) => (
                  <TableRow key={row.name}>
                    <TableCell className="text-sm font-medium py-2">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-2 h-2 rounded-full" 
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        {row.name}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-right font-semibold py-2">
                      {formatValue(row.sum)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-muted-foreground py-2">
                      {formatValue(row.avg)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-muted-foreground py-2">
                      {formatValue(row.max)}
                    </TableCell>
                    <TableCell className="text-sm text-right text-muted-foreground py-2">
                      {formatValue(row.min)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        );

      case 'gauge':
        // Gauge widget: donut-style visualization
        const maxValue = filteredRecords.length > 0 
          ? Math.max(...filteredRecords.map(r => getFieldValue(r, widget.metric_config?.field || '') || 0))
          : 100;
        const gaugeMax = maxValue > 0 ? Math.max(mainValue, maxValue * 1.2) : 100;
        const percentage = Math.min(100, Math.max(0, (mainValue / gaugeMax) * 100));
        
        return (
          <div className="flex flex-col items-center justify-center w-full py-2">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                {/* Background circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#e5e7eb"
                  strokeWidth="10"
                  fill="none"
                />
                {/* Progress circle */}
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  stroke="#22d3ee"
                  strokeWidth="10"
                  fill="none"
                  strokeDasharray={`${percentage * 2.51} 251`}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-bold text-foreground">{formatValue(mainValue)}</span>
              </div>
            </div>
            {comparisonData && (
              <div className={`flex items-center gap-1.5 mt-2 text-sm font-medium ${
                comparisonData.isPositive ? 'text-emerald-500' : 'text-rose-500'
              }`}>
                <span>{comparisonData.isPositive ? '↑' : '↓'} {Math.abs(comparisonData.change).toFixed(2)}%</span>
                <span className="text-muted-foreground font-normal">vs Last 31 Days</span>
              </div>
            )}
          </div>
        );

      case 'notes':
        // Notes panel: Display text fields in accordion view grouped by date
        const textFields = datasetFields?.filter(f => f.field_type === 'text') || [];
        const noteFieldSlugs = textFields.map(f => f.field_slug);
        
        // Group records by date field if available, otherwise by created_at
        const groupedByDate: Record<string, typeof filteredRecords> = {};
        filteredRecords.forEach(record => {
          const dateValue = record.extracted_data?.date || 
            format(new Date(record.created_at), 'yyyy-MM-dd');
          const dateKey = typeof dateValue === 'string' ? dateValue : format(new Date(dateValue), 'yyyy-MM-dd');
          if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
          groupedByDate[dateKey].push(record);
        });

        const sortedDates = Object.keys(groupedByDate).sort((a, b) => b.localeCompare(a));
        
        if (!sortedDates.length) {
          return <div className="text-muted-foreground text-sm">No records to display.</div>;
        }

        return (
          <div className="overflow-auto w-full space-y-4" style={{ maxHeight: contentHeight }}>
            {sortedDates.slice(0, 10).map(dateKey => {
              const dateRecords = groupedByDate[dateKey];
              return (
                <div key={dateKey} className="border rounded-lg p-3 bg-muted/30">
                  <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-sm">
                      {format(new Date(dateKey), 'EEEE, MMM d, yyyy')}
                    </span>
                    <Badge variant="secondary" className="ml-auto">
                      {dateRecords.length} {dateRecords.length === 1 ? 'entry' : 'entries'}
                    </Badge>
                  </div>
                  
                  {dateRecords.map((record, recordIdx) => {
                    // Check closer_name, setter_name, entity_name for the display name
                    const displayName = record.extracted_data?.closer_name || record.extracted_data?.setter_name || record.extracted_data?.entity_name || 'Unknown';
                    const dailyFeedback = record.extracted_data?.daily_feedback;
                    const revenueActivities = record.extracted_data?.revenue_generating_activities;
                    
                    // Get booked call notes (fields that start with booked_call_)
                    const bookedCallNotes = noteFieldSlugs
                      .filter(slug => slug.startsWith('booked_call_'))
                      .map(slug => ({
                        slug,
                        label: textFields.find(f => f.field_slug === slug)?.field_name || slug,
                        value: record.extracted_data?.[slug],
                      }))
                      .filter(note => note.value && String(note.value).trim().length > 0);

                    return (
                      <Accordion type="single" collapsible key={record.id} className="mb-2">
                        <AccordionItem value={record.id} className="border rounded-md bg-background">
                          <AccordionTrigger className="px-3 py-2 hover:no-underline">
                            <div className="flex items-center gap-3 text-left">
                              <User className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{displayName}</span>
                              {bookedCallNotes.length > 0 && (
                                <Badge variant="outline" className="text-xs">
                                  <FileText className="h-3 w-3 mr-1" />
                                  {bookedCallNotes.length} notes
                                </Badge>
                              )}
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-3 pb-3">
                            <div className="space-y-3">
                              {/* Daily Feedback */}
                              {dailyFeedback && (
                                <div className="p-2 bg-muted/50 rounded-md">
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Daily Feedback
                                  </div>
                                  <p className="text-sm">{String(dailyFeedback)}</p>
                                </div>
                              )}
                              
                              {/* Revenue Activities */}
                              {revenueActivities && (
                                <div className="p-2 bg-muted/50 rounded-md">
                                  <div className="text-xs font-semibold text-muted-foreground mb-1">
                                    Revenue Generating Activities
                                  </div>
                                  <p className="text-sm">{String(revenueActivities)}</p>
                                </div>
                              )}
                              
                              {/* Booked Call Notes */}
                              {bookedCallNotes.length > 0 && (
                                <div className="space-y-2">
                                  <div className="text-xs font-semibold text-muted-foreground">
                                    Call Notes
                                  </div>
                                  {bookedCallNotes.map((note, idx) => (
                                    <div key={note.slug} className="p-2 bg-primary/5 border-l-2 border-primary rounded-r-md">
                                      <div className="text-xs font-medium text-primary mb-1">
                                        {note.label}
                                      </div>
                                      <p className="text-sm whitespace-pre-wrap">{String(note.value)}</p>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );

      default:
        return <div className="text-muted-foreground">Unknown widget type: {widget.widget_type}</div>;
    }
  };

  // Get current size based on position width
  const getCurrentSize = () => {
    const w = widget.position?.w || 3;
    if (w >= 12) return 'full';
    if (w >= 6) return 'half';
    return 'third';
  };

  // Get current height based on position height
  const getCurrentHeight = () => {
    const h = widget.position?.h || 2;
    if (h >= 6) return 'large';
    if (h >= 4) return 'medium';
    return 'small';
  };

  // Check if widget type supports height adjustment
  const supportsHeightAdjustment = ['table', 'bar', 'line', 'multi-bar', 'summary', 'notes'].includes(widget.widget_type);

  return (
    <Card className="h-full flex flex-col bg-card shadow-sm border group">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-foreground">
            {widget.title || `${widget.metric_config?.aggregation} of ${widget.metric_config?.field}`}
          </CardTitle>
          <div className="flex items-center gap-1">
            {/* Move buttons - always visible */}
            {onMoveUp && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={onMoveUp}
                disabled={!canMoveUp}
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </Button>
            )}
            {onMoveDown && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-7 w-7" 
                onClick={onMoveDown}
                disabled={!canMoveDown}
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => refetch()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {onResize && (
                  <>
                    <DropdownMenuItem 
                      onClick={() => onResize('full')}
                      className={getCurrentSize() === 'full' ? 'bg-accent' : ''}
                    >
                      <Maximize2 className="h-4 w-4 mr-2" />
                      Full Width
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onResize('half')}
                      className={getCurrentSize() === 'half' ? 'bg-accent' : ''}
                    >
                      <Columns className="h-4 w-4 mr-2" />
                      Half Width
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onResize('third')}
                      className={getCurrentSize() === 'third' ? 'bg-accent' : ''}
                    >
                      <LayoutGrid className="h-4 w-4 mr-2" />
                      Third Width
                    </DropdownMenuItem>
                  </>
                )}
                {onResizeHeight && supportsHeightAdjustment && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem 
                      onClick={() => onResizeHeight('small')}
                      className={getCurrentHeight() === 'small' ? 'bg-accent' : ''}
                    >
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      Small Height
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onResizeHeight('medium')}
                      className={getCurrentHeight() === 'medium' ? 'bg-accent' : ''}
                    >
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      Medium Height
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => onResizeHeight('large')}
                      className={getCurrentHeight() === 'large' ? 'bg-accent' : ''}
                    >
                      <ArrowUpDown className="h-4 w-4 mr-2" />
                      Large Height
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {widget.metric_config?.filters?.length ? (
          <div className="flex flex-wrap gap-1 mt-1">
            {widget.metric_config.filters.map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {f.field} {f.op} {f.value}
              </Badge>
            ))}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1 flex items-center justify-center pt-0">
        {renderContent()}
      </CardContent>
    </Card>
  );
}
