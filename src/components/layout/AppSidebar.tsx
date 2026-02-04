import { useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Calendar,
  FileText,
  Users,
  Settings,
  BarChart3,
  LogOut,
  DollarSign,
  ClipboardList,
  Activity,
  ExternalLink,
  Camera,
  Shield,
  Headphones,
  FileBarChart
} from 'lucide-react';
import { NavLink } from '@/components/NavLink';
import { useAuth } from '@/hooks/useAuth';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { OrganizationSwitcher } from '@/components/organization/OrganizationSwitcher';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/hooks/useOrganization';

// All admin users see all features now (removed org restriction)
const getAdminItems = () => {
  return [
    { title: 'Dashboard', url: '/', icon: LayoutDashboard },
    { title: 'Attribution', url: '/attribution', icon: ClipboardList },
    { title: 'Analytics', url: '/analytics', icon: BarChart3 },
    { title: 'Call Reports', url: '/calls-report', icon: FileBarChart },
    { title: 'Setter Metrics', url: '/setter-metrics', icon: Headphones },
    { title: 'Team', url: '/team', icon: Activity },
    { title: 'Rep Portal', url: '/rep', icon: ExternalLink },
    { title: 'Settings', url: '/settings', icon: Settings },
  ];
};

const superAdminItems = [
  { title: 'Client Management', url: '/super-admin', icon: Shield },
];

const salesRepItems = [
  { title: 'My Events', url: '/', icon: Calendar },
  { title: 'Post-Call Form', url: '/pcf', icon: FileText },
  { title: 'My Stats', url: '/my-stats', icon: BarChart3 },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const location = useLocation();
  const { isAdmin, isSuperAdmin, profile, signOut } = useAuth();
  const { currentOrganization } = useOrganization();
  const collapsed = state === 'collapsed';

  const adminItems = getAdminItems();
  const items = isAdmin ? adminItems : salesRepItems;
  const currentPath = location.pathname;

  const initials = profile?.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
            <span className="font-display text-lg font-bold text-primary-foreground">SR</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display font-semibold text-sidebar-foreground tracking-tight">
                SalesReps
              </span>
              <span className="text-xs text-sidebar-foreground/60">
                {isSuperAdmin ? 'Super Admin' : isAdmin ? 'Admin Portal' : 'Rep Portal'}
              </span>
            </div>
          )}
        </div>
        
        {/* Organization Switcher for admins */}
        {isAdmin && (
          <div className="mt-4">
            <OrganizationSwitcher collapsed={collapsed} />
          </div>
        )}
      </SidebarHeader>
      
      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/50">
            {isAdmin ? 'Management' : 'Sales'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={currentPath === item.url}
                    tooltip={collapsed ? item.title : undefined}
                  >
                    <NavLink 
                      to={item.url} 
                      end 
                      className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Super Admin Section - for all super admins */}
        {isSuperAdmin && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/50">
              Super Admin
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {superAdminItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={currentPath === item.url}
                      tooltip={collapsed ? item.title : undefined}
                    >
                      <NavLink
                        to={item.url}
                        end
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
                        activeClassName="bg-sidebar-accent text-sidebar-primary font-medium"
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span>{item.title}</span>}
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4">
        <Separator className="mb-4 bg-sidebar-border" />
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile?.name || 'User'}
                </span>
                {isSuperAdmin && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    SA
                  </Badge>
                )}
              </div>
              <span className="truncate text-xs text-sidebar-foreground/60">
                {profile?.email}
              </span>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            className="h-8 w-8 text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}