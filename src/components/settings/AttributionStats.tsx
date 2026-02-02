import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, DollarSign, TrendingUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useOrganization } from '@/hooks/useOrganization';

interface AttributionStat {
  name: string;
  total_payments: number;
  total_cash: number;
  total_calls: number;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function AttributionStats() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  // Fetch cash collected by closer this month
  const { data: closerStats = [], isLoading: loadingClosers } = useQuery({
    queryKey: ['attribution-stats-closers', monthStart.toISOString(), orgId],
    queryFn: async () => {
      // CRITICAL: Filter by organization_id for data isolation
      let query = supabase
        .from('payments')
        .select(`
          amount,
          net_revenue,
          closer_id,
          event_id,
          events!inner(closer_name, closer_id)
        `)
        .gte('payment_date', monthStart.toISOString())
        .lte('payment_date', monthEnd.toISOString());

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data: payments, error } = await query;

      if (error) throw error;

      // Aggregate by closer
      const closerMap = new Map<string, { name: string; total: number; count: number }>();
      
      for (const payment of payments || []) {
        const closerName = (payment.events as any)?.closer_name || 'Unknown';
        const existing = closerMap.get(closerName) || { name: closerName, total: 0, count: 0 };
        existing.total += Number(payment.net_revenue || payment.amount || 0);
        existing.count += 1;
        closerMap.set(closerName, existing);
      }

      return Array.from(closerMap.values())
        .sort((a, b) => b.total - a.total)
        .map(item => ({
          name: item.name,
          total_cash: item.total,
          total_payments: item.count
        }));
    },
    enabled: !!orgId,
  });

  // Fetch cash collected by setter this month
  const { data: setterStats = [], isLoading: loadingSetters } = useQuery({
    queryKey: ['attribution-stats-setters', monthStart.toISOString(), orgId],
    queryFn: async () => {
      // CRITICAL: Filter by organization_id for data isolation
      let query = supabase
        .from('payments')
        .select(`
          amount,
          net_revenue,
          event_id,
          events!inner(setter_name)
        `)
        .gte('payment_date', monthStart.toISOString())
        .lte('payment_date', monthEnd.toISOString());

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data: payments, error } = await query;

      if (error) throw error;

      // Aggregate by setter
      const setterMap = new Map<string, { name: string; total: number; count: number }>();

      for (const payment of payments || []) {
        const setterName = (payment.events as any)?.setter_name || 'Unknown';
        const existing = setterMap.get(setterName) || { name: setterName, total: 0, count: 0 };
        existing.total += Number(payment.net_revenue || payment.amount || 0);
        existing.count += 1;
        setterMap.set(setterName, existing);
      }

      return Array.from(setterMap.values())
        .sort((a, b) => b.total - a.total)
        .map(item => ({
          name: item.name,
          total_cash: item.total,
          total_payments: item.count
        }));
    },
    enabled: !!orgId,
  });

  // Fetch calls booked by setter this month
  const { data: setterCallStats = [], isLoading: loadingSetterCalls } = useQuery({
    queryKey: ['attribution-stats-setter-calls', monthStart.toISOString(), orgId],
    queryFn: async () => {
      // CRITICAL: Filter by organization_id for data isolation
      let query = supabase
        .from('events')
        .select('setter_name')
        .gte('scheduled_at', monthStart.toISOString())
        .lte('scheduled_at', monthEnd.toISOString());

      if (orgId) {
        query = query.eq('organization_id', orgId);
      }

      const { data: events, error } = await query;

      if (error) throw error;

      // Aggregate by setter
      const setterMap = new Map<string, number>();

      for (const event of events || []) {
        const setterName = event.setter_name || 'Unknown';
        setterMap.set(setterName, (setterMap.get(setterName) || 0) + 1);
      }

      return Array.from(setterMap.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count }));
    },
    enabled: !!orgId,
  });

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Cash by Closer */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-success" />
            <CardTitle className="text-lg">Cash by Closer</CardTitle>
          </div>
          <CardDescription>
            {format(monthStart, 'MMMM yyyy')} revenue by closer
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingClosers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : closerStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No payment data this month</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Closer</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {closerStats.map((stat, idx) => (
                  <TableRow key={stat.name}>
                    <TableCell className="font-medium">
                      {idx === 0 && <span className="mr-2">🏆</span>}
                      {stat.name}
                    </TableCell>
                    <TableCell className="text-right">{stat.total_payments}</TableCell>
                    <TableCell className="text-right font-medium text-success">
                      {formatCurrency(stat.total_cash)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cash by Setter */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Cash by Setter</CardTitle>
          </div>
          <CardDescription>
            {format(monthStart, 'MMMM yyyy')} revenue attributed to setter
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSetters ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : setterStats.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No payment data this month</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setter</TableHead>
                  <TableHead className="text-right">Deals</TableHead>
                  <TableHead className="text-right">Cash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setterStats.map((stat, idx) => (
                  <TableRow key={stat.name}>
                    <TableCell className="font-medium">
                      {idx === 0 && <span className="mr-2">🏆</span>}
                      {stat.name}
                    </TableCell>
                    <TableCell className="text-right">{stat.total_payments}</TableCell>
                    <TableCell className="text-right font-medium text-primary">
                      {formatCurrency(stat.total_cash)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Calls Booked by Setter */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Setter Efficiency</CardTitle>
          <CardDescription>
            Calls booked vs cash generated - {format(monthStart, 'MMMM yyyy')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingSetterCalls || loadingSetters ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setter</TableHead>
                  <TableHead className="text-right">Calls Booked</TableHead>
                  <TableHead className="text-right">Deals Closed</TableHead>
                  <TableHead className="text-right">Cash Generated</TableHead>
                  <TableHead className="text-right">Avg per Deal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setterCallStats.map((callStat) => {
                  const cashStat = setterStats.find(s => s.name === callStat.name);
                  const avgPerDeal = cashStat && cashStat.total_payments > 0 
                    ? cashStat.total_cash / cashStat.total_payments 
                    : 0;
                  
                  return (
                    <TableRow key={callStat.name}>
                      <TableCell className="font-medium">{callStat.name}</TableCell>
                      <TableCell className="text-right">{callStat.count}</TableCell>
                      <TableCell className="text-right">{cashStat?.total_payments || 0}</TableCell>
                      <TableCell className="text-right font-medium text-success">
                        {formatCurrency(cashStat?.total_cash || 0)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatCurrency(avgPerDeal)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
