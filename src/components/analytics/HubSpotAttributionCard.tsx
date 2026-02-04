import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useHubSpotMetrics } from '@/hooks/useHubSpotMetrics';
import { useIsHubSpotSyncEnabled } from '@/hooks/useHubSpotSync';
import { mapHubSpotSource } from '@/lib/hubspotSourceMapping';
import { Database, TrendingUp, Users, Target } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface HubSpotAttributionCardProps {
  startDate?: Date;
  endDate?: Date;
}

// Color palette for pie chart
const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--primary))',
  'hsl(var(--muted-foreground))',
];

export function HubSpotAttributionCard({ startDate, endDate }: HubSpotAttributionCardProps) {
  const isEnabled = useIsHubSpotSyncEnabled();
  const { data: metrics, isLoading } = useHubSpotMetrics({ startDate, endDate });

  // Only render for Trenton
  if (!isEnabled) return null;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-warning" />
            HubSpot Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!metrics || metrics.totalEvents === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-warning" />
            HubSpot Attribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No HubSpot data available for the selected period
          </p>
        </CardContent>
      </Card>
    );
  }

  // Prepare pie chart data
  const pieData = metrics.bySource.map(s => ({
    name: mapHubSpotSource(s.source) || s.source,
    value: s.count,
    originalSource: s.source,
  }));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-warning" />
            HubSpot Attribution
          </CardTitle>
          <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
            {metrics.coverageRate}% Coverage
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary metrics */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold">{metrics.syncedEvents}</p>
            <p className="text-xs text-muted-foreground">Synced Events</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-success/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <p className="text-2xl font-bold text-success">
              {metrics.bySource.reduce((sum, s) => sum + s.showed, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Showed</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-primary/10">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <p className="text-2xl font-bold text-primary">
              {metrics.bySource.reduce((sum, s) => sum + s.closed, 0)}
            </p>
            <p className="text-xs text-muted-foreground">Closed</p>
          </div>
        </div>

        {/* Pie chart and table side by side */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-popover border rounded-lg px-3 py-2 shadow-md">
                        <p className="font-medium">{data.name}</p>
                        <p className="text-sm text-muted-foreground">{data.value} events</p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Source breakdown table */}
          <div className="overflow-auto max-h-[200px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Show%</TableHead>
                  <TableHead className="text-right">Close%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {metrics.bySource.map((row, index) => (
                  <TableRow key={row.source}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: COLORS[index % COLORS.length] }} 
                        />
                        {mapHubSpotSource(row.source) || row.source}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{row.count}</TableCell>
                    <TableCell className="text-right">{row.showRate}%</TableCell>
                    <TableCell className="text-right">{row.closeRate}%</TableCell>
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
