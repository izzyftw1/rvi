/**
 * Action Permission Hook
 * 
 * Provides granular action-level permission checks beyond page access.
 * Actions: approve_qc, release_production, export_data, edit_wo,
 *          approve_dispatch, create_invoice, waive_qc, close_ncr
 * 
 * Uses action_permissions table + department type resolution.
 * Admin/Super Admin bypass all checks.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDepartmentPermissions } from './useDepartmentPermissions';

export type ActionKey =
  | 'approve_qc'
  | 'release_production'
  | 'export_data'
  | 'edit_wo'
  | 'approve_dispatch'
  | 'create_invoice'
  | 'waive_qc'
  | 'close_ncr';

interface ActionPermissionMap {
  [key: string]: boolean;
}

export const useActionPermission = () => {
  const { isBypassUser, userDepartmentType, loading: deptLoading } = useDepartmentPermissions();
  const [actionMap, setActionMap] = useState<ActionPermissionMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (deptLoading) return;

    // Bypass users (admin/finance/super_admin) can do everything
    if (isBypassUser) {
      setActionMap({
        approve_qc: true, release_production: true, export_data: true,
        edit_wo: true, approve_dispatch: true, create_invoice: true,
        waive_qc: true, close_ncr: true,
      });
      setLoading(false);
      return;
    }

    if (!userDepartmentType) {
      setLoading(false);
      return;
    }

    const loadActions = async () => {
      const { data } = await supabase
        .from('action_permissions')
        .select('action_key, allowed')
        .eq('department_type', userDepartmentType);

      const map: ActionPermissionMap = {};
      (data || []).forEach((row: any) => {
        map[row.action_key] = row.allowed;
      });
      setActionMap(map);
      setLoading(false);
    };

    loadActions();
  }, [isBypassUser, userDepartmentType, deptLoading]);

  const canPerform = useCallback((action: ActionKey): boolean => {
    if (isBypassUser) return true;
    return actionMap[action] ?? false;
  }, [isBypassUser, actionMap]);

  return { canPerform, loading };
};
