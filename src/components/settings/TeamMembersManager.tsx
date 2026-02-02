import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useToast } from '@/hooks/use-toast';
import { usePortalSettings, getPortalBaseUrl } from '@/hooks/usePortalSettings';
import { useInvitations, useCreateInvitation, useResendInvitation } from '@/hooks/useInvitations';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { 
  Plus, Trash2, Loader2, UserCheck, Phone, Mail, ExternalLink, Send, RefreshCw, 
  CheckCircle, Clock, XCircle, MoreHorizontal, Copy, UserPlus
} from 'lucide-react';
import { isPast, formatDistanceToNow } from 'date-fns';

interface TeamMember {
  id: string;
  name: string;
  email?: string;
  is_active: boolean;
  created_at: string;
  profile_id?: string;
}

interface Invitation {
  id: string;
  email: string;
  status: string;
  expires_at: string;
  closer_name: string | null;
}

export function TeamMembersManager() {
  const { currentOrganization } = useOrganization();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: portalSettings } = usePortalSettings();
  const { data: invitations = [] } = useInvitations('sales_rep');
  const createInvitation = useCreateInvitation();
  const resendInvitation = useResendInvitation();
  
  const [activeTab, setActiveTab] = useState('closers');
  const [addSetterOpen, setAddSetterOpen] = useState(false);
  const [addCloserOpen, setAddCloserOpen] = useState(false);
  const [newSetterName, setNewSetterName] = useState('');
  const [newSetterEmail, setNewSetterEmail] = useState('');
  const [newCloserName, setNewCloserName] = useState('');
  const [newCloserEmail, setNewCloserEmail] = useState('');
  const [sendingInvite, setSendingInvite] = useState<string | null>(null);
  const [syncingFromCalendly, setSyncingFromCalendly] = useState(false);

  // Helper to get invitation for a closer
  const getInvitationForCloser = (closerName: string, closerEmail?: string): Invitation | undefined => {
    return invitations.find(inv => 
      inv.closer_name === closerName || (closerEmail && inv.email === closerEmail)
    ) as Invitation | undefined;
  };

  // Helper to get invite status
  const getInviteStatus = (member: TeamMember): { status: 'linked' | 'accepted' | 'pending' | 'expired' | 'none'; invitation?: Invitation } => {
    if (member.profile_id) {
      return { status: 'linked' };
    }
    
    const invitation = getInvitationForCloser(member.name, member.email);
    if (!invitation) {
      return { status: 'none' };
    }
    
    if (invitation.status === 'accepted') {
      return { status: 'accepted', invitation };
    }
    
    if (isPast(new Date(invitation.expires_at))) {
      return { status: 'expired', invitation };
    }
    
    return { status: 'pending', invitation };
  };

  // Fetch setters
  const { data: setters = [], isLoading: settersLoading } = useQuery({
    queryKey: ['setters', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('setters')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .order('name');
      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Fetch closers
  const { data: closers = [], isLoading: closersLoading } = useQuery({
    queryKey: ['closers', currentOrganization?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('closers')
        .select('*')
        .eq('organization_id', currentOrganization?.id)
        .order('name');
      if (error) throw error;
      return data as TeamMember[];
    },
    enabled: !!currentOrganization?.id,
  });

  // Add setter
  const addSetter = useMutation({
    mutationFn: async ({ name, email }: { name: string; email?: string }) => {
      const { error } = await supabase
        .from('setters')
        .insert({ 
          name, 
          email: email || null,
          organization_id: currentOrganization?.id 
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['setters'] });
      setNewSetterName('');
      setNewSetterEmail('');
      setAddSetterOpen(false);
      toast({ title: 'Setter added successfully' });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Add closer
  const addCloser = useMutation({
    mutationFn: async ({ name, email }: { name: string; email?: string }) => {
      const { error } = await supabase
        .from('closers')
        .insert({ 
          name, 
          email: email || null,
          organization_id: currentOrganization?.id 
        });
      if (error) throw error;
      return { name, email };
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['closers'] });
      setNewCloserName('');
      setNewCloserEmail('');
      setAddCloserOpen(false);
      toast({ title: 'Closer added successfully' });
      
      // Automatically create invitation and send email if email was provided
      if (data?.email) {
        try {
          const invitation = await createInvitation.mutateAsync({ 
            email: data.email, 
            inviteType: 'sales_rep',
            closerName: data.name,
          });
          
          const { error } = await supabase.functions.invoke('send-invite-email', {
            body: {
              email: data.email,
              token: invitation.token,
              inviteType: 'sales_rep',
              closerName: data.name,
              organizationId: currentOrganization?.id,
            },
          });
          if (!error) {
            toast({ title: 'Invite sent', description: `Signup invite sent to ${data.email}` });
          }
        } catch (err) {
          console.error('Failed to send invite email:', err);
        }
      }
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Toggle active status
  const toggleActive = useMutation({
    mutationFn: async ({ id, table, isActive }: { id: string; table: 'setters' | 'closers'; isActive: boolean }) => {
      const { error } = await supabase
        .from(table)
        .update({ is_active: isActive })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { table }) => {
      queryClient.invalidateQueries({ queryKey: [table] });
    },
  });

  // Delete member
  const deleteMember = useMutation({
    mutationFn: async ({ id, table }: { id: string; table: 'setters' | 'closers' }) => {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: (_, { table }) => {
      queryClient.invalidateQueries({ queryKey: [table] });
      toast({ title: `${table === 'setters' ? 'Setter' : 'Closer'} removed` });
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const getPortalLink = (name: string) => {
    const baseUrl = getPortalBaseUrl(portalSettings);
    return `${baseUrl}/rep?name=${encodeURIComponent(name)}`;
  };

  const copyPortalLink = (name: string) => {
    const link = getPortalLink(name);
    navigator.clipboard.writeText(link);
    toast({ title: 'Link copied', description: 'Portal link copied to clipboard' });
  };

  const sendInviteEmail = async (member: TeamMember) => {
    if (!member.email) {
      toast({ title: 'No email', description: 'Add an email address first', variant: 'destructive' });
      return;
    }
    
    setSendingInvite(member.id);
    try {
      const existingInvite = getInvitationForCloser(member.name, member.email);
      
      if (existingInvite && existingInvite.status === 'pending' && !isPast(new Date(existingInvite.expires_at))) {
        await resendInvitation.mutateAsync(existingInvite.id);
        const { error } = await supabase.functions.invoke('send-invite-email', {
          body: {
            email: member.email,
            token: existingInvite.id,
            inviteType: 'sales_rep',
            closerName: member.name,
            organizationId: currentOrganization?.id,
          },
        });
        if (!error) {
          toast({ title: 'Invite resent', description: `Signup invite resent to ${member.email}` });
        }
      } else if (!existingInvite || existingInvite.status !== 'accepted') {
        const invitation = await createInvitation.mutateAsync({ 
          email: member.email, 
          inviteType: 'sales_rep',
          closerName: member.name,
        });
        
        const { error } = await supabase.functions.invoke('send-invite-email', {
          body: {
            email: member.email,
            token: invitation.token,
            inviteType: 'sales_rep',
            closerName: member.name,
            organizationId: currentOrganization?.id,
          },
        });
        if (!error) {
          toast({ title: 'Invite sent', description: `Signup invite sent to ${member.email}` });
        }
      } else {
        toast({ title: 'Already accepted', description: 'This user has already accepted their invite' });
      }
    } catch (err: any) {
      toast({ title: 'Failed to send', description: err.message, variant: 'destructive' });
    } finally {
      setSendingInvite(null);
    }
  };

  const syncClosersFromCalendly = async () => {
    if (!currentOrganization?.id) return;
    
    setSyncingFromCalendly(true);
    try {
      const { data, error } = await supabase.functions.invoke('sync-calendly-hosts', {
        body: { organizationId: currentOrganization.id },
      });
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['closers'] });
      
      if (data.added > 0) {
        toast({ 
          title: 'Closers synced', 
          description: `Added ${data.added} new closer${data.added > 1 ? 's' : ''} from Calendly` 
        });
      } else {
        toast({ 
          title: 'Already synced', 
          description: 'All Calendly hosts are already in your closers list' 
        });
      }
    } catch (err: any) {
      console.error('Sync from Calendly failed:', err);
      toast({ 
        title: 'Sync failed', 
        description: err.message || 'Failed to sync from Calendly', 
        variant: 'destructive' 
      });
    } finally {
      setSyncingFromCalendly(false);
    }
  };

  const InviteStatusBadge = ({ member }: { member: TeamMember }) => {
    const { status, invitation } = getInviteStatus(member);
    
    switch (status) {
      case 'linked':
      case 'accepted':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 hover:bg-emerald-500/20">
            <CheckCircle className="h-3 w-3 mr-1" />
            Linked
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="secondary" className="gap-1">
            <Clock className="h-3 w-3" />
            Pending
          </Badge>
        );
      case 'expired':
        return (
          <Badge variant="destructive" className="gap-1">
            <XCircle className="h-3 w-3" />
            Expired
          </Badge>
        );
      default:
        return member.email ? (
          <Badge variant="outline" className="text-muted-foreground">
            Not invited
          </Badge>
        ) : null;
    }
  };

  const renderClosersTable = () => {
    if (closersLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (closers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <UserCheck className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No closers yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first closer or sync from Calendly
          </p>
          <div className="flex gap-2">
            <Button onClick={() => setAddCloserOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Closer
            </Button>
            <Button variant="outline" onClick={syncClosersFromCalendly} disabled={syncingFromCalendly}>
              {syncingFromCalendly ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Sync from Calendly
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[120px]">Status</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {closers.map((closer) => {
              const { status } = getInviteStatus(closer);
              const isLinked = status === 'linked' || status === 'accepted';
              
              return (
                <TableRow key={closer.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                          {closer.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span>{closer.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {closer.email ? (
                      <span className="text-muted-foreground">{closer.email}</span>
                    ) : (
                      <span className="text-muted-foreground/50 italic">No email</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <InviteStatusBadge member={closer} />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={closer.is_active}
                      onCheckedChange={(checked) => 
                        toggleActive.mutate({ id: closer.id, table: 'closers', isActive: checked })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => copyPortalLink(closer.name)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Portal Link
                        </DropdownMenuItem>
                        {closer.email && !isLinked && (
                          <DropdownMenuItem 
                            onClick={() => sendInviteEmail(closer)}
                            disabled={sendingInvite === closer.id}
                          >
                            {sendingInvite === closer.id ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            {status === 'pending' ? 'Resend Invite' : 'Send Invite'}
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onClick={() => deleteMember.mutate({ id: closer.id, table: 'closers' })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderSettersTable = () => {
    if (settersLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (setters.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Phone className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No setters yet</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Add your first setter to start tracking bookings
          </p>
          <Button onClick={() => setAddSetterOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Setter
          </Button>
        </div>
      );
    }

    return (
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[200px]">Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="w-[100px]">Active</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {setters.map((setter) => (
              <TableRow key={setter.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center">
                      <span className="text-sm font-semibold text-secondary-foreground">
                        {setter.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <span>{setter.name}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {setter.email ? (
                    <span className="text-muted-foreground">{setter.email}</span>
                  ) : (
                    <span className="text-muted-foreground/50 italic">No email</span>
                  )}
                </TableCell>
                <TableCell>
                  <Switch
                    checked={setter.is_active}
                    onCheckedChange={(checked) => 
                      toggleActive.mutate({ id: setter.id, table: 'setters', isActive: checked })
                    }
                  />
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteMember.mutate({ id: setter.id, table: 'setters' })}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          Team Members
        </CardTitle>
        <CardDescription>
          Manage your sales team — closers run calls, setters book them
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-4">
            <TabsList>
              <TabsTrigger value="closers" className="gap-2">
                <UserCheck className="h-4 w-4" />
                Closers
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {closers.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="setters" className="gap-2">
                <Phone className="h-4 w-4" />
                Setters
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {setters.length}
                </Badge>
              </TabsTrigger>
            </TabsList>
            
            <div className="flex gap-2">
              {activeTab === 'closers' && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={syncClosersFromCalendly}
                    disabled={syncingFromCalendly}
                  >
                    {syncingFromCalendly ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Sync Calendly
                  </Button>
                  <Dialog open={addCloserOpen} onOpenChange={setAddCloserOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Add Closer
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add New Closer</DialogTitle>
                        <DialogDescription>
                          Add a closer to your team. If you include their email, they'll receive an invite to create their account.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="closer-name">Name *</Label>
                          <Input
                            id="closer-name"
                            placeholder="John Smith"
                            value={newCloserName}
                            onChange={(e) => setNewCloserName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="closer-email">Email</Label>
                          <Input
                            id="closer-email"
                            type="email"
                            placeholder="john@company.com"
                            value={newCloserEmail}
                            onChange={(e) => setNewCloserEmail(e.target.value)}
                          />
                          <p className="text-xs text-muted-foreground">
                            This should match their Calendly email for automatic event matching
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setAddCloserOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => addCloser.mutate({ name: newCloserName.trim(), email: newCloserEmail.trim() })}
                          disabled={!newCloserName.trim() || addCloser.isPending}
                        >
                          {addCloser.isPending ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <Plus className="h-4 w-4 mr-2" />
                          )}
                          Add Closer
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}
              
              {activeTab === 'setters' && (
                <Dialog open={addSetterOpen} onOpenChange={setAddSetterOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Setter
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Setter</DialogTitle>
                      <DialogDescription>
                        Add a setter to your team to track who books calls.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="setter-name">Name *</Label>
                        <Input
                          id="setter-name"
                          placeholder="Jane Doe"
                          value={newSetterName}
                          onChange={(e) => setNewSetterName(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="setter-email">Email (optional)</Label>
                        <Input
                          id="setter-email"
                          type="email"
                          placeholder="jane@company.com"
                          value={newSetterEmail}
                          onChange={(e) => setNewSetterEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddSetterOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={() => addSetter.mutate({ name: newSetterName.trim(), email: newSetterEmail.trim() })}
                        disabled={!newSetterName.trim() || addSetter.isPending}
                      >
                        {addSetter.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Plus className="h-4 w-4 mr-2" />
                        )}
                        Add Setter
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>

          <TabsContent value="closers" className="mt-0">
            {renderClosersTable()}
            {closers.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                {closers.filter(c => c.is_active).length} active • Closers are matched to events by email first, then by name
              </p>
            )}
          </TabsContent>

          <TabsContent value="setters" className="mt-0">
            {renderSettersTable()}
            {setters.length > 0 && (
              <p className="text-xs text-muted-foreground mt-3">
                {setters.filter(s => s.is_active).length} active setters
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
