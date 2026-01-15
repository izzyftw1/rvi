/**
 * Customer Display Hook
 * 
 * Provides consistent customer name/code display based on user permissions.
 * 
 * PRIVACY RULES:
 * - Only Admin, Super Admin, Finance, and Sales can see customer names
 * - All other departments see only Party Code
 * - This is UI-level masking only - queries remain unchanged
 */

import { useMemo } from 'react';
import { useDepartmentPermissions } from './useDepartmentPermissions';

// Department types that can view customer names
const CUSTOMER_NAME_ALLOWED_DEPARTMENTS = ['admin', 'super_admin', 'finance', 'sales'];

export interface CustomerDisplayOptions {
  customerName?: string | null;
  partyCode?: string | null;
  fallback?: string;
}

export interface CustomerDisplayResult {
  displayName: string;
  showName: boolean;
  partyCode: string;
  fullDisplay: string; // "Party Code - Customer Name" or just "Party Code"
}

/**
 * Hook to determine if current user can view customer names
 */
export function useCanViewCustomerName(): { canView: boolean; loading: boolean } {
  const { userDepartmentType, loading, isBypassUser } = useDepartmentPermissions();
  
  const canView = useMemo(() => {
    // Bypass users (admin, finance, super_admin) can always see names
    if (isBypassUser) return true;
    
    // Check if department is in allowed list
    if (!userDepartmentType) return false;
    return CUSTOMER_NAME_ALLOWED_DEPARTMENTS.includes(userDepartmentType);
  }, [userDepartmentType, isBypassUser]);
  
  return { canView, loading };
}

/**
 * Hook to get formatted customer display based on permissions
 */
export function useCustomerDisplay(options: CustomerDisplayOptions): CustomerDisplayResult {
  const { canView, loading } = useCanViewCustomerName();
  
  const result = useMemo(() => {
    const partyCode = options.partyCode || 'N/A';
    const customerName = options.customerName || options.fallback || 'Unknown';
    
    // While loading, show party code only (safe default)
    if (loading) {
      return {
        displayName: partyCode,
        showName: false,
        partyCode,
        fullDisplay: partyCode,
      };
    }
    
    if (canView) {
      return {
        displayName: customerName,
        showName: true,
        partyCode,
        fullDisplay: `${partyCode} - ${customerName}`,
      };
    }
    
    return {
      displayName: partyCode,
      showName: false,
      partyCode,
      fullDisplay: partyCode,
    };
  }, [options.customerName, options.partyCode, options.fallback, canView, loading]);
  
  return result;
}

/**
 * Utility function to format customer display (for use outside React components)
 * Use this when you have the permission state already
 */
export function formatCustomerDisplay(
  canViewName: boolean,
  customerName: string | null | undefined,
  partyCode: string | null | undefined,
  format: 'name' | 'code' | 'full' = 'full'
): string {
  const code = partyCode || 'N/A';
  const name = customerName || 'Unknown';
  
  if (!canViewName) {
    return code;
  }
  
  switch (format) {
    case 'name':
      return name;
    case 'code':
      return code;
    case 'full':
    default:
      return `${code} - ${name}`;
  }
}

/**
 * Component-friendly utility to get display text
 */
export function getCustomerDisplayText(
  canViewName: boolean,
  customerName: string | null | undefined,
  partyCode: string | null | undefined
): string {
  if (canViewName && customerName) {
    return customerName;
  }
  return partyCode || 'N/A';
}

/**
 * Get combined display for dropdowns/selects
 */
export function getCustomerSelectDisplay(
  canViewName: boolean,
  customerName: string | null | undefined,
  partyCode: string | null | undefined
): string {
  const code = partyCode || '';
  const name = customerName || '';
  
  if (!canViewName) {
    return code || 'N/A';
  }
  
  if (code && name) {
    return `${code} - ${name}`;
  }
  
  return name || code || 'N/A';
}
