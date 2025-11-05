import { useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { UnifiedNavigation } from "@/components/UnifiedNavigation";

export const MainLayout = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setUser(session.user);
        loadRoles(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        loadRoles(session.user.id);
      } else {
        setUser(null);
        setUserRoles([]);
        navigate("/auth");
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);

  const loadRoles = async (userId: string) => {
    const { data: rolesData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);
    
    if (rolesData) {
      setUserRoles(rolesData.map(r => r.role));
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {user && <UnifiedNavigation userRoles={userRoles} />}
      
      <main className="w-full">
        <Outlet />
      </main>
    </div>
  );
};
