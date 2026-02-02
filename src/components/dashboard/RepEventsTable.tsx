import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText, Copy, Calendar, User, CheckCircle, Clock, XCircle, Target, ChevronRight, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { BookingPlatformBadge } from '@/components/ui/BookingPlatformBadge';
import { useQueryClient } from '@tanstack/react-query';

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
  event_name?: string | null;
  opportunity_status_name?: string | null;
  opportunity_status_color?: string | null;
  pcf_outcome_label?: string | null;
  close_custom_fields?: Record<string, string> | null;
  booking_platform?: string | null;
}

const platformColors: Record<string, string> = {
  Instagram: 'bg-pink-500/10 text-pink-600 border-pink-500/20',
  LinkedIn: 'bg-blue-600/10 text-blue-600 border-blue-600/20',
  X: 'bg-gray-800/10 text-gray-800 border-gray-800/20 dark:bg-gray-200/10 dark:text-gray-200 dark:border-gray-200/20',
  YouTube: 'bg-red-500/10 text-red-600 border-red-500/20',
  Newsletter: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  Facebook: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  TikTok: 'bg-purple-500/10 text-purple-600 border-purple-500/20',
};

interface RepEventsTableProps {
  events: Event[];
  onSubmitPCF: (event: Event) => void;
  showStatusActions?: boolean;
}

const outcomeLabels: Record<string, string> = {
  no_show: 'No Show',
  showed_no_offer: 'Showed - No Offer',
  showed_offer_no_close: 'Offer Made - No Close',
  closed: 'Closed ✓',
  completed: 'Completed',
  not_qualified: 'Not Qualified',
  lost: 'Lost',
  rescheduled: 'Rescheduled',
  canceled: 'Canceled',
};

const outcomeIcons: Record<string, React.ReactNode> = {
  no_show: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  showed_no_offer: <CheckCircle className="h-3.5 w-3.5 text-muted-foreground" />,
  showed_offer_no_close: <Target className="h-3.5 w-3.5 text-primary" />,
  closed: <CheckCircle className="h-3.5 w-3.5 text-success" />,
  completed: <CheckCircle className="h-3.5 w-3.5 text-success" />,
  not_qualified: <XCircle className="h-3.5 w-3.5 text-warning" />,
  lost: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  rescheduled: <RefreshCw className="h-3.5 w-3.5 text-warning" />,
  canceled: <XCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

// Format date in EST timezone
function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

export function RepEventsTable({ events, onSubmitPCF, showStatusActions = false }: RepEventsTableProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [updatingEventId, setUpdatingEventId] = useState<string | null>(null);

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
      await queryClient.invalidateQueries({ queryKey: ['rep-events'] });
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

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const isPending = !event.pcf_submitted;
        const isNoShow = event.event_outcome === 'no_show';
        const isClosed = event.event_outcome === 'closed';
        
        return (
          <div 
            key={event.id} 
            className={cn(
              "flex items-center gap-3 p-3 rounded-lg border bg-card transition-colors",
              isPending && "border-warning/30 bg-warning/5",
              isClosed && "border-success/30 bg-success/5"
            )}
          >
            {/* Left: Lead Info + Date */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <p className="font-semibold truncate">{event.lead_name}</p>
                {event.setter_name && (
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    via {event.setter_name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatInEST(event.scheduled_at, 'MMM d')} · {formatInEST(event.scheduled_at, 'h:mm a')}
                </span>
                {event.event_name && (
                  <span className="hidden md:inline truncate max-w-[150px]">
                    {event.event_name}
                  </span>
                )}
              </div>
            </div>

            {/* Center: Status Badges - Combined view */}
            <div className="hidden sm:flex items-center gap-2">
              {/* Booking Platform Badge */}
              <BookingPlatformBadge platform={event.booking_platform} className="text-xs" />
              
              {/* Platform Badge */}
              {event.close_custom_fields?.platform && (
                <Badge 
                  variant="outline" 
                  className={cn(
                    "text-xs",
                    platformColors[event.close_custom_fields.platform] || "bg-muted text-muted-foreground"
                  )}
                >
                  {event.close_custom_fields.platform}
                </Badge>
              )}
              
              {/* Status */}
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs capitalize",
                  event.call_status === 'completed' && "bg-success/10 text-success border-success/20",
                  event.call_status === 'scheduled' && "bg-info/10 text-info border-info/20",
                  event.call_status === 'canceled' && "bg-muted text-muted-foreground",
                  event.call_status === 'rescheduled' && "bg-warning/10 text-warning border-warning/20"
                )}
              >
                {event.call_status}
              </Badge>
              
              {/* Outcome - Show pcf_outcome_label first, then opportunity_status_name, then call_status */}
              {event.call_status && event.call_status !== 'scheduled' && (
                <div className="flex items-center gap-1 text-xs">
                  {event.pcf_outcome_label ? (
                    // Show the actual PCF outcome label saved from form
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      style={event.opportunity_status_color ? { 
                        borderColor: event.opportunity_status_color,
                        color: event.opportunity_status_color
                      } : undefined}
                    >
                      {event.pcf_outcome_label}
                    </Badge>
                  ) : event.opportunity_status_name ? (
                    // Fallback to opportunity_status_name from joined PCF data
                    <Badge 
                      variant="outline" 
                      className="text-xs"
                      style={event.opportunity_status_color ? { 
                        borderColor: event.opportunity_status_color,
                        color: event.opportunity_status_color
                      } : undefined}
                    >
                      {event.opportunity_status_name}
                    </Badge>
                  ) : (
                    // Final fallback to call_status with icons
                    <>
                      {outcomeIcons[event.call_status] || outcomeIcons[event.event_outcome!]}
                      <span className={cn(
                        event.call_status === 'completed' && "text-success font-medium",
                        event.call_status === 'no_show' && "text-destructive",
                        event.call_status === 'canceled' && "text-muted-foreground"
                      )}>
                        {outcomeLabels[event.call_status] || event.call_status.replace('_', ' ')}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Right: PCF Status + Action */}
            <div className="flex items-center gap-2">
              {/* PCF Badge - visible on mobile too */}
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  event.pcf_submitted 
                    ? "bg-success/10 text-success border-success/20" 
                    : "bg-warning/10 text-warning border-warning/20"
                )}
              >
                {event.pcf_submitted ? (
                  <><CheckCircle className="h-3 w-3 mr-1" />Done</>
                ) : (
                  <><Clock className="h-3 w-3 mr-1" />PCF</>
                )}
              </Badge>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {showStatusActions && event.call_status === 'scheduled' && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-8 w-8 p-0 text-warning hover:text-warning hover:bg-warning/10"
                    onClick={() => markAsRescheduled(event.id)}
                    disabled={updatingEventId === event.id}
                    title="Mark as Rescheduled"
                  >
                    <RefreshCw className={cn("h-4 w-4", updatingEventId === event.id && "animate-spin")} />
                  </Button>
                )}
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-8 w-8 p-0"
                  onClick={() => copyLink(event.id)}
                  title="Copy PCF link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
                
                <Button
                  variant={event.pcf_submitted ? "outline" : "default"} 
                  size="sm"
                  className={cn(
                    "gap-1",
                    !event.pcf_submitted && "bg-primary hover:bg-primary/90"
                  )}
                  onClick={() => onSubmitPCF(event)}
                >
                  <FileText className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {event.pcf_submitted ? 'Edit' : 'Fill PCF'}
                  </span>
                  <span className="sm:hidden">
                    {event.pcf_submitted ? 'Edit' : 'PCF'}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
