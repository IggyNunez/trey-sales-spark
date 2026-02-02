import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/hooks/useOrganization";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import SalesRepDashboard from "./pages/SalesRepDashboard";
import Auth from "./pages/Auth";
import AcceptInvite from "./pages/AcceptInvite";
import RepLogin from "./pages/RepLogin";
import RepPortal from "./pages/RepPortal";
import AdminRepPortal from "./pages/AdminRepPortal";
import AnalyticsPage from "./pages/AnalyticsPage";
import TeamPage from "./pages/TeamPage";
import SettingsPage from "./pages/SettingsPage";
import AttributionPage from "./pages/AttributionPage";
import PostCallFormPage from "./pages/PostCallFormPage";
import RepCommissionsPage from "./pages/RepCommissionsPage";
import SetterMetricsPage from "./pages/SetterMetricsPage";
import NotFound from "./pages/NotFound";
import SuperAdminPage from "./pages/SuperAdminPage";
import ExportEventsPage from "./pages/ExportEventsPage";
import DynamicFormBuilderPage from "./pages/DynamicFormBuilderPage";
import WebhookDocsPage from "./pages/WebhookDocsPage";
import WhatsNewPage from "./pages/WhatsNewPage";
import CallsReportPage from "./pages/CallsReportPage";
import UtmSetupGuidePage from "./pages/UtmSetupGuidePage";

const queryClient = new QueryClient();

// Component that decides which rep portal to show
function RepPortalRoute() {
  const [searchParams] = useSearchParams();
  const { isAdmin } = useAuth();
  
  // If there's a token query param, always use the public RepPortal (magic link flow)
  const hasToken = searchParams.has('token');
  
  if (hasToken) {
    return <RepPortal />;
  }
  
  // Otherwise, admins see AdminRepPortal, reps see RepPortal
  return isAdmin ? <AdminRepPortal /> : <RepPortal />;
}

function AppRoutes() {
  const { isAdmin, loading, user } = useAuth();
  
  // Public routes available to everyone
  const publicRoutes = (
    <Routes>
      <Route path="/" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/rep" element={<RepPortal />} />
      <Route path="/rep-login" element={<RepPortal />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/my-commissions" element={<RepCommissionsPage />} />
      <Route path="*" element={<Index />} />
    </Routes>
  );

  // Show public routes while loading
  if (loading) {
    return publicRoutes;
  }

  // Unauthenticated users see public routes with landing page
  if (!user) {
    return publicRoutes;
  }

  // Authenticated users get full app access
  return (
    <Routes>
      <Route path="/" element={isAdmin ? <Dashboard /> : <SalesRepDashboard />} />
      <Route path="/landing" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/rep" element={<RepPortalRoute />} />
      <Route path="/rep-login" element={<RepPortal />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route path="/my-commissions" element={<RepCommissionsPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/team" element={<TeamPage />} />
      <Route path="/attribution" element={<AttributionPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/settings/forms/:formId" element={<DynamicFormBuilderPage />} />
      <Route path="/super-admin" element={<SuperAdminPage />} />
      <Route path="/pcf/:eventId" element={<PostCallFormPage />} />
      <Route path="/pcf" element={<SalesRepDashboard />} />
      <Route path="/my-stats" element={<SalesRepDashboard />} />
      <Route path="/setter-metrics" element={<SetterMetricsPage />} />
      <Route path="/export-events" element={<ExportEventsPage />} />
      <Route path="/webhook-docs" element={<WebhookDocsPage />} />
      <Route path="/whats-new" element={<WhatsNewPage />} />
      <Route path="/calls-report" element={<CallsReportPage />} />
      <Route path="/utm-setup" element={<UtmSetupGuidePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <OrganizationProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </TooltipProvider>
      </OrganizationProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;