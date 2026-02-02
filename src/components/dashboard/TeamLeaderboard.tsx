import { useState } from 'react';
import { Trophy, TrendingUp, DollarSign, Phone, Target, Medal, Award, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useLeaderboard, SalesRepStats } from '@/hooks/useLeaderboard';
import { cn } from '@/lib/utils';

interface LeaderboardProps {
  startDate?: Date;
  endDate?: Date;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-500" />;
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />;
    case 3:
      return <Award className="h-5 w-5 text-amber-600" />;
    default:
      return <span className="text-sm font-medium text-muted-foreground w-5 text-center">{rank}</span>;
  }
}

function getRankBadgeClass(rank: number) {
  switch (rank) {
    case 1:
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
    case 2:
      return "bg-gray-200/50 text-gray-600 border-gray-300/20";
    case 3:
      return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function TeamLeaderboard({ startDate, endDate }: LeaderboardProps) {
  const [sortBy, setSortBy] = useState<'revenue' | 'closeRate' | 'dealsClosed' | 'completedCalls'>('revenue');
  
  const { data: leaderboard, isLoading } = useLeaderboard({
    startDate,
    endDate,
    sortBy,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Team Leaderboard</CardTitle>
              <CardDescription>Loading...</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array(3).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!leaderboard || leaderboard.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Trophy className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Team Leaderboard</CardTitle>
              <CardDescription>No sales rep data available for this period</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Add sales reps and assign them to calls to see rankings here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Top performer stats
  const topPerformer = leaderboard[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Team Leaderboard</CardTitle>
              <CardDescription>Sales rep performance rankings</CardDescription>
            </div>
          </div>
          
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="revenue">
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Revenue
                </span>
              </SelectItem>
              <SelectItem value="closeRate">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Close Rate
                </span>
              </SelectItem>
              <SelectItem value="dealsClosed">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Deals Closed
                </span>
              </SelectItem>
              <SelectItem value="completedCalls">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Completed Calls
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {/* Top Performer Highlight */}
      {topPerformer && (
        <div className="mx-6 mb-4 p-4 rounded-lg bg-gradient-to-r from-yellow-500/10 via-amber-500/5 to-transparent border border-yellow-500/20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-12 w-12 ring-2 ring-yellow-500/50">
                <AvatarFallback className="bg-yellow-500/20 text-yellow-600 font-semibold">
                  {getInitials(topPerformer.name)}
                </AvatarFallback>
              </Avatar>
              <Crown className="absolute -top-2 -right-2 h-5 w-5 text-yellow-500" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{topPerformer.name}</p>
              <p className="text-sm text-muted-foreground">Top Performer</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-yellow-600">
                {sortBy === 'revenue' && formatCurrency(topPerformer.totalRevenue)}
                {sortBy === 'closeRate' && `${topPerformer.closeRate}%`}
                {sortBy === 'dealsClosed' && topPerformer.dealsClosed}
                {sortBy === 'completedCalls' && topPerformer.completedCalls}
              </p>
              <p className="text-xs text-muted-foreground capitalize">{sortBy.replace(/([A-Z])/g, ' $1').trim()}</p>
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center">Rank</TableHead>
              <TableHead>Rep</TableHead>
              <TableHead className="text-center">Calls</TableHead>
              <TableHead className="text-center">Show Rate</TableHead>
              <TableHead className="text-center">Close Rate</TableHead>
              <TableHead className="text-center">Deals</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((rep, index) => {
              const rank = index + 1;
              return (
                <TableRow 
                  key={rep.userId}
                  className={cn(
                    rank <= 3 && "bg-muted/30",
                    rank === 1 && "bg-yellow-500/5"
                  )}
                >
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      {getRankIcon(rank)}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={cn(
                          "text-xs font-medium",
                          rank === 1 && "bg-yellow-500/20 text-yellow-600",
                          rank === 2 && "bg-gray-200 text-gray-600",
                          rank === 3 && "bg-amber-500/20 text-amber-600"
                        )}>
                          {getInitials(rep.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium">{rep.name}</p>
                        <p className="text-xs text-muted-foreground">{rep.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono">
                      {rep.completedCalls}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-medium",
                      rep.showRate >= 70 && "text-success",
                      rep.showRate < 50 && "text-destructive"
                    )}>
                      {rep.showRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-medium",
                      rep.closeRate >= 50 && "text-success",
                      rep.closeRate < 30 && "text-destructive"
                    )}>
                      {rep.closeRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold">{rep.dealsClosed}</span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-semibold">{formatCurrency(rep.totalRevenue)}</span>
                    {rep.avgDealSize > 0 && (
                      <p className="text-xs text-muted-foreground">
                        avg {formatCurrency(rep.avgDealSize)}
                      </p>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
