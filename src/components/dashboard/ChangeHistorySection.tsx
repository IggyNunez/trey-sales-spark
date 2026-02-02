import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';
import { History, ArrowRight, User, Bot } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useEventAuditLog, parseFieldChanges } from '@/hooks/useEventAuditLog';
import { cn } from '@/lib/utils';

interface ChangeHistorySectionProps {
  eventId: string;
}

function formatInEST(dateString: string, formatStr: string): string {
  const date = new Date(dateString);
  const estDate = toZonedTime(date, 'America/New_York');
  return format(estDate, formatStr);
}

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/^\w/, c => c.toUpperCase());
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ChangeHistorySection({ eventId }: ChangeHistorySectionProps) {
  const { data: auditLogs, isLoading } = useEventAuditLog(eventId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!auditLogs || auditLogs.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No changes recorded</p>
      </div>
    );
  }

  // Filter to only UPDATE actions with meaningful changes
  const meaningfulLogs = auditLogs
    .filter(log => log.action === 'UPDATE')
    .map(log => ({
      ...log,
      changes: parseFieldChanges(
        log.old_data as Record<string, unknown> | null, 
        log.new_data as Record<string, unknown> | null
      ),
    }))
    .filter(log => log.changes.length > 0);

  if (meaningfulLogs.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No tracked field changes</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground mb-2">
        {meaningfulLogs.length} change{meaningfulLogs.length !== 1 ? 's' : ''} recorded
      </p>
      
      <div className="space-y-3">
        {meaningfulLogs.map((log) => (
          <div key={log.id} className="rounded-lg border bg-card p-3">
            {/* Header with timestamp and user */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {log.user_email ? (
                  <>
                    <User className="h-3 w-3" />
                    <span className="font-medium text-foreground">{log.user_email}</span>
                  </>
                ) : (
                  <>
                    <Bot className="h-3 w-3" />
                    <span className="font-medium text-foreground">System</span>
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {formatInEST(log.created_at, 'MMM d, h:mm a')}
              </span>
            </div>
            
            {/* Changes */}
            <div className="space-y-1.5">
              {log.changes.map((change, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1.5"
                >
                  <span className="font-medium text-muted-foreground shrink-0">
                    {formatFieldName(change.field)}:
                  </span>
                  <span className={cn(
                    "text-red-600 dark:text-red-400 line-through truncate",
                    change.oldValue === null || change.oldValue === undefined ? "opacity-50" : ""
                  )}>
                    {formatValue(change.oldValue)}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-green-600 dark:text-green-400 font-medium truncate">
                    {formatValue(change.newValue)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
