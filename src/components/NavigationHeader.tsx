import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, LogOut, Factory } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

interface NavigationHeaderProps {
  title?: string;
  subtitle?: string;
}

export const NavigationHeader = ({ title, subtitle }: NavigationHeaderProps) => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);

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
                <div className="p-1.5 bg-primary rounded-lg">
                  <Factory className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <h1 className="text-lg font-bold">RV Industries</h1>
                  <p className="text-xs text-muted-foreground">Manufacturing Traceability</p>
                </div>
              </div>
            )}
          </div>
          
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
    </header>
  );
};
