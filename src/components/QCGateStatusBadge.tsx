import { QCStatusIndicator, QCStatus, resolveQCGateStatus } from "@/components/qc/QCStatusIndicator";

interface QCGateStatusBadgeProps {
  status: QCStatus;
  label?: string;
  /** If true, shows as "Blocked" instead of "Pending" when status is pending/not_started */
  isBlocked?: boolean;
}

/**
 * QC Gate Status Badge - Uses unified QCStatusIndicator
 * 
 * Terminology:
 * - Passed: Inspection completed successfully
 * - Failed: Inspection completed with rejection
 * - Pending: Awaiting inspection, can be acted upon now
 * - Blocked: Cannot proceed, waiting for prerequisite
 * - Waived: Intentionally skipped with authorization
 */
export const QCGateStatusBadge = ({ status, label, isBlocked = false }: QCGateStatusBadgeProps) => {
  const resolvedStatus = resolveQCGateStatus(status, isBlocked);
  return <QCStatusIndicator status={resolvedStatus} label={label} size="sm" />;
};
