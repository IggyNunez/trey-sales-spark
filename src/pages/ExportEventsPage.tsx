import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Download, Loader2, CheckCircle } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';

interface EventRow {
  id: string;
  event_name: string | null;
  lead_name: string;
  lead_email: string;
  lead_phone: string | null;
  scheduled_at: string;
  booked_at: string | null;
  call_status: string;
  event_outcome: string | null;
  closer_name: string | null;
  closer_email: string | null;
  setter_name: string | null;
  notes: string | null;
  pcf_submitted: boolean;
}

export default function ExportEventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloaded, setDownloaded] = useState(false);
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;

  useEffect(() => {
    async function fetchEvents() {
      // SECURITY: Require org to be selected before fetching
      if (!orgId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('events')
        .select(`
          id,
          event_name,
          lead_name,
          lead_email,
          lead_phone,
          scheduled_at,
          booked_at,
          call_status,
          event_outcome,
          closer_name,
          closer_email,
          setter_name,
          notes,
          pcf_submitted
        `)
        .eq('organization_id', orgId)
        .gte('scheduled_at', '2026-01-01')
        .lt('scheduled_at', '2026-02-01')
        .order('scheduled_at', { ascending: true });

      if (!error && data) {
        setEvents(data);
      }
      setLoading(false);
    }
    fetchEvents();
  }, [orgId]);

  const downloadCSV = () => {
    const headers = [
      'ID',
      'Event Name',
      'Lead Name',
      'Lead Email',
      'Lead Phone',
      'Scheduled At',
      'Booked At',
      'Call Status',
      'Event Outcome',
      'Closer Name',
      'Closer Email',
      'Setter Name',
      'Notes',
      'PCF Submitted'
    ];

    const escapeCSV = (value: string | null | boolean | undefined): string => {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = events.map(event => [
      escapeCSV(event.id),
      escapeCSV(event.event_name),
      escapeCSV(event.lead_name),
      escapeCSV(event.lead_email),
      escapeCSV(event.lead_phone),
      escapeCSV(event.scheduled_at),
      escapeCSV(event.booked_at),
      escapeCSV(event.call_status),
      escapeCSV(event.event_outcome),
      escapeCSV(event.closer_name),
      escapeCSV(event.closer_email),
      escapeCSV(event.setter_name),
      escapeCSV(event.notes),
      escapeCSV(event.pcf_submitted)
    ].join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const orgName = currentOrganization?.name?.toLowerCase().replace(/\s+/g, '-') || 'events';
    link.download = `${orgName}-events-january-2026.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setDownloaded(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="bg-card border rounded-lg p-8 max-w-md w-full text-center space-y-6">
        <h1 className="text-2xl font-bold">Export Events</h1>
        <p className="text-muted-foreground">
          {currentOrganization?.name || 'Organization'} - January 2026
        </p>
        
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading {events.length} events...</span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-lg font-medium">
              {events.length} events ready for export
            </p>
            
            <Button 
              onClick={downloadCSV} 
              size="lg" 
              className="w-full"
              variant={downloaded ? "outline" : "default"}
            >
              {downloaded ? (
                <>
                  <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
                  Downloaded! Click to download again
                </>
              ) : (
                <>
                  <Download className="mr-2 h-5 w-5" />
                  Download CSV
                </>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
