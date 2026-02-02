import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { DollarSign, FileText, AlertCircle, CalendarDays, Lock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';

interface SnapshotDetail {
  id: string;
  payment_date: string | null;
  customer_email: string | null;
  customer_name: string | null;
  amount: number;
  refund_amount: number;
  net_amount: number;
  closer_name: string | null;
  setter_name: string | null;
  source_name: string | null;
  snapshot_id: string;
}

interface PayoutSnapshot {
  id: string;
  name: string;
  period_start: string;
  period_end: string;
  status: string;
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
};

export default function RepCommissionsPage() {
  const [searchParams] = useSearchParams();
  const [repName, setRepName] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [tokenValidated, setTokenValidated] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<Date>(startOfMonth(subMonths(new Date(), 1)));
  const [dateTo, setDateTo] = useState<Date>(endOfMonth(subMonths(new Date(), 1)));
  const [closerCommission, setCloserCommission] = useState<number>(0);
  const [setterCommission, setSetterCommission] = useState<number>(0);

  // Initialize from URL params
  useEffect(() => {
    if (initialized) return;
    
    const token = searchParams.get('token');
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const closerPct = searchParams.get('closerPct');
    const setterPct = searchParams.get('setterPct');
    
    if (fromParam) setDateFrom(parseISO(fromParam));
    if (toParam) setDateTo(parseISO(toParam));
    if (closerPct) setCloserCommission(parseFloat(closerPct));
    if (setterPct) setSetterCommission(parseFloat(setterPct));
    
    if (token) {
      const validateToken = async () => {
        const { data, error } = await supabase
          .from('closer_access_tokens')
          .select('*')
          .eq('token', token)
          .eq('is_active', true)
          .maybeSingle();
        
        if (data && !error) {
          setOrganizationId(data.organization_id);
          setTokenValidated(true);

          if (data.closer_name !== '__UNIVERSAL__') {
            setRepName(data.closer_name);
          }

          // Update last_used_at timestamp (non-critical, log error but don't fail)
          const { error: updateError } = await supabase
            .from('closer_access_tokens')
            .update({ last_used_at: new Date().toISOString() })
            .eq('id', data.id);

          if (updateError) {
            console.error('Failed to update token last_used_at:', updateError);
          }
        }
      };
      validateToken();
    }
    setInitialized(true);
  }, [searchParams, initialized]);

  // Fetch finalized payout snapshots for this org
  const { data: snapshots } = useQuery({
    queryKey: ['payout-snapshots', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payout_snapshots')
        .select('id, name, period_start, period_end, status')
        .eq('organization_id', organizationId!)
        .eq('status', 'finalized')
        .order('period_end', { ascending: false });
      if (error) throw error;
      return data as PayoutSnapshot[];
    },
    enabled: tokenValidated && !!organizationId,
  });

  // Fetch payout snapshot details that match the rep's name
  const { data: snapshotDetails, isLoading: detailsLoading } = useQuery({
    queryKey: ['rep-snapshot-details', repName],
    queryFn: async () => {
      // Get all snapshot details where this rep is closer OR setter
      const { data, error } = await supabase
        .from('payout_snapshot_details')
        .select('*')
        .or(`closer_name.ilike.%${repName}%,setter_name.ilike.%${repName}%`)
        .order('payment_date', { ascending: false });
      
      if (error) throw error;
      return data as SnapshotDetail[];
    },
    enabled: tokenValidated && !!repName,
  });

  // Filter by date range using EST boundaries
  const filteredDeals = useMemo(() => {
    if (!snapshotDetails) return [];
    
    // Create EST-aware boundaries (EST is UTC-5)
    // Start of day in EST = midnight EST = 5 AM UTC
    const startBoundary = new Date(dateFrom);
    startBoundary.setUTCHours(5, 0, 0, 0); // Midnight EST = 5 AM UTC
    
    // End of day in EST = 11:59:59.999 PM EST = 4:59:59.999 AM UTC next day
    const endBoundary = new Date(dateTo);
    endBoundary.setDate(endBoundary.getDate() + 1);
    endBoundary.setUTCHours(4, 59, 59, 999); // 11:59:59 PM EST = 4:59:59 AM UTC next day
    
    return snapshotDetails.filter(d => {
      if (!d.payment_date) return true;
      const paymentDate = new Date(d.payment_date);
      return paymentDate >= startBoundary && paymentDate <= endBoundary;
    });
  }, [snapshotDetails, dateFrom, dateTo]);

  // Calculate totals
  const totals = useMemo(() => {
    const closerDeals = filteredDeals.filter(d => 
      d.closer_name?.toLowerCase() === repName.toLowerCase()
    );
    const setterDeals = filteredDeals.filter(d => 
      d.setter_name?.toLowerCase() === repName.toLowerCase()
    );
    
    const closerAmount = closerDeals.reduce((sum, d) => sum + d.amount, 0);
    const closerRefunds = closerDeals.reduce((sum, d) => sum + d.refund_amount, 0);
    const setterAmount = setterDeals.reduce((sum, d) => sum + d.amount, 0);
    const setterRefunds = setterDeals.reduce((sum, d) => sum + d.refund_amount, 0);
    
    const closerNet = closerAmount - closerRefunds;
    const setterNet = setterAmount - setterRefunds;
    
    const closerPayout = closerNet * (closerCommission / 100);
    const setterPayout = setterNet * (setterCommission / 100);
    
    return {
      closerDeals: closerDeals.length,
      setterDeals: setterDeals.length,
      closerAmount,
      closerRefunds,
      closerNet,
      closerPayout,
      setterAmount,
      setterRefunds,
      setterNet,
      setterPayout,
      totalPayout: closerPayout + setterPayout,
    };
  }, [filteredDeals, repName, closerCommission, setterCommission]);

  // Show access denied if no valid token
  if (initialized && !tokenValidated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="py-12 text-center">
            <Lock className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Access Required</h2>
            <p className="text-muted-foreground">
              Please use the commission link provided by your admin to view your commission report.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-6xl">
        {/* Header */}
        <header className="mb-6 sm:mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <DollarSign className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Commissions</h1>
              <p className="text-sm text-muted-foreground">
                Commission report for {repName}
              </p>
            </div>
          </div>
        </header>

        {/* Content */}
        {tokenValidated && repName && (
          <>
            {/* Date Range Info */}
            <Card className="mb-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarDays className="h-5 w-5" />
                  Pay Period
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Showing payments from <strong>{format(dateFrom, 'MMM d, yyyy')}</strong> to <strong>{format(dateTo, 'MMM d, yyyy')}</strong>
                </p>
              </CardContent>
            </Card>

            {detailsLoading ? (
              <Card className="mb-6">
                <CardContent className="py-8 text-center text-muted-foreground">
                  Loading your deals...
                </CardContent>
              </Card>
            ) : filteredDeals.length === 0 ? (
              <Card className="mb-6">
                <CardContent className="py-8 text-center">
                  <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No deals found for this period.</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Make sure a payout snapshot has been finalized by your admin.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Summary Cards */}
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        As Closer
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totals.closerDeals} deals</div>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(totals.closerAmount)} collected
                      </p>
                      {totals.closerRefunds > 0 && (
                        <p className="text-sm text-destructive">
                          -{formatCurrency(totals.closerRefunds)} refunds
                        </p>
                      )}
                      {closerCommission > 0 && (
                        <p className="text-sm font-medium text-primary mt-1">
                          {closerCommission}% → {formatCurrency(totals.closerPayout)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        As Setter
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">{totals.setterDeals} deals</div>
                      <p className="text-sm text-muted-foreground">
                        {formatCurrency(totals.setterAmount)} collected
                      </p>
                      {totals.setterRefunds > 0 && (
                        <p className="text-sm text-destructive">
                          -{formatCurrency(totals.setterRefunds)} refunds
                        </p>
                      )}
                      {setterCommission > 0 && (
                        <p className="text-sm font-medium text-primary mt-1">
                          {setterCommission}% → {formatCurrency(totals.setterPayout)}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                  
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Cash Collected
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {formatCurrency(totals.closerAmount + totals.setterAmount)}
                      </div>
                      {totals.closerRefunds + totals.setterRefunds > 0 && (
                        <p className="text-sm text-destructive">
                          -{formatCurrency(totals.closerRefunds + totals.setterRefunds)} total refunds
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-primary/5 border-primary/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Your Payout
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(totals.totalPayout)}
                      </div>
                      {(closerCommission > 0 || setterCommission > 0) ? (
                        <p className="text-sm text-muted-foreground">
                          {closerCommission > 0 && `${closerCommission}% closer`}
                          {closerCommission > 0 && setterCommission > 0 && ' + '}
                          {setterCommission > 0 && `${setterCommission}% setter`}
                        </p>
                      ) : (
                        <p className="text-sm text-amber-600">
                          Commission % not set
                        </p>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* Deals Table */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Your Deals ({filteredDeals.length})
                    </CardTitle>
                    <CardDescription>
                      All deals where you are the closer or setter.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Customer</TableHead>
                            <TableHead>Closer</TableHead>
                            <TableHead>Setter</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Refund</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filteredDeals.map((deal) => {
                            const isCloser = deal.closer_name?.toLowerCase() === repName.toLowerCase();
                            const isSetter = deal.setter_name?.toLowerCase() === repName.toLowerCase();
                            
                            return (
                              <TableRow key={deal.id}>
                                <TableCell className="text-sm">
                                  {deal.payment_date 
                                    ? formatInTimeZone(new Date(deal.payment_date), 'America/New_York', 'MMM d, yyyy')
                                    : '-'}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium text-sm">{deal.customer_name || '-'}</p>
                                    <p className="text-xs text-muted-foreground">{deal.customer_email || ''}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {deal.closer_name ? (
                                    <Badge variant={isCloser ? 'default' : 'outline'} className="text-xs">
                                      {deal.closer_name}
                                    </Badge>
                                  ) : '-'}
                                </TableCell>
                                <TableCell>
                                  {deal.setter_name ? (
                                    <Badge variant={isSetter ? 'secondary' : 'outline'} className="text-xs">
                                      {deal.setter_name}
                                    </Badge>
                                  ) : '-'}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {formatCurrency(deal.amount)}
                                </TableCell>
                                <TableCell className="text-right">
                                  {deal.refund_amount > 0 ? (
                                    <span className="text-destructive">
                                      -{formatCurrency(deal.refund_amount)}
                                    </span>
                                  ) : '-'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>

                {/* Notice */}
                <Card className="mt-6 border-amber-500/30 bg-amber-500/5">
                  <CardContent className="py-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="font-medium">Notice</p>
                        <p className="text-sm text-muted-foreground">
                          Review your deals carefully. If anything looks incorrect, please notify your admin.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
