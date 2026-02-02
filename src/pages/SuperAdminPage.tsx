import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Building2, Users, UserPlus, Shield, Mail } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { InviteClientAdminModal } from '@/components/super-admin/InviteClientAdminModal';

interface Organization {
  id: string;
  name: string;
  slug: string | null;
  created_at: string;
}

interface OrganizationMember {
  id: string;
  user_id: string;
  role: string;
  profiles: {
    name: string;
    email: string;
  };
}

interface OrganizationWithMembers extends Organization {
  members: OrganizationMember[];
  pendingInvites: number;
}

const SUPER_ADMIN_EMAIL = 'trey@salesreps.com';

export default function SuperAdminPage() {
  const { user, isSuperAdmin, profile, loading: authLoading } = useAuth();
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Fetch all organizations with their members
  const { data: organizations, isLoading, refetch } = useQuery({
    queryKey: ['super-admin-organizations'],
    queryFn: async () => {
      // Fetch all organizations
      const { data: orgs, error: orgsError } = await supabase
        .from('organizations')
        .select('*')
        .order('created_at', { ascending: false });

      if (orgsError) throw orgsError;

      // Fetch members for each org with their profiles
      const orgsWithMembers: OrganizationWithMembers[] = await Promise.all(
        (orgs || []).map(async (org) => {
          // First get the organization members
          const { data: members } = await supabase
            .from('organization_members')
            .select('id, user_id, role')
            .eq('organization_id', org.id);

          // Then fetch profiles for each member
          const membersWithProfiles: OrganizationMember[] = await Promise.all(
            (members || []).map(async (member) => {
              const { data: profile } = await supabase
                .from('profiles')
                .select('name, email')
                .eq('user_id', member.user_id)
                .single();

              return {
                id: member.id,
                user_id: member.user_id,
                role: member.role,
                profiles: {
                  name: profile?.name || 'Unknown',
                  email: profile?.email || '',
                },
              };
            })
          );

          // Count pending admin invites for this org
          const { count } = await supabase
            .from('invitations')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', org.id)
            .eq('invite_type', 'client_admin')
            .eq('status', 'pending');

          return {
            ...org,
            members: membersWithProfiles,
            pendingInvites: count || 0,
          };
        })
      );

      return orgsWithMembers;
    },
    enabled: isSuperAdmin && profile?.email === SUPER_ADMIN_EMAIL,
  });

  // Show loading while auth is loading
  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Redirect if not super admin or not the specific email
  if (!isSuperAdmin || profile?.email !== SUPER_ADMIN_EMAIL) {
    return <Navigate to="/" replace />;
  }

  const handleInviteClick = (org: Organization) => {
    setSelectedOrg(org);
    setIsInviteModalOpen(true);
  };

  const handleInviteSuccess = () => {
    refetch();
  };

  return (
    <AppLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Shield className="h-8 w-8 text-primary" />
              Client Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage client organizations and invite admins
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            Super Admin Only
          </Badge>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Organizations</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{organizations?.length || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Admins</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {organizations?.reduce((acc, org) =>
                  acc + org.members.filter(m => m.role === 'admin' || m.role === 'owner').length, 0
                ) || 0}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Invites</CardTitle>
              <Mail className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {organizations?.reduce((acc, org) => acc + org.pendingInvites, 0) || 0}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Organizations List */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Organizations</h2>

          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : organizations?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No organizations yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {organizations?.map((org) => (
                <Card key={org.id}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          <Building2 className="h-5 w-5" />
                          {org.name}
                        </CardTitle>
                        <CardDescription>
                          {org.slug && `Slug: ${org.slug} • `}
                          Created {new Date(org.created_at).toLocaleDateString()}
                        </CardDescription>
                      </div>
                      <Button
                        onClick={() => handleInviteClick(org)}
                        size="sm"
                      >
                        <UserPlus className="h-4 w-4 mr-2" />
                        Invite Admin
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>Members ({org.members.length})</span>
                        {org.pendingInvites > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {org.pendingInvites} pending invite{org.pendingInvites > 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>

                      {org.members.length > 0 ? (
                        <div className="grid gap-2 pl-6">
                          {org.members.map((member) => (
                            <div
                              key={member.id}
                              className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg"
                            >
                              <div>
                                <p className="font-medium text-sm">
                                  {member.profiles?.name || 'Unknown User'}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {member.profiles?.email}
                                </p>
                              </div>
                              <Badge
                                variant={member.role === 'owner' ? 'default' : 'secondary'}
                                className="capitalize"
                              >
                                {member.role}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground pl-6">
                          No members yet - invite an admin to get started
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Invite Modal */}
      <InviteClientAdminModal
        open={isInviteModalOpen}
        onOpenChange={setIsInviteModalOpen}
        organization={selectedOrg}
        onSuccess={handleInviteSuccess}
      />
    </AppLayout>
  );
}
