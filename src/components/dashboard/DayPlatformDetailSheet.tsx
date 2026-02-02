import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ChevronRight, User, Mail, Phone, Calendar, Clock } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { cn } from '@/lib/utils';
import { useSetterAliasMap } from '@/hooks/useSetterAliases';
import { useCloserDisplayNames } from '@/hooks/useCloserDisplayNames';
import { resolveSetterName, resolveCloserDisplayName } from '@/lib/identityResolver';
import type { DayPlatformBreakdown, EventSummary, UTMBreakdownItem } from '@/hooks/useCallsByPlatformPerDay';

interface DayPlatformDetailSheetProps {
  date: string | null;
  dateLabel: string;
  platform: string | null;
  breakdown: DayPlatformBreakdown | null;
  onClose: () => void;
  onEventClick: (event: EventSummary) => void;
}

function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

function UTMBreakdownSection({ label, items }: { label: string; items: UTMBreakdownItem[] }) {
  const hasRealData = items.some(item => item.value !== '(none)');
  if (!hasRealData && items.length <= 1) return null;

  return (
    <div className="space-y-1.5">
      <h5 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</h5>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.value} className="flex items-center justify-between py-1 px-2 rounded-md bg-muted/50 text-sm">
            <span className={cn(item.value === '(none)' && "text-muted-foreground italic")}>
              {item.value}
            </span>
            <span className="font-medium tabular-nums">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function EventCard({ 
  event, 
  onClick,
  aliasMap,
  displayNameMap,
}: { 
  event: EventSummary; 
  onClick: () => void;
  aliasMap: Map<string, string>;
  displayNameMap: Map<string, string>;
}) {
  const metadata = event.booking_metadata || {};
  const responses = event.booking_responses || {};
  
  const effectiveSetter = resolveSetterName(event.setter_name || (metadata.utm_setter as string | undefined), aliasMap);
  const effectiveCloser = resolveCloserDisplayName(event.closer_name, event.closer_email, displayNameMap);
  
  // Get capital tier from responses (various field names)
  const capitalTier = (responses['How-much-investible-capital-do-you-have-to-invest-into-your-education-and-to-fund-a-business-acquisition'] as string) ||
                      (responses['capital_tier'] as string) ||
                      (responses['investible_capital'] as string);
  
  const citizenship = (responses['USCITZIZEN'] as string) || (responses['us_citizen'] as string);
  const igHandle = responses['IGHANDLE'] as string;

  const getOutcomeBadge = () => {
    switch (event.event_outcome) {
      case 'closed': return <Badge variant="default" className="bg-green-500">Closed</Badge>;
      case 'no_show': return <Badge variant="destructive">No Show</Badge>;
      case 'showed_offer_no_close': return <Badge variant="secondary">Offer Made</Badge>;
      case 'showed_no_offer': return <Badge variant="outline">No Offer</Badge>;
      case 'not_qualified': return <Badge variant="outline">Not Qualified</Badge>;
      default: return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card 
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium truncate">{event.lead_name}</span>
            </div>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{event.lead_email}</span>
            </div>
            {event.lead_phone && (
              <div className="flex items-center gap-2 mt-0.5 text-sm text-muted-foreground">
                <Phone className="h-3.5 w-3.5 shrink-0" />
                <span>{event.lead_phone}</span>
              </div>
            )}
          </div>
          <div className="flex flex-col items-end gap-1">
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
            {getOutcomeBadge()}
          </div>
        </div>
        
        {/* Attribution badges */}
        <div className="flex flex-wrap gap-1.5 mt-3">
          {metadata.utm_platform && (
            <UtmPlatformBadge platform={metadata.utm_platform as string} size="sm" />
          )}
          {metadata.utm_channel && (
            <Badge variant="outline" className="text-xs bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800">
              {metadata.utm_channel as string}
            </Badge>
          )}
          {effectiveSetter && (
            <Badge variant="outline" className="text-xs bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800">
              Setter: {effectiveSetter}
            </Badge>
          )}
          {effectiveCloser && (
            <Badge variant="outline" className="text-xs bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
              Closer: {effectiveCloser}
            </Badge>
          )}
        </div>
        
        {/* Key form responses */}
        {(capitalTier || citizenship || igHandle) && (
          <div className="mt-3 pt-3 border-t text-xs text-muted-foreground space-y-1">
            {capitalTier && (
              <div>
                <span className="font-medium">Capital:</span> {capitalTier}
              </div>
            )}
            {citizenship && (
              <div>
                <span className="font-medium">US Citizen:</span> {citizenship}
              </div>
            )}
            {igHandle && (
              <div>
                <span className="font-medium">IG:</span> @{igHandle.replace('@', '')}
              </div>
            )}
          </div>
        )}
        
        {/* Time info */}
        <div className="flex items-center gap-4 mt-3 pt-2 border-t text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            <span>{formatInEST(event.scheduled_at, 'MMM d')}</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatInEST(event.scheduled_at, 'h:mm a')} EST</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function DayPlatformDetailSheet({
  date,
  dateLabel,
  platform,
  breakdown,
  onClose,
  onEventClick,
}: DayPlatformDetailSheetProps) {
  const { aliasMap } = useSetterAliasMap();
  const { displayNameMap } = useCloserDisplayNames();
  
  const isOpen = !!(date && platform);
  const eventCount = breakdown?.events.length || 0;
  const utmBreakdowns = breakdown?.utmBreakdowns;

  const hasAnyUtmData = utmBreakdowns && (
    utmBreakdowns.utm_source.some(i => i.value !== '(none)') ||
    utmBreakdowns.utm_medium.some(i => i.value !== '(none)') ||
    utmBreakdowns.utm_campaign.some(i => i.value !== '(none)') ||
    utmBreakdowns.utm_channel.some(i => i.value !== '(none)') ||
    utmBreakdowns.utm_setter.some(i => i.value !== '(none)')
  );

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {dateLabel} • {platform}
            <Badge variant="secondary">{eventCount} {eventCount === 1 ? 'call' : 'calls'}</Badge>
          </SheetTitle>
          <SheetDescription>
            UTM parameters and events for this day
          </SheetDescription>
        </SheetHeader>
        
        <ScrollArea className="flex-1 -mx-6 px-6">
          <div className="space-y-6 pb-6">
            {/* UTM Breakdowns */}
            {hasAnyUtmData && utmBreakdowns && (
              <>
                <div>
                  <h4 className="text-sm font-semibold mb-3">UTM Parameters</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <UTMBreakdownSection label="Source" items={utmBreakdowns.utm_source} />
                    <UTMBreakdownSection label="Medium" items={utmBreakdowns.utm_medium} />
                    <UTMBreakdownSection label="Channel" items={utmBreakdowns.utm_channel} />
                    <UTMBreakdownSection label="Campaign" items={utmBreakdowns.utm_campaign} />
                    <UTMBreakdownSection label="Setter" items={utmBreakdowns.utm_setter} />
                  </div>
                </div>
                <Separator />
              </>
            )}
            
            {!hasAnyUtmData && (
              <>
                <p className="text-sm text-muted-foreground py-2">
                  No UTM parameter data available for this day. All calls have empty UTM values.
                </p>
                <Separator />
              </>
            )}
            
            {/* Events List */}
            <div>
              <h4 className="text-sm font-semibold mb-3">
                Events ({eventCount})
              </h4>
              <div className="space-y-3">
                {breakdown?.events.map(event => (
                  <EventCard
                    key={event.id}
                    event={event}
                    onClick={() => onEventClick(event)}
                    aliasMap={aliasMap}
                    displayNameMap={displayNameMap}
                  />
                ))}
                {eventCount === 0 && (
                  <p className="text-sm text-muted-foreground py-4 text-center">
                    No events for this day and platform.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}