import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { Badge } from '@/components/ui/badge';
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Copy, ChevronRight, Calendar, User, RefreshCw, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { CRMType } from '@/hooks/useIntegrationConfig';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useState, useRef, useEffect, useCallback } from 'react';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { UtmPlatformBadge } from '@/components/ui/UtmPlatformBadge';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { getUnifiedSource, getOriginLabel } from '@/lib/unifiedSourceExtraction';

interface Event {
  id: string;
  lead_name: string;
  lead_email: string;
  scheduled_at: string;
  booked_at?: string | null;
  call_status: string;
  event_outcome: string | null;
  pcf_submitted: boolean;
  setter_name: string | null;
  closer_name?: string;
  closer_email?: string | null;
  closer_id?: string | null;
  call_type_id?: string | null;
  event_name?: string | null;
  ghl_contact_id?: string | null;
  lead_id?: string | null;
  lead_phone?: string | null;
  source?: { id: string; name: string } | null;
  traffic_type?: { id: string; name: string } | null;
  pcf_outcome_label?: string | null;
  booking_platform?: string | null;
  booking_metadata?: Record<string, unknown> | null;
  booking_responses?: Record<string, unknown> | null;
}

export interface DynamicColumn {
  field_key: string;
  display_label: string;
  field_source: 'booking_metadata' | 'booking_responses';
}

interface EventsTableProps {
  events: Event[];
  onViewEvent?: (event: Event) => void;
  onSubmitPCF?: (event: Event) => void;
  onLeadClick?: (event: Event) => void;
  showPCFAction?: boolean;
  showCloser?: boolean;
  showBookingDate?: boolean;
  /** Show unified Source column (merges UTM platform, CRM field, and lead source) */
  showSource?: boolean;
  showTrafficType?: boolean;
  showEventName?: boolean;
  /** Show quick status update buttons (like Mark as Rescheduled) */
  showStatusActions?: boolean;
  /** @deprecated Use crmType instead */
  showGHLStatus?: boolean;
  /** The organization's primary CRM type - controls which CRM column to show */
  crmType?: CRMType;
  /** Dynamic columns from event_display_columns configuration */
  dynamicColumns?: DynamicColumn[];
}

const statusColors: Record<string, string> = {
  scheduled: 'bg-info/10 text-info border-info/20',
  completed: 'bg-success/10 text-success border-success/20',
  no_show: 'bg-destructive/10 text-destructive border-destructive/20',
  canceled: 'bg-muted text-muted-foreground border-muted',
  rescheduled: 'bg-warning/10 text-warning border-warning/20',
};

const outcomeLabels: Record<string, string> = {
  no_show: 'No Show',
  showed_no_offer: 'Showed - No Offer',
  showed_offer_no_close: 'Offer Made - No Close',
  closed: 'Closed',
  not_qualified: 'Not Qualified',
  lost: 'Lost',
  rescheduled: 'Rescheduled',
  canceled: 'Canceled',
};

// Format date in EST timezone
function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

