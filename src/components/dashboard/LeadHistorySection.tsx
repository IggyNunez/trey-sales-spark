import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { History, Circle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { useLeadHistory } from '@/hooks/useLeadHistory';
import { cn } from '@/lib/utils';

interface LeadHistorySectionProps {
  leadEmail: string;
  currentEventId: string;
}

function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

function getOutcomeColor(outcome: string | null): string {
  switch (outcome) {
    case 'closed':
      return 'text-green-600 dark:text-green-400';
    case 'showed_offer_no_close':
    case 'showed_no_offer':
      return 'text-amber-600 dark:text-amber-400';
    case 'no_show':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-muted-foreground';
  }
}

function formatOutcome(outcome: string | null): string {
  if (!outcome) return 'Pending';
  return outcome
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function LeadHistorySection({ leadEmail, currentEventId }: LeadHistorySectionProps) {
  const { data: history, isLoading } = useLeadHistory(leadEmail, currentEventId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No prior events with this lead</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        {history.length} prior event{history.length !== 1 ? 's' : ''} with this lead
      </p>
      
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-2.5 top-3 bottom-3 w-px bg-border" />
        
        <div className="space-y-4">
          {history.map((event) => (
            <div key={event.id} className="relative pl-8">
              {/* Timeline dot */}
              <div className={cn(
                "absolute left-0 top-1.5 h-5 w-5 rounded-full border-2 flex items-center justify-center",
                event.event_outcome === 'closed' 
                  ? 'bg-green-100 border-green-500 dark:bg-green-950' 
                  : 'bg-background border-muted-foreground/30'
              )}>
                <Circle className={cn("h-2 w-2", getOutcomeColor(event.event_outcome))} />
              </div>
              
              <div className="rounded-lg border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {formatInEST(event.scheduled_at, 'MMM d, yyyy')}
                      </span>
                      {event.booking_platform && (
                        <BookingPlatformBadge platform={event.booking_platform} animate={false} />
                      )}
                    </div>
                    {event.event_name && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {event.event_name}
                      </p>
                    )}
                  </div>
                  <Badge 
                    variant={event.event_outcome === 'closed' ? 'default' : 'secondary'}
                    className="shrink-0 text-xs"
                  >
                    {formatOutcome(event.event_outcome)}
                  </Badge>
                </div>
                
                {event.closer_name && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    Closer: <span className="font-medium text-foreground">{event.closer_name}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
