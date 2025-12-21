import { QCStatusIndicator, QCStatus } from "@/components/qc/QCStatusIndicator";

interface QCGateStatusBadgeProps {
  status: QCStatus;
  label?: string;
}

// Re-export using the unified QCStatusIndicator for consistency
export const QCGateStatusBadge = ({ status, label }: QCGateStatusBadgeProps) => {
  return <QCStatusIndicator status={status} label={label} size="sm" />;
};
