import { useState, useEffect } from 'react';
import { startOfMonth, endOfMonth, format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { CloserMetricsTable } from '@/components/dashboard/CloserMetricsTable';
import { PlatformAnalyticsTab } from '@/components/analytics/PlatformAnalyticsTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { useIntegrationConfig } from '@/hooks/useIntegrationConfig';

export default function AnalyticsPage() {
  const { hasCalcom, isLoading: integrationsLoading } = useIntegrationConfig();
  const today = new Date();
  const [startDate, setStartDate] = useState<Date | undefined>(startOfMonth(today));
  const [endDate, setEndDate] = useState<Date | undefined>(endOfMonth(today));
  const [bookingPlatformFilter, setBookingPlatformFilter] = useState<string>('all');
  
  // Set Cal.com as default when connected
  useEffect(() => {
    if (!integrationsLoading && hasCalcom) {
      setBookingPlatformFilter('calcom');
    }
  }, [hasCalcom, integrationsLoading]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Deep dive into your sales performance and team metrics
            </p>
          </div>

          {/* Shared Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Calendar Filter - only show if Cal.com connected */}
            {hasCalcom && (
              <Select 
                value={bookingPlatformFilter} 
                onValueChange={setBookingPlatformFilter}
              >
                <SelectTrigger className="w-[140px] text-primary animate-aura-pulse">
                  <SelectValue placeholder="Calendar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Calendars</SelectItem>
                  <SelectItem value="calendly">
                    <div className="flex items-center gap-2">
                      <BookingPlatformBadge platform="calendly" animate={false} />
                    </div>
                  </SelectItem>
                  <SelectItem value="calcom">
                    <div className="flex items-center gap-2">
                      <BookingPlatformBadge platform="calcom" animate={false} />
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}

            {/* Date Range */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !startDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, 'MMM d, yyyy') : 'Start date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <span className="text-muted-foreground">to</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !endDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, 'MMM d, yyyy') : 'End date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Tabbed Interface */}
        <Tabs defaultValue="platform" className="space-y-6">
          <TabsList>
            <TabsTrigger value="closer">Closer Performance</TabsTrigger>
            <TabsTrigger value="platform">Platform Performance</TabsTrigger>
          </TabsList>

          <TabsContent value="closer">
            <CloserMetricsTable 
              defaultStartDate={startDate} 
              defaultEndDate={endDate}
              bookingPlatform={hasCalcom && bookingPlatformFilter !== 'all' ? bookingPlatformFilter : undefined}
            />
          </TabsContent>

          <TabsContent value="platform">
            <PlatformAnalyticsTab 
              startDate={startDate} 
              endDate={endDate}
              bookingPlatform={hasCalcom && bookingPlatformFilter !== 'all' ? bookingPlatformFilter : undefined}
            />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
