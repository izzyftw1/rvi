/**
 * ActionGate - Conditionally renders UI elements based on action permissions.
 * 
 * Uses the action_permissions table for granular action-level control.
 * Actions: approve_qc, release_production, export_data, edit_wo,
 *          approve_dispatch, create_invoice, waive_qc, close_ncr
 * 
 * @example
 * <ActionGate action="approve_qc">
 *   <Button>Approve QC</Button>
 * </ActionGate>
 * 
 * @example
 * <ActionGate action="export_data" fallback={<span className="text-muted-foreground text-sm">Export not available</span>}>
 *   <ExportButton />
 * </ActionGate>
 */
import { ReactNode } from 'react';
import { useActionPermission, type ActionKey } from '@/hooks/useActionPermission';

interface ActionGateProps {
  action: ActionKey;
  children: ReactNode;
  fallback?: ReactNode;
}

export const ActionGate = ({ action, children, fallback = null }: ActionGateProps) => {
  const { canPerform, loading } = useActionPermission();

  if (loading) return null;

  return canPerform(action) ? <>{children}</> : <>{fallback}</>;
};
