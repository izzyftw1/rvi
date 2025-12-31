import { ReactNode } from 'react';
import { useDepartmentPermissions } from '@/hooks/useDepartmentPermissions';

interface PermissionGateProps {
  pageKey: string;
  children: ReactNode;
  fallback?: ReactNode;
  requireMutate?: boolean;
}

/**
 * PermissionGate - Conditionally renders children based on department permissions
 * 
 * Use this component to wrap UI elements that should only be visible
 * to users with appropriate department permissions.
 * 
 * @param pageKey - The page key from department_defaults (e.g., 'sales-orders', 'invoices')
 * @param children - Content to render if user has permission
 * @param fallback - Optional content to render if user lacks permission
 * @param requireMutate - If true, requires can_mutate permission instead of can_view
 * 
 * @example
 * <PermissionGate pageKey="finance-dashboard">
 *   <FinancialData />
 * </PermissionGate>
 * 
 * @example
 * <PermissionGate pageKey="work-orders" requireMutate>
 *   <EditButton />
 * </PermissionGate>
 */
export const PermissionGate = ({ 
  pageKey, 
  children, 
  fallback = null,
  requireMutate = false 
}: PermissionGateProps) => {
  const { loading, getPagePermission } = useDepartmentPermissions();

  if (loading) {
    return null; // Don't render anything while loading permissions
  }

  const permission = getPagePermission(pageKey);

  if (requireMutate) {
    return permission.canMutate ? <>{children}</> : <>{fallback}</>;
  }

  return permission.canView ? <>{children}</> : <>{fallback}</>;
};

/**
 * MutationGate - Specifically for mutation permissions (create/update/delete)
 */
export const MutationGate = ({ 
  pageKey, 
  children, 
  fallback = null 
}: Omit<PermissionGateProps, 'requireMutate'>) => {
  return (
    <PermissionGate pageKey={pageKey} requireMutate fallback={fallback}>
      {children}
    </PermissionGate>
  );
};
