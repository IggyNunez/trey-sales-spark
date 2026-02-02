import { useState } from 'react';
import { Users, TrendingUp, Phone, Target, Medal, Award, Crown } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useSetterLeaderboard, SetterStats } from '@/hooks/useSetterLeaderboard';
import { cn } from '@/lib/utils';

interface SetterLeaderboardProps {
  startDate?: Date;
  endDate?: Date;
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

export function SetterLeaderboard({ startDate, endDate }: SetterLeaderboardProps) {
  const [sortBy, setSortBy] = useState<'callsSet' | 'showRate' | 'closeRate'>('callsSet');
  
  const { data: leaderboard, isLoading } = useSetterLeaderboard({
    startDate,
    endDate,
    sortBy,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Users className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Setter Leaderboard</CardTitle>
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
            <Users className="h-6 w-6 text-primary" />
            <div>
              <CardTitle>Setter Leaderboard</CardTitle>
              <CardDescription>No setter data available for this period</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Sync Close CRM data to see setter performance rankings here.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Top performer
  const topPerformer = leaderboard[0];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-info/10">
              <Users className="h-5 w-5 text-info" />
            </div>
            <div>
              <CardTitle>Setter Leaderboard</CardTitle>
              <CardDescription>Setter performance rankings</CardDescription>
            </div>
          </div>
          
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="callsSet">
                <span className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Calls Set
                </span>
              </SelectItem>
              <SelectItem value="showRate">
                <span className="flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Show Rate
                </span>
              </SelectItem>
              <SelectItem value="closeRate">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Close Rate
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      {/* Top Performer Highlight */}
      {topPerformer && (
        <div className="mx-6 mb-4 p-4 rounded-lg bg-gradient-to-r from-info/10 via-info/5 to-transparent border border-info/20">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Avatar className="h-12 w-12 ring-2 ring-info/50">
                <AvatarFallback className="bg-info/20 text-info font-semibold">
                  {getInitials(topPerformer.setterName)}
                </AvatarFallback>
              </Avatar>
              <Crown className="absolute -top-2 -right-2 h-5 w-5 text-info" />
            </div>
            <div className="flex-1">
              <p className="font-semibold">{topPerformer.setterName}</p>
              <p className="text-sm text-muted-foreground">Top Setter</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-info">
                {sortBy === 'callsSet' && topPerformer.callsSet}
                {sortBy === 'showRate' && `${topPerformer.showRate}%`}
                {sortBy === 'closeRate' && `${topPerformer.closeRate}%`}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {sortBy === 'callsSet' ? 'Calls Set' : sortBy === 'showRate' ? 'Show Rate' : 'Close Rate'}
              </p>
            </div>
          </div>
        </div>
      )}

      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-16 text-center">Rank</TableHead>
              <TableHead>Setter</TableHead>
              <TableHead className="text-center w-16">Source</TableHead>
              <TableHead className="text-center">Calls Set</TableHead>
              <TableHead className="text-center">Showed</TableHead>
              <TableHead className="text-center">Show Rate</TableHead>
              <TableHead className="text-center">Closed</TableHead>
              <TableHead className="text-center">Close Rate</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {leaderboard.map((setter, index) => {
              const rank = index + 1;
              return (
                <TableRow 
                  key={setter.setterName}
                  className={cn(
                    rank <= 3 && "bg-muted/30",
                    rank === 1 && "bg-info/5"
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
                          rank === 1 && "bg-info/20 text-info",
                          rank === 2 && "bg-gray-200 text-gray-600",
                          rank === 3 && "bg-amber-500/20 text-amber-600"
                        )}>
                          {getInitials(setter.setterName)}
                        </AvatarFallback>
                      </Avatar>
                      <p className="font-medium">{setter.setterName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-[10px] px-1.5",
                        setter.attributionSource === 'crm' && "bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950 dark:text-blue-400",
                        setter.attributionSource === 'utm' && "bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-950 dark:text-amber-400",
                        setter.attributionSource === 'mixed' && "bg-purple-50 text-purple-600 border-purple-200 dark:bg-purple-950 dark:text-purple-400"
                      )}
                    >
                      {setter.attributionSource === 'crm' ? 'CRM' : 
                       setter.attributionSource === 'utm' ? 'UTM' : 'Both'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono">
                      {setter.callsSet}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-medium">{setter.showed}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-medium",
                      setter.showRate >= 70 && "text-success",
                      setter.showRate < 50 && "text-destructive"
                    )}>
                      {setter.showRate}%
                    </span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="font-semibold">{setter.closed}</span>
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "font-medium",
                      setter.closeRate >= 50 && "text-success",
                      setter.closeRate < 30 && "text-destructive"
                    )}>
                      {setter.closeRate}%
                    </span>
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
