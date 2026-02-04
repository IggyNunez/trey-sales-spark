import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHubSpotDealMetrics } from '@/hooks/useHubSpotDealMetrics';
import { useIsHubSpotSyncEnabled } from '@/hooks/useHubSpotSync';
import { Briefcase, DollarSign, TrendingUp, Target } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts';

interface HubSpotDealStageCardProps {
  startDate?: Date;
  endDate?: Date;
}

// Stage colors for visual distinction
const STAGE_COLORS: Record<string, string> = {
  'Live call - Offer Made': 'hsl(var(--chart-1))',
  'Reschedule': 'hsl(var(--chart-2))',
  'Canceled/DQ': 'hsl(var(--chart-3))',
  'Closed lost': 'hsl(var(--chart-4))',
  'Closed won': 'hsl(var(--chart-5))',
  'default': 'hsl(var(--muted-foreground))',
};

function getStageColor(stage: string): string {
  return STAGE_COLORS[stage] || STAGE_COLORS['default'];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function HubSpotDealStageCard({ startDate, endDate }: HubSpotDealStageCardProps) {
  const isEnabled = useIsHubSpotSyncEnabled();
  const { data: metrics, isLoading } = useHubSpotDealMetrics({ startDate, endDate });

  // Only render for Trenton
  if (!isEnabled) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-warning" />
            Deal Stage Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.totalDeals === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-warning" />
            Deal Stage Pipeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No deal stage data available for the selected period
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prepare chart data
  const chartData = metrics.byStage.map(s => ({
    name: s.stage.length > 15 ? s.stage.substring(0, 15) + '...' : s.stage,
    fullName: s.stage,
    count: s.count,
    amount: s.totalAmount,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-warning" />
            Deal Stage Pipeline
          </CardTitle>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            {metrics.totalDeals} Deals
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{metrics.byStage.length}</p>
            <p className="text-xs text-muted-foreground">Active Stages</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-success/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <DollarSign className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-success">
              {formatCurrency(metrics.totalPipeline)}
            </p>
            <p className="text-xs text-muted-foreground">Total Pipeline</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-primary/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">
              {metrics.totalPipeline > 0 
                ? formatCurrency(metrics.totalPipeline / metrics.totalDeals) 
                : '$0'}
            </p>
            <p className="text-xs text-muted-foreground">Avg Deal Value</p>
          </div>
        </div>

        {/* Bar chart and table side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Bar Chart */}
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical">
                <XAxis type="number" hide />
                <YAxis 
                  type="category" 
                  dataKey="name" 
                  width={100}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg px-3 py-2 shadow-md">
                        <p className="font-medium">{data.fullName}</p>
                        <p className="text-sm text-muted-foreground">{data.count} deals</p>
                        <p className="text-sm text-success">{formatCurrency(data.amount)}</p>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getStageColor(entry.fullName)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Stage breakdown table */}
          <div className="overflow-auto max-h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Show%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.byStage.map((row) => (
                  <TableRow key={row.stage}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full shrink-0" 
                          style={{ backgroundColor: getStageColor(row.stage) }} 
                        />
                        <span className="truncate max-w-[120px]" title={row.stage}>
                          {row.stage}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right text-success">
                      {formatCurrency(row.totalAmount)}
                    </TableCell>
                    <TableCell className="text-right">{row.showRate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
