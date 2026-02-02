import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'sales_rep' | 'super_admin';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  isSalesRep: boolean;
  isSuperAdmin: boolean;
  userRole: AppRole | null;
  profile: { id: string; name: string; email: string; linked_closer_name?: string | null; current_organization_id?: string | null } | null;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signUp: (email: string, password: string, name: string) => Promise<{ data: { user: User | null } | null; error: AuthError | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSalesRep, setIsSalesRep] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<{ id: string; name: string; email: string; linked_closer_name?: string | null; current_organization_id?: string | null } | null>(null);

  const fetchUserRole = useCallback(async (userId: string) => {
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (roleData) {
      const role = roleData.role as AppRole;
      setUserRole(role);
      setIsSuperAdmin(role === 'super_admin');
      setIsAdmin(role === 'admin' || role === 'super_admin');
      setIsSalesRep(role === 'sales_rep');
    }
  }, []);

  const fetchUserProfile = useCallback(async (userId: string) => {
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, name, email, linked_closer_name, current_organization_id')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileData) {
      setProfile(profileData);
    }
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        setTimeout(() => {
          fetchUserRole(session.user.id);
          fetchUserProfile(session.user.id);
        }, 0);
      } else {
        setIsAdmin(false);
        setIsSalesRep(false);
        setIsSuperAdmin(false);
        setUserRole(null);
        setProfile(null);
      }
      
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserRole(session.user.id);
        fetchUserProfile(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [fetchUserRole, fetchUserProfile]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUp = async (email: string, password: string, name: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { name }
      }
    });
    return { data, error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      loading,
      isAdmin,
      isSalesRep,
      isSuperAdmin,
      userRole,
      profile,
      signIn,
      signUp,
      signOut
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}