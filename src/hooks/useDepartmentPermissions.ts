import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DepartmentDefault {
  department_type: string;
  page_key: string;
  can_view: boolean;
  can_access_route: boolean;
  can_mutate: boolean;
}

interface PermissionResult {
  canView: boolean;
  canAccessRoute: boolean;
  canMutate: boolean;
}

// Map route paths to page_keys used in department_defaults
const routeToPageKey: Record<string, string> = {
  '/sales': 'sales-orders',
  '/customers': 'customers',
  '/items': 'items',
  '/purchase/raw-po': 'raw-po',
  '/material-requirements': 'material-requirements',
  '/purchase/dashboard': 'purchase-dashboard',
  '/work-orders': 'work-orders',
  '/daily-production-log': 'daily-production-log',
  '/floor-dashboard': 'floor-dashboard',
  '/cnc-dashboard': 'cnc-dashboard',
  '/production-progress': 'production-progress',
  '/machine-utilisation': 'machine-utilisation',
  '/operator-efficiency': 'operator-efficiency',
  '/setter-efficiency': 'setter-efficiency',
  '/downtime-analytics': 'downtime-analytics',
  '/quality': 'quality-dashboard',
  '/qc/incoming': 'qc-incoming',
  '/hourly-qc': 'hourly-qc',
  '/final-qc': 'final-qc',
  '/ncr': 'ncr',
  '/quality/traceability': 'traceability',
  '/quality/documents': 'quality-documents',
  '/quality/analytics': 'quality-analytics',
  '/tolerance-setup': 'tolerances',
  '/instruments': 'instruments',
  '/finance/dashboard': 'finance-dashboard',
  '/finance/invoices': 'invoices',
  '/finance/receipts': 'receipts',
  '/finance/supplier-payments': 'supplier-payments',
  '/finance/adjustments': 'adjustments',
  '/finance/tds': 'tds-report',
  '/finance/aging': 'aging',
  '/reports/reconciliation': 'reconciliations',
  '/finance/reports': 'finance-reports',
  '/finance/settings': 'finance-settings',
  '/gate-register': 'gate-register',
  '/logistics': 'logistics-dashboard',
  '/finished-goods': 'finished-goods',
  '/packing': 'packing',
  '/dispatch': 'dispatch',
  '/partner-dashboard': 'partner-dashboard',
  '/external-efficiency': 'external-analytics',
  '/admin': 'admin-panel',
  '/factory-calendar': 'factory-calendar',
};

// Admin & Finance roles that bypass all permission checks
const BYPASS_ROLES = ['admin', 'super_admin', 'finance_admin', 'accounts'];

export const useDepartmentPermissions = () => {
  const [departmentDefaults, setDepartmentDefaults] = useState<DepartmentDefault[]>([]);
  const [userDepartmentType, setUserDepartmentType] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Load user roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);
      
      const roles = rolesData?.map(r => r.role) || [];
      setUserRoles(roles);

      // Check if user bypasses permission checks
      const bypassCheck = roles.some(role => BYPASS_ROLES.includes(role));
      
      if (bypassCheck) {
        // Admin/Finance bypass - set empty defaults, checks will return true
        setDepartmentDefaults([]);
        setUserDepartmentType(null);
        setLoading(false);
        return;
      }

      // Load user's department type from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('department_id')
        .eq('id', user.id)
        .single();

      if (profileData?.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('type')
          .eq('id', profileData.department_id)
          .single();
        
        if (deptData) {
          setUserDepartmentType(deptData.type);
        }
      }

      // Load all department defaults
      const { data: defaults } = await supabase
        .from('department_defaults')
        .select('*');
      
      setDepartmentDefaults(defaults || []);
    } catch (error) {
      console.error('Error loading department permissions:', error);
    } finally {
      setLoading(false);
    }
  };

  // Check if user bypasses all permission checks (Admin/Finance)
  const isBypassUser = useMemo(() => {
    return userRoles.some(role => BYPASS_ROLES.includes(role));
  }, [userRoles]);

  // Get permission for a specific page key
  const getPagePermission = useCallback((pageKey: string): PermissionResult => {
    // Admin/Finance bypass - full access
    if (isBypassUser) {
      return { canView: true, canAccessRoute: true, canMutate: true };
    }

    // No department assigned - default deny
    if (!userDepartmentType) {
      return { canView: false, canAccessRoute: false, canMutate: false };
    }

    // Find permission for this department and page
    const permission = departmentDefaults.find(
      d => d.department_type === userDepartmentType && d.page_key === pageKey
    );

    if (!permission) {
      // No explicit permission = deny
      return { canView: false, canAccessRoute: false, canMutate: false };
    }

    return {
      canView: permission.can_view,
      canAccessRoute: permission.can_access_route,
      canMutate: permission.can_mutate,
    };
  }, [isBypassUser, userDepartmentType, departmentDefaults]);

  // Get permission for a route path
  const getRoutePermission = useCallback((routePath: string): PermissionResult => {
    // Handle dynamic routes (e.g., /work-orders/123)
    const basePath = Object.keys(routeToPageKey).find(key => 
      routePath === key || routePath.startsWith(key + '/')
    );
    
    const pageKey = basePath ? routeToPageKey[basePath] : null;
    
    if (!pageKey) {
      // Unknown route - allow for Admin/Finance, deny for others
      if (isBypassUser) {
        return { canView: true, canAccessRoute: true, canMutate: true };
      }
      // For unknown routes, default to allow view (public pages like home)
      return { canView: true, canAccessRoute: true, canMutate: false };
    }

    return getPagePermission(pageKey);
  }, [getPagePermission, isBypassUser]);

  // Check if a route is accessible
  const canAccessRoute = useCallback((routePath: string): boolean => {
    return getRoutePermission(routePath).canAccessRoute;
  }, [getRoutePermission]);

  // Check if a page/section is visible in navigation
  const canViewPage = useCallback((pageKey: string): boolean => {
    return getPagePermission(pageKey).canView;
  }, [getPagePermission]);

  // Check if user can mutate data on a page
  const canMutatePage = useCallback((pageKey: string): boolean => {
    return getPagePermission(pageKey).canMutate;
  }, [getPagePermission]);

  // Get all accessible page keys for navigation filtering
  const getAccessiblePageKeys = useCallback((): string[] => {
    if (isBypassUser) {
      return Object.values(routeToPageKey);
    }

    if (!userDepartmentType) {
      return [];
    }

    return departmentDefaults
      .filter(d => d.department_type === userDepartmentType && d.can_view)
      .map(d => d.page_key);
  }, [isBypassUser, userDepartmentType, departmentDefaults]);

  // Get route path from page key
  const getRouteFromPageKey = useCallback((pageKey: string): string | null => {
    const entry = Object.entries(routeToPageKey).find(([_, key]) => key === pageKey);
    return entry ? entry[0] : null;
  }, []);

  return {
    loading,
    isBypassUser,
    userDepartmentType,
    userRoles,
    getPagePermission,
    getRoutePermission,
    canAccessRoute,
    canViewPage,
    canMutatePage,
    getAccessiblePageKeys,
    getRouteFromPageKey,
    routeToPageKey,
  };
};
