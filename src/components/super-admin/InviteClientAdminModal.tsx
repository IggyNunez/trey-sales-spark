import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, UserPlus, Copy, Check, Mail } from 'lucide-react';

interface Organization {
  id: string;
  name: string;
  slug: string | null;
}

interface InviteClientAdminModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organization: Organization | null;
  onSuccess?: () => void;
}

export function InviteClientAdminModal({
  open,
  onOpenChange,
  organization,
  onSuccess,
}: InviteClientAdminModalProps) {
  const [email, setEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInviteMutation = useMutation({
    mutationFn: async (email: string) => {
      if (!organization || !user) {
        throw new Error('Missing organization or user');
      }

      // Create the invitation with client_admin type
      const { data: invitation, error } = await supabase
        .from('invitations')
        .insert({
          email: email.toLowerCase().trim(),
          invite_type: 'client_admin',
          organization_id: organization.id,
          invited_by: user.id,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          throw new Error('An invitation for this email already exists');
        }
        throw error;
      }

      // Try to send the email
      try {
        const { error: emailError } = await supabase.functions.invoke('send-invite-email', {
          body: {
            email: email.toLowerCase().trim(),
            token: invitation.token,
            inviteType: 'client_admin',
            organizationName: organization.name,
          },
        });

        if (emailError) {
          console.error('Email send error:', emailError);
          // Don't throw - invitation was created successfully
        }
      } catch (e) {
        console.error('Failed to send email:', e);
        // Don't throw - invitation was created successfully
      }

      return invitation;
    },
    onSuccess: (data) => {
      const baseUrl = window.location.origin;
      const link = `${baseUrl}/accept-invite?token=${data.token}`;
      setInviteLink(link);

      toast({
        title: 'Invitation Created',
        description: `Admin invitation sent to ${email}`,
      });

      queryClient.invalidateQueries({ queryKey: ['super-admin-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create invitation',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: 'Error',
        description: 'Please enter a valid email address',
        variant: 'destructive',
      });
      return;
    }

    createInviteMutation.mutate(email);
  };

  const handleCopyLink = async () => {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast({
        title: 'Copied!',
        description: 'Invite link copied to clipboard',
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to copy link',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setEmail('');
    setInviteLink(null);
    setCopied(false);
    createInviteMutation.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Invite Client Admin
          </DialogTitle>
          <DialogDescription>
            Invite an admin to manage{' '}
            <span className="font-medium text-foreground">{organization?.name}</span>.
            They'll have full access to this organization only.
          </DialogDescription>
        </DialogHeader>

        {!inviteLink ? (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="client@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={createInviteMutation.isPending}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  An invitation email will be sent with a link to create their account.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={createInviteMutation.isPending}>
                {createInviteMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send Invitation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-muted p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-600">
                <Check className="h-4 w-4" />
                Invitation Created Successfully
              </div>
              <p className="text-sm text-muted-foreground">
                An email has been sent to <strong>{email}</strong>. You can also share this invite link directly:
              </p>
              <div className="flex items-center gap-2">
                <Input
                  value={inviteLink}
                  readOnly
                  className="text-xs bg-background"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCopyLink}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
