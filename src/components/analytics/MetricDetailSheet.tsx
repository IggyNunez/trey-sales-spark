import { useState } from 'react';
import { format } from 'date-fns';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useFilteredEventsForMetric } from '@/hooks/useFilteredEventsForMetric';
import { MetricFilter } from '@/types/metricFilter';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { LeadJourneySheet } from '@/components/dashboard/LeadJourneySheet';
import { cn } from '@/lib/utils';

interface MetricDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: MetricFilter | null;
  startDate?: Date;
  endDate?: Date;
}

function getOutcomeBadgeVariant(outcome: string | null): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (outcome) {
    case 'closed':
      return 'default';
    case 'showed_offer_no_close':
    case 'showed_no_offer':
      return 'secondary';
    case 'no_show':
      return 'destructive';
    default:
      return 'outline';
  }
}

function formatOutcome(outcome: string | null): string {
  if (!outcome) return 'Pending';
  return outcome
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// Attribution tag component for consistent styling
function AttributionTag({ label, value, variant }: { 
  label: string; 
  value: string | null | undefined; 
  variant: 'platform' | 'traffic' | 'setter' | 'source' | 'closer';
}) {
  if (!value) return null;
  
  const variantStyles = {
    platform: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300',
    traffic: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300',
    setter: 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300',
    source: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950 dark:text-blue-300',
    closer: 'bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-950 dark:text-pink-300',
  };
  
  return (
    <Badge 
      variant="outline" 
      className={cn('text-[10px] px-1.5 py-0 font-medium', variantStyles[variant])}
    >
      {label}:{value}
    </Badge>
  );
}

export function MetricDetailSheet({
  open,
  onOpenChange,
  filter,
  startDate,
  endDate,
}: MetricDetailSheetProps) {
  const { data: events, isLoading } = useFilteredEventsForMetric({
    filter,
    startDate,
    endDate,
    enabled: open,
  });

  // State for lead journey drill-down
  const [selectedEvent, setSelectedEvent] = useState<typeof events extends (infer E)[] ? E : never | null>(null);
  const [isJourneyOpen, setIsJourneyOpen] = useState(false);

  const handleLeadClick = (event: NonNullable<typeof events>[number]) => {
    setSelectedEvent(event);
    setIsJourneyOpen(true);
  };

  const dateRangeText = startDate && endDate
    ? `${format(startDate, 'MMM d, yyyy')} - ${format(endDate, 'MMM d, yyyy')}`
    : 'All time';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{filter?.label || 'Events'}</SheetTitle>
          <SheetDescription>
            {isLoading ? (
              <Skeleton className="h-4 w-32" />
            ) : (
              <>
                {events?.length || 0} events • {dateRangeText}
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : events && events.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Attribution</TableHead>
                  <TableHead>Scheduled</TableHead>
                  <TableHead>Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => {
                  const metadata = event.booking_metadata as {
                    utm_platform?: string;
                    utm_source?: string;
                    utm_setter?: string;
                    utm_channel?: string;
                  } | null;
                  const closeFields = event.close_custom_fields as Record<string, string> | null;
                  
                  return (
                    <TableRow key={event.id}>
                      <TableCell>
                        <div>
                          <div 
                            className="font-medium cursor-pointer hover:text-primary hover:underline transition-colors"
                            onClick={() => handleLeadClick(event)}
                          >
                            {event.lead_name}
                          </div>
                          <div className="text-xs text-muted-foreground">{event.lead_email}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[280px]">
                          {/* Booking Platform Tag */}
                          {event.booking_platform && (
                            <BookingPlatformBadge platform={event.booking_platform} animate={false} />
                          )}
                          
                          {/* Traffic Source from UTM (Cal.com) */}
                          {metadata?.utm_platform && (
                            <UtmPlatformBadge platform={metadata.utm_platform} size="sm" />
                          )}
                          
                          {/* Channel Tag */}
                          <AttributionTag 
                            label="Channel" 
                            value={metadata?.utm_channel} 
                            variant="source" 
                          />
                          
                          {/* Setter Tag */}
                          <AttributionTag 
                            label="Setter" 
                            value={event.setter_name || metadata?.utm_setter} 
                            variant="setter" 
                          />
                          
                          {/* Closer Tag */}
                          <AttributionTag 
                            label="Closer" 
                            value={event.closer_name} 
                            variant="closer" 
                          />
                          
                          {/* Lead Source from CRM */}
                          <AttributionTag 
                            label="Source" 
                            value={closeFields?.platform || closeFields?.lead_source} 
                            variant="source" 
                          />
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {event.scheduled_at
                          ? format(new Date(event.scheduled_at), 'MMM d, h:mm a')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getOutcomeBadgeVariant(event.event_outcome)}>
                          {formatOutcome(event.event_outcome)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No events found matching this filter.
            </p>
          )}
        </div>

        {/* Lead Journey Sheet for drill-down */}
        <LeadJourneySheet
          open={isJourneyOpen}
          onOpenChange={setIsJourneyOpen}
          event={selectedEvent as Parameters<typeof LeadJourneySheet>[0]['event']}
        />
      </SheetContent>
    </Sheet>
  );
}
