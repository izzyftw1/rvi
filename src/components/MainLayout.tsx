import { useEffect, useState } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationBar } from "@/components/NavigationBar";
import { Button } from "@/components/ui/button";
import rvLogo from "@/assets/rv-logo.jpg";
import { QrCode, LogOut } from "lucide-react";

export const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadProfile(session.user.id);
      } else {
        setUser(null);
        setProfile(null);
        setUserRoles([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadProfile = async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (data) {
      setProfile(data);
    }

    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (rolesData) {
      setUserRoles(rolesData.map(r => r.role));
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Main Header - Sticky at top */}
      <header className="sticky top-0 z-50 bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate("/")}>
              <img 
                src={rvLogo} 
                alt="RV Industries Logo" 
                className="h-12 object-contain"
              />
              <div>
                <h1 className="text-lg font-bold">R.V. Industries</h1>
                <p className="text-xs text-muted-foreground">Manufacturing Control Center</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button 
                onClick={() => navigate("/scan-console")} 
                variant="default"
                size="sm"
                className="gap-2"
              >
                <QrCode className="h-4 w-4" />
                <span className="hidden sm:inline">Scan Console</span>
              </Button>
              {profile && (
                <div className="hidden md:flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium">{profile?.full_name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{profile?.role?.replace('_', ' ')}</p>
                  </div>
                  <Button 
                    onClick={handleLogout} 
                    variant="ghost" 
                    size="icon"
                    title="Logout"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Navigation Bar - Directly below header */}
        {user && <NavigationBar userRoles={userRoles} />}
      </header>

      {/* Main Content Area */}
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  );
};
