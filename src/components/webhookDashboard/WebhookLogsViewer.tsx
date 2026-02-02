import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText, Search, RefreshCw, Eye, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useOrganization } from '@/hooks/useOrganization';

interface WebhookLog {
  id: string;
  connection_id: string | null;
  connection_name: string | null;
  payload_hash: string | null;
  status: string | null;
  error_message: string | null;
  processing_time_ms: number | null;
  ip_address: string | null;
  headers: Record<string, any> | null;
  raw_payload: Record<string, any> | null;
  extracted_data: Record<string, any> | null;
  created_at: string;
  dataset_record_id: string | null;
}

export function WebhookLogsViewer() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<WebhookLog | null>(null);

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['webhook-logs', orgId, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('webhook_logs')
        .select(`
          *,
          webhook_connections (name)
        `)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).map(log => ({
        ...log,
        connection_name: (log.webhook_connections as any)?.name || 'Unknown',
      })) as unknown as WebhookLog[];
    },
    enabled: !!orgId,
    refetchInterval: 10000, // Auto-refresh every 10s
  });

  const filteredLogs = logs?.filter(log => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      log.connection_name?.toLowerCase().includes(searchLower) ||
      log.status?.toLowerCase().includes(searchLower) ||
      log.ip_address?.includes(search) ||
      log.error_message?.toLowerCase().includes(searchLower)
    );
  });

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return (
          <Badge variant="outline" className="bg-success/10 text-success border-success/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Success
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
            <XCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case 'partial':
        return (
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Partial
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status || 'Unknown'}
          </Badge>
        );
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Webhook Logs
            </CardTitle>
            <CardDescription>
              View incoming webhook activity and debug issues
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Logs Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading logs...</div>
        ) : filteredLogs?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No logs yet</h3>
            <p>Webhook activity will appear here once you start receiving data.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs?.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm">{format(new Date(log.created_at), 'MMM d, h:mm:ss a')}</span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{log.connection_name}</TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(log.status)}
                      {log.error_message && (
                        <span className="text-xs text-destructive truncate max-w-[200px]" title={log.error_message}>
                          {log.error_message}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {log.processing_time_ms != null ? (
                      <span className="flex items-center gap-1 text-sm">
                        <Clock className="h-3 w-3" />
                        {log.processing_time_ms}ms
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs">{log.ip_address || '—'}</code>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setSelectedLog(log)}
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Log Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Webhook Log Details
              {selectedLog && getStatusBadge(selectedLog.status)}
            </DialogTitle>
          </DialogHeader>
          
          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <p className="font-medium">{selectedLog.connection_name}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Time:</span>
                    <p className="font-medium">
                      {format(new Date(selectedLog.created_at), 'PPpp')}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP Address:</span>
                    <p className="font-medium font-mono">{selectedLog.ip_address || 'Unknown'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Processing Time:</span>
                    <p className="font-medium">{selectedLog.processing_time_ms ?? 'N/A'}ms</p>
                  </div>
                  {selectedLog.payload_hash && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Payload Hash:</span>
                      <p className="font-mono text-xs truncate">{selectedLog.payload_hash}</p>
                    </div>
                  )}
                  {selectedLog.dataset_record_id && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Dataset Record:</span>
                      <p className="font-mono text-xs">{selectedLog.dataset_record_id}</p>
                    </div>
                  )}
                </div>

                {selectedLog.error_message && (
                  <div>
                    <span className="text-sm text-muted-foreground">Error:</span>
                    <div className="mt-1 p-3 rounded bg-destructive/10 text-destructive text-sm">
                      {selectedLog.error_message}
                    </div>
                  </div>
                )}

                {selectedLog.extracted_data && Object.keys(selectedLog.extracted_data).length > 0 && (
                  <div>
                    <span className="text-sm text-muted-foreground">Extracted Data:</span>
                    <pre className="mt-1 p-3 rounded bg-success/10 text-success text-xs overflow-auto max-h-[150px]">
                      {JSON.stringify(selectedLog.extracted_data, null, 2)}
                    </pre>
                  </div>
                )}

                {selectedLog.raw_payload && (
                  <div>
                    <span className="text-sm text-muted-foreground">Raw Payload:</span>
                    <pre className="mt-1 p-3 rounded bg-muted text-xs overflow-auto max-h-[200px]">
                      {JSON.stringify(selectedLog.raw_payload, null, 2)}
                    </pre>
                  </div>
                )}

                <div>
                  <span className="text-sm text-muted-foreground">Headers:</span>
                  <pre className="mt-1 p-3 rounded bg-muted text-xs overflow-auto max-h-[150px]">
                    {JSON.stringify(selectedLog.headers || {}, null, 2)}
                  </pre>
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
