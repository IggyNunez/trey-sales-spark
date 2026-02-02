import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WebhookConnectionsManager } from '@/components/settings/WebhookConnectionsManager';
import { PCFFormBuilder } from '@/components/settings/PCFFormBuilder';
import { TeamMembersManager } from '@/components/settings/TeamMembersManager';
import { PackagesManager } from '@/components/settings/PackagesManager';
import { BookingSoftwareSection, CRMSection, PaymentProcessorsSection } from '@/components/settings/integrations';
import { NotificationsSection } from '@/components/settings/NotificationsSection';
import { DynamicFormsList } from '@/components/forms/DynamicFormsList';
import { WebhookDashboardPage } from '@/components/webhookDashboard/WebhookDashboardPage';
import { DeletedCloserMapping } from '@/components/settings/DeletedCloserMapping';
import { SetterAliasManager } from '@/components/settings/SetterAliasManager';
import { CloserDisplayNameManager } from '@/components/settings/CloserDisplayNameManager';
import { useOrganization } from '@/hooks/useOrganization';
import { useIsDynamicFormsEnabled } from '@/hooks/useDynamicForms';
import { useIsWebhookDashboardEnabled } from '@/hooks/useWebhookDashboard';

// Acquisition Ace org ID - only this org sees all features
const ACQUISITION_ACE_ORG_ID = '74c1d616-43ca-4acc-bd3a-4cefc171fa31';

export default function SettingsPage() {
  const { currentOrganization } = useOrganization();
  const isAcquisitionAce = currentOrganization?.id === ACQUISITION_ACE_ORG_ID;
  const isDynamicFormsEnabled = useIsDynamicFormsEnabled();
  const isWebhookDashboardEnabled = useIsWebhookDashboardEnabled();

  return (
    <AppLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your integrations and team for {currentOrganization?.name || 'your organization'}
          </p>
        </div>

        <Tabs defaultValue="integrations" className="space-y-4 sm:space-y-6">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="integrations" className="text-xs sm:text-sm">Integrations</TabsTrigger>
            <TabsTrigger value="webhooks" className="text-xs sm:text-sm">Webhooks</TabsTrigger>
            <TabsTrigger value="packages" className="text-xs sm:text-sm">Packages</TabsTrigger>
            <TabsTrigger value="forms" className="text-xs sm:text-sm">Forms</TabsTrigger>
            {isDynamicFormsEnabled && (
              <TabsTrigger value="dynamic-forms" className="text-xs sm:text-sm">Dynamic Forms</TabsTrigger>
            )}
            {isWebhookDashboardEnabled && (
              <TabsTrigger value="webhook-dashboard" className="text-xs sm:text-sm">Data Platform</TabsTrigger>
            )}
            {isAcquisitionAce && (
              <TabsTrigger value="notifications" className="text-xs sm:text-sm">Notifications</TabsTrigger>
            )}
            <TabsTrigger value="team" className="text-xs sm:text-sm">Team</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-6">
            {/* Organized by category */}
            <BookingSoftwareSection />
            <CRMSection />
            <PaymentProcessorsSection />
          </TabsContent>

          <TabsContent value="webhooks" className="space-y-6">
            <WebhookConnectionsManager />
          </TabsContent>

          <TabsContent value="packages" className="space-y-6">
            <PackagesManager />
          </TabsContent>

          <TabsContent value="forms" className="space-y-6">
            <PCFFormBuilder />
          </TabsContent>

          {isDynamicFormsEnabled && (
            <TabsContent value="dynamic-forms" className="space-y-6">
              <DynamicFormsList />
            </TabsContent>
          )}

          {isWebhookDashboardEnabled && (
            <TabsContent value="webhook-dashboard" className="space-y-6">
              <WebhookDashboardPage />
            </TabsContent>
          )}

          {isAcquisitionAce && (
            <TabsContent value="notifications" className="space-y-6">
              <NotificationsSection />
            </TabsContent>
          )}

          <TabsContent value="team" className="space-y-6">
            <TeamMembersManager />
            <CloserDisplayNameManager />
            <SetterAliasManager />
            <DeletedCloserMapping />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
