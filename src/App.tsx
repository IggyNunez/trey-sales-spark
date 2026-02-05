import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useSearchParams } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { OrganizationProvider } from "@/hooks/useOrganization";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Dashboard from "./pages/Dashboard";
import SalesRepDashboard from "./pages/SalesRepDashboard";
import SetterDashboard from "./pages/SetterDashboard";
import SetterLeadsPage from "./pages/SetterLeadsPage";
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
  const { isAdmin, isAdminOrAbove, isCloser, isSetter, loading, user } = useAuth();

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

  // Determine dashboard based on role
  const getDashboard = () => {
    if (isAdminOrAbove) return <Dashboard />;
    if (isSetter) return <SetterDashboard />;
    // Closers and legacy sales_rep use SalesRepDashboard
    return <SalesRepDashboard />;
  };

  // Authenticated users get full app access with role-based routing
  return (
    <Routes>
      {/* Main dashboard - role-based */}
      <Route path="/" element={getDashboard()} />

      {/* Public/shared routes */}
      <Route path="/landing" element={<Index />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/rep" element={<RepPortalRoute />} />
      <Route path="/rep-login" element={<RepPortal />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />

      {/* Closer routes */}
      <Route path="/my-commissions" element={
        <ProtectedRoute requiredRole={['closer', 'sales_rep', 'admin', 'super_admin']}>
          <RepCommissionsPage />
        </ProtectedRoute>
      } />
      <Route path="/pcf/:eventId" element={
        <ProtectedRoute resource="pcf">
          <PostCallFormPage />
        </ProtectedRoute>
      } />
      <Route path="/pcf" element={
        <ProtectedRoute resource="pcf">
          <SalesRepDashboard />
        </ProtectedRoute>
      } />
      <Route path="/my-stats" element={
        <ProtectedRoute resource="stats">
          {isSetter ? <SetterDashboard /> : <SalesRepDashboard />}
        </ProtectedRoute>
      } />

      {/* Setter routes */}
      <Route path="/my-leads" element={
        <ProtectedRoute requiredRole={['setter', 'admin', 'super_admin']}>
          <SetterLeadsPage />
        </ProtectedRoute>
      } />

      {/* Admin-only routes */}
      <Route path="/analytics" element={
        <ProtectedRoute adminOnly>
          <AnalyticsPage />
        </ProtectedRoute>
      } />
      <Route path="/team" element={
        <ProtectedRoute adminOnly>
          <TeamPage />
        </ProtectedRoute>
      } />
      <Route path="/attribution" element={
        <ProtectedRoute adminOnly>
          <AttributionPage />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute adminOnly>
          <SettingsPage />
        </ProtectedRoute>
      } />
      <Route path="/settings/forms/:formId" element={
        <ProtectedRoute adminOnly>
          <DynamicFormBuilderPage />
        </ProtectedRoute>
      } />
      <Route path="/setter-metrics" element={
        <ProtectedRoute adminOnly>
          <SetterMetricsPage />
        </ProtectedRoute>
      } />
      <Route path="/calls-report" element={
        <ProtectedRoute adminOnly>
          <CallsReportPage />
        </ProtectedRoute>
      } />
      <Route path="/export-events" element={
        <ProtectedRoute adminOnly>
          <ExportEventsPage />
        </ProtectedRoute>
      } />
      <Route path="/webhook-docs" element={
        <ProtectedRoute adminOnly>
          <WebhookDocsPage />
        </ProtectedRoute>
      } />
      <Route path="/utm-setup" element={
        <ProtectedRoute adminOnly>
          <UtmSetupGuidePage />
        </ProtectedRoute>
      } />

      {/* Super Admin only */}
      <Route path="/super-admin" element={
        <ProtectedRoute resource="super_admin">
          <SuperAdminPage />
        </ProtectedRoute>
      } />

      {/* Shared routes */}
      <Route path="/whats-new" element={<WhatsNewPage />} />

      {/* Catch-all */}
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