export function EventsTable({ 
  events, 
  onViewEvent, 
  onSubmitPCF,
  onLeadClick,
  showPCFAction = false,
  showCloser = false,
  showBookingDate = false,
  showSource = false,
  showTrafficType = false,
  showEventName = false,
  showStatusActions = false,
  showGHLStatus = false,
  crmType = 'none',
  dynamicColumns = [],
}: EventsTableProps) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);
  
  // Scroll state and refs for horizontal navigation (must be before early returns)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  
  // Drag-to-scroll state (pointer-based for reliability)
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{
    isDown: boolean;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
    pointerId: number | null;
  }>({ isDown: false, startX: 0, startScrollLeft: 0, moved: false, pointerId: null });

  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container) {
      setCanScrollLeft(container.scrollLeft > 0);
      setCanScrollRight(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Initial measurement after layout
    requestAnimationFrame(updateScrollButtons);

    // Listen for scroll
    container.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);

    // ResizeObserver for robust overflow detection
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateScrollButtons);
    });
    resizeObserver.observe(container);

    return () => {
      container.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
      resizeObserver.disconnect();
    };
  }, [updateScrollButtons, events, dynamicColumns]);

  const scrollLeft = () => {
    scrollContainerRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
  };

  const scrollRight = () => {
    scrollContainerRef.current?.scrollBy({ left: 300, behavior: 'smooth' });
  };

  // Drag-to-scroll handlers (Pointer Events + pointer capture)
  const DRAG_THRESHOLD_PX = 4;

  const stopDrag = () => {
    const container = scrollContainerRef.current;
    const pointerId = dragRef.current.pointerId;

    dragRef.current.isDown = false;
    dragRef.current.pointerId = null;
    dragRef.current.moved = false;
    setIsDragging(false);

    if (container && pointerId != null) {
      try {
        container.releasePointerCapture(pointerId);
      } catch {
        // ignore
      }
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left click only for mouse; allow touch/pen
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    // Don't start drag if clicking on a button or interactive element
    if (
      (e.target as HTMLElement).closest(
        'button, a, input, textarea, select, [role="button"], [data-no-drag="true"]'
      )
    ) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container) return;
    if (container.scrollWidth <= container.clientWidth + 1) return;

    dragRef.current.isDown = true;
    dragRef.current.startX = e.clientX;
    dragRef.current.startScrollLeft = container.scrollLeft;
    dragRef.current.moved = false;
    dragRef.current.pointerId = e.pointerId;

    setIsDragging(true);
    container.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const container = scrollContainerRef.current;
    if (!container || !dragRef.current.isDown) return;

    const dx = e.clientX - dragRef.current.startX;
    if (!dragRef.current.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;

    dragRef.current.moved = true;
    container.scrollLeft = dragRef.current.startScrollLeft - dx;
  };

  const handlePointerUp = () => stopDrag();
  const handlePointerCancel = () => stopDrag();
  
  // Show CRM column only if a CRM is configured
  const showCRMColumn = crmType !== 'none';
  const crmLabel = crmType === 'ghl' ? 'GHL' : crmType === 'close' ? 'Close' : '';
  
  // Get CRM ID based on CRM type
  const getCRMId = (event: Event) => {
    if (crmType === 'ghl') return event.ghl_contact_id;
    if (crmType === 'close') return event.lead_id;
    return null;
  };

  const copyLink = (eventId: string) => {
    const url = `${window.location.origin}/pcf/${eventId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'Link Copied',
      description: 'PCF link copied to clipboard',
    });
  };

  const markAsRescheduled = async (eventId: string) => {
    setUpdatingEventId(eventId);
    try {
      const { error } = await supabase
        .from('events')
        .update({ 
          call_status: 'rescheduled',
          pcf_submitted: true 
        })
        .eq('id', eventId);
      
      if (error) throw error;
      
      await queryClient.invalidateQueries({ queryKey: ['events'] });
      toast({
        title: 'Status Updated',
        description: 'Event marked as rescheduled',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    } finally {
      setUpdatingEventId(null);
    }
  };

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <FileText className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="font-medium text-lg">No events found</h3>
        <p className="text-sm text-muted-foreground mt-1">Events will appear here once they are scheduled</p>
      </div>
    );
  }

  // Mobile card view
  if (isMobile) {
    return (
      <div className="space-y-3">
        {events.map((event) => (
          <Card key={event.id} className="overflow-hidden">
            <CardContent className="p-4">
              {/* Lead info and status */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate text-base">{event.lead_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{event.lead_email}</p>
                </div>
                <Badge variant="outline" className={cn("capitalize shrink-0 text-xs", statusColors[event.call_status])}>
                  {event.call_status.replace('_', ' ')}
                </Badge>
              </div>
              
              {/* Event details */}
              <div className="space-y-2 text-sm mb-3">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  <span>{formatInEST(event.scheduled_at, 'MMM d, yyyy · h:mm a')}</span>
                </div>
                {showCloser && event.closer_name && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{event.closer_name}</span>
                  </div>
                )}
                {event.event_name && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <FileText className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{event.event_name}</span>
                  </div>
                )}
              </div>

              {/* Badges row */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                <BookingPlatformBadge platform={event.booking_platform} />
                {showCRMColumn && (
                  getCRMId(event) ? (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">
                      {crmLabel} ✓
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-muted text-muted-foreground border-muted text-xs">
                      No {crmLabel}
                    </Badge>
                  )
                )}
                {event.pcf_submitted ? (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">
                    PCF Done
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20 text-xs">
                    PCF Pending
                  </Badge>
                )}
                {event.call_status && event.call_status !== 'scheduled' && (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {event.pcf_outcome_label || event.call_status.replace('_', ' ')}
                  </Badge>
                )}
                {showTrafficType && event.traffic_type?.name && (
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-xs",
                      event.traffic_type.name.toLowerCase() === 'paid' 
                        ? "bg-warning/10 text-warning border-warning/20"
                        : "bg-success/10 text-success border-success/20"
                    )}
                  >
                    {event.traffic_type.name}
                  </Badge>
                )}
              </div>

              {/* Action buttons - full width for better touch targets */}
              <div className="flex flex-col gap-2">
                {showPCFAction && onSubmitPCF && (
                  <Button 
                    variant={event.pcf_submitted ? "outline" : "default"} 
                    size="lg"
                    className="w-full h-12"
                    onClick={() => onSubmitPCF(event)}
                  >
                    <FileText className="h-5 w-5 mr-2" />
                    {event.pcf_submitted ? 'Edit PCF' : 'Submit PCF'}
                  </Button>
                )}
                <div className="flex gap-2">
                  {showStatusActions && event.call_status === 'scheduled' && (
                    <Button 
                      variant="outline" 
                      size="default"
                      className="h-11 px-3 text-warning border-warning/30 hover:bg-warning/10"
                      onClick={() => markAsRescheduled(event.id)}
                      disabled={updatingEventId === event.id}
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-1", updatingEventId === event.id && "animate-spin")} />
                      Resched.
                    </Button>
                  )}
                  {onViewEvent && (
                    <Button variant="outline" size="default" className="flex-1 h-11" onClick={() => onViewEvent(event)}>
                      Open
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="default"
                    className="h-11 px-4"
                    onClick={() => copyLink(event.id)}
                  >
                    <Copy className="h-4 w-4 mr-1" />
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Desktop table view - with horizontal scroll
  return (
    <div className="rounded-lg border bg-card w-full relative group">
      {/* Left scroll button - always visible when scrollable */}
      {canScrollLeft && (
        <button
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-r from-card via-card/80 to-transparent opacity-60 hover:opacity-100 transition-opacity flex items-center"
          aria-label="Scroll left"
          data-no-drag="true"
        >
          <div className="rounded-full bg-muted/90 p-1.5 shadow-sm border">
            <ChevronLeft className="h-4 w-4" />
          </div>
        </button>
      )}
      
      {/* Right scroll button - always visible when scrollable */}
      {canScrollRight && (
        <button
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 z-10 h-full px-2 bg-gradient-to-l from-card via-card/80 to-transparent opacity-60 hover:opacity-100 transition-opacity flex items-center"
          aria-label="Scroll right"
          data-no-drag="true"
        >
          <div className="rounded-full bg-muted/90 p-1.5 shadow-sm border">
            <ChevronRight className="h-4 w-4" />
          </div>
        </button>
      )}
      
      <div 
        ref={scrollContainerRef} 
        className={cn(
          "overflow-x-auto touch-pan-y",
          isDragging ? "cursor-grabbing select-none" : "cursor-grab"
        )}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
      >
        {/* Plain <table> - no wrapper from Table component to avoid nested scroll containers */}
        <table className="w-full min-w-max caption-bottom text-sm">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Lead</TableHead>
            {showEventName && <TableHead>Event</TableHead>}
            {showBookingDate && <TableHead>Booked (EST)</TableHead>}
            <TableHead>Scheduled (EST)</TableHead>
            {showCloser && <TableHead>Closer</TableHead>}
            <TableHead>Setter</TableHead>
            <TableHead>Booking</TableHead>
            {showSource && <TableHead>Source</TableHead>}
            {showTrafficType && <TableHead>Traffic Type</TableHead>}
            {showCRMColumn && <TableHead>{crmLabel}</TableHead>}
            {/* Dynamic columns from configuration */}
            {dynamicColumns.map(col => (
              <TableHead key={col.field_key}>{col.display_label}</TableHead>
            ))}
            <TableHead>Status</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>PCF</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {events.map((event) => (
            <TableRow key={event.id}>
              <TableCell>
                <div>
                  <p 
                    className={cn(
                      "font-medium",
                      onLeadClick && "cursor-pointer hover:text-primary hover:underline"
                    )}
                    data-no-drag="true"
                    onClick={(e) => {
                      if (onLeadClick) {
                        e.stopPropagation();
                        onLeadClick(event);
                      }
                    }}
                  >
                    {event.lead_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{event.lead_email}</p>
                </div>
              </TableCell>
              {showEventName && (
                <TableCell>
                  <span className="text-sm">{event.event_name || '—'}</span>
                </TableCell>
              )}
              {showBookingDate && (
                <TableCell>
                  <div>
                    <p className="text-sm font-medium">
                      {event.booked_at ? formatInEST(event.booked_at, 'MMM d, yyyy') : '—'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {event.booked_at ? formatInEST(event.booked_at, 'h:mm a') : ''}
                    </p>
                  </div>
                </TableCell>
              )}
              <TableCell>
                <div>
                  <p className="font-medium">{formatInEST(event.scheduled_at, 'MMM d, yyyy')}</p>
                  <p className="text-sm text-muted-foreground">{formatInEST(event.scheduled_at, 'h:mm a')}</p>
                </div>
              </TableCell>
              {showCloser && (
                <TableCell>
                  <span className="text-sm font-medium">{event.closer_name || '—'}</span>
                </TableCell>
              )}
              <TableCell>
                <span className="text-sm">{event.setter_name || '—'}</span>
              </TableCell>
              <TableCell>
                <BookingPlatformBadge platform={event.booking_platform} />
              </TableCell>
              {showSource && (
                <TableCell>
                  {(() => {
                    const { value, origin } = getUnifiedSource(event);
                    if (!value) return <span className="text-sm text-muted-foreground">—</span>;
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <UtmPlatformBadge platform={value} size="sm" showCanonical />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Source: {getOriginLabel(origin)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}
                </TableCell>
              )}
              {showTrafficType && (
                <TableCell>
                  {event.traffic_type?.name ? (
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs",
                        event.traffic_type.name.toLowerCase() === 'paid' 
                          ? "bg-warning/10 text-warning border-warning/20"
                          : "bg-success/10 text-success border-success/20"
                      )}
                    >
                      {event.traffic_type.name}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {showCRMColumn && (
                <TableCell>
                  {getCRMId(event) ? (
                    <Badge variant="outline" className="bg-success/10 text-success border-success/20 text-xs">
                      ✓ Linked
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              {/* Dynamic columns from configuration */}
              {dynamicColumns.map(col => {
                const sourceData = col.field_source === 'booking_metadata' 
                  ? event.booking_metadata 
                  : event.booking_responses;
                const value = sourceData?.[col.field_key];
                
                return (
                  <TableCell key={col.field_key}>
                    {value ? (
                      col.field_key.startsWith('utm_') ? (
                        <UtmPlatformBadge platform={String(value)} size="sm" showCanonical />
                      ) : (
                        <span className="text-sm">{String(value)}</span>
                      )
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                );
              })}
              <TableCell>
                <Badge variant="outline" className={cn("capitalize", statusColors[event.call_status])}>
                  {event.call_status.replace('_', ' ')}
                </Badge>
              </TableCell>
              <TableCell>
                {event.call_status && event.call_status !== 'scheduled' ? (
                  <Badge variant="secondary" className="text-xs capitalize">
                    {event.pcf_outcome_label || event.call_status.replace('_', ' ')}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                {event.pcf_submitted ? (
                  <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                    Submitted
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20">
                    Pending
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {showStatusActions && event.call_status === 'scheduled' && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => markAsRescheduled(event.id)}
                      disabled={updatingEventId === event.id}
                      title="Mark as Rescheduled"
                      className="text-warning hover:text-warning hover:bg-warning/10"
                    >
                      <RefreshCw className={cn("h-4 w-4", updatingEventId === event.id && "animate-spin")} />
                    </Button>
                  )}
                  {onViewEvent && (
                    <Button variant="outline" size="sm" onClick={() => onViewEvent(event)}>
                      Open
                    </Button>
                  )}
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => copyLink(event.id)}
                    title="Copy PCF link"
                  >
                    <Copy className="h-4 w-4" />
                    <span className="ml-1 text-xs">Copy link</span>
                  </Button>
                  {showPCFAction && onSubmitPCF && (
                    <Button 
                      variant={event.pcf_submitted ? "ghost" : "outline"} 
                      size="sm" 
                      onClick={() => onSubmitPCF(event)}
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      {event.pcf_submitted ? 'Edit' : 'PCF'}
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        </table>
      </div>
    </div>
  );
}
