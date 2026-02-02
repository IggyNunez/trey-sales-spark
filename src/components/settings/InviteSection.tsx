import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Building2, Plus, Copy, Trash2, RefreshCw, Loader2, CheckCircle } from 'lucide-react';
import { useInvitations, useCreateInvitation, useDeleteInvitation, useResendInvitation } from '@/hooks/useInvitations';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format, isPast } from 'date-fns';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/useOrganization';
import { usePortalSettings, getPortalBaseUrl } from '@/hooks/usePortalSettings';

interface InviteSectionProps {
  type: 'whitelabel' | 'sales_rep';
}

export function InviteSection({ type }: InviteSectionProps) {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const { data: portalSettings } = usePortalSettings();

  const [email, setEmail] = useState('');
  const [selectedCloser, setSelectedCloser] = useState('');
  const [newCloserName, setNewCloserName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAddingCloser, setIsAddingCloser] = useState(false);

  const { data: invitations, isLoading } = useInvitations(type);
  const createInvitation = useCreateInvitation();
  const deleteInvitation = useDeleteInvitation();
  const resendInvitation = useResendInvitation();

  // Fetch unique closer names from events and closers table for this organization
  const { data: closerNames, refetch: refetchClosers } = useQuery({
    queryKey: ['closer-names', orgId],
    queryFn: async () => {
      // Get from events for this org
      let eventsQuery = supabase
        .from('events')
        .select('closer_name')
        .not('closer_name', 'is', null);
      if (orgId) eventsQuery = eventsQuery.eq('organization_id', orgId);
      const { data: eventClosers } = await eventsQuery;
      
      // Get from closers table for this org
      let closersQuery = supabase
        .from('closers')
        .select('name')
        .eq('is_active', true);
      if (orgId) closersQuery = closersQuery.eq('organization_id', orgId);
      const { data: closersTable } = await closersQuery;
      
      // Combine and dedupe
      const eventNames = eventClosers?.map(e => e.closer_name).filter(Boolean) || [];
      const closerTableNames = closersTable?.map(c => c.name) || [];
      const allNames = [...new Set([...eventNames, ...closerTableNames])] as string[];
      return allNames.sort();
    },
    enabled: type === 'sales_rep' && !!orgId,
  });

  const handleAddCloser = async () => {
    if (!newCloserName.trim()) return;
    
    setIsAddingCloser(true);
    try {
      const { error } = await supabase
        .from('closers')
        .insert({ name: newCloserName.trim(), organization_id: orgId });
      
      if (error) throw error;
      
      toast.success(`Added "${newCloserName}" as a closer`);
      setSelectedCloser(newCloserName.trim());
      setNewCloserName('');
      refetchClosers();
    } catch (error) {
      toast.error('Failed to add closer');
    } finally {
      setIsAddingCloser(false);
    }
  };

  const isWhitelabel = type === 'whitelabel';
  const title = isWhitelabel ? 'Whitelabel Partners' : 'Sales Reps';
  const description = isWhitelabel 
    ? 'Invite partners who will get their own version of the platform'
    : 'Invite sales reps to join your team';
  const Icon = isWhitelabel ? Building2 : Users;

  const handleInvite = async () => {
    if (!email.trim()) return;
    if (!isWhitelabel && !selectedCloser) {
      toast.error('Please select which closer this sales rep is');
      return;
    }

    try {
      const invitation = await createInvitation.mutateAsync({ 
        email, 
        inviteType: type,
        closerName: isWhitelabel ? undefined : selectedCloser,
      });
      
      // Send the invite email (don't await - let it happen in background)
      supabase.functions.invoke('send-invite-email', {
        body: {
          email: invitation.email,
          token: invitation.token,
          inviteType: type,
          closerName: isWhitelabel ? undefined : selectedCloser,
        },
      }).then(({ error }) => {
        if (error) {
          console.warn('Email sending failed (domain not verified):', error);
        }
      }).catch((emailError) => {
        console.warn('Email sending error:', emailError);
      });
      
      // Always show success - emails require verified domain
      toast.success(`Invitation created for ${email}. Copy the invite link to share it.`);
      
      setEmail('');
      setSelectedCloser('');
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

  const handleResend = async (invitation: { id: string; email: string; token: string; closer_name: string | null }) => {
    try {
      // First update the invitation expiry
      const updated = await resendInvitation.mutateAsync(invitation.id);
      
      // Then try to send the email (don't block on it)
      supabase.functions.invoke('send-invite-email', {
        body: {
          email: invitation.email,
          token: updated.token || invitation.token,
          inviteType: type,
          closerName: invitation.closer_name,
        },
      }).then(({ error }) => {
        if (error) {
          console.warn('Email sending failed (domain not verified):', error);
        }
      }).catch((emailError) => {
        console.warn('Email sending error:', emailError);
      });
      
      toast.success(`Invitation renewed for ${invitation.email}. Copy the link to share.`);
    } catch (error) {
      toast.error('Failed to resend invitation');
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
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Invite Form */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor={`${type}-email`}>Email Address</Label>
            <Input
              id={`${type}-email`}
              type="email"
              placeholder={isWhitelabel ? 'partner@company.com' : 'rep@company.com'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
          </div>
          
          {!isWhitelabel && (
            <div className="space-y-2">
              <Label htmlFor="closer-select">Link to Closer</Label>
              <Select value={selectedCloser} onValueChange={setSelectedCloser}>
                <SelectTrigger id="closer-select">
                  <SelectValue placeholder="Select which closer this rep is..." />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {closerNames?.map((name) => (
                    <SelectItem key={name} value={name}>
                      {name}
                    </SelectItem>
                  ))}
                  {closerNames?.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No closers found. Add one below.
                    </div>
                  )}
                </SelectContent>
              </Select>
              
              {/* Add new closer */}
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Add new closer name..."
                  value={newCloserName}
                  onChange={(e) => setNewCloserName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCloser()}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddCloser}
                  disabled={isAddingCloser || !newCloserName.trim()}
                >
                  {isAddingCloser ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
              
              <p className="text-xs text-muted-foreground">
                This links the sales rep to their events by matching the closer name
              </p>
            </div>
          )}
          
          <Button 
            onClick={handleInvite} 
            disabled={createInvitation.isPending || !email.trim() || (!isWhitelabel && !selectedCloser)}
            className="w-full"
          >
            {createInvitation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Invite
          </Button>
        </div>

        <Separator />

        {/* Invitations List */}
        <div className="space-y-2">
          <h4 className="font-medium text-sm">Pending & Recent Invitations</h4>
          
          {isLoading ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : invitations && invitations.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  {!isWhitelabel && <TableHead>Linked Closer</TableHead>}
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow key={invitation.id}>
                    <TableCell className="font-medium">{invitation.email}</TableCell>
                    {!isWhitelabel && (
                      <TableCell className="text-muted-foreground">
                        {invitation.closer_name || '—'}
                      </TableCell>
                    )}
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
                              title="Resend invitation email"
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
