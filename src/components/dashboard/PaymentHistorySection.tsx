import { format } from 'date-fns';
import { DollarSign, CreditCard, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeadPayments } from '@/hooks/useLeadPayments';
import { cn } from '@/lib/utils';

interface PaymentHistorySectionProps {
  eventId: string;
}

export function PaymentHistorySection({ eventId }: PaymentHistorySectionProps) {
  const { data: payments, isLoading } = useLeadPayments(eventId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No payments recorded</p>
      </div>
    );
  }

  // Calculate totals
  const totalAmount = payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalRefunds = payments.reduce((sum, p) => sum + (p.refund_amount || 0), 0);
  const netRevenue = totalAmount - totalRefunds;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 p-3 text-center">
          <DollarSign className="h-4 w-4 mx-auto text-green-600 dark:text-green-400 mb-1" />
          <div className="text-lg font-semibold text-green-700 dark:text-green-300">
            ${totalAmount.toLocaleString()}
          </div>
          <div className="text-xs text-green-600 dark:text-green-400">Collected</div>
        </div>
        
        {totalRefunds > 0 && (
          <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-3 text-center">
            <RefreshCw className="h-4 w-4 mx-auto text-red-600 dark:text-red-400 mb-1" />
            <div className="text-lg font-semibold text-red-700 dark:text-red-300">
              -${totalRefunds.toLocaleString()}
            </div>
            <div className="text-xs text-red-600 dark:text-red-400">Refunded</div>
          </div>
        )}
        
        <div className={cn(
          "rounded-lg p-3 text-center border",
          totalRefunds > 0 
            ? "bg-muted/50 border-border" 
            : "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800"
        )}>
          <DollarSign className={cn(
            "h-4 w-4 mx-auto mb-1",
            totalRefunds > 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"
          )} />
          <div className={cn(
            "text-lg font-semibold",
            totalRefunds > 0 ? "text-foreground" : "text-green-700 dark:text-green-300"
          )}>
            ${netRevenue.toLocaleString()}
          </div>
          <div className={cn(
            "text-xs",
            totalRefunds > 0 ? "text-muted-foreground" : "text-green-600 dark:text-green-400"
          )}>
            Net
          </div>
        </div>
      </div>

      {/* Payment List */}
      <div className="space-y-2">
        {payments.map((payment) => (
          <div 
            key={payment.id} 
            className="flex items-center justify-between p-3 rounded-lg border bg-card"
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center",
                payment.refund_amount && payment.refund_amount > 0
                  ? "bg-amber-100 dark:bg-amber-950"
                  : "bg-green-100 dark:bg-green-950"
              )}>
                <DollarSign className={cn(
                  "h-4 w-4",
                  payment.refund_amount && payment.refund_amount > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-green-600 dark:text-green-400"
                )} />
              </div>
              <div>
                <div className="font-medium">
                  ${(payment.amount || 0).toLocaleString()}
                </div>
                {payment.payment_date && (
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(payment.payment_date), 'MMM d, yyyy')}
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              {payment.payment_type && (
                <Badge variant="outline" className="text-xs">
                  {payment.payment_type}
                </Badge>
              )}
              {payment.refund_amount && payment.refund_amount > 0 && (
                <div className="text-xs text-red-600 dark:text-red-400 mt-1">
                  Refund: ${payment.refund_amount.toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
