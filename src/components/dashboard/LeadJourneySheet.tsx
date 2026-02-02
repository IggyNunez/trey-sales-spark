import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { ArrowRight, Calendar, Mail, Phone, User, CheckCircle2, Circle, History, DollarSign, ClipboardList } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { LeadHistorySection } from './LeadHistorySection';
import { PaymentHistorySection } from './PaymentHistorySection';
import { ChangeHistorySection } from './ChangeHistorySection';
import { cn } from '@/lib/utils';
import { useSetterAliasMap } from '@/hooks/useSetterAliases';
import { useCloserDisplayNames } from '@/hooks/useCloserDisplayNames';
import { resolveSetterName, resolveCloserDisplayName } from '@/lib/identityResolver';

interface LeadJourneyEvent {
  id: string;
  lead_name: string;
  lead_email: string;
  lead_phone?: string | null;
  scheduled_at: string;
  booked_at?: string | null;
  closer_name?: string | null;
  closer_email?: string | null;
  setter_name?: string | null;
  event_outcome?: string | null;
  pcf_submitted?: boolean;
  booking_platform?: string | null;
  booking_metadata?: Record<string, unknown> | null;
  booking_responses?: Record<string, unknown> | null;
}

interface LeadJourneySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: LeadJourneyEvent | null;
}

function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

function AttributionNode({ 
  label, 
  value, 
  type 
}: { 
  label: string; 
  value: string | null | undefined; 
  type: 'traffic' | 'source' | 'setter' | 'closer' | 'channel';
}) {
  const colorClasses = {
    traffic: 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
    source: 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800',
    setter: 'bg-purple-50 border-purple-200 dark:bg-purple-950 dark:border-purple-800',
    closer: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
    channel: 'bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800',
  };

  return (
    <div className={cn(
      "flex flex-col items-center justify-center p-3 rounded-lg border min-w-[100px]",
      value ? colorClasses[type] : "bg-muted/50 border-dashed"
    )}>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      <span className={cn("text-sm font-medium text-center", !value && "text-muted-foreground")}>
        {value || '(none)'}
      </span>
    </div>
  );
}

function TimelineStep({
  label,
  date,
  completed,
  value,
}: {
  label: string;
  date?: string | null;
  completed: boolean;
  value?: string | number | null;
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center border-2",
        completed 
          ? "bg-primary border-primary text-primary-foreground" 
          : "bg-muted border-muted-foreground/30"
      )}>
        {completed ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground/50" />
        )}
      </div>
      <span className={cn(
        "text-xs font-medium mt-2",
        completed ? "text-foreground" : "text-muted-foreground"
      )}>
        {label}
      </span>
      {date && (
        <span className="text-[10px] text-muted-foreground">
          {formatInEST(date, 'MMM d')}
        </span>
      )}
      {value !== undefined && value !== null && (
        <span className="text-xs font-semibold text-primary">
          {typeof value === 'number' ? `$${value.toLocaleString()}` : value}
        </span>
      )}
    </div>
  );
}

