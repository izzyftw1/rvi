import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Ban } from "lucide-react";

type QCGateStatus = 'passed' | 'pending' | 'failed' | 'waived';

interface QCGateStatusBadgeProps {
  status: QCGateStatus;
  label?: string;
}

export const QCGateStatusBadge = ({ status, label }: QCGateStatusBadgeProps) => {
  const configs = {
    pending: {
      icon: Clock,
      variant: "outline" as const,
      label: "⏳ Pending",
      className: "border-warning text-warning",
    },
    passed: {
      icon: CheckCircle2,
      variant: "default" as const,
      label: "✅ Passed",
      className: "bg-success text-success-foreground",
    },
    failed: {
      icon: XCircle,
      variant: "destructive" as const,
      label: "❌ Failed",
      className: "",
    },
    waived: {
      icon: Ban,
      variant: "secondary" as const,
      label: "🚫 Waived",
      className: "bg-muted",
    },
  };

  const config = configs[status] || configs.pending;
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      {Icon && <Icon className="w-3 h-3 mr-1" />}
      {label || config.label}
    </Badge>
  );
};
