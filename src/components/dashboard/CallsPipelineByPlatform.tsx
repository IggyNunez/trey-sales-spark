import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { useCallsByPlatformPerDay, CallsByPlatformResult, PlatformUTMBreakdowns, UTMBreakdownItem, EventSummary } from '@/hooks/useCallsByPlatformPerDay';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DayPlatformDetailSheet } from './DayPlatformDetailSheet';
import { LeadJourneySheet } from './LeadJourneySheet';

interface CallsPipelineByPlatformProps {
  startDate?: Date;
  endDate?: Date;
  bookingPlatform?: string;
}

interface UTMBreakdownSectionProps {
  label: string;
  items: UTMBreakdownItem[];
}

function UTMBreakdownSection({ label, items }: UTMBreakdownSectionProps) {
  // Don't show section if only "(none)" exists
  const hasRealData = items.some(item => item.value !== '(none)');
  if (!hasRealData && items.length <= 1) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">{label}</h4>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.value} className="flex items-center justify-between py-1 px-2 rounded-md bg-muted/50">
            <span className={cn(
              "text-sm",
              item.value === '(none)' && "text-muted-foreground italic"
            )}>
              {item.value}
            </span>
            <span className="text-sm font-medium tabular-nums">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface UTMBreakdownSheetProps {
  platform: string | null;
  breakdown: PlatformUTMBreakdowns | null;
  totalCount: number;
  onClose: () => void;
}

function UTMBreakdownSheet({ platform, breakdown, totalCount, onClose }: UTMBreakdownSheetProps) {
  const hasAnyData = breakdown && (
    breakdown.utm_source.some(i => i.value !== '(none)') ||
    breakdown.utm_medium.some(i => i.value !== '(none)') ||
    breakdown.utm_campaign.some(i => i.value !== '(none)') ||
    breakdown.utm_content.some(i => i.value !== '(none)') ||
    breakdown.utm_term.some(i => i.value !== '(none)') ||
    breakdown.utm_channel?.some(i => i.value !== '(none)') ||
    breakdown.utm_setter?.some(i => i.value !== '(none)')
  );

  return (
    <Sheet open={!!platform} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {platform}
            <span className="text-muted-foreground font-normal">({totalCount} calls)</span>
          </SheetTitle>
          <SheetDescription>
            UTM parameter breakdown for calls from this platform (total period)
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {!hasAnyData ? (
            <p className="text-sm text-muted-foreground py-4">
              No UTM parameter data available for this platform. All calls have empty UTM values.
            </p>
          ) : (
            <>
              {breakdown && (
                <>
                  <UTMBreakdownSection label="utm_source" items={breakdown.utm_source} />
                  <UTMBreakdownSection label="utm_medium" items={breakdown.utm_medium} />
                  <UTMBreakdownSection label="utm_channel" items={breakdown.utm_channel || []} />
                  <UTMBreakdownSection label="utm_campaign" items={breakdown.utm_campaign} />
                  <UTMBreakdownSection label="utm_setter" items={breakdown.utm_setter || []} />
                  <UTMBreakdownSection label="utm_content" items={breakdown.utm_content} />
                  <UTMBreakdownSection label="utm_term" items={breakdown.utm_term} />
                </>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface PlatformTableProps {
  data?: CallsByPlatformResult;
  isLoading: boolean;
  onPlatformClick: (platform: string) => void;
  onDayPlatformClick: (date: string, dateLabel: string, platform: string) => void;
}

function PlatformTable({ data, isLoading, onPlatformClick, onDayPlatformClick }: PlatformTableProps) {
  if (isLoading) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (!data || data.days.length === 0) {
    return <p className="text-muted-foreground text-sm py-4">No data available for the selected period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="sticky left-0 bg-background">Date</TableHead>
            {data.platforms.map(platform => (
              <TableHead key={platform} className="text-right">{platform}</TableHead>
            ))}
            <TableHead className="text-right font-semibold">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.days.map((day) => (
            <TableRow key={day.date}>
              <TableCell className="sticky left-0 bg-background font-medium">{day.dateLabel}</TableCell>
              {data.platforms.map(platform => {
                const count = day.platforms[platform] || 0;
                return (
                  <TableCell key={platform} className="text-right">
                    {count > 0 ? (
                      <button
                        onClick={() => onDayPlatformClick(day.date, day.dateLabel, platform)}
                        className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
                      >
                        {count}
                        <ChevronRight className="h-3 w-3 opacity-50" />
                      </button>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                );
              })}
              <TableCell className="text-right font-semibold">{day.total}</TableCell>
            </TableRow>
          ))}
          {/* Totals row - clickable platform cells */}
          <TableRow className="bg-muted/50 font-semibold">
            <TableCell className="sticky left-0 bg-muted/50">Total</TableCell>
            {data.platforms.map(platform => (
              <TableCell 
                key={platform} 
                className="text-right"
              >
                <button
                  onClick={() => onPlatformClick(platform)}
                  className="inline-flex items-center gap-1 hover:text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
                >
                  {data.totals[platform] || 0}
                  <ChevronRight className="h-3 w-3 opacity-50" />
                </button>
              </TableCell>
            ))}
            <TableCell className="text-right">{data.grandTotal}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </div>
  );
}

export function CallsPipelineByPlatform({ startDate, endDate, bookingPlatform }: CallsPipelineByPlatformProps) {
  const [activeTab, setActiveTab] = useState('completed');
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);
  const [selectedDayPlatform, setSelectedDayPlatform] = useState<{
    date: string;
    dateLabel: string;
    platform: string;
  } | null>(null);
  const [journeyEvent, setJourneyEvent] = useState<EventSummary | null>(null);

  const { data: completedData, isLoading: completedLoading } = useCallsByPlatformPerDay({
    startDate,
    endDate,
    dateType: 'completed',
    bookingPlatform,
  });

  const { data: createdData, isLoading: createdLoading } = useCallsByPlatformPerDay({
    startDate,
    endDate,
    dateType: 'created',
    bookingPlatform,
  });

  // Get the active data based on current tab
  const activeData = activeTab === 'completed' ? completedData : createdData;
  const breakdown = selectedPlatform && activeData?.platformBreakdowns?.[selectedPlatform] || null;
  const totalCount = selectedPlatform && activeData?.totals?.[selectedPlatform] || 0;
  
  // Get day+platform breakdown
  const dayPlatformBreakdown = selectedDayPlatform && activeData?.dayPlatformBreakdowns?.[selectedDayPlatform.date]?.[selectedDayPlatform.platform] || null;

  const handlePlatformClick = (platform: string) => {
    setSelectedPlatform(platform);
  };
  
  const handleDayPlatformClick = (date: string, dateLabel: string, platform: string) => {
    setSelectedDayPlatform({ date, dateLabel, platform });
  };
  
  const handleEventClick = (event: EventSummary) => {
    setJourneyEvent(event);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Calls by Platform (Daily)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="completed">Completed Calls</TabsTrigger>
              <TabsTrigger value="created">Created Calls</TabsTrigger>
            </TabsList>
            <TabsContent value="completed">
              <p className="text-sm text-muted-foreground mb-4">
                Past calls that have occurred (for outcome metrics like show/close rates)
              </p>
              <PlatformTable 
                data={completedData} 
                isLoading={completedLoading} 
                onPlatformClick={handlePlatformClick}
                onDayPlatformClick={handleDayPlatformClick}
              />
            </TabsContent>
            <TabsContent value="created">
              <p className="text-sm text-muted-foreground mb-4">
                Calls created/booked on each day (for UTM tracking & source journey)
              </p>
              <PlatformTable 
                data={createdData} 
                isLoading={createdLoading} 
                onPlatformClick={handlePlatformClick}
                onDayPlatformClick={handleDayPlatformClick}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Total platform UTM breakdown sheet */}
      <UTMBreakdownSheet
        platform={selectedPlatform}
        breakdown={breakdown}
        totalCount={totalCount}
        onClose={() => setSelectedPlatform(null)}
      />
      
      {/* Day-specific platform drill-down */}
      <DayPlatformDetailSheet
        date={selectedDayPlatform?.date || null}
        dateLabel={selectedDayPlatform?.dateLabel || ''}
        platform={selectedDayPlatform?.platform || null}
        breakdown={dayPlatformBreakdown}
        onClose={() => setSelectedDayPlatform(null)}
        onEventClick={handleEventClick}
      />
      
      {/* Lead Journey sheet */}
      <LeadJourneySheet
        open={!!journeyEvent}
        onOpenChange={(open) => !open && setJourneyEvent(null)}
        event={journeyEvent}
      />
    </>
  );
}
