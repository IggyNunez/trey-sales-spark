import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Shield, UserCheck, UserPlus } from 'lucide-react';
import { InviteSection } from '@/components/settings/InviteSection';
import { InviteOrgMember } from '@/components/settings/InviteOrgMember';
import { SetterCloseMapping } from '@/components/settings/SetterCloseMapping';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';

interface TeamMember {
  id: string;
  membership_id: string;
  user_id: string;
  name: string;
  email: string;
  role: 'owner' | 'admin' | 'member';
  created_at: string;
}

export default function TeamPage() {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: teamMembers, isLoading } = useQuery({
    queryKey: ['team-members', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('No organization selected');
      }

      // Get organization members for current org
      const { data: orgMembers, error: orgMembersError } = await supabase
        .from('organization_members')
        .select('id, user_id, role, created_at')
        .eq('organization_id', currentOrganization.id);

      if (orgMembersError) throw orgMembersError;

      if (!orgMembers || orgMembers.length === 0) {
        return [];
      }

      const userIds = orgMembers.map(m => m.user_id);

      // Get profiles only for users in this organization
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds)
        .order('created_at', { ascending: true });

      if (profilesError) throw profilesError;

      return profiles.map(profile => {
        const orgMember = orgMembers.find(m => m.user_id === profile.user_id);
        return {
          ...profile,
          membership_id: orgMember?.id || '',
          role: orgMember?.role || 'member',
          created_at: orgMember?.created_at || profile.created_at,
        };
      }) as TeamMember[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Check if current user is owner or admin based on their organization membership
  const { data: currentUserRole } = useQuery({
    queryKey: ['current-user-org-role', currentOrganization?.id, user?.id],
    queryFn: async () => {
      if (!currentOrganization?.id || !user?.id) return null;
      
      const { data, error } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', currentOrganization.id)
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      return data?.role;
    },
    enabled: !!currentOrganization?.id && !!user?.id,
  });

  const canManageRoles = currentUserRole === 'owner' || currentUserRole === 'admin';

  const updateRoleMutation = useMutation({
    mutationFn: async ({ membershipId, newRole }: { membershipId: string; newRole: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ role: newRole })
        .eq('id', membershipId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success('Role updated successfully');
    },
    onError: (error) => {
      console.error('Failed to update role:', error);
      toast.error('Failed to update role');
    },
  });

  const handleRoleChange = (membershipId: string, memberId: string, newRole: string) => {
    // Prevent changing own role if owner
    if (memberId === user?.id && currentUserRole === 'owner') {
      toast.error("You can't change your own owner role");
      return;
    }
    updateRoleMutation.mutate({ membershipId, newRole });
  };

  const admins = teamMembers?.filter(m => m.role === 'admin' || m.role === 'owner') || [];
  const salesReps = teamMembers?.filter(m => m.role === 'member') || [];

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'owner':
        return <Badge className="bg-primary text-primary-foreground">Owner</Badge>;
      case 'admin':
        return <Badge className="bg-warning text-warning-foreground">Admin</Badge>;
      default:
        return <Badge variant="secondary">Sales Rep</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team</h1>
          <p className="text-muted-foreground mt-1">
            Manage your sales team and their roles
          </p>
        </div>

        {/* Team Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{teamMembers?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Total Members</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-warning/10">
                <Shield className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold">{admins.length}</p>
                <p className="text-sm text-muted-foreground">Admins</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 flex items-center gap-4">
              <div className="p-3 rounded-lg bg-success/10">
                <UserCheck className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold">{salesReps.length}</p>
                <p className="text-sm text-muted-foreground">Sales Reps</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invite Organization Members (Admins/Clients) */}
        {canManageRoles && <InviteOrgMember />}

        {/* Invite Sales Reps */}
        <InviteSection type="sales_rep" />

        {/* Close CRM Mapping */}
        <SetterCloseMapping />

        {/* Team Members */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Members
            </CardTitle>
            <CardDescription>
              All team members with their roles and access levels
              {canManageRoles && ' • You can change roles for team members'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-4">
                {Array(5).fill(0).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : !teamMembers || teamMembers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No team members found</p>
                <p className="text-sm mt-1">Invite team members using the form above</p>
              </div>
            ) : (
              <div className="space-y-3">
                {teamMembers.map((member) => {
                  const initials = member.name
                    .split(' ')
                    .filter(n => n.length > 0)
                    .map(n => n[0] || '')
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || '??';

                  const isCurrentUser = member.user_id === user?.id;
                  const isOwner = member.role === 'owner';

                  return (
                    <div 
                      key={member.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.name}
                            {isCurrentUser && <span className="text-muted-foreground ml-2">(you)</span>}
                          </p>
                          <p className="text-sm text-muted-foreground">{member.email}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {canManageRoles && !isOwner ? (
                          <Select
                            value={member.role}
                            onValueChange={(value) => handleRoleChange(member.membership_id, member.user_id, value)}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="member">Sales Rep</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          getRoleBadge(member.role)
                        )}
                        <span className="text-sm text-muted-foreground">
                          Joined {format(new Date(member.created_at), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}