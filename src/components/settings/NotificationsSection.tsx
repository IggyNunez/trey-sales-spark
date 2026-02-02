import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bell, FileText, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';

export function NotificationsSection() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const orgId = currentOrganization?.id;

  const [testingDailyReport, setTestingDailyReport] = useState(false);
  const [testingOverduePCF, setTestingOverduePCF] = useState(false);
  const [dailyReportResult, setDailyReportResult] = useState<any>(null);
  const [overduePCFResult, setOverduePCFResult] = useState<any>(null);

  const testDailyReport = async () => {
    if (!orgId) {
      toast({ title: 'Error', description: 'No organization selected', variant: 'destructive' });
      return;
    }
    setTestingDailyReport(true);
    setDailyReportResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('slack-daily-report', {
        body: { organization_id: orgId, dry_run: true }
      });
      
      if (error) throw error;
      
      setDailyReportResult(data);
      toast({
        title: 'Daily Report Generated',
        description: 'Preview the message that would be sent to Slack',
      });
    } catch (err) {
      toast({
        title: 'Test Failed',
        description: err instanceof Error ? err.message : 'Could not generate report',
        variant: 'destructive',
      });
    } finally {
      setTestingDailyReport(false);
    }
  };

  const testOverduePCFReminder = async () => {
    if (!orgId) {
      toast({ title: 'Error', description: 'No organization selected', variant: 'destructive' });
      return;
    }
    setTestingOverduePCF(true);
    setOverduePCFResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('slack-overdue-pcf-reminder', {
        body: { organization_id: orgId, dry_run: true }
      });
      
      if (error) throw error;
      
      setOverduePCFResult(data);
      toast({
        title: 'Overdue PCF Check Complete',
        description: data.overdue_count === 0 ? 'No overdue forms found!' : `Found ${data.stats?.total_overdue || 0} overdue forms`,
      });
    } catch (err) {
      toast({
        title: 'Test Failed',
        description: err instanceof Error ? err.message : 'Could not check overdue PCFs',
        variant: 'destructive',
      });
    } finally {
      setTestingOverduePCF(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Slack Notifications</CardTitle>
            <CardDescription>
              Test Slack reports before connecting your webhook
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Daily Report Test */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">Daily Sales Report</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Preview the daily report that would be sent to Slack at 10 AM EST.
          </p>
          
          <Button 
            onClick={testDailyReport}
            disabled={testingDailyReport}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {testingDailyReport ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Test Daily Report
          </Button>

          {dailyReportResult && (
            <div className="mt-3 p-4 rounded-lg bg-muted/50 border space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-success/10 text-success border-success/20">
                  Preview
                </Badge>
                <span className="text-xs text-muted-foreground">This is what would be sent to Slack</span>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded bg-background border">
                  <p className="text-xs text-muted-foreground">Calls Booked Today</p>
                  <p className="text-2xl font-bold">{dailyReportResult.stats?.booked_calls || 0}</p>
                </div>
                <div className="p-3 rounded bg-background border">
                  <p className="text-xs text-muted-foreground">Cash Collected</p>
                  <p className="text-2xl font-bold">${(dailyReportResult.stats?.cash_collected || 0).toLocaleString()}</p>
                </div>
                <div className="p-3 rounded bg-background border">
                  <p className="text-xs text-muted-foreground">Scheduled Calls</p>
                  <p className="text-2xl font-bold">{dailyReportResult.stats?.scheduled_calls || 0}</p>
                </div>
                <div className="p-3 rounded bg-background border">
                  <p className="text-xs text-muted-foreground">Upcoming</p>
                  <p className="text-2xl font-bold">{dailyReportResult.stats?.upcoming_calls || 0}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Overdue PCF Test */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-medium">Overdue Post-Call Forms Reminder</h4>
          </div>
          <p className="text-sm text-muted-foreground">
            Preview the reminder that lists closers with overdue forms (sent every 4 hours).
          </p>
          
          <Button 
            onClick={testOverduePCFReminder}
            disabled={testingOverduePCF}
            variant="outline"
            className="w-full sm:w-auto"
          >
            {testingOverduePCF ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <AlertTriangle className="h-4 w-4 mr-2" />
            )}
            Test Overdue PCF Check
          </Button>

          {overduePCFResult && (
            <div className="mt-3 p-4 rounded-lg bg-muted/50 border space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className={overduePCFResult.overdue_count === 0 
                  ? "bg-success/10 text-success border-success/20"
                  : "bg-destructive/10 text-destructive border-destructive/20"
                }>
                  {overduePCFResult.overdue_count === 0 ? 'All Clear!' : 'Overdue Forms Found'}
                </Badge>
              </div>
              
              {overduePCFResult.stats?.closers && overduePCFResult.stats.closers.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    {overduePCFResult.stats.total_overdue} overdue forms from {overduePCFResult.stats.closers_with_overdue} closers:
                  </p>
                  <div className="space-y-1">
                    {overduePCFResult.stats.closers.map((closer: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center p-2 rounded bg-background border text-sm">
                        <span className="font-medium">{closer.name}</span>
                        <div className="text-right">
                          <span className="text-destructive font-medium">{closer.overdue_count} overdue</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            (oldest: {closer.oldest_overdue_relative})
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No overdue post-call forms found. Great job! 🎉
                </p>
              )}
            </div>
          )}
        </div>

        <Separator />

        {/* Setup Instructions */}
        <div className="p-4 rounded-lg bg-muted/30 border border-dashed space-y-2">
          <h4 className="font-medium text-sm">Ready to enable Slack notifications?</h4>
          <p className="text-xs text-muted-foreground">
            Once you're happy with the report formats, set up a Slack webhook to send these automatically:
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1">
            <li>Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">api.slack.com/apps</a></li>
            <li>Create a new app with Incoming Webhooks</li>
            <li>Add the webhook URL to your secrets</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
