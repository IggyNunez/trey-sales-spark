import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calculator, BarChart3, Calendar, GitBranch, TrendingUp, Loader2 } from 'lucide-react';
import { useCalculatedFields, CalculatedField, FormulaType } from '@/hooks/useCalculatedFields';
import { useDatasetRecords } from '@/hooks/useWebhookDashboard';
import { calculateAggregations } from '@/lib/calculationEngine';

interface CalculatedFieldsSummaryProps {
  datasetId: string;
}

export function CalculatedFieldsSummary({ datasetId }: CalculatedFieldsSummaryProps) {
  const { data: calculatedFields = [], isLoading: fieldsLoading } = useCalculatedFields(datasetId);
  const { data: records = [], isLoading: recordsLoading } = useDatasetRecords(datasetId, 1000);

  const aggregationFields = calculatedFields.filter(f => f.formula_type === 'aggregation' && f.is_active);
  
  // Calculate all aggregations
  const aggregationResults = useMemo(() => {
    if (!records.length || !aggregationFields.length) return {};
    
    // Map records to use extracted_data for calculations
    const mappedRecords = records.map(r => ({
      ...r.extracted_data,
      created_at: r.created_at,
    }));
    
    return calculateAggregations(aggregationFields, mappedRecords, 'created_at');
  }, [records, aggregationFields]);

  const getFormulaIcon = (type: FormulaType) => {
    switch (type) {
      case 'expression': return <Calculator className="h-4 w-4" />;
      case 'aggregation': return <BarChart3 className="h-4 w-4" />;
      case 'date_diff': return <Calendar className="h-4 w-4" />;
      case 'conditional': return <GitBranch className="h-4 w-4" />;
    }
  };

  const formatValue = (value: any, field: CalculatedField): string => {
    if (value === null || value === undefined) return '-';
    
    const numValue = Number(value);
    if (isNaN(numValue)) return String(value);
    
    // Format based on formula content hints
    if (field.formula.toLowerCase().includes('avg') || field.formula.toLowerCase().includes('average')) {
      return numValue.toFixed(2);
    }
    if (field.formula.toLowerCase().includes('count')) {
      return Math.round(numValue).toLocaleString();
    }
    if (numValue >= 1000) {
      return numValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
    }
    return numValue.toFixed(2);
  };

  const isLoading = fieldsLoading || recordsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (aggregationFields.length === 0) {
    return null; // Don't show if no aggregation fields
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <TrendingUp className="h-4 w-4" />
          Calculated Metrics
        </CardTitle>
        <CardDescription>
          Real-time aggregations from {records.length} records
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {aggregationFields.map((field) => {
            const value = aggregationResults[field.field_slug];
            
            return (
              <div
                key={field.id}
                className="p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  {getFormulaIcon(field.formula_type)}
                  <span className="text-xs font-medium">{field.display_name}</span>
                </div>
                <div className="text-2xl font-bold">
                  {formatValue(value, field)}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">
                    {field.time_scope === 'all' ? 'All time' : field.time_scope.toUpperCase()}
                  </Badge>
                  <code className="text-xs text-muted-foreground truncate max-w-[100px]">
                    {field.formula}
                  </code>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}