export function LeadJourneySheet({ open, onOpenChange, event }: LeadJourneySheetProps) {
  const { aliasMap } = useSetterAliasMap();
  const { displayNameMap } = useCloserDisplayNames();
  
  if (!event) return null;

  const rawMetadata = event.booking_metadata || {};
  const metadata = {
    utm_platform: typeof rawMetadata.utm_platform === 'string' ? rawMetadata.utm_platform : undefined,
    utm_source: typeof rawMetadata.utm_source === 'string' ? rawMetadata.utm_source : undefined,
    utm_setter: typeof rawMetadata.utm_setter === 'string' ? rawMetadata.utm_setter : undefined,
    utm_campaign: typeof rawMetadata.utm_campaign === 'string' ? rawMetadata.utm_campaign : undefined,
    utm_medium: typeof rawMetadata.utm_medium === 'string' ? rawMetadata.utm_medium : undefined,
    utm_channel: typeof rawMetadata.utm_channel === 'string' ? rawMetadata.utm_channel : undefined,
  };
  const responses = event.booking_responses || {};
  
  // Determine setter from either source and apply alias resolution
  const rawSetter = event.setter_name || metadata.utm_setter;
  const effectiveSetter = resolveSetterName(rawSetter, aliasMap);
  
  // Resolve closer display name
  const effectiveCloser = resolveCloserDisplayName(
    event.closer_name,
    event.closer_email,
    displayNameMap
  );
  
  // Determine timeline stages
  const isBooked = true; // If we have the event, it's booked
  const hasShowed = event.event_outcome && !['no_show', 'canceled', 'rescheduled'].includes(event.event_outcome);
  const hasOffer = event.event_outcome && ['showed_offer_no_close', 'closed'].includes(event.event_outcome);
  const hasClosed = event.event_outcome === 'closed';
  
  // Get outcome label
  const getOutcomeLabel = () => {
    switch (event.event_outcome) {
      case 'closed': return 'Deal Closed';
      case 'no_show': return 'No Show';
      case 'showed_offer_no_close': return 'Offer Made';
      case 'showed_no_offer': return 'No Offer';
      case 'not_qualified': return 'Not Qualified';
      case 'canceled': return 'Canceled';
      case 'rescheduled': return 'Rescheduled';
      default: return 'Pending';
    }
  };

  // Parse booking responses for display
  const responseEntries = Object.entries(responses).filter(([key, value]) => {
    // Filter out technical fields
    if (key.startsWith('_') || key === 'name' || key === 'email') return false;
    return value !== null && value !== undefined && value !== '';
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Lead Journey</SheetTitle>
          <SheetDescription>
            Attribution path and event timeline
          </SheetDescription>
        </SheetHeader>

        {/* Lead Info Header */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 border">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">{event.lead_name}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                <Mail className="h-3.5 w-3.5" />
                <span>{event.lead_email}</span>
              </div>
              {event.lead_phone && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1">
                  <Phone className="h-3.5 w-3.5" />
                  <span>{event.lead_phone}</span>
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>{formatInEST(event.scheduled_at, 'MMM d, yyyy')}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {formatInEST(event.scheduled_at, 'h:mm a')} EST
              </div>
              <div className="mt-2">
                <BookingPlatformBadge platform={event.booking_platform} />
              </div>
            </div>
          </div>
          
          {/* Status Badge */}
          <div className="mt-3 pt-3 border-t flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={hasClosed ? 'default' : hasShowed ? 'secondary' : 'outline'}>
              {getOutcomeLabel()}
            </Badge>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Attribution Path */}
        <div>
          <h4 className="text-sm font-semibold mb-4">Attribution Path</h4>
          <div className="flex items-center gap-2 flex-wrap">
            <AttributionNode 
              label="Traffic" 
              value={metadata.utm_platform} 
              type="traffic" 
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <AttributionNode 
              label="Source" 
              value={metadata.utm_source} 
              type="source" 
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <AttributionNode 
              label="Channel" 
              value={metadata.utm_channel} 
              type="channel" 
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <AttributionNode 
              label="Setter" 
              value={effectiveSetter} 
              type="setter" 
            />
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <AttributionNode 
              label="Closer" 
              value={effectiveCloser} 
              type="closer" 
            />
          </div>
          
          {/* UTM Tags */}
          {(metadata.utm_platform || metadata.utm_source || metadata.utm_campaign || metadata.utm_medium || metadata.utm_channel) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {metadata.utm_platform && (
                <UtmPlatformBadge platform={metadata.utm_platform} size="sm" />
              )}
              {metadata.utm_source && (
                <Badge variant="outline" className="text-xs">
                  source: {metadata.utm_source}
                </Badge>
              )}
              {metadata.utm_channel && (
                <Badge variant="outline" className="text-xs bg-cyan-50 border-cyan-200 dark:bg-cyan-950 dark:border-cyan-800">
                  channel: {metadata.utm_channel}
                </Badge>
              )}
              {metadata.utm_campaign && (
                <Badge variant="outline" className="text-xs">
                  campaign: {metadata.utm_campaign}
                </Badge>
              )}
              {metadata.utm_medium && (
                <Badge variant="outline" className="text-xs">
                  medium: {metadata.utm_medium}
                </Badge>
              )}
            </div>
          )}
        </div>

        <Separator className="my-6" />

        {/* Event Timeline */}
        <div>
          <h4 className="text-sm font-semibold mb-4">Event Timeline</h4>
          <div className="flex items-start justify-between px-4">
            <TimelineStep 
              label="Booked" 
              date={event.booked_at} 
              completed={isBooked} 
            />
            <div className="flex-1 h-0.5 bg-muted self-center mx-2 mt-[-12px]" />
            <TimelineStep 
              label="Showed" 
              date={hasShowed ? event.scheduled_at : undefined} 
              completed={!!hasShowed} 
            />
            <div className="flex-1 h-0.5 bg-muted self-center mx-2 mt-[-12px]" />
            <TimelineStep 
              label="Offer" 
              completed={!!hasOffer} 
            />
            <div className="flex-1 h-0.5 bg-muted self-center mx-2 mt-[-12px]" />
            <TimelineStep 
              label="Closed" 
              completed={!!hasClosed} 
            />
          </div>
        </div>

        {/* Booking Form Responses */}
        {responseEntries.length > 0 && (
          <>
            <Separator className="my-6" />
            <div>
              <h4 className="text-sm font-semibold mb-4">Booking Form Responses</h4>
              <Accordion type="single" collapsible className="w-full">
                {responseEntries.map(([question, answer], index) => (
                  <AccordionItem key={index} value={`item-${index}`}>
                    <AccordionTrigger className="text-sm text-left">
                      {formatQuestionLabel(question)}
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {formatAnswerValue(answer)}
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </>
        )}

        {/* New Sections: Lead History, Payments, Change History */}
        <Separator className="my-6" />

        {/* Lead History */}
        <Collapsible defaultOpen className="space-y-2">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
            <History className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Lead History</h4>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <LeadHistorySection 
              leadEmail={event.lead_email} 
              currentEventId={event.id} 
            />
          </CollapsibleContent>
        </Collapsible>

        <Separator className="my-6" />

        {/* Payment History */}
        <Collapsible defaultOpen className="space-y-2">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Payment History</h4>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <PaymentHistorySection eventId={event.id} />
          </CollapsibleContent>
        </Collapsible>

        <Separator className="my-6" />

        {/* Change History (Audit Trail) */}
        <Collapsible defaultOpen className="space-y-2">
          <CollapsibleTrigger className="flex items-center gap-2 w-full text-left hover:opacity-80 transition-opacity">
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Change History</h4>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <ChangeHistorySection eventId={event.id} />
          </CollapsibleContent>
        </Collapsible>
      </SheetContent>
    </Sheet>
  );
}

// Helper to format question labels from snake_case or camelCase
function formatQuestionLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

// Helper to format answer values
function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
