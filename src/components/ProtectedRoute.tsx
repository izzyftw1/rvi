import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { RoutePermissionGuard } from './RoutePermissionGuard';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const lastDeptTimestamp = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      if (!session) {
        navigate('/auth');
        return;
      }
      // Check if user is active and record dept timestamp
      checkUserActive(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (!session) {
          navigate('/auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [navigate]);

  // Check user is active + monitor role changes for forced reauth
  const checkUserActive = async (userId: string) => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active, updated_at')
      .eq('id', userId)
      .single();

    if (profile) {
      // Block inactive users
      if (profile.is_active === false) {
        await supabase.auth.signOut();
        navigate('/auth');
        return;
      }
      lastDeptTimestamp.current = profile.updated_at;
    }
  };

  // Subscribe to profile changes for role-change forced reauth
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel('profile-reauth-watch')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${session.user.id}`,
      }, async (payload) => {
        const newProfile = payload.new as any;
        
        // If user was deactivated, force logout
        if (newProfile.is_active === false) {
          await supabase.auth.signOut();
          navigate('/auth');
          return;
        }

        // If department changed (updated_at changed by trigger), force re-login
        if (lastDeptTimestamp.current && newProfile.updated_at !== lastDeptTimestamp.current) {
          // Check if department_id actually changed
          const oldProfile = payload.old as any;
          if (oldProfile.department_id !== newProfile.department_id) {
            await supabase.auth.signOut();
            navigate('/auth');
          } else {
            lastDeptTimestamp.current = newProfile.updated_at;
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, navigate]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen">Loading...</div>;
  }

  if (!session) {
    return null;
  }

  return (
    <RoutePermissionGuard>
      {children}
    </RoutePermissionGuard>
  );
};
