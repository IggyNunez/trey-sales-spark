import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import {
  Bell,
  Plus,
  MoreVertical,
  Pencil,
  Trash2,
  Play,
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  MessageSquare,
  Loader2,
  Zap,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  useDatasetAlerts,
  useCreateDatasetAlert,
  useUpdateDatasetAlert,
  useDeleteDatasetAlert,
  useToggleDatasetAlert,
  useTestAlert,
  DatasetAlert,
  AlertCondition,
  NotificationConfig,
  ALERT_OPERATORS,
  NOTIFICATION_TYPES,
  AGGREGATION_TYPES,
  TIME_WINDOWS,
  NotificationType,
  AggregationType,
  AlertOperator,
} from '@/hooks/useDatasetAlerts';
import { useDatasetFields } from '@/hooks/useWebhookDashboard';
import { useCalculatedFields } from '@/hooks/useCalculatedFields';

interface AlertsManagerProps {
  datasetId: string;
  datasetName: string;
}

export function AlertsManager({ datasetId, datasetName }: AlertsManagerProps) {
  const { data: alerts = [], isLoading } = useDatasetAlerts(datasetId);
  const { data: datasetFields = [] } = useDatasetFields(datasetId);
  const { data: calculatedFields = [] } = useCalculatedFields(datasetId);
  
  const createAlert = useCreateDatasetAlert();
  const updateAlert = useUpdateDatasetAlert();
  const deleteAlert = useDeleteDatasetAlert();
  const toggleAlert = useToggleDatasetAlert();
  const testAlert = useTestAlert();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAlert, setEditingAlert] = useState<DatasetAlert | null>(null);
  const [activeTab, setActiveTab] = useState('condition');

  // Form state
  const [name, setName] = useState('');
  const [field, setField] = useState('');
  const [operator, setOperator] = useState<AlertOperator>('>');
  const [value, setValue] = useState('');
  const [aggregation, setAggregation] = useState<AggregationType>('VALUE');
  const [timeWindow, setTimeWindow] = useState('all');
  const [notificationType, setNotificationType] = useState<NotificationType>('in_app');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [slackChannel, setSlackChannel] = useState('');
  const [emailAddresses, setEmailAddresses] = useState('');
  const [inAppTitle, setInAppTitle] = useState('');
  const [inAppMessage, setInAppMessage] = useState('');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');

  // Combine regular fields and calculated fields
  const allFields = [
    ...datasetFields.map(f => ({ slug: f.field_slug, name: f.field_name, type: 'field' })),
    ...calculatedFields.filter(f => f.is_active).map(f => ({ slug: f.field_slug, name: f.display_name, type: 'calculated' })),
  ];

  const resetForm = () => {
    setName('');
    setField('');
    setOperator('>');
    setValue('');
    setAggregation('VALUE');
    setTimeWindow('all');
    setNotificationType('in_app');
    setSlackWebhookUrl('');
    setSlackChannel('');
    setEmailAddresses('');
    setInAppTitle('');
    setInAppMessage('');
    setCooldownMinutes('60');
    setActiveTab('condition');
  };

  const openCreateDialog = () => {
    setEditingAlert(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (alert: DatasetAlert) => {
    setEditingAlert(alert);
    setName(alert.name);
    setField(alert.condition.field);
    setOperator(alert.condition.operator);
    setValue(String(alert.condition.value));
    setAggregation(alert.condition.aggregation || 'VALUE');
    setTimeWindow(alert.condition.time_window || 'all');
    setNotificationType(alert.notification_type);
    setSlackWebhookUrl(alert.notification_config.slack_webhook_url || '');
    setSlackChannel(alert.notification_config.slack_channel || '');
    setEmailAddresses(alert.notification_config.email_addresses?.join(', ') || '');
    setInAppTitle(alert.notification_config.in_app_title || '');
    setInAppMessage(alert.notification_config.in_app_message || '');
    setCooldownMinutes(String(alert.notification_config.cooldown_minutes || 60));
    setActiveTab('condition');
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter an alert name');
      return;
    }
    if (!field) {
      toast.error('Please select a field to monitor');
      return;
    }
    if (!value.trim()) {
      toast.error('Please enter a threshold value');
      return;
    }

    // Validate Slack webhook URL format
    if (notificationType === 'slack' && slackWebhookUrl) {
      const slackUrlPattern = /^https:\/\/hooks\.slack\.com\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[a-zA-Z0-9]+$/;
      if (!slackUrlPattern.test(slackWebhookUrl)) {
        toast.error('Invalid Slack webhook URL format. It should start with https://hooks.slack.com/services/');
        return;
      }
    }

    // Validate email addresses format
    if (notificationType === 'email' && emailAddresses) {
      const emails = emailAddresses.split(',').map(e => e.trim()).filter(Boolean);
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const invalidEmails = emails.filter(email => !emailPattern.test(email));
      if (invalidEmails.length > 0) {
        toast.error(`Invalid email address(es): ${invalidEmails.join(', ')}`);
        return;
      }
    }

    // Validate cooldown minutes is a positive number
    const cooldown = parseInt(cooldownMinutes);
    if (isNaN(cooldown) || cooldown < 1 || cooldown > 1440) {
      toast.error('Cooldown must be between 1 and 1440 minutes');
      return;
    }

    const condition: AlertCondition = {
      field,
      operator,
      value: isNaN(Number(value)) ? value : Number(value),
      aggregation,
      time_window: timeWindow as AlertCondition['time_window'],
    };

    const notificationConfig: NotificationConfig = {
      cooldown_minutes: parseInt(cooldownMinutes) || 60,
    };

    if (notificationType === 'slack') {
      notificationConfig.slack_webhook_url = slackWebhookUrl;
      notificationConfig.slack_channel = slackChannel;
    } else if (notificationType === 'email') {
      notificationConfig.email_addresses = emailAddresses.split(',').map(e => e.trim()).filter(Boolean);
    } else {
      notificationConfig.in_app_title = inAppTitle || name;
      notificationConfig.in_app_message = inAppMessage || `Alert triggered: ${name}`;
    }

    try {
      if (editingAlert) {
        await updateAlert.mutateAsync({
          id: editingAlert.id,
          name,
          condition,
          notification_type: notificationType,
          notification_config: notificationConfig,
        });
        toast.success('Alert updated');
      } else {
        await createAlert.mutateAsync({
          dataset_id: datasetId,
          name,
          condition,
          notification_type: notificationType,
          notification_config: notificationConfig,
        });
        toast.success('Alert created');
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast.error('Failed to save alert');
      console.error('Alert save error:', error);
    }
  };

  const handleDelete = async (alert: DatasetAlert) => {
    if (!confirm(`Delete alert "${alert.name}"?`)) return;
    
    try {
      await deleteAlert.mutateAsync({ id: alert.id, datasetId: alert.dataset_id });
      toast.success('Alert deleted');
    } catch (error) {
      toast.error('Failed to delete alert');
    }
  };

  const handleToggle = async (alert: DatasetAlert) => {
    try {
      await toggleAlert.mutateAsync({
        id: alert.id,
        is_active: !alert.is_active,
        datasetId: alert.dataset_id,
      });
      toast.success(alert.is_active ? 'Alert paused' : 'Alert activated');
    } catch (error) {
      toast.error('Failed to toggle alert');
    }
  };

  const handleTest = async (alert: DatasetAlert) => {
    try {
      const result = await testAlert.mutateAsync(alert.id);
      if (result.triggered) {
        toast.success(`Alert would trigger! Current value: ${result.current_value}`);
      } else {
        toast.info(`Alert would NOT trigger. Current value: ${result.current_value}, threshold: ${alert.condition.value}`);
      }
    } catch (error) {
      toast.error('Failed to test alert');
    }
  };

  const getNotificationIcon = (type: NotificationType) => {
    switch (type) {
      case 'slack': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'in_app': return <Bell className="h-4 w-4" />;
    }
  };

  const formatCondition = (condition: AlertCondition) => {
    const opLabel = ALERT_OPERATORS.find(o => o.id === condition.operator)?.label || condition.operator;
    const aggLabel = condition.aggregation && condition.aggregation !== 'VALUE' 
      ? `${condition.aggregation}(${condition.field})` 
      : condition.field;
    return `${aggLabel} ${opLabel} ${condition.value}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Alerts
              </CardTitle>
              <CardDescription>
                Get notified when your data meets specific conditions
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              New Alert
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed rounded-lg">
              <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">No alerts configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Create alerts to monitor your {datasetName} data
              </p>
              <Button variant="outline" onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-2" />
                Create First Alert
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>Notification</TableHead>
                  <TableHead>Last Triggered</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {alerts.map((alert) => (
                  <TableRow key={alert.id}>
                    <TableCell className="font-medium">{alert.name}</TableCell>
                    <TableCell>
                      <code className="text-xs bg-muted px-2 py-1 rounded">
                        {formatCondition(alert.condition)}
                      </code>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {getNotificationIcon(alert.notification_type)}
                        {alert.notification_type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {alert.last_triggered_at ? (
                        <span className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatDistanceToNow(new Date(alert.last_triggered_at), { addSuffix: true })}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">Never</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={alert.is_active}
                        onCheckedChange={() => handleToggle(alert)}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleTest(alert)}>
                            <Play className="h-4 w-4 mr-2" />
                            Test Alert
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEditDialog(alert)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDelete(alert)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              {editingAlert ? 'Edit Alert' : 'Create Alert'}
            </DialogTitle>
            <DialogDescription>
              Configure when and how you want to be notified
            </DialogDescription>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="condition">Condition</TabsTrigger>
              <TabsTrigger value="notification">Notification</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>

            <TabsContent value="condition" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="name">Alert Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., High Revenue Alert"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Field to Monitor</Label>
                  <Select value={field} onValueChange={setField}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      {allFields.map((f) => (
                        <SelectItem key={f.slug} value={f.slug}>
                          {f.name}
                          {f.type === 'calculated' && (
                            <Badge variant="secondary" className="ml-2 text-xs">calc</Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Aggregation</Label>
                  <Select value={aggregation} onValueChange={(v) => setAggregation(v as AggregationType)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AGGREGATION_TYPES.map((agg) => (
                        <SelectItem key={agg.id} value={agg.id}>{agg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Operator</Label>
                  <Select value={operator} onValueChange={(v) => setOperator(v as AlertOperator)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALERT_OPERATORS.map((op) => (
                        <SelectItem key={op.id} value={op.id}>{op.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Threshold Value</Label>
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g., 1000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Time Window</Label>
                <Select value={timeWindow} onValueChange={setTimeWindow}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_WINDOWS.map((tw) => (
                      <SelectItem key={tw.id} value={tw.id}>{tw.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="notification" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Notification Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {NOTIFICATION_TYPES.map((type) => (
                    <Button
                      key={type.id}
                      type="button"
                      variant={notificationType === type.id ? 'default' : 'outline'}
                      className="h-auto py-4 flex flex-col items-center gap-2"
                      onClick={() => setNotificationType(type.id)}
                    >
                      {type.id === 'slack' && <MessageSquare className="h-5 w-5" />}
                      {type.id === 'email' && <Mail className="h-5 w-5" />}
                      {type.id === 'in_app' && <Bell className="h-5 w-5" />}
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {notificationType === 'slack' && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Slack Webhook URL</Label>
                    <Input
                      type="url"
                      value={slackWebhookUrl}
                      onChange={(e) => setSlackWebhookUrl(e.target.value)}
                      placeholder="https://hooks.slack.com/services/..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Create an incoming webhook in your Slack workspace settings
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Channel (optional)</Label>
                    <Input
                      value={slackChannel}
                      onChange={(e) => setSlackChannel(e.target.value)}
                      placeholder="#alerts"
                    />
                  </div>
                </div>
              )}

              {notificationType === 'email' && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Email Addresses</Label>
                    <Textarea
                      value={emailAddresses}
                      onChange={(e) => setEmailAddresses(e.target.value)}
                      placeholder="email1@example.com, email2@example.com"
                      rows={2}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated list of email addresses
                    </p>
                  </div>
                </div>
              )}

              {notificationType === 'in_app' && (
                <div className="space-y-4 p-4 border rounded-lg">
                  <div className="space-y-2">
                    <Label>Notification Title</Label>
                    <Input
                      value={inAppTitle}
                      onChange={(e) => setInAppTitle(e.target.value)}
                      placeholder="Alert triggered"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      value={inAppMessage}
                      onChange={(e) => setInAppMessage(e.target.value)}
                      placeholder="Your alert condition has been met..."
                      rows={2}
                    />
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="settings" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label>Cooldown Period (minutes)</Label>
                <Input
                  type="number"
                  value={cooldownMinutes}
                  onChange={(e) => setCooldownMinutes(e.target.value)}
                  min="1"
                  max="1440"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum time between repeated notifications (prevents spam)
                </p>
              </div>

              <div className="p-4 bg-muted rounded-lg">
                <h4 className="font-medium mb-2 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  Alert Preview
                </h4>
                <p className="text-sm text-muted-foreground">
                  When <code className="bg-background px-1 rounded">{aggregation}({field || 'field'})</code>{' '}
                  <strong>{ALERT_OPERATORS.find(o => o.id === operator)?.label}</strong>{' '}
                  <code className="bg-background px-1 rounded">{value || '?'}</code>
                  {timeWindow !== 'all' && (
                    <> within <strong>{TIME_WINDOWS.find(t => t.id === timeWindow)?.label}</strong></>
                  )}
                  , send a <strong>{notificationType}</strong> notification.
                </p>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={createAlert.isPending || updateAlert.isPending}
            >
              {(createAlert.isPending || updateAlert.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingAlert ? 'Update Alert' : 'Create Alert'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
