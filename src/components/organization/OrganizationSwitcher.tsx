import { Building2, ChevronDown, Plus, Check } from 'lucide-react';
import { useOrganization } from '@/hooks/useOrganization';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { CreateOrganizationDialog } from './CreateOrganizationDialog';

interface OrganizationSwitcherProps {
  collapsed?: boolean;
}

export function OrganizationSwitcher({ collapsed = false }: OrganizationSwitcherProps) {
  const { isSuperAdmin } = useAuth();
  const { organizations, currentOrganization, switchOrganization, isLoadingOrgs } = useOrganization();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  if (isLoadingOrgs) {
    return (
      <div className="px-2">
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (organizations.length === 0 && !isSuperAdmin) {
    return null;
  }

  // For non-super-admins with only one organization, show just the org name (no switcher)
  if (!isSuperAdmin && organizations.length === 1) {
    return (
      <div className="px-2">
        <div className="flex items-center gap-2 h-10">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
            <Building2 className="h-4 w-4 text-primary" />
          </div>
          {!collapsed && (
            <div className="flex flex-1 flex-col items-start text-left overflow-hidden">
              <span className="truncate text-sm font-medium">
                {currentOrganization?.name || organizations[0]?.name}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 px-2 h-10"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            {!collapsed && (
              <>
                <div className="flex flex-1 flex-col items-start text-left overflow-hidden">
                  <span className="truncate text-sm font-medium">
                    {currentOrganization?.name || 'Select Organization'}
                  </span>
                  {isSuperAdmin && (
                    <span className="text-xs text-muted-foreground">Super Admin</span>
                  )}
                </div>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[240px]">
          <DropdownMenuLabel className="flex items-center justify-between">
            Organizations
            {isSuperAdmin && (
              <Badge variant="secondary" className="text-xs">
                Super Admin
              </Badge>
            )}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {organizations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onClick={() => switchOrganization(org.id)}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{org.name}</span>
              </div>
              {currentOrganization?.id === org.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </DropdownMenuItem>
          ))}
          {(isSuperAdmin || organizations.length === 0) && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setCreateDialogOpen(true)}
                className="cursor-pointer"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Organization
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      
      <CreateOrganizationDialog 
        open={createDialogOpen} 
        onOpenChange={setCreateDialogOpen} 
      />
    </>
  );
}
