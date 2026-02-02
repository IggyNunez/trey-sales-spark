import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Zap, Search, RefreshCw, Eye, CheckCircle, AlertCircle, Clock, Loader2, Calculator } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { 
  Dataset, 
  DatasetRecord,
  useDatasetRecords,
  useDatasetFields 
} from '@/hooks/useWebhookDashboard';
import { useCalculatedFields } from '@/hooks/useCalculatedFields';
import { calculateFieldValue } from '@/lib/calculationEngine';
import { CalculatedFieldsSummary } from './CalculatedFieldsSummary';

interface DatasetRecordsViewerProps {
  dataset: Dataset;
}

export function DatasetRecordsViewer({ dataset }: DatasetRecordsViewerProps) {
  const { data: records, isLoading, refetch, isFetching } = useDatasetRecords(dataset.id, 100);
  const { data: fields } = useDatasetFields(dataset.id);
  const { data: calculatedFields = [] } = useCalculatedFields(dataset.id);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<DatasetRecord | null>(null);

  const visibleFields = fields?.filter(f => f.is_visible) || [];
  const activeCalculatedFields = calculatedFields.filter(f => f.is_active && f.formula_type !== 'aggregation');

  // Compute calculated field values for a record
  const getCalculatedFieldValues = useMemo(() => {
    return (record: DatasetRecord) => {
      const result: Record<string, any> = {};
      for (const field of activeCalculatedFields) {
        try {
          result[field.field_slug] = calculateFieldValue(
            field,
            { ...record.extracted_data, created_at: record.created_at },
            records?.map(r => ({ ...r.extracted_data, created_at: r.created_at }))
          );
        } catch {
          result[field.field_slug] = null;
        }
      }
      return result;
    };
  }, [activeCalculatedFields, records]);

  const filteredRecords = records?.filter(record => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    
    // Search in extracted_data
    const extractedStr = JSON.stringify(record.extracted_data).toLowerCase();
    return extractedStr.includes(searchLower);
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-success" />;
      case 'partial':
        return <Clock className="h-4 w-4 text-warning" />;
      case 'failed':
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return null;
    }
  };

  const getFieldValue = (record: DatasetRecord, fieldSlug: string) => {
    const value = record.extracted_data?.[fieldSlug];
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const formatFieldValue = (value: any, fieldType: string) => {
    if (value === null || value === undefined || value === '-') return '-';
    
    switch (fieldType) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
        }).format(Number(value) / 100); // Assume cents
      case 'date':
      case 'datetime':
        try {
          return format(new Date(value), 'MMM d, yyyy h:mm a');
        } catch {
          return value;
        }
      case 'boolean':
        return value === true || value === 'true' || value === 'Yes' ? 'Yes' : 'No';
      case 'number':
        const num = Number(value);
        return isNaN(num) ? value : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
      default:
        return String(value);
    }
  };

  return (
    <div className="space-y-6">
      {/* Aggregation Summary Cards */}
      <CalculatedFieldsSummary datasetId={dataset.id} />
      
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  Live Data Stream
                  {dataset.realtime_enabled && (
                    <Badge variant="default" className="bg-success">
                      <Zap className="h-3 w-3 mr-1" />
                      Real-time
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {records?.length || 0} records in this dataset
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search records..."
                  className="pl-9 w-[250px]"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button variant="outline" size="icon" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredRecords?.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No records yet. Data will appear here when webhooks are received.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[50px]">Status</TableHead>
                      <TableHead className="w-[120px]">Received</TableHead>
                      {visibleFields.slice(0, 5).map((field) => (
                        <TableHead key={field.id}>{field.field_name}</TableHead>
                      ))}
                      <TableHead className="w-[80px]">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecords?.map((record) => {
                      const calculatedValues = getCalculatedFieldValues(record);
                      
                      return (
                        <TableRow key={record.id}>
                          <TableCell>{getStatusIcon(record.processing_status)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(record.created_at), { addSuffix: true })}
                          </TableCell>
                          {visibleFields.slice(0, 5).map((field) => (
                            <TableCell key={field.id} className="max-w-[200px] truncate">
                              {formatFieldValue(getFieldValue(record, field.field_slug), field.field_type)}
                            </TableCell>
                          ))}
                          <TableCell>
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setSelectedRecord(record)}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh]">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    Record Details
                                    {getStatusIcon(record.processing_status)}
                                  </DialogTitle>
                                </DialogHeader>
                                <ScrollArea className="h-[60vh]">
                                  <div className="space-y-4">
                                    <div>
                                      <h4 className="font-medium mb-2">Metadata</h4>
                                      <div className="grid grid-cols-2 gap-2 text-sm">
                                        <div>
                                          <span className="text-muted-foreground">ID:</span>
                                          <span className="ml-2 font-mono text-xs">{record.id}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Received:</span>
                                          <span className="ml-2">{format(new Date(record.created_at), 'PPpp')}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Status:</span>
                                          <Badge variant="outline" className="ml-2">{record.processing_status}</Badge>
                                        </div>
                                        {record.error_message && (
                                          <div className="col-span-2">
                                            <span className="text-muted-foreground">Error:</span>
                                            <span className="ml-2 text-destructive">{record.error_message}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div>
                                      <h4 className="font-medium mb-2">Extracted Data</h4>
                                      <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                                        {JSON.stringify(record.extracted_data, null, 2)}
                                      </pre>
                                    </div>

                                    {/* Calculated Fields Section */}
                                    {activeCalculatedFields.length > 0 && (
                                      <div>
                                        <h4 className="font-medium mb-2 flex items-center gap-2">
                                          <Calculator className="h-4 w-4" />
                                          Calculated Fields
                                        </h4>
                                        <div className="grid grid-cols-2 gap-2">
                                          {activeCalculatedFields.map((field) => (
                                            <div key={field.id} className="p-3 rounded-lg border bg-muted/50">
                                              <div className="text-xs text-muted-foreground">{field.display_name}</div>
                                              <div className="font-medium">
                                                {formatFieldValue(calculatedValues[field.field_slug], 'number')}
                                              </div>
                                              <code className="text-xs text-muted-foreground">{field.formula}</code>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    <div>
                                      <h4 className="font-medium mb-2">Raw Payload</h4>
                                      <pre className="bg-muted p-4 rounded-lg text-xs overflow-auto">
                                        {JSON.stringify(record.raw_payload, null, 2)}
                                      </pre>
                                    </div>
                                  </div>
                                </ScrollArea>
                              </DialogContent>
                            </Dialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
