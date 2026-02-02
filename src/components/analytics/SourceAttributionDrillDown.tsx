import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ChevronRight, ChevronDown, Download, Network } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSourceAttributionTree, TreeNode, AttributionSource } from '@/hooks/useSourceAttributionTree';
import { exportToCSV } from '@/lib/exportUtils';
import { MetricFilter } from '@/types/metricFilter';

interface SourceAttributionDrillDownProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
  onNodeClick?: (filter: MetricFilter) => void;
}

interface TreeRowProps {
  node: TreeNode;
  depth: number;
  onNodeClick?: (filter: MetricFilter) => void;
}

const sourceColors: Record<AttributionSource, string> = {
  utm: 'bg-primary/10 text-primary',
  crm: 'bg-accent text-accent-foreground',
  quiz: 'bg-secondary text-secondary-foreground',
  ighandle: 'bg-muted text-muted-foreground',
  none: '',
};

const sourceLabels: Record<AttributionSource, string> = {
  utm: 'UTM',
  crm: 'CRM',
  quiz: 'DETECTED',
  ighandle: 'IG',
  none: '',
};

function TreeRow({ node, depth, onNodeClick }: TreeRowProps) {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const indent = depth * 24;

  const handleRowClick = () => {
    if (onNodeClick) {
      onNodeClick({
        type: 'attributionNode',
        label: node.label,
        value: node.label,
        platform: node.platform,
        channel: node.channel,
        setter: node.setter,
        capitalTier: node.capitalTier,
      } as MetricFilter);
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={cn(
          'grid grid-cols-[1fr_80px_80px_80px_80px] items-center py-2 px-4 hover:bg-muted/50 transition-colors border-b border-border/50',
          depth === 0 && 'bg-muted/30 font-medium',
          depth === 1 && 'text-sm',
          depth === 2 && 'text-sm text-muted-foreground',
          depth === 3 && 'text-xs text-muted-foreground/80'
        )}
      >
        <div className="flex items-center gap-2" style={{ paddingLeft: indent }}>
          {hasChildren ? (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 p-0">
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            </CollapsibleTrigger>
          ) : (
            <div className="w-6" />
          )}
          <span
            className="cursor-pointer hover:underline"
            onClick={handleRowClick}
          >
            {node.label}
          </span>
          <span className="text-muted-foreground">({node.total})</span>
          {node.level === 'platform' && node.attributionSource && node.attributionSource !== 'none' && (
            <Badge 
              variant="outline" 
              className={cn('ml-1 text-[10px] px-1.5 py-0', sourceColors[node.attributionSource])}
            >
              {sourceLabels[node.attributionSource]}
            </Badge>
          )}
        </div>
        <div className="text-right tabular-nums">{node.total}</div>
        <div className="text-right tabular-nums">
          <span className={cn(
            node.showRate >= 50 && 'text-primary',
            node.showRate >= 30 && node.showRate < 50 && 'text-foreground/80',
            node.showRate < 30 && 'text-muted-foreground'
          )}>
            {node.showRate}%
          </span>
        </div>
        <div className="text-right tabular-nums">{node.closed}</div>
        <div className="text-right tabular-nums">
          <span className={cn(
            node.closeRate >= 20 && 'text-primary',
            node.closeRate >= 10 && node.closeRate < 20 && 'text-foreground/80',
            node.closeRate < 10 && 'text-muted-foreground'
          )}>
            {node.closeRate}%
          </span>
        </div>
      </div>

      {hasChildren && (
        <CollapsibleContent>
          {node.children!.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onNodeClick={onNodeClick}
            />
          ))}
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}

export function SourceAttributionDrillDown({
  startDate,
  endDate,
  bookingPlatform,
  onNodeClick,
}: SourceAttributionDrillDownProps) {
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [setterFilter, setSetterFilter] = useState<string>('all');
  const [capitalTierFilter, setCapitalTierFilter] = useState<string>('all');
  const [showCapitalTiers, setShowCapitalTiers] = useState<boolean>(false);

  const { tree, summary, platforms, channels, setters, capitalTiers, isLoading } = useSourceAttributionTree({
    startDate,
    endDate,
    bookingPlatform,
    platformFilter,
    channelFilter,
    setterFilter,
    capitalTierFilter,
    showCapitalTiers,
  });

  const handleExport = () => {
    const flatData = flattenTreeForExport(tree, showCapitalTiers);
    const columns = [
      { key: 'platform', label: 'Platform' },
      { key: 'channel', label: 'Channel' },
      { key: 'setter', label: 'Setter' },
      ...(showCapitalTiers ? [{ key: 'capitalTier', label: 'Capital Tier' }] : []),
      { key: 'calls', label: 'Calls' },
      { key: 'showed', label: 'Showed' },
      { key: 'showRate', label: 'Show Rate' },
      { key: 'closed', label: 'Closed' },
      { key: 'closeRate', label: 'Close Rate' },
    ];
    exportToCSV(
      flatData,
      columns,
      `source-attribution-${new Date().toISOString().split('T')[0]}`
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network className="h-5 w-5" />
            Source Attribution Drill-Down
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="flex items-center gap-2">
          <Network className="h-5 w-5" />
          Source Attribution Drill-Down
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filter Bar */}
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={platformFilter} onValueChange={setPlatformFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
              <SelectItem value="Quiz Funnel">Quiz Funnel</SelectItem>
              <SelectItem value="(No Attribution)">(No Attribution)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              {channels.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
              <SelectItem value="(none)">(none)</SelectItem>
            </SelectContent>
          </Select>

          <Select value={setterFilter} onValueChange={setSetterFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Setters" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Setters</SelectItem>
              {setters.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
              <SelectItem value="(unattributed)">(unattributed)</SelectItem>
            </SelectContent>
          </Select>

          {showCapitalTiers && (
            <Select value={capitalTierFilter} onValueChange={setCapitalTierFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Tiers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tiers</SelectItem>
                {capitalTiers.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
                <SelectItem value="(unknown)">(unknown)</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <Checkbox 
              id="showCapitalTier"
              checked={showCapitalTiers}
              onCheckedChange={(checked) => setShowCapitalTiers(checked === true)}
            />
            <Label htmlFor="showCapitalTier" className="text-sm cursor-pointer">
              Show Capital Tiers
            </Label>
          </div>
        </div>

        {/* Attribution Source Legend */}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted-foreground">Sources:</span>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', sourceColors.utm)}>UTM</Badge>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', sourceColors.crm)}>CRM</Badge>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', sourceColors.quiz)}>DETECTED</Badge>
          <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', sourceColors.ighandle)}>IG</Badge>
        </div>

        {/* Tree Table */}
        <div className="border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-[1fr_80px_80px_80px_80px] items-center py-3 px-4 bg-muted/50 font-medium text-sm border-b">
            <div>Platform / Channel / Setter{showCapitalTiers ? ' / Tier' : ''}</div>
            <div className="text-right">Calls</div>
            <div className="text-right">Show %</div>
            <div className="text-right">Deals</div>
            <div className="text-right">Close %</div>
          </div>

          {/* Tree Rows */}
          <div className="max-h-[500px] overflow-y-auto">
            {tree.length > 0 ? (
              tree.map((node) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  onNodeClick={onNodeClick}
                />
              ))
            ) : (
              <div className="py-8 text-center text-muted-foreground">
                No attribution data found for the selected filters
              </div>
            )}
          </div>
        </div>

        {/* Summary Footer */}
        <div className="flex items-center justify-between text-sm text-muted-foreground pt-2 border-t">
          <div>
            <span className="font-medium text-foreground">{summary.withAttribution}</span> events with attribution ({summary.coveragePercent}%)
            {' | '}
            <span className="font-medium text-foreground">{summary.withoutAttribution}</span> without ({100 - summary.coveragePercent}%)
          </div>
          <div>
            Total: <span className="font-medium text-foreground">{summary.total}</span> events
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper function to flatten tree for CSV export
interface FlatRow {
  platform: string;
  channel: string;
  setter: string;
  capitalTier?: string;
  calls: number;
  showed: number;
  showRate: string;
  closed: number;
  closeRate: string;
}

function flattenTreeForExport(nodes: TreeNode[], includeCapitalTiers: boolean): FlatRow[] {
  const rows: FlatRow[] = [];

  function traverse(node: TreeNode, platform: string, channel: string, setter: string) {
    const row: FlatRow = {
      platform: node.level === 'platform' ? node.label : platform,
      channel: node.level === 'channel' ? node.label : (node.level === 'platform' ? '(all)' : channel),
      setter: node.level === 'setter' ? node.label : (node.level === 'capitalTier' ? setter : '(all)'),
      calls: node.total,
      showed: node.showed,
      showRate: `${node.showRate}%`,
      closed: node.closed,
      closeRate: `${node.closeRate}%`,
    };

    if (includeCapitalTiers) {
      row.capitalTier = node.level === 'capitalTier' ? node.label : '(all)';
    }

    rows.push(row);

    node.children?.forEach((child) => {
      traverse(
        child,
        node.level === 'platform' ? node.label : platform,
        node.level === 'channel' ? node.label : channel,
        node.level === 'setter' ? node.label : setter
      );
    });
  }

  nodes.forEach((n) => traverse(n, '', '', ''));
  return rows;
}
