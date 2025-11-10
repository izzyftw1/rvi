import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, LogOut, Factory, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import rvLogo from "@/assets/rv-logo.jpg";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSiteContext } from "@/hooks/useSiteContext";
import { GlobalSearch } from "./GlobalSearch";

interface NavigationHeaderProps {
  title?: string;
  subtitle?: string;
}

export const NavigationHeader = ({ title, subtitle }: NavigationHeaderProps) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { currentSite, setCurrentSite, availableSites, loading: sitesLoading } = useSiteContext();

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (data) {
        setProfile(data);
      }

      // Check if user has admin role
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      setIsAdmin(roles?.some(r => r.role === 'admin') || false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const handleBack = () => {
    navigate(-1);
  };

  const handleHome = () => {
    navigate("/");
  };

  return (
    <header className="border-b bg-card sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Back and Home Buttons */}
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="hover:bg-primary/10"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleHome}
                className="hover:bg-primary/10"
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
            </div>
            
            {/* Page Title or App Branding */}
            {title ? (
              <div className="ml-4 border-l pl-4">
                <h1 className="text-lg font-bold">{title}</h1>
                {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
              </div>
            ) : (
              <div className="flex items-center gap-2 ml-4 border-l pl-4">
                <img 
                  src={rvLogo} 
                  alt="RV Industries Logo" 
                  className="h-12 object-contain"
                />
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            {/* Global Search */}
            <GlobalSearch />
            
            {/* Site Selector */}
            {!sitesLoading && availableSites.length > 0 && (
              <div className="flex items-center gap-2">
                <Factory className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={currentSite?.id || ""}
                  onValueChange={(value) => {
                    const site = availableSites.find(s => s.id === value);
                    if (site) setCurrentSite(site);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Select site" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSites.map((site) => (
                      <SelectItem key={site.id} value={site.id}>
                        {site.name} ({site.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Admin Panel Link for Admin Users */}
            {isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/admin")}
                className="hover:bg-primary/10"
              >
                <Shield className="h-4 w-4 mr-2" />
                Admin
              </Button>
            )}

            {/* User Info and Logout */}
            <div className="flex items-center gap-4">
              {profile && (
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-medium">{profile.full_name}</p>
                  <p className="text-xs text-muted-foreground capitalize">
                    {profile.role?.replace('_', ' ')}
                  </p>
                </div>
              )}
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
