import { useDepartmentPermissions } from './useDepartmentPermissions';

/**
 * @deprecated Use useDepartmentPermissions instead.
 * This hook is kept for backward compatibility but now wraps useDepartmentPermissions.
 * Permissions are now based on department type, not roles.
 */
export type UserRole = string;

export const useUserRole = () => {
  const { 
    userDepartmentType, 
    isBypassUser, 
    loading 
  } = useDepartmentPermissions();

  // Map department types to legacy role checks
  const hasRole = (role: string): boolean => {
    if (isBypassUser) return true;
    
    // Map legacy role names to department types
    const roleToDepth: Record<string, string> = {
      'admin': 'admin',
      'super_admin': 'admin',
      'finance_admin': 'finance',
      'finance_user': 'finance',
      'accounts': 'finance',
      'production': 'production',
      'quality': 'quality',
      'packing': 'packing',
      'stores': 'packing',
      'sales': 'sales',
      'design': 'design',
      'hr': 'hr',
    };
    
    return roleToDepth[role] === userDepartmentType;
  };

  const hasAnyRole = (roles: string[]): boolean => {
    return roles.some(role => hasRole(role));
  };

  const isFinanceRole = (): boolean => {
    return userDepartmentType === 'finance' || userDepartmentType === 'admin';
  };

  const isSuperAdmin = (): boolean => {
    return userDepartmentType === 'admin';
  };

  return {
    roles: userDepartmentType ? [userDepartmentType] : [],
    loading,
    hasRole,
    hasAnyRole,
    isFinanceRole,
    isSuperAdmin,
    impersonatedRole: null,
    impersonate: () => {}, // No-op, impersonation not supported in department model
  };
};
