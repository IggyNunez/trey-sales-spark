import { useAuth } from './useAuth';

type AppRole = 'admin' | 'sales_rep' | 'super_admin' | 'closer' | 'setter';
type Scope = 'all' | 'org' | 'own' | 'own_leads' | null;

interface PermissionSet {
  events?: Scope;
  leads?: Scope;
  payments?: Scope;
  pcf?: Scope;
  stats?: Scope;
  settings?: Scope;
  team?: Scope;
  analytics?: Scope;
  magic_links?: Scope;
  super_admin?: Scope;
}

// Permission matrix defining what each role can access
const PERMISSIONS: Record<AppRole, PermissionSet> = {
  super_admin: {
    events: 'all',
    leads: 'all',
    payments: 'all',
    pcf: 'all',
    stats: 'all',
    settings: 'all',
    team: 'all',
    analytics: 'all',
    magic_links: 'all',
    super_admin: 'all',
  },
  admin: {
    events: 'org',
    leads: 'org',
    payments: 'org',
    pcf: 'org',
    stats: 'org',
    settings: 'org',
    team: 'org',
    analytics: 'org',
    magic_links: 'org',
  },
  sales_rep: {
    // Legacy role - treat like closer for backward compatibility
    events: 'own',
    pcf: 'own',
    payments: 'own',
    stats: 'own',
  },
  closer: {
    events: 'own',
    pcf: 'own',
    payments: 'own',
    stats: 'own',
  },
  setter: {
    leads: 'own',
    events: 'own_leads',
    stats: 'own',
  },
};

// Page permission requirements
const PAGE_PERMISSIONS: Record<string, { resource: keyof PermissionSet; minScope?: Scope }> = {
  '/': { resource: 'events' },
  '/analytics': { resource: 'analytics' },
  '/attribution': { resource: 'analytics' },
  '/team': { resource: 'team' },
  '/settings': { resource: 'settings' },
  '/super-admin': { resource: 'super_admin' },
  '/setter-metrics': { resource: 'analytics' },
  '/calls-report': { resource: 'analytics' },
  '/my-commissions': { resource: 'payments' },
  '/my-leads': { resource: 'leads' },
  '/rep': { resource: 'events' },
  '/pcf': { resource: 'pcf' },
};

export function usePermissions() {
  const { userRole, isSuperAdmin } = useAuth();

  /**
   * Check if the user can access a resource
   * @param resource - The resource to check (events, leads, payments, etc.)
   * @returns boolean - Whether the user has any access to this resource
   */
  const can = (resource: keyof PermissionSet): boolean => {
    if (!userRole) return false;
    if (isSuperAdmin) return true;

    const perms = PERMISSIONS[userRole];
    return perms ? !!perms[resource] : false;
  };

  /**
   * Get the scope of access for a resource
   * @param resource - The resource to check
   * @returns Scope - 'all', 'org', 'own', 'own_leads', or null if no access
   */
  const getScope = (resource: keyof PermissionSet): Scope => {
    if (!userRole) return null;
    if (isSuperAdmin) return 'all';

    const perms = PERMISSIONS[userRole];
    return perms ? perms[resource] || null : null;
  };

  /**
   * Check if user can access a specific page
   * @param path - The route path
   * @returns boolean
   */
  const canAccessPage = (path: string): boolean => {
    if (!userRole) return false;
    if (isSuperAdmin) return true;

    const pageReq = PAGE_PERMISSIONS[path];
    if (!pageReq) return true; // Unknown pages default to accessible

    return can(pageReq.resource);
  };

  /**
   * Check if user has org-wide or broader access to a resource
   * @param resource - The resource to check
   * @returns boolean
   */
  const hasOrgAccess = (resource: keyof PermissionSet): boolean => {
    const scope = getScope(resource);
    return scope === 'all' || scope === 'org';
  };

  /**
   * Check if user only has access to their own data for a resource
   * @param resource - The resource to check
   * @returns boolean
   */
  const hasOwnOnlyAccess = (resource: keyof PermissionSet): boolean => {
    const scope = getScope(resource);
    return scope === 'own' || scope === 'own_leads';
  };

  return {
    can,
    getScope,
    canAccessPage,
    hasOrgAccess,
    hasOwnOnlyAccess,
    permissions: userRole ? PERMISSIONS[userRole] : null,
  };
}
