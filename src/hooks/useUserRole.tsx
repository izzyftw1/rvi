import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type UserRole = 
  | 'super_admin'
  | 'finance_admin'
  | 'finance_user'
  | 'ops_manager'
  | 'production'
  | 'quality'
  | 'stores'
  | 'packing'
  | 'sales'
  | 'admin'
  | 'accounts'
  | 'purchase'
  | 'logistics';

export const useUserRole = () => {
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [impersonatedRole, setImpersonatedRole] = useState<UserRole | null>(null);

  useEffect(() => {
    loadUserRoles();
  }, []);

  const loadUserRoles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setRoles([]);
        setLoading(false);
        return;
      }

      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      setRoles(userRoles?.map(r => r.role as UserRole) || []);
    } catch (error) {
      console.error('Error loading user roles:', error);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  const hasRole = (role: UserRole): boolean => {
    // If impersonating, check impersonated role
    if (impersonatedRole) {
      return impersonatedRole === role;
    }
    return roles.includes(role);
  };

  const hasAnyRole = (checkRoles: UserRole[]): boolean => {
    // If impersonating, check if impersonated role is in the list
    if (impersonatedRole) {
      return checkRoles.includes(impersonatedRole);
    }
    return roles.some(role => checkRoles.includes(role));
  };

  const isFinanceRole = (): boolean => {
    const financeRoles: UserRole[] = ['super_admin', 'finance_admin', 'finance_user', 'admin', 'accounts'];
    return hasAnyRole(financeRoles);
  };

  const isSuperAdmin = (): boolean => {
    return hasAnyRole(['super_admin', 'admin']);
  };

  const impersonate = (role: UserRole | null) => {
    // Only super admins can impersonate
    if (isSuperAdmin()) {
      setImpersonatedRole(role);
    }
  };

  return {
    roles,
    loading,
    hasRole,
    hasAnyRole,
    isFinanceRole,
    isSuperAdmin,
    impersonatedRole,
    impersonate,
  };
};
