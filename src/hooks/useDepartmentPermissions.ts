import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface DepartmentDefault {
  department_type: string;
  page_key: string;
  can_view: boolean;
  can_access_route: boolean;
  can_mutate: boolean;
}

interface UserOverride {
  page_key: string;
  can_view: boolean | null;
  can_access_route: boolean | null;
  can_mutate: boolean | null;
}

interface PermissionResult {
  canView: boolean;
  canAccessRoute: boolean;
  canMutate: boolean;
  source: 'bypass' | 'override' | 'department' | 'deny';
}

// Valid department types: admin, finance, sales, design, hr, production, quality, packing

/**
 * COMPREHENSIVE Route-to-PageKey Mapping
 * Covers ALL routes in App.tsx - both navigation and non-navigation pages
 */
export const routeToPageKey: Record<string, string> = {
  // === SALES & CUSTOMERS ===
  '/sales': 'sales-orders',
  '/customers': 'customers',
  '/customers/reports': 'customers',
  '/items': 'items',
  
  // === PROCUREMENT ===
  '/purchase': 'raw-po',
  '/purchase/raw-po': 'raw-po',
  '/purchase/settings': 'purchase-dashboard',
  '/purchase/dashboard': 'purchase-dashboard',
  '/procurement': 'purchase-dashboard',
  '/material-requirements': 'material-requirements',
  '/material-requirements-v2': 'material-requirements',
  '/materials/inwards': 'material-inwards',
  '/inventory-procurement': 'material-requirements',
  '/reports/rpo-inventory': 'material-requirements',
  
  // === PRODUCTION ===
  '/work-orders': 'work-orders',
  '/work-orders/new': 'work-orders',
  '/daily-production-log': 'daily-production-log',
  '/floor-dashboard': 'floor-dashboard',
  '/cnc-dashboard': 'cnc-dashboard',
  '/production-progress': 'production-progress',
  '/machine-utilisation': 'machine-utilisation',
  '/machine-status': 'machine-utilisation',
  '/operator-efficiency': 'operator-efficiency',
  '/setter-efficiency': 'setter-efficiency',
  '/downtime-analytics': 'downtime-analytics',
  '/cutting': 'production-progress',
  '/forging': 'production-progress',
  
  // === QUALITY ===
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
  '/genealogy': 'traceability',
  '/dispatch-qc-report': 'final-qc',
  
  // === FINANCE ===
  '/finance/dashboard': 'finance-dashboard',
  '/finance/invoices': 'invoices',
  '/finance/invoices/create': 'invoices',
  '/finance/receipts': 'receipts',
  '/finance/payments': 'receipts',
  '/finance/supplier-payments': 'supplier-payments',
  '/finance/adjustments': 'adjustments',
  '/finance/tds': 'tds-report',
  '/finance/aging': 'aging',
  '/reports/reconciliation': 'reconciliations',
  '/finance/reports': 'finance-reports',
  '/finance/settings': 'finance-settings',
  
  // === LOGISTICS ===
  '/gate-register': 'gate-register',
  '/logistics': 'logistics-dashboard',
  '/logistics-dashboard': 'logistics-dashboard',
  '/finished-goods': 'finished-goods',
  '/packing': 'packing',
  '/dispatch': 'dispatch',
  '/goods-inwards': 'gate-register',
  
  // === EXTERNAL PROCESSES ===
  '/partners': 'partner-dashboard',
  '/partner-dashboard': 'partner-dashboard',
  '/partner-performance': 'partner-dashboard',
  '/external-efficiency': 'external-analytics',
  '/external-analytics': 'external-analytics',
  
  // === ADMIN ===
  '/admin': 'admin-panel',
  '/factory-calendar': 'factory-calendar',
  
  // === REPORTS ===
  '/reports': 'finance-reports',
  '/reports/machine-runtime': 'machine-utilisation',
  '/reports/worker-efficiency': 'operator-efficiency',
  
  // === SPECIAL PAGES ===
  '/scan': 'work-orders',
  '/scan-console': 'work-orders',
  '/supplier-portal': 'work-orders', // Supplier portal uses own RLS
};

/**
 * All page keys with display names
 * Used in Admin UI for permission management
 */
export const PAGE_KEYS: Record<string, string> = {
  // Sales & Customers
  'sales-orders': 'Sales Orders',
  'customers': 'Customers',
  'items': 'Items',
  
  // Procurement
  'raw-po': 'Raw PO',
  'material-requirements': 'Material Requirements',
  'purchase-dashboard': 'Purchase Dashboard',
  
  // Production
  'work-orders': 'Work Orders',
  'daily-production-log': 'Daily Production Log',
  'floor-dashboard': 'Floor Dashboard',
  'cnc-dashboard': 'CNC Dashboard',
  'production-progress': 'Production Progress',
  'machine-utilisation': 'Machine Utilisation',
  'operator-efficiency': 'Operator Efficiency',
  'setter-efficiency': 'Setter Efficiency',
  'downtime-analytics': 'Downtime Analytics',
  
  // Quality
  'quality-dashboard': 'Quality Dashboard',
  'qc-incoming': 'Incoming QC',
  'hourly-qc': 'Hourly QC',
  'final-qc': 'Final QC',
  'ncr': 'NCR Management',
  'traceability': 'Traceability',
  'quality-documents': 'Quality Documents',
  'quality-analytics': 'Quality Analytics',
  'tolerances': 'Tolerances',
  'instruments': 'Instruments',
  
  // Finance
  'finance-dashboard': 'Finance Dashboard',
  'invoices': 'Invoices',
  'receipts': 'Customer Receipts',
  'supplier-payments': 'Supplier Payments',
  'adjustments': 'Customer Adjustments',
  'tds-report': 'TDS Report',
  'aging': 'Aging',
  'reconciliations': 'Reconciliations',
  'finance-reports': 'Finance Reports',
  'finance-settings': 'Finance Settings',
  
  // Logistics
  'gate-register': 'Gate Register',
  'logistics-dashboard': 'Logistics Dashboard',
  'finished-goods': 'Finished Goods',
  'packing': 'Packing',
  'dispatch': 'Dispatch',
  
  // External
  'partner-dashboard': 'Partner Dashboard',
  'external-analytics': 'External Analytics',
  
  // Admin
  'admin-panel': 'Admin Panel',
  'factory-calendar': 'Factory Calendar',
};

