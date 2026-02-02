import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Trash2, Loader2, Shield, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useOrganization } from '@/hooks/useOrganization';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';

interface OrgMember {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
  profile: {
    name: string;
    email: string;
  } | null;
}

export function OrgMembersList() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();

  const { data: members, isLoading } = useQuery({
    queryKey: ['organization-members', currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          role,
          created_at,
          profiles!organization_members_user_id_fkey(name, email)
        `)
        .eq('organization_id', currentOrganization.id);

      if (error) throw error;
      
      return (data || []).map(m => ({
        ...m,
        profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      })) as OrgMember[];
    },
    enabled: !!currentOrganization?.id,
  });

  const updateRole = useMutation({
    mutationFn: async ({ memberId, newRole }: { memberId: string; newRole: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ role: newRole })
        .eq('id', memberId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      toast.success('Role updated successfully');
    },
    onError: (error: any) => {
      toast.error(`Failed to update role: ${error.message}`);
    },
  });

  const removeMember = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      toast.success('Member removed from organization');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove member: ${error.message}`);
    },
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return (
          <Badge className="bg-primary/10 text-primary border-primary/20">
            <Shield className="h-3 w-3 mr-1" />
            Admin
          </Badge>
        );
      case 'member':
        return (
          <Badge variant="secondary">
            <User className="h-3 w-3 mr-1" />
            Member
          </Badge>
        );
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  if (!currentOrganization) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-secondary/50">
            <Users className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <CardTitle>Current Members</CardTitle>
            <CardDescription>
              Manage members who have access to {currentOrganization.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array(2).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members && members.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">
                    {member.profile?.name || 'Unknown'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.profile?.email || 'No email'}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={member.role}
                      onValueChange={(value) => updateRole.mutate({ memberId: member.id, newRole: value })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm('Are you sure you want to remove this member from the organization?')) {
                          removeMember.mutate(member.id);
                        }
                      }}
                      disabled={removeMember.isPending}
                      title="Remove from organization"
                    >
                      {removeMember.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No members in this organization yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}