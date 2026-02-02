import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
}

interface OrganizationMember {
  organization_id: string;
  role: string;
  organization: Organization;
}

interface OrganizationContextType {
  organizations: Organization[];
  currentOrganization: Organization | null;
  setCurrentOrganization: (org: Organization | null) => void;
  isLoadingOrgs: boolean;
  userOrgRole: string | null;
  createOrganization: (name: string, slug: string) => Promise<{ data: Organization | null; error: Error | null }>;
  switchOrganization: (orgId: string) => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined);

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrganization, setCurrentOrganization] = useState<Organization | null>(null);
  const [isLoadingOrgs, setIsLoadingOrgs] = useState(true);
  const [userOrgRole, setUserOrgRole] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    
    if (!user) {
      setOrganizations([]);
      setCurrentOrganization(null);
      setUserOrgRole(null);
      setIsLoadingOrgs(false);
      return;
    }

    fetchOrganizations();
  }, [user, authLoading]);

  const fetchOrganizations = async () => {
    if (!user) return;
    
    setIsLoadingOrgs(true);
    
    try {
      // Just fetch all organizations - RLS will handle what user can see
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .order('name');
      
      if (error) {
        console.error('Error fetching organizations:', error);
        throw error;
      }
      
      setOrganizations(data || []);
      
      // Set current org from localStorage or first org
      const savedOrgId = localStorage.getItem('currentOrganizationId');
      const savedOrg = data?.find(o => o.id === savedOrgId);
      if (savedOrg) {
        setCurrentOrganization(savedOrg);
      } else if (data && data.length > 0) {
        setCurrentOrganization(data[0]);
        localStorage.setItem('currentOrganizationId', data[0].id);
      }
      
      // Check user's role - first check if super admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (roleData?.role === 'super_admin') {
        setUserOrgRole('super_admin');
      } else if (currentOrganization) {
        // Get role for current org
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('role')
          .eq('user_id', user.id)
          .eq('organization_id', currentOrganization.id)
          .maybeSingle();
        
        setUserOrgRole(memberData?.role || null);
      }
    } catch (error) {
      console.error('Error fetching organizations:', error);
    } finally {
      setIsLoadingOrgs(false);
    }
  };

  const switchOrganization = async (orgId: string) => {
    const org = organizations.find(o => o.id === orgId);
    if (org) {
      setCurrentOrganization(org);
      localStorage.setItem('currentOrganizationId', orgId);
      
      // Update role for this org
      if (user) {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .maybeSingle();
        
        if (roleData?.role === 'super_admin') {
          setUserOrgRole('super_admin');
        } else {
          const { data } = await supabase
            .from('organization_members')
            .select('role')
            .eq('user_id', user.id)
            .eq('organization_id', orgId)
            .maybeSingle();
          
          setUserOrgRole(data?.role || null);
        }
      }
    }
  };

  const createOrganization = async (name: string, slug: string): Promise<{ data: Organization | null; error: Error | null }> => {
    if (!user) return { data: null, error: new Error('Not authenticated') };
    
    try {
      // Create the organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({ name, slug })
        .select()
        .single();
      
      if (orgError) throw orgError;
      
      // Add the creator as owner
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: 'owner'
        });
      
      if (memberError) throw memberError;
      
      // Refresh organizations list
      await fetchOrganizations();
      
      return { data: org, error: null };
    } catch (error) {
      return { data: null, error: error as Error };
    }
  };

  return (
    <OrganizationContext.Provider value={{
      organizations,
      currentOrganization,
      setCurrentOrganization,
      isLoadingOrgs,
      userOrgRole,
      createOrganization,
      switchOrganization
    }}>
      {children}
    </OrganizationContext.Provider>
  );
}

export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (context === undefined) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
