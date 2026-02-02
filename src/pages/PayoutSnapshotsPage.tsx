import { useState, useEffect } from "react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { Camera, Lock, Trash2, Eye, Plus, Download, Filter, Percent, FileText, Users, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { 
  usePayoutSnapshots, 
  usePayoutSnapshotDetails, 
  useCreatePayoutSnapshot, 
  useFinalizeSnapshot,
  useDeleteSnapshot,
  useRemoveSnapshotDetail,
  PayoutSnapshot
} from "@/hooks/usePayoutSnapshots";

interface RepCommission {
  name: string;
  grossRevenue: number;
  refunds: number;
  netRevenue: number;
  commissionPercent: number;
  commissionAmount: number;
}

export default function PayoutSnapshotsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedSnapshot, setSelectedSnapshot] = useState<PayoutSnapshot | null>(null);
  const [viewTab, setViewTab] = useState("client-report");
  const [clientReportTab, setClientReportTab] = useState("payments");
  
  // Filters for client report
  const [filterWhop, setFilterWhop] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterTraffic, setFilterTraffic] = useState<string>('all');
  const [includeRefunds, setIncludeRefunds] = useState<boolean>(true);
  
  // Commission state - persisted per snapshot
  const [commissions, setCommissions] = useState<Record<string, number>>({});
  
  // Default to last month
  const lastMonth = subMonths(new Date(), 1);
  const [periodStart, setPeriodStart] = useState(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
  const [snapshotName, setSnapshotName] = useState("");

  const { data: snapshots, isLoading } = usePayoutSnapshots();
  const { data: snapshotDetails } = usePayoutSnapshotDetails(selectedSnapshot?.id || null);
  const createSnapshot = useCreatePayoutSnapshot();
  const finalizeSnapshot = useFinalizeSnapshot();
  const deleteSnapshot = useDeleteSnapshot();
  const removeDetail = useRemoveSnapshotDetail();

  // Load commissions from localStorage when snapshot changes
  useEffect(() => {
    if (selectedSnapshot) {
      const saved = localStorage.getItem(`commissions_${selectedSnapshot.id}`);
      if (saved) {
        setCommissions(JSON.parse(saved));
      } else {
        setCommissions({});
      }
    }
  }, [selectedSnapshot?.id]);

  const saveCommissions = () => {
    if (selectedSnapshot) {
      localStorage.setItem(`commissions_${selectedSnapshot.id}`, JSON.stringify(commissions));
      toast.success('Commissions saved');
    }
  };

  const updateCommission = (repName: string, percent: number) => {
    setCommissions(prev => ({ ...prev, [repName]: percent }));
  };

  // Get closer commissions - calculate from details to include refunds they were part of
  const getCloserCommissions = (): RepCommission[] => {
    const details = snapshotDetails?.details || [];
    const closerMap = new Map<string, { gross: number; refunds: number }>();
    
    details.forEach(d => {
      const name = d.closer_name || 'Unassigned';
      const existing = closerMap.get(name) || { gross: 0, refunds: 0 };
      closerMap.set(name, {
        gross: existing.gross + d.amount,
        refunds: existing.refunds + d.refund_amount
      });
    });
    
    return Array.from(closerMap.entries())
      .filter(([name]) => name !== 'Unassigned')
      .map(([name, data]) => ({
        name,
        grossRevenue: data.gross,
        refunds: data.refunds,
        netRevenue: data.gross - data.refunds,
        commissionPercent: commissions[name] || 0,
        commissionAmount: (data.gross - data.refunds) * ((commissions[name] || 0) / 100)
      }))
      .sort((a, b) => b.netRevenue - a.netRevenue);
  };

  // Get setter commissions - calculate from details to include refunds they were part of
  const getSetterCommissions = (): RepCommission[] => {
    const details = snapshotDetails?.details || [];
    const setterMap = new Map<string, { gross: number; refunds: number }>();
    
    details.forEach(d => {
      const name = d.setter_name || 'Unassigned';
      const existing = setterMap.get(name) || { gross: 0, refunds: 0 };
      setterMap.set(name, {
        gross: existing.gross + d.amount,
        refunds: existing.refunds + d.refund_amount
      });
    });
    
    return Array.from(setterMap.entries())
      .filter(([name]) => name !== 'Unassigned')
      .map(([name, data]) => ({
        name,
        grossRevenue: data.gross,
        refunds: data.refunds,
        netRevenue: data.gross - data.refunds,
        commissionPercent: commissions[`setter_${name}`] || 0,
        commissionAmount: (data.gross - data.refunds) * ((commissions[`setter_${name}`] || 0) / 100)
      }))
      .sort((a, b) => b.netRevenue - a.netRevenue);
  };

  const handleCreate = async () => {
    await createSnapshot.mutateAsync({ 
      periodStart, 
      periodEnd, 
      name: snapshotName || undefined 
    });
    setIsCreateOpen(false);
    setSnapshotName("");
  };

  const setPresetMonth = (monthsAgo: number) => {
    const targetMonth = subMonths(new Date(), monthsAgo);
    setPeriodStart(format(startOfMonth(targetMonth), 'yyyy-MM-dd'));
    setPeriodEnd(format(endOfMonth(targetMonth), 'yyyy-MM-dd'));
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // Get unique values for filters from details
  const getUniqueWhops = () => [...new Set(snapshotDetails?.details.map(d => d.whop_connection_name).filter(Boolean) || [])];
  const getUniqueSources = () => [...new Set(snapshotDetails?.details.map(d => d.source_name).filter(Boolean) || [])];
  const getUniqueTraffic = () => [...new Set(snapshotDetails?.details.map(d => d.traffic_type_name).filter(Boolean) || [])];

  // Filter details for client report
  const getFilteredDetails = (excludeRefunds = false) => {
    let details = snapshotDetails?.details || [];
    if (filterWhop !== 'all') details = details.filter(d => d.whop_connection_name === filterWhop);
    if (filterSource !== 'all') details = details.filter(d => d.source_name === filterSource);
    if (filterTraffic !== 'all') details = details.filter(d => d.traffic_type_name === filterTraffic);
    if (excludeRefunds) details = details.filter(d => d.refund_amount === 0);
    return details;
  };

  // Get details for payments tab based on includeRefunds toggle
  const getPaymentsTabDetails = () => {
    return getFilteredDetails(!includeRefunds);
  };

  // Calculate payments tab totals
  const getPaymentsTabTotals = () => {
    const filtered = getPaymentsTabDetails();
    return {
      revenue: filtered.reduce((sum, d) => sum + d.amount, 0),
      refunds: filtered.reduce((sum, d) => sum + d.refund_amount, 0),
      net: filtered.reduce((sum, d) => sum + d.net_amount, 0),
      count: filtered.length
    };
  };

  // Get only refunded details
  const getRefundedDetails = () => {
    return getFilteredDetails().filter(d => d.refund_amount > 0);
  };

  // Calculate filtered totals
  const getFilteredTotals = () => {
    const filtered = getFilteredDetails();
    return {
      revenue: filtered.reduce((sum, d) => sum + d.amount, 0),
      refunds: filtered.reduce((sum, d) => sum + d.refund_amount, 0),
      net: filtered.reduce((sum, d) => sum + d.net_amount, 0),
      count: filtered.length
    };
  };

  // Calculate refund totals
  const getRefundTotals = () => {
    const refunded = getRefundedDetails();
    return {
      originalAmount: refunded.reduce((sum, d) => sum + d.amount, 0),
      refundAmount: refunded.reduce((sum, d) => sum + d.refund_amount, 0),
      count: refunded.length
    };
  };

  const downloadCSV = (filename: string, headers: string[], rows: string[][]) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${filename}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
    toast.success(`Exported ${filename}.csv`);
  };

  const exportClientReport = () => {
    const details = getPaymentsTabDetails();
    const headers = ['Date', 'Customer Email', 'Payment Processor', 'Source', 'Traffic Type', 'Amount', 'Refund', 'Net'];
    const rows = details.map(d => [
      d.payment_date ? format(new Date(d.payment_date), 'yyyy-MM-dd') : '',
      d.customer_email || '',
      d.whop_connection_name || '',
      d.source_name || '',
      d.traffic_type_name || '',
      d.amount.toString(),
      d.refund_amount.toString(),
      d.net_amount.toString()
    ]);
    
    const filterLabel = filterWhop !== 'all' ? `_${filterWhop}` : '';
    const refundLabel = !includeRefunds ? '_no_refunds' : '';
    downloadCSV(`${selectedSnapshot?.name || 'snapshot'}${filterLabel}${refundLabel}_client_report`, headers, rows);
  };

  const exportRefunds = () => {
    const refunded = getRefundedDetails();
    const headers = ['Date', 'Customer Email', 'Payment Processor', 'Source', 'Traffic Type', 'Original Amount', 'Refund Amount'];
    const rows = refunded.map(d => [
      d.payment_date ? format(new Date(d.payment_date), 'yyyy-MM-dd') : '',
      d.customer_email || '',
      d.whop_connection_name || '',
      d.source_name || '',
      d.traffic_type_name || '',
      d.amount.toString(),
      d.refund_amount.toString()
    ]);
    
    const filterLabel = filterWhop !== 'all' ? `_${filterWhop}` : '';
    downloadCSV(`${selectedSnapshot?.name || 'snapshot'}${filterLabel}_refunds`, headers, rows);
  };

  const exportCommissions = () => {
    const closerCommissions = getCloserCommissions();
    const setterCommissions = getSetterCommissions();
    
    const headers = ['Role', 'Name', 'Gross Revenue', 'Refunds', 'Net Revenue', 'Commission %', 'Payout'];
    const rows = [
      ...closerCommissions.map(c => [
        'Closer',
        c.name,
        c.grossRevenue.toString(),
        c.refunds.toString(),
        c.netRevenue.toString(),
        c.commissionPercent.toString(),
        c.commissionAmount.toString()
      ]),
      ...setterCommissions.map(s => [
        'Setter',
        s.name,
        s.grossRevenue.toString(),
        s.refunds.toString(),
        s.netRevenue.toString(),
        s.commissionPercent.toString(),
        s.commissionAmount.toString()
      ])
    ];
    
    downloadCSV(`${selectedSnapshot?.name || 'snapshot'}_commissions`, headers, rows);
  };

  const clearFilters = () => {
    setFilterWhop('all');
    setFilterSource('all');
    setFilterTraffic('all');
  };

  const hasActiveFilters = filterWhop !== 'all' || filterSource !== 'all' || filterTraffic !== 'all';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Payout Snapshots</h1>
          <p className="text-muted-foreground">Generate client reports and calculate commissions</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Snapshot
            </Button>
          </DialogTrigger>
          <DialogContent className="pointer-events-auto">
            <DialogHeader>
              <DialogTitle>Create Payout Snapshot</DialogTitle>
              <DialogDescription>
                Capture all payments and attribution data for a specific period.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Quick Select</Label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPresetMonth(1)}>
                    Last Month
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPresetMonth(2)}>
                    2 Months Ago
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPresetMonth(0)}>
                    This Month
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={periodStart}
                    onChange={(e) => setPeriodStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={periodEnd}
                    onChange={(e) => setPeriodEnd(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Snapshot Name (optional)</Label>
                <Input
                  placeholder="e.g. December 2025 Payout"
                  value={snapshotName}
                  onChange={(e) => setSnapshotName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleCreate} disabled={createSnapshot.isPending}>
                {createSnapshot.isPending ? 'Creating...' : 'Create Snapshot'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Snapshots List */}
      <Card>
        <CardHeader>
          <CardTitle>All Snapshots</CardTitle>
          <CardDescription>View and manage your payout snapshots</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : !snapshots?.length ? (
            <div className="text-center py-8 text-muted-foreground">
              <Camera className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No snapshots yet. Create one to lock in payout data.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Refunds</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((snapshot) => (
                  <TableRow key={snapshot.id}>
                    <TableCell className="font-medium">{snapshot.name}</TableCell>
                    <TableCell>
                      {format(new Date(snapshot.period_start), 'MMM d')} - {format(new Date(snapshot.period_end), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell>
                      <Badge variant={snapshot.status === 'finalized' ? 'default' : 'secondary'}>
                        {snapshot.status === 'finalized' && <Lock className="mr-1 h-3 w-3" />}
                        {snapshot.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(snapshot.total_revenue)}</TableCell>
                    <TableCell className="text-right text-destructive">-{formatCurrency(snapshot.total_refunds)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(snapshot.net_revenue)}</TableCell>
                    <TableCell>{format(new Date(snapshot.created_at), 'MMM d, yyyy')}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => setSelectedSnapshot(snapshot)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {snapshot.status !== 'finalized' && (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => finalizeSnapshot.mutate(snapshot.id)}
                            >
                              <Lock className="h-4 w-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Snapshot?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will permanently delete the snapshot and all its data.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteSnapshot.mutate(snapshot.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Snapshot Details Dialog */}
      <Dialog open={!!selectedSnapshot} onOpenChange={(open) => !open && setSelectedSnapshot(null)}>
        <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedSnapshot?.name}
              {selectedSnapshot?.status === 'finalized' && (
                <Badge variant="default"><Lock className="mr-1 h-3 w-3" /> Finalized</Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {selectedSnapshot && (
                <>
                  {format(new Date(selectedSnapshot.period_start), 'MMM d')} - {format(new Date(selectedSnapshot.period_end), 'MMM d, yyyy')}
                  {' | '}
                  Net Revenue: <strong>{formatCurrency(selectedSnapshot.net_revenue)}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={viewTab} onValueChange={setViewTab}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="client-report" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Client Report
              </TabsTrigger>
              <TabsTrigger value="commissions" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Commissions
              </TabsTrigger>
            </TabsList>

            {/* CLIENT REPORT TAB */}
            <TabsContent value="client-report" className="mt-4">
              <div className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-1">
                    <Filter className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Filter by:</span>
                  </div>
                  <Select value={filterWhop} onValueChange={setFilterWhop}>
                    <SelectTrigger className="w-[160px] h-8">
                      <SelectValue placeholder="All Processors" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Processors</SelectItem>
                      {getUniqueWhops().map(name => (
                        <SelectItem key={name} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue placeholder="All Sources" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Sources</SelectItem>
                      {getUniqueSources().map(name => (
                        <SelectItem key={name} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterTraffic} onValueChange={setFilterTraffic}>
                    <SelectTrigger className="w-[140px] h-8">
                      <SelectValue placeholder="All Traffic" />
                    </SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="all">All Traffic</SelectItem>
                      {getUniqueTraffic().map(name => (
                        <SelectItem key={name} value={name!}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" className="h-8" onClick={clearFilters}>
                      Clear
                    </Button>
                  )}
                </div>

                {/* Sub-tabs for Payments vs Refunds */}
                <Tabs value={clientReportTab} onValueChange={setClientReportTab}>
                  <div className="flex items-center justify-between">
                    <TabsList className="w-auto">
                      <TabsTrigger value="payments">
                        Payments ({getPaymentsTabTotals().count})
                      </TabsTrigger>
                      <TabsTrigger value="refunds">
                        Refunds ({getRefundTotals().count})
                      </TabsTrigger>
                    </TabsList>
                    
                    {clientReportTab === 'payments' && (
                      <div className="flex items-center gap-2">
                        <Switch 
                          id="include-refunds" 
                          checked={includeRefunds} 
                          onCheckedChange={setIncludeRefunds}
                        />
                        <Label htmlFor="include-refunds" className="text-sm text-muted-foreground cursor-pointer">
                          Include refunds
                        </Label>
                      </div>
                    )}
                  </div>

                  {/* PAYMENTS SUB-TAB */}
                  <TabsContent value="payments" className="mt-4">
                    <div className="space-y-4">
                      {/* Summary Stats */}
                      <div className="grid grid-cols-4 gap-4">
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Deals</p>
                          <p className="text-xl font-semibold">{getPaymentsTabTotals().count}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Revenue</p>
                          <p className="text-xl font-semibold">{formatCurrency(getPaymentsTabTotals().revenue)}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Refunds</p>
                          <p className="text-xl font-semibold text-destructive">-{formatCurrency(getPaymentsTabTotals().refunds)}</p>
                        </div>
                        <div className="p-3 bg-primary/10 rounded-lg border border-primary/20">
                          <p className="text-xs text-muted-foreground">Net</p>
                          <p className="text-xl font-bold">{formatCurrency(getPaymentsTabTotals().net)}</p>
                        </div>
                      </div>

                      {/* Export Button */}
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={exportClientReport}>
                          <Download className="h-4 w-4 mr-2" />
                          Export CSV
                        </Button>
                      </div>

                      {/* Deals Table */}
                      <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Date (EST)</TableHead>
                              <TableHead>Email</TableHead>
                              <TableHead>Processor</TableHead>
                              <TableHead>Source</TableHead>
                              <TableHead>Traffic Type</TableHead>
                              <TableHead className="text-right">Amount</TableHead>
                              <TableHead className="text-right">Refund</TableHead>
                              <TableHead className="text-right">Net</TableHead>
                              {selectedSnapshot?.status !== 'finalized' && (
                                <TableHead className="w-10"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {getPaymentsTabDetails().map((detail) => (
                              <TableRow key={detail.id}>
                                <TableCell className="text-sm">
                                  {detail.payment_date ? formatInTimeZone(new Date(detail.payment_date), 'America/New_York', 'MMM d, yyyy') : '-'}
                                </TableCell>
                                <TableCell className="text-sm">{detail.customer_email || '-'}</TableCell>
                                <TableCell className="text-sm">{detail.whop_connection_name || '-'}</TableCell>
                                <TableCell className="text-sm">{detail.source_name || '-'}</TableCell>
                                <TableCell className="text-sm">{detail.traffic_type_name || '-'}</TableCell>
                                <TableCell className="text-right">{formatCurrency(detail.amount)}</TableCell>
                                <TableCell className="text-right text-destructive">
                                  {detail.refund_amount > 0 ? `-${formatCurrency(detail.refund_amount)}` : '-'}
                                </TableCell>
                                <TableCell className="text-right font-semibold">{formatCurrency(detail.net_amount)}</TableCell>
                                {selectedSnapshot?.status !== 'finalized' && (
                                  <TableCell>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                          <X className="h-3 w-3 text-destructive" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Remove from snapshot?</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            This will remove this payment from the snapshot. The original payment record will not be affected.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction 
                                            onClick={() => removeDetail.mutate({ 
                                              detailId: detail.id, 
                                              snapshotId: selectedSnapshot!.id 
                                            })}
                                          >
                                            Remove
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </TabsContent>

                  {/* REFUNDS SUB-TAB */}
                  <TabsContent value="refunds" className="mt-4">
                    <div className="space-y-4">
                      {/* Refund Stats */}
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Refunded Deals</p>
                          <p className="text-xl font-semibold">{getRefundTotals().count}</p>
                        </div>
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-xs text-muted-foreground">Original Amount</p>
                          <p className="text-xl font-semibold">{formatCurrency(getRefundTotals().originalAmount)}</p>
                        </div>
                        <div className="p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                          <p className="text-xs text-muted-foreground">Total Refunds</p>
                          <p className="text-xl font-bold text-destructive">-{formatCurrency(getRefundTotals().refundAmount)}</p>
                        </div>
                      </div>

                      {/* Export Button */}
                      <div className="flex justify-end">
                        <Button variant="outline" size="sm" onClick={exportRefunds}>
                          <Download className="h-4 w-4 mr-2" />
                          Export Refunds CSV
                        </Button>
                      </div>

                      {/* Refunds Table */}
                      <div className="max-h-[400px] overflow-y-auto border rounded-lg">
                        {getRefundedDetails().length === 0 ? (
                          <div className="p-8 text-center text-muted-foreground">
                            No refunds in this period
                          </div>
                        ) : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date (EST)</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Processor</TableHead>
                                <TableHead>Source</TableHead>
                                <TableHead>Traffic Type</TableHead>
                                <TableHead className="text-right">Original Amount</TableHead>
                                <TableHead className="text-right">Refund Amount</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {getRefundedDetails().map((detail) => (
                                <TableRow key={detail.id}>
                                  <TableCell className="text-sm">
                                    {detail.payment_date ? formatInTimeZone(new Date(detail.payment_date), 'America/New_York', 'MMM d, yyyy') : '-'}
                                  </TableCell>
                                  <TableCell className="text-sm">{detail.customer_email || '-'}</TableCell>
                                  <TableCell className="text-sm">{detail.whop_connection_name || '-'}</TableCell>
                                  <TableCell className="text-sm">{detail.source_name || '-'}</TableCell>
                                  <TableCell className="text-sm">{detail.traffic_type_name || '-'}</TableCell>
                                  <TableCell className="text-right">{formatCurrency(detail.amount)}</TableCell>
                                  <TableCell className="text-right text-destructive font-semibold">
                                    -{formatCurrency(detail.refund_amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            </TabsContent>

            {/* COMMISSIONS TAB */}
            <TabsContent value="commissions" className="mt-4">
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Assign commission percentages. Payouts are calculated on net revenue (after refunds).
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={exportCommissions}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                    <Button size="sm" onClick={saveCommissions}>
                      Save Commissions
                    </Button>
                  </div>
                </div>

                {/* Closers */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Closers
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Closer</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Refunds</TableHead>
                          <TableHead className="text-right">Net Revenue</TableHead>
                          <TableHead className="w-24 text-center">Commission %</TableHead>
                          <TableHead className="text-right">Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getCloserCommissions().map((rep) => (
                          <TableRow key={rep.name}>
                            <TableCell className="font-medium">{rep.name}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(rep.grossRevenue)}</TableCell>
                            <TableCell className="text-right text-destructive">
                              {rep.refunds > 0 ? `-${formatCurrency(rep.refunds)}` : '-'}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(rep.netRevenue)}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={commissions[rep.name] || ''}
                                onChange={(e) => updateCommission(rep.name, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-16 h-8 text-center mx-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatCurrency(rep.commissionAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {getCloserCommissions().length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total Closer Payouts</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(getCloserCommissions().reduce((s, r) => s + r.grossRevenue, 0))}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              -{formatCurrency(getCloserCommissions().reduce((s, r) => s + r.refunds, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(getCloserCommissions().reduce((s, r) => s + r.netRevenue, 0))}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right text-primary font-bold">
                              {formatCurrency(getCloserCommissions().reduce((s, r) => s + r.commissionAmount, 0))}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Setters */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Setters
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Setter</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Refunds</TableHead>
                          <TableHead className="text-right">Net Revenue</TableHead>
                          <TableHead className="w-24 text-center">Commission %</TableHead>
                          <TableHead className="text-right">Payout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSetterCommissions().map((rep) => (
                          <TableRow key={rep.name}>
                            <TableCell className="font-medium">{rep.name}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{formatCurrency(rep.grossRevenue)}</TableCell>
                            <TableCell className="text-right text-destructive">
                              {rep.refunds > 0 ? `-${formatCurrency(rep.refunds)}` : '-'}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(rep.netRevenue)}</TableCell>
                            <TableCell className="text-center">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                value={commissions[`setter_${rep.name}`] || ''}
                                onChange={(e) => updateCommission(`setter_${rep.name}`, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-16 h-8 text-center mx-auto"
                              />
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {formatCurrency(rep.commissionAmount)}
                            </TableCell>
                          </TableRow>
                        ))}
                        {getSetterCommissions().length > 0 && (
                          <TableRow className="bg-muted/50 font-semibold">
                            <TableCell>Total Setter Payouts</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(getSetterCommissions().reduce((s, r) => s + r.grossRevenue, 0))}
                            </TableCell>
                            <TableCell className="text-right text-destructive">
                              -{formatCurrency(getSetterCommissions().reduce((s, r) => s + r.refunds, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(getSetterCommissions().reduce((s, r) => s + r.netRevenue, 0))}
                            </TableCell>
                            <TableCell></TableCell>
                            <TableCell className="text-right text-primary font-bold">
                              {formatCurrency(getSetterCommissions().reduce((s, r) => s + r.commissionAmount, 0))}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Grand Total */}
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-lg">Total Payouts</span>
                    <span className="font-bold text-2xl text-primary">
                      {formatCurrency(
                        getCloserCommissions().reduce((s, r) => s + r.commissionAmount, 0) +
                        getSetterCommissions().reduce((s, r) => s + r.commissionAmount, 0)
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