// Admin & Finance department types that bypass all permission checks
const BYPASS_DEPARTMENT_TYPES = ['admin', 'finance'];

export const useDepartmentPermissions = () => {
  const [departmentDefaults, setDepartmentDefaults] = useState<DepartmentDefault[]>([]);
  const [userOverrides, setUserOverrides] = useState<UserOverride[]>([]);
  const [userDepartmentType, setUserDepartmentType] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionVersion, setPermissionVersion] = useState(0);

  const loadPermissions = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      setUserId(user.id);

      // Load user's department type from profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('department_id')
        .eq('id', user.id)
        .single();

      let deptType: string | null = null;
      if (profileData?.department_id) {
        const { data: deptData } = await supabase
          .from('departments')
          .select('type')
          .eq('id', profileData.department_id)
          .single();
        
        if (deptData) {
          deptType = deptData.type;
          setUserDepartmentType(deptType);
        }
      }

      // Check if user bypasses permission checks (Admin/Finance departments)
      if (deptType && BYPASS_DEPARTMENT_TYPES.includes(deptType)) {
        // Admin/Finance bypass - set empty defaults, checks will return true
        setDepartmentDefaults([]);
        setUserOverrides([]);
        setLoading(false);
        return;
      }

      // Load user's permission overrides
      const { data: overridesData } = await supabase
        .from('user_permission_overrides')
        .select('page_key, can_view, can_access_route, can_mutate')
        .eq('user_id', user.id);
      
      setUserOverrides(overridesData || []);

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
  }, []);

  useEffect(() => {
    loadPermissions();

    // Subscribe to permission override changes for current user
    const channel = supabase
      .channel('user-permission-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'user_permission_overrides',
      }, () => {
        // Reload permissions when overrides change
        loadPermissions();
        setPermissionVersion(v => v + 1);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadPermissions]);

  // Check if user bypasses all permission checks (Admin/Finance departments)
  const isBypassUser = useMemo(() => {
    return userDepartmentType !== null && BYPASS_DEPARTMENT_TYPES.includes(userDepartmentType);
  }, [userDepartmentType]);

  // Get permission for a specific page key with override priority
  const getPagePermission = useCallback((pageKey: string): PermissionResult => {
    // Admin/Finance bypass - full access
    if (isBypassUser) {
      return { canView: true, canAccessRoute: true, canMutate: true, source: 'bypass' };
    }

    // Check for user override first
    const override = userOverrides.find(o => o.page_key === pageKey);
    
    // Get department default
    const deptDefault = departmentDefaults.find(
      d => d.department_type === userDepartmentType && d.page_key === pageKey
    );

    // Apply override logic: override takes precedence if not null
    const canView = override?.can_view ?? deptDefault?.can_view ?? false;
    const canAccessRoute = override?.can_access_route ?? deptDefault?.can_access_route ?? false;
    const canMutate = override?.can_mutate ?? deptDefault?.can_mutate ?? false;

    // Determine source
    let source: PermissionResult['source'] = 'deny';
    if (override?.can_view !== null || override?.can_access_route !== null || override?.can_mutate !== null) {
      source = 'override';
    } else if (deptDefault) {
      source = 'department';
    }

    return { canView, canAccessRoute, canMutate, source };
  }, [isBypassUser, userOverrides, userDepartmentType, departmentDefaults]);

  // Get permission for a route path
  const getRoutePermission = useCallback((routePath: string): PermissionResult => {
    // Handle dynamic routes (e.g., /work-orders/123, /customers/:id)
    const basePath = Object.keys(routeToPageKey).find(key => 
      routePath === key || routePath.startsWith(key + '/')
    );
    
    const pageKey = basePath ? routeToPageKey[basePath] : null;
    
    if (!pageKey) {
      // Unknown route - allow for Admin/Finance, allow view for others (public pages like /)
      if (isBypassUser) {
        return { canView: true, canAccessRoute: true, canMutate: true, source: 'bypass' };
      }
      // Default: allow access to unmapped routes (like home page "/")
      return { canView: true, canAccessRoute: true, canMutate: false, source: 'deny' };
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

    return Object.keys(PAGE_KEYS).filter(pageKey => {
      const perm = getPagePermission(pageKey);
      return perm.canView;
    });
  }, [isBypassUser, getPagePermission]);

  // Invalidate permissions cache (force reload)
  const invalidatePermissions = useCallback(() => {
    loadPermissions();
    setPermissionVersion(v => v + 1);
  }, [loadPermissions]);

  return {
    loading,
    isBypassUser,
    userDepartmentType,
    userId,
    userOverrides,
    permissionVersion,
    getPagePermission,
    getRoutePermission,
    canAccessRoute,
    canViewPage,
    canMutatePage,
    getAccessiblePageKeys,
    invalidatePermissions,
    routeToPageKey,
    PAGE_KEYS,
  };
};
