/**
 * Field-Level Data Masking Hook
 * 
 * Determines which fields should be masked based on user's department.
 * Works in conjunction with DB-level masking (work_orders_restricted view).
 * 
 * Masking rules:
 * - Customer name: Visible to Admin, Super Admin, Finance, Sales only
 * - Financial fields (cost, margin, rate, value): Visible to Admin, Super Admin, Finance only
 * - All other roles see masked/null values
 * 
 * This provides UI-level masking as a second layer on top of DB-level masking.
 */
import { useMemo } from 'react';
import { useDepartmentPermissions } from './useDepartmentPermissions';

const CUSTOMER_VISIBLE_DEPTS = ['admin', 'super_admin', 'finance', 'sales'];
const FINANCIAL_VISIBLE_DEPTS = ['admin', 'super_admin', 'finance'];

export interface FieldMaskingResult {
  /** Whether customer names are visible */
  canViewCustomerName: boolean;
  /** Whether financial fields (cost, margin, rate) are visible */
  canViewFinancials: boolean;
  /** Whether export functionality is available */
  canExportData: boolean;
  /** Mask a customer name - returns party_code fallback */
  maskCustomer: (name: string | null, partyCode: string | null) => string;
  /** Mask a financial value - returns '•••' if masked */
  maskFinancial: (value: number | string | null) => string;
  /** Mask a currency value with formatting */
  maskCurrency: (value: number | null, currency?: string) => string;
  /** Loading state */
  loading: boolean;
}

export const useFieldMasking = (): FieldMaskingResult => {
  const { userDepartmentType, isBypassUser, loading } = useDepartmentPermissions();

  const canViewCustomerName = useMemo(() => {
    if (isBypassUser) return true;
    return userDepartmentType ? CUSTOMER_VISIBLE_DEPTS.includes(userDepartmentType) : false;
  }, [isBypassUser, userDepartmentType]);

  const canViewFinancials = useMemo(() => {
    if (isBypassUser) return true;
    return userDepartmentType ? FINANCIAL_VISIBLE_DEPTS.includes(userDepartmentType) : false;
  }, [isBypassUser, userDepartmentType]);

  const canExportData = useMemo(() => {
    if (isBypassUser) return true;
    // Only admin, finance, sales can export
    return userDepartmentType
      ? ['admin', 'super_admin', 'finance', 'sales'].includes(userDepartmentType)
      : false;
  }, [isBypassUser, userDepartmentType]);

  const maskCustomer = useMemo(() => {
    return (name: string | null, partyCode: string | null): string => {
      if (canViewCustomerName && name) return name;
      return partyCode || '—';
    };
  }, [canViewCustomerName]);

  const maskFinancial = useMemo(() => {
    return (value: number | string | null): string => {
      if (canViewFinancials) {
        if (value === null || value === undefined) return '—';
        return String(value);
      }
      return '•••';
    };
  }, [canViewFinancials]);

  const maskCurrency = useMemo(() => {
    return (value: number | null, currency = 'INR'): string => {
      if (canViewFinancials) {
        if (value === null || value === undefined) return '—';
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency,
          maximumFractionDigits: 0,
        }).format(value);
      }
      return '•••';
    };
  }, [canViewFinancials]);

  return {
    canViewCustomerName,
    canViewFinancials,
    canExportData,
    maskCustomer,
    maskFinancial,
    maskCurrency,
    loading,
  };
};
