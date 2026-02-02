import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, XCircle, User } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface InviteData {
  id: string;
  email: string;
  invite_type: string;
  closer_name: string | null;
  status: string;
  expires_at: string;
  organization_id: string | null;
  organization_name?: string | null;
}

export default function AcceptInvite() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch and validate invite via secure edge function
  useEffect(() => {
    const fetchInvite = async () => {
      if (!token) {
        setInviteError('No invitation token provided');
        setIsLoading(false);
        return;
      }

      try {
        // Use edge function to validate invite (bypasses RLS securely)
        const { data, error } = await supabase.functions.invoke('validate-invite', {
          body: { token },
        });

        if (error) {
          console.error('Validate invite error:', error);
          setInviteError('Failed to validate invitation');
          setIsLoading(false);
          return;
        }

        if (!data.valid) {
          setInviteError(data.error || 'Invalid invitation link');
          setIsLoading(false);
          return;
        }

        const invitation = data.invitation;
        setInviteData({
          id: invitation.id,
          email: invitation.email,
          invite_type: invitation.invite_type,
          closer_name: invitation.closer_name,
          status: invitation.status,
          expires_at: invitation.expires_at,
          organization_id: invitation.organization_id,
          organization_name: invitation.organization_name,
        });
        setIsLoading(false);
      } catch (err) {
        console.error('Error validating invite:', err);
        setInviteError('Failed to validate invitation');
        setIsLoading(false);
      }
    };

    fetchInvite();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Please make sure your passwords match.',
        variant: 'destructive',
      });
      return;
    }

    const validation = signupSchema.safeParse({ name, password });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    if (!inviteData) return;

    setIsSubmitting(true);

    try {
      // Create the user account
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: inviteData.email,
        password,
        options: {
          data: { name },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (authError) {
        // Check if user already exists
        if (authError.message.includes('already registered')) {
          toast({
            title: 'Account Already Exists',
            description: 'An account with this email already exists. Please log in instead.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
        throw authError;
      }

      if (!authData.user) {
        throw new Error('Failed to create account');
      }

      // Wait a moment for the profile trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update the profile with linked_closer_name and name
      const { error: profileError } = inviteData.closer_name
        ? await supabase
            .from('profiles')
            .update({
              linked_closer_name: inviteData.closer_name,
              name: name
            })
            .eq('user_id', authData.user.id)
        : await supabase
            .from('profiles')
            .update({ name: name })
            .eq('user_id', authData.user.id);

      if (profileError) {
        throw new Error(`Failed to update profile: ${profileError.message}`);
      }

      // Add user role based on invite type
      // client_admin and admin get 'admin' role, sales_rep gets 'sales_rep'
      const userRole = inviteData.invite_type === 'sales_rep' ? 'sales_rep' : 'admin';
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({ user_id: authData.user.id, role: userRole });

      if (roleError) {
        throw new Error(`Failed to assign user role: ${roleError.message}`);
      }

      // Determine org membership role (admin invite = admin role, sales_rep = member)
      const orgMemberRole = inviteData.invite_type === 'admin' || inviteData.invite_type === 'client_admin' ? 'admin' : 'member';

      // Link the closer record to this user's profile if closer_name is provided
      if (inviteData.closer_name && inviteData.organization_id) {
        const { error: closerLinkError } = await supabase
          .from('closers')
          .update({ profile_id: authData.user.id })
          .eq('name', inviteData.closer_name)
          .eq('organization_id', inviteData.organization_id);
        
        if (closerLinkError) {
          console.warn('Failed to link closer record:', closerLinkError.message);
          // Don't throw - this is not critical
        }
      }

      // Add user to the organization if org_id exists
      if (inviteData.organization_id) {
        const { error: memberError } = await supabase
          .from('organization_members')
          .insert({
            user_id: authData.user.id,
            organization_id: inviteData.organization_id,
            role: orgMemberRole
          });
        
        if (memberError) {
          console.warn('Failed to add user to organization:', memberError.message);
        }

        // Also update the user's profile to set current_organization_id
        await supabase
          .from('profiles')
          .update({ current_organization_id: inviteData.organization_id })
          .eq('user_id', authData.user.id);
      }

      // Mark invitation as accepted
      const { error: inviteUpdateError } = await supabase
        .from('invitations')
        .update({
          status: 'accepted',
          accepted_at: new Date().toISOString()
        })
        .eq('id', inviteData.id);

      if (inviteUpdateError) {
        throw new Error(`Failed to update invitation status: ${inviteUpdateError.message}`);
      }

      toast({
        title: 'Account Created!',
        description: 'Welcome to SalesTracker. Redirecting to your dashboard...',
      });

      // Redirect to the app
      setTimeout(() => {
        navigate('/');
      }, 1500);

    } catch (error: any) {
      console.error('Signup error:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create account. Please try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Validating invitation...</p>
        </div>
      </div>
    );
  }

  if (inviteError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <CardTitle>Invalid Invitation</CardTitle>
            <CardDescription>{inviteError}</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => navigate('/auth')} variant="outline">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getInviteTypeLabel = () => {
    switch (inviteData?.invite_type) {
      case 'sales_rep':
        return 'a Sales Rep';
      case 'admin':
        return 'an Organization Member';
      case 'client_admin':
        return 'an Admin';
      default:
        return 'a Whitelabel Partner';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <User className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Join SalesTracker</CardTitle>
          <CardDescription>
            You've been invited as {' '}
            <span className="font-medium text-foreground">
              {getInviteTypeLabel()}
            </span>
            {inviteData?.organization_name && (
              <>
                <br />
                <span className="text-sm">Organization: <strong>{inviteData.organization_name}</strong></span>
              </>
            )}
            {inviteData?.closer_name && (
              <>
                <br />
                <span className="text-sm">Linked to: <strong>{inviteData.closer_name}</strong></span>
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={inviteData?.email || ''}
                disabled
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                This is the email your invitation was sent to
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John Smith"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Create Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm Password</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating your account...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Create Account & Get Started
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              Already have an account?{' '}
              <button 
                onClick={() => navigate('/auth')}
                className="text-primary hover:underline font-medium"
              >
                Log in instead
              </button>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
