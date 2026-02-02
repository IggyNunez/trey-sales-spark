import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { Download, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { LeadJourneySheet } from '@/components/dashboard/LeadJourneySheet';
import { exportToCSV } from '@/lib/exportUtils';
import type { CallsReportEvent } from '@/hooks/useCallsReport';

interface CallsEventTableProps {
  events: CallsReportEvent[];
}

const PAGE_SIZE = 25;

function getOutcomeBadge(outcome: string | null, callStatus: string) {
  if (outcome === 'deal_closed') {
    return <Badge className="bg-success/10 text-success border-success/20">Closed</Badge>;
  }
  if (outcome === 'no_deal') {
    return <Badge variant="secondary">No Deal</Badge>;
  }
  if (callStatus === 'no_show' || outcome === 'no_show') {
    return <Badge variant="destructive">No Show</Badge>;
  }
  if (callStatus === 'cancelled') {
    return <Badge variant="outline">Cancelled</Badge>;
  }
  return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
}

function formatCurrency(value: number): string {
  if (value === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export function CallsEventTable({ events }: CallsEventTableProps) {
  const [page, setPage] = useState(0);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const totalPages = Math.ceil(events.length / PAGE_SIZE);
  const paginatedEvents = events.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Build selected event object for LeadJourneySheet
  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    const event = events.find(e => e.id === selectedEventId);
    if (!event) return null;
    return {
      id: event.id,
      lead_name: event.lead_name,
      lead_email: event.lead_email,
      lead_phone: event.lead_phone,
      scheduled_at: event.scheduled_at,
      booked_at: event.booked_at,
      closer_name: event.closer_name,
      setter_name: event.setter_name,
      event_outcome: event.event_outcome,
      pcf_submitted: event.pcf_submitted,
      booking_platform: event.booking_platform,
      booking_metadata: { utm_platform: event.trafficSource, utm_campaign: event.utmCampaign },
    };
  }, [selectedEventId, events]);

  const handleExport = () => {
    const columns = [
      { key: 'lead_name', label: 'Lead Name' },
      { key: 'lead_email', label: 'Email' },
      { key: 'lead_phone', label: 'Phone' },
      { key: 'scheduled_at', label: 'Scheduled At', format: (v: unknown) => v ? format(new Date(v as string), 'yyyy-MM-dd HH:mm') : '' },
      { key: 'booked_at', label: 'Booked At', format: (v: unknown) => v ? format(new Date(v as string), 'yyyy-MM-dd HH:mm') : '' },
      { key: 'trafficSource', label: 'Traffic Source' },
      { key: 'utmCampaign', label: 'UTM Campaign' },
      { key: 'setter_name', label: 'Setter' },
      { key: 'closer_name', label: 'Closer' },
      { key: 'event_name', label: 'Event Type' },
      { key: 'event_outcome', label: 'Outcome' },
      { key: 'revenue', label: 'Revenue' },
      { key: 'pcf_submitted', label: 'PCF Submitted', format: (v: unknown) => v ? 'Yes' : 'No' },
      { key: 'booking_platform', label: 'Calendar' },
    ];

    exportToCSV(events, columns, `calls-report-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Event List</CardTitle>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No events found for the selected filters.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Setter</TableHead>
                      <TableHead>Closer</TableHead>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead>PCF</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell>
                          <button
                            className="text-left hover:underline text-primary font-medium flex items-center gap-1"
                            onClick={() => setSelectedEventId(event.id)}
                          >
                            {event.lead_name}
                            <ExternalLink className="h-3 w-3 opacity-50" />
                          </button>
                          <p className="text-xs text-muted-foreground">{event.lead_email}</p>
                        </TableCell>
                        <TableCell>
                          {event.trafficSource ? (
                            <Badge variant="outline">{event.trafficSource}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {event.setter_name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {event.closer_name || <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {format(new Date(event.scheduled_at), 'MMM d, yyyy')}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(event.scheduled_at), 'h:mm a')}
                          </p>
                        </TableCell>
                        <TableCell>
                          {getOutcomeBadge(event.event_outcome, event.call_status)}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(event.revenue)}
                        </TableCell>
                        <TableCell>
                          {event.pcf_submitted ? (
                            <Badge variant="secondary" className="text-xs">Done</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, events.length)} of {events.length.toLocaleString()}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm">
                      Page {page + 1} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Lead Journey Sheet */}
      {selectedEvent && (
        <LeadJourneySheet
          event={selectedEvent}
          open={!!selectedEventId}
          onOpenChange={(open) => !open && setSelectedEventId(null)}
        />
      )}
    </>
  );
}
