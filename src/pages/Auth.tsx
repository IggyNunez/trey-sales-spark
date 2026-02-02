import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, BarChart3, Users, TrendingUp } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

interface InviteData {
  id: string;
  email: string;
  invite_type: string;
  closer_name: string | null;
  expires_at: string;
}

export default function Auth() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  
  const [isLoading, setIsLoading] = useState(false);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  
  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Fetch invite data if token is present
  useEffect(() => {
    if (inviteToken) {
      const fetchInvite = async () => {
        const { data, error } = await supabase
          .from('invitations')
          .select('id, email, invite_type, closer_name, expires_at')
          .eq('token', inviteToken)
          .eq('status', 'pending')
          .maybeSingle();

        if (data && !error) {
          // SECURITY: Check if invitation has expired
          if (new Date(data.expires_at) < new Date()) {
            toast({
              title: 'Invitation Expired',
              description: 'This invitation has expired. Please request a new one.',
              variant: 'destructive',
            });
            return;
          }
          setInviteData(data);
          setSignupEmail(data.email);
        }
      };
      fetchInvite();
    }
  }, [inviteToken]);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = loginSchema.safeParse({ email: loginEmail, password: loginPassword });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    const { error } = await signIn(loginEmail, loginPassword);
    setIsLoading(false);
    
    if (error) {
      toast({
        title: 'Login Failed',
        description: error.message === 'Invalid login credentials' 
          ? 'Invalid email or password. Please try again.'
          : error.message,
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Welcome back!',
        description: 'You have successfully logged in.',
      });
      navigate('/');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const validation = signupSchema.safeParse({ 
      name: signupName, 
      email: signupEmail, 
      password: signupPassword 
    });
    if (!validation.success) {
      toast({
        title: 'Validation Error',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }
    
    setIsLoading(true);
    const { error, data } = await signUp(signupEmail, signupPassword, signupName);
    
    if (error) {
      setIsLoading(false);
      if (error.message.includes('already registered')) {
        toast({
          title: 'Account Exists',
          description: 'An account with this email already exists. Please log in instead.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Signup Failed',
          description: error.message,
          variant: 'destructive',
        });
      }
    } else {
      // If this was an invite signup, update the profile and invitation
      if (inviteData && data?.user) {
        // Update the profile with linked_closer_name
        if (inviteData.closer_name) {
          await supabase
            .from('profiles')
            .update({ linked_closer_name: inviteData.closer_name })
            .eq('user_id', data.user.id);
        }
        
        // Mark invitation as accepted
        await supabase
          .from('invitations')
          .update({ 
            status: 'accepted', 
            accepted_at: new Date().toISOString() 
          })
          .eq('id', inviteData.id);
        
        // Add user role based on invite type
        const role = inviteData.invite_type === 'sales_rep' ? 'sales_rep' : 'admin';
        await supabase
          .from('user_roles')
          .insert({ user_id: data.user.id, role });
      }
      
      setIsLoading(false);
      toast({
        title: 'Account Created',
        description: 'Your account has been created. Please check your email to verify.',
      });
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Branding (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-1/2 gradient-primary p-12 flex-col justify-between">
        <div>
          <h1 className="text-3xl font-bold text-primary-foreground">SalesTracker</h1>
          <p className="text-primary-foreground/80 mt-2">Enterprise Sales Performance Platform</p>
        </div>
        
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary-foreground/10">
              <BarChart3 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-foreground">Real-time Analytics</h3>
              <p className="text-primary-foreground/70 text-sm">Track every call, close rate, and revenue metric in real-time</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary-foreground/10">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-foreground">Team Performance</h3>
              <p className="text-primary-foreground/70 text-sm">Monitor individual and team metrics at a glance</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-primary-foreground/10">
              <TrendingUp className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-primary-foreground">Revenue Attribution</h3>
              <p className="text-primary-foreground/70 text-sm">Attribute revenue to setters, closers, and sources</p>
            </div>
          </div>
        </div>
        
        <p className="text-primary-foreground/60 text-sm">
          Built for high-volume sales teams
        </p>
      </div>
      
      {/* Right side - Auth forms */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-4 sm:p-8 bg-background">
        <Card className="w-full max-w-md border-0 shadow-xl">
          <CardHeader className="text-center px-4 sm:px-6">
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
                <span className="font-display text-xl font-bold text-primary-foreground">SR</span>
              </div>
            </div>
            <CardTitle className="text-xl sm:text-2xl">Welcome</CardTitle>
            <CardDescription className="text-sm">Sign in to your account or create a new one</CardDescription>
          </CardHeader>
          <CardContent className="px-4 sm:px-6">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6 h-12">
                <TabsTrigger value="login" className="text-sm sm:text-base h-10">Login</TabsTrigger>
                <TabsTrigger value="signup" className="text-sm sm:text-base h-10">Sign Up</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email" className="text-sm">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@company.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password" className="text-sm">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Signing in...
                      </>
                    ) : (
                      'Sign In'
                    )}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name" className="text-sm">Full Name</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="John Smith"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email" className="text-sm">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="you@company.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password" className="text-sm">Password</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      required
                      className="h-12 text-base"
                    />
                  </div>
                  <Button type="submit" className="w-full h-12 text-base" disabled={isLoading}>
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      'Create Account'
                    )}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}