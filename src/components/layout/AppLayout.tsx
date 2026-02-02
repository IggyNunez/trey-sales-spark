import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SidebarProvider, SidebarTrigger, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { useUpdateNotification } from '@/hooks/useUpdateNotification';
import { UpdateBanner } from './UpdateBanner';
import { Loader2 } from 'lucide-react';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { showBanner, dismissNotification, currentNotification } = useUpdateNotification();

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
    }
  }, [user, loading, navigate]);

  const handleViewUpdates = () => {
    dismissNotification();
    navigate('/whats-new');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset className="flex-1 flex flex-col overflow-hidden">
          <header className="shrink-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4 md:px-6">
            <SidebarTrigger className="-ml-2" />
          </header>
          {showBanner && (
            <UpdateBanner
              title={currentNotification.bannerTitle}
              description={currentNotification.bannerDescription}
              onDismiss={dismissNotification}
              onViewUpdates={handleViewUpdates}
            />
          )}
          <main className="flex-1 overflow-auto p-4 md:p-6">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}