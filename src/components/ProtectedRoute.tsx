import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2 } from 'lucide-react';

type AppRole = 'admin' | 'sales_rep' | 'super_admin' | 'closer' | 'setter';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * Resource to check access for (events, leads, payments, settings, etc.)
   * If provided, checks if user has any access to this resource
   */
  resource?: 'events' | 'leads' | 'payments' | 'pcf' | 'stats' | 'settings' | 'team' | 'analytics' | 'magic_links' | 'super_admin';
  /**
   * Specific role(s) required to access this route
   * If provided, user must have one of these roles
   */
  requiredRole?: AppRole | AppRole[];
  /**
   * Path to redirect to if access is denied
   * Defaults to '/'
   */
  fallback?: string;
  /**
   * If true, requires the user to be an admin or super_admin
   */
  adminOnly?: boolean;
}

function LoadingSpinner() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

/**
 * ProtectedRoute component for role-based access control
 *
 * Usage:
 * ```tsx
 * // Require admin access
 * <ProtectedRoute adminOnly>
 *   <SettingsPage />
 * </ProtectedRoute>
 *
 * // Require specific resource access
 * <ProtectedRoute resource="analytics">
 *   <AnalyticsPage />
 * </ProtectedRoute>
 *
 * // Require specific role(s)
 * <ProtectedRoute requiredRole="closer">
 *   <MyCommissionsPage />
 * </ProtectedRoute>
 *
 * <ProtectedRoute requiredRole={['closer', 'setter']}>
 *   <MyStatsPage />
 * </ProtectedRoute>
 * ```
 */
export function ProtectedRoute({
  children,
  resource,
  requiredRole,
  fallback = '/',
  adminOnly = false,
}: ProtectedRouteProps) {
  const { user, userRole, loading, isAdminOrAbove } = useAuth();
  const { can } = usePermissions();

  // Show loading state while checking auth
  if (loading) {
    return <LoadingSpinner />;
  }

  // Redirect to auth if not logged in
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Check admin requirement
  if (adminOnly && !isAdminOrAbove) {
    return <Navigate to={fallback} replace />;
  }

  // Check specific role requirement
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!userRole || !roles.includes(userRole)) {
      return <Navigate to={fallback} replace />;
    }
  }

  // Check resource permission requirement
  if (resource && !can(resource)) {
    return <Navigate to={fallback} replace />;
  }

  return <>{children}</>;
}

/**
 * Higher-order component version of ProtectedRoute
 *
 * Usage:
 * ```tsx
 * const ProtectedSettingsPage = withProtectedRoute(SettingsPage, { adminOnly: true });
 * ```
 */
export function withProtectedRoute<P extends object>(
  Component: React.ComponentType<P>,
  options: Omit<ProtectedRouteProps, 'children'>
) {
  return function WrappedComponent(props: P) {
    return (
      <ProtectedRoute {...options}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}
