import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  LayoutDashboard, 
  Plus, 
  ChevronRight,
  Share2,
  Settings,
} from 'lucide-react';
import { useWebhookDashboards, WebhookDashboard } from '@/hooks/useWebhookDashboard';
import { EnhancedDashboardViewer } from '@/components/webhookDashboard/EnhancedDashboardViewer';
import { DashboardList } from '@/components/webhookDashboard/DashboardList';
import { useNavigate } from 'react-router-dom';

export function DashboardsTab() {
  const navigate = useNavigate();
  const { data: dashboards, isLoading } = useWebhookDashboards();
  const [selectedDashboard, setSelectedDashboard] = useState<WebhookDashboard | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // If a dashboard is selected, show the viewer
  if (selectedDashboard) {
    return (
      <div className="space-y-4">
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={() => setSelectedDashboard(null)}
          className="mb-2"
        >
          ← Back to Dashboards
        </Button>
        <EnhancedDashboardViewer 
          dashboard={selectedDashboard} 
          showBackButton={false}
        />
      </div>
    );
  }

  // Show dashboard list
  if (!dashboards?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <LayoutDashboard className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Custom Dashboards</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
            Create custom dashboards to visualize your webhook data, form submissions, 
            and other metrics with widgets like charts, cards, and tables.
          </p>
          <Button onClick={() => navigate('/settings?tab=data-platform')}>
            <Settings className="h-4 w-4 mr-2" />
            Go to Settings to Create Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Custom Dashboards</h3>
          <p className="text-sm text-muted-foreground">
            View and manage your webhook dashboards
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/settings?tab=data-platform')}>
          <Plus className="h-4 w-4 mr-2" />
          Create New
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dashboards.map((dashboard) => (
          <Card 
            key={dashboard.id} 
            className="cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => setSelectedDashboard(dashboard)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <LayoutDashboard className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{dashboard.name}</CardTitle>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
              {dashboard.description && (
                <CardDescription className="line-clamp-2">
                  {dashboard.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                {dashboard.is_shared && (
                  <Badge variant="secondary" className="text-xs">
                    <Share2 className="h-3 w-3 mr-1" />
                    Shared
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
