import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";

interface QCGateStatusBadgeProps {
  status: 'not_required' | 'pending' | 'passed' | 'failed' | 'approved';
  label?: string;
}

export const QCGateStatusBadge = ({ status, label }: QCGateStatusBadgeProps) => {
  const configs = {
    not_required: {
      icon: null,
      variant: "secondary" as const,
      label: "Not Required",
      className: "",
    },
    pending: {
      icon: Clock,
      variant: "outline" as const,
      label: "Pending QC",
      className: "border-warning text-warning",
    },
    passed: {
      icon: CheckCircle2,
      variant: "default" as const,
      label: "QC Passed",
      className: "bg-success",
    },
    approved: {
      icon: CheckCircle2,
      variant: "default" as const,
      label: "QC Approved",
      className: "bg-success",
    },
    failed: {
      icon: XCircle,
      variant: "destructive" as const,
      label: "QC Failed",
      className: "",
    },
  };

  const config = configs[status] || configs.not_required;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      {Icon && <Icon className="w-3 h-3 mr-1" />}
      {label || config.label}
    </Badge>
  );
};
