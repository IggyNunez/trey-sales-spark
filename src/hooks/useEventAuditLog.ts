import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AuditLogEntry {
  id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  user_email: string | null;
  created_at: string;
}

// Fields we care about showing in the audit trail
const TRACKED_FIELDS = [
  'event_outcome',
  'pcf_submitted',
  'closer_name',
  'setter_name',
  'notes',
  'call_status',
];

export interface FieldChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
}

export function parseFieldChanges(oldData: Record<string, unknown> | null, newData: Record<string, unknown> | null): FieldChange[] {
  if (!oldData || !newData) return [];

  const changes: FieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldVal = oldData[field];
    const newVal = newData[field];

    // Check if the value actually changed
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({
        field,
        oldValue: oldVal,
        newValue: newVal,
      });
    }
  }

  return changes;
}

export function useEventAuditLog(eventId: string | undefined) {
  return useQuery({
    queryKey: ['event-audit-log', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, action, old_data, new_data, user_email, created_at')
        .eq('table_name', 'events')
        .eq('record_id', eventId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching audit logs:', error);
        throw error;
      }

      return (data || []) as AuditLogEntry[];
    },
    enabled: !!eventId,
  });
}
