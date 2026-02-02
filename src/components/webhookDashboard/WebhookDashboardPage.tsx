import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Database, Link2, LayoutDashboard, FileText, BookOpen } from 'lucide-react';
import { Dataset, WebhookDashboard } from '@/hooks/useWebhookDashboard';
import { DatasetManager } from './DatasetManager';
import { DatasetSchemaBuilder } from './DatasetSchemaBuilder';
import { DatasetRecordsViewer } from './DatasetRecordsViewer';
import { EnhancedConnectionManager } from './EnhancedConnectionManager';
import { WebhookLogsViewer } from './WebhookLogsViewer';
import { DashboardList } from './DashboardList';
import { DashboardViewer } from './DashboardViewer';

export function WebhookDashboardPage() {
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<WebhookDashboard | null>(null);
  const [activeTab, setActiveTab] = useState('connections');

  // If a dataset is selected, show its details
  if (selectedDataset) {
    return (
      <div className="space-y-6">
        <DatasetSchemaBuilder 
          dataset={selectedDataset} 
          onBack={() => setSelectedDataset(null)} 
        />
        <DatasetRecordsViewer dataset={selectedDataset} />
      </div>
    );
  }

  // If a dashboard is selected, show dashboard viewer
  if (selectedDashboard) {
    return (
      <DashboardViewer 
        dashboard={selectedDashboard} 
        onBack={() => setSelectedDashboard(null)} 
      />
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList>
        <TabsTrigger value="connections" className="flex items-center gap-2">
          <Link2 className="h-4 w-4" />
          Webhook Sources
        </TabsTrigger>
        <TabsTrigger value="datasets" className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          Datasets
        </TabsTrigger>
        <TabsTrigger value="dashboards" className="flex items-center gap-2">
          <LayoutDashboard className="h-4 w-4" />
          Dashboards
        </TabsTrigger>
        <TabsTrigger value="logs" className="flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Logs
        </TabsTrigger>
      </TabsList>

      <TabsContent value="connections" className="space-y-4">
        <div className="flex justify-end">
          <Button variant="outline" size="sm" asChild>
            <Link to="/webhook-docs" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              API Documentation
            </Link>
          </Button>
        </div>
        <EnhancedConnectionManager />
      </TabsContent>

      <TabsContent value="datasets">
        <DatasetManager onSelectDataset={setSelectedDataset} />
      </TabsContent>

      <TabsContent value="dashboards">
        <DashboardList onSelectDashboard={setSelectedDashboard} />
      </TabsContent>

      <TabsContent value="logs">
        <WebhookLogsViewer />
      </TabsContent>
    </Tabs>
  );
}
