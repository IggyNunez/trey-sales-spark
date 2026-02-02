import { AppLayout } from '@/components/layout/AppLayout';
import { useOrganization } from '@/hooks/useOrganization';
import { MagicLinkManager } from '@/components/settings/MagicLinkManager';
import RepPortal from './RepPortal';

export default function AdminRepPortal() {
  const { currentOrganization } = useOrganization();
  
  return (
    <AppLayout>
      <div className="space-y-6">
        <MagicLinkManager />
        <RepPortal embedded organizationId={currentOrganization?.id} />
      </div>
    </AppLayout>
  );
}