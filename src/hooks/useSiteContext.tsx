import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';

interface Site {
  id: string;
  name: string;
  code: string;
}

interface SiteContextType {
  currentSite: Site | null;
  setCurrentSite: (site: Site | null) => void;
  availableSites: Site[];
  loading: boolean;
}

const SiteContext = createContext<SiteContextType | undefined>(undefined);

export const SiteProvider = ({ children }: { children: ReactNode }) => {
  const [currentSite, setCurrentSite] = useState<Site | null>(null);
  const [availableSites, setAvailableSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const { isSuperAdmin } = useUserRole();

  useEffect(() => {
    loadSites();
  }, []);

  const loadSites = async () => {
    try {
      setLoading(true);
      
      if (isSuperAdmin()) {
        // Admins see all sites
        const { data, error } = await supabase
          .from('sites')
          .select('*')
          .order('name');
        
        if (error) throw error;
        setAvailableSites(data || []);
        
        // Set first site as default if none selected
        if (!currentSite && data && data.length > 0) {
          setCurrentSite(data[0]);
        }
      } else {
        // Regular users see only their assigned site
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('department_id, departments(site_id, sites(id, name, code))')
          .eq('id', user.id)
          .single();

        if (profile?.departments?.sites) {
          const userSite = profile.departments.sites;
          setAvailableSites([userSite]);
          setCurrentSite(userSite);
        }
      }
    } catch (error) {
      console.error('Error loading sites:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SiteContext.Provider value={{ currentSite, setCurrentSite, availableSites, loading }}>
      {children}
    </SiteContext.Provider>
  );
};

export const useSiteContext = () => {
  const context = useContext(SiteContext);
  if (context === undefined) {
    throw new Error('useSiteContext must be used within a SiteProvider');
  }
  return context;
};
