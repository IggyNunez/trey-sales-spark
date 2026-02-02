import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPlus, Copy, Trash2, RefreshCw, Loader2, CheckCircle, Shield } from 'lucide-react';
import { useInvitations, useCreateInvitation, useDeleteInvitation, useResendInvitation, useUpdateInvitationRole, type InviteRole } from '@/hooks/useInvitations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isPast } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/useOrganization';
import { usePortalSettings, getPortalBaseUrl } from '@/hooks/usePortalSettings';

export function InviteOrgMember() {
  const { currentOrganization } = useOrganization();
  const { data: portalSettings } = usePortalSettings();

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'member'>('member');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Use 'admin' type for org member invites (not linked to a closer)
  const { data: invitations, isLoading } = useInvitations('admin');
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();
  const resendInvitation = useResendInvitation();
  const updateRole = useUpdateInvitationRole();

  const handleInvite = async () => {
    if (!email.trim()) return;

    try {
      const invitation = await createInvitation.mutateAsync({ 
        email, 
        inviteType: 'admin', // This creates an admin/member invite (not sales_rep)
        role: role,
      });
      
      // Send the invite email
      supabase.functions.invoke('send-invite-email', {
        body: {
          email: invitation.email,
          token: invitation.token,
          inviteType: 'admin',
          organizationName: currentOrganization?.name,
          role: role,
        },
      }).then(({ error }) => {
        if (error) {
          console.warn('Email sending failed:', error);
        }
      }).catch((emailError) => {
        console.warn('Email sending error:', emailError);
      });
      
      toast.success(`Invitation created for ${email}. Copy the invite link to share it.`);
      setEmail('');
    } catch (error) {
      toast.error('Failed to create invitation');
    }
  };

  const handleCopyLink = (invitation: { token: string; id: string }) => {
    const baseUrl = getPortalBaseUrl(portalSettings);
    const link = `${baseUrl}/accept-invite?token=${invitation.token}`;
    navigator.clipboard.writeText(link);
    setCopiedId(invitation.id);
    toast.success('Invite link copied!');
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInvitation.mutateAsync(id);
      toast.success('Invitation deleted');
    } catch (error) {
      toast.error('Failed to delete invitation');
    }
  };

  const handleResend = async (invitation: { id: string; email: string; token: string }) => {
    try {
      const updated = await resendInvitation.mutateAsync(invitation.id);
      
      supabase.functions.invoke('send-invite-email', {
        body: {
          email: invitation.email,
          token: updated.token || invitation.token,
          inviteType: 'admin',
          organizationName: currentOrganization?.name,
        },
      }).catch(console.warn);
      
      toast.success(`Invitation renewed for ${invitation.email}. Copy the link to share.`);
    } catch (error) {
      toast.error('Failed to resend invitation');
    }
  };

  const handleRoleChange = async (invitationId: string, newRole: InviteRole) => {
    try {
      await updateRole.mutateAsync({ id: invitationId, role: newRole });
      toast.success('Role updated');
    } catch (error) {
      toast.error('Failed to update role');
    }
  };

  const getStatusBadge = (invitation: { status: string; expires_at: string }) => {
    if (invitation.status === 'accepted') {
      return <Badge className="bg-success/10 text-success border-success/20">Accepted</Badge>;
    }
    if (isPast(new Date(invitation.expires_at))) {
      return <Badge variant="destructive">Expired</Badge>;
    }
    return <Badge variant="secondary">Pending</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Organization Members</CardTitle>
            <CardDescription>
              Invite admins or members to access {currentOrganization?.name || 'this organization'}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite Form */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="member-email">Email Address</Label>
            <Input
              id="member-email"
              type="email"
              placeholder="client@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="member-role">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as 'admin' | 'member')}>
              <SelectTrigger id="member-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin - Full access to manage settings</SelectItem>
                <SelectItem value="member">Member - View access only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              This person will only see data from {currentOrganization?.name || 'this organization'}
            </p>
          </div>
          
          <Button 
            onClick={handleInvite} 
            disabled={createInvitation.isPending || !email.trim()}
            className="w-full"
          >
            {createInvitation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4 mr-2" />
            )}
            Invite to Organization
          </Button>
        </div>

        <Separator />

        {/* Invitations List */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Pending & Recent Invitations</h4>
          
          {isLoading ? (
            <div className="space-y-2">
              {Array(2).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invitations && invitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    <TableCell>
                      {invitation.status === 'pending' ? (
                        <Select
                          value={invitation.role || 'member'}
                          onValueChange={(value) => handleRoleChange(invitation.id, value as InviteRole)}
                          disabled={updateRole.isPending}
                        >
                          <SelectTrigger className="w-[100px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="member">Member</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className="capitalize">
                          {invitation.role || 'member'}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(invitation)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(invitation.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {invitation.status === 'pending' && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleCopyLink(invitation)}
                              title="Copy invite link"
                            >
                              {copiedId === invitation.id ? (
                                <CheckCircle className="h-4 w-4 text-success" />
                              ) : (
                                <Copy className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleResend(invitation)}
                              disabled={resendInvitation.isPending}
                              title="Resend invitation"
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(invitation.id)}
                          disabled={deleteInvitation.isPending}
                          title="Delete invitation"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No invitations sent yet
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}