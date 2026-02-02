import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { usePortalSettings, useUpdatePortalSettings } from '@/hooks/usePortalSettings';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Users } from 'lucide-react';

export function PortalConfigCard() {
  const { data: settings, isLoading } = usePortalSettings();
  const updateSettings = useUpdatePortalSettings();

  const handleToggle = (key: keyof typeof settings, value: boolean) => {
    if (!settings) return;
    
    updateSettings.mutate(
      { id: settings.id, [key]: value },
      {
        onSuccess: () => {
          toast.success('Portal settings updated');
        },
        onError: () => {
          toast.error('Failed to update settings');
        },
      }
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array(6).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sales Rep Portal</CardTitle>
          <CardDescription>No settings found</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const toggleItems = [
    { key: 'show_booked_calls', label: 'Booked Calls', description: 'Show total booked calls stat' },
    { key: 'show_show_rate', label: 'Show Rate', description: 'Show show rate percentage' },
    { key: 'show_close_rate', label: 'Close Rate', description: 'Show close rate percentage' },
    { key: 'show_cash_collected', label: 'Cash Collected', description: 'Show cash collected amount' },
    { key: 'show_upcoming_events', label: 'Upcoming Events', description: 'Show upcoming scheduled events' },
    { key: 'show_overdue_pcfs', label: 'Overdue PCFs', description: 'Show overdue post-call forms' },
    { key: 'show_past_events', label: 'Past Events', description: 'Show past events history' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Sales Rep Portal Settings
        </CardTitle>
        <CardDescription>
          Configure what sales reps can see in their dashboard
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Toggle Settings */}
        {toggleItems.map((item) => (
          <div key={item.key} className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor={item.key} className="text-sm font-medium">
                {item.label}
              </Label>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <Switch
              id={item.key}
              checked={settings[item.key as keyof typeof settings] as boolean}
              onCheckedChange={(checked) => handleToggle(item.key as keyof typeof settings, checked)}
              disabled={updateSettings.isPending}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
