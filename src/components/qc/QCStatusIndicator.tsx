import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Ban, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

export type QCStatus = 'passed' | 'pass' | 'pending' | 'failed' | 'fail' | 'waived' | 'hold' | 'not_started' | null;

interface QCStatusIndicatorProps {
  status: QCStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

// Unified status configuration for consistent visual language across all QC pages
const STATUS_CONFIG = {
  passed: {
    icon: CheckCircle2,
    label: 'Passed',
    badgeClass: 'bg-emerald-600 text-white hover:bg-emerald-600',
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
  },
  pass: {
    icon: CheckCircle2,
    label: 'Passed',
    badgeClass: 'bg-emerald-600 text-white hover:bg-emerald-600',
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
  },
  pending: {
    icon: Clock,
    label: 'Pending',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700',
    iconClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
  },
  failed: {
    icon: XCircle,
    label: 'Failed',
    badgeClass: 'bg-destructive text-destructive-foreground hover:bg-destructive',
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
    borderClass: 'border-destructive/30',
  },
  fail: {
    icon: XCircle,
    label: 'Failed',
    badgeClass: 'bg-destructive text-destructive-foreground hover:bg-destructive',
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
    borderClass: 'border-destructive/30',
  },
  hold: {
    icon: AlertTriangle,
    label: 'On Hold',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-300',
    iconClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    borderClass: 'border-orange-200 dark:border-orange-800',
  },
  waived: {
    icon: Ban,
    label: 'Waived',
    badgeClass: 'bg-muted text-muted-foreground',
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/50',
    borderClass: 'border-muted',
  },
  not_started: {
    icon: Clock,
    label: 'Not Started',
    badgeClass: 'bg-muted/50 text-muted-foreground',
    iconClass: 'text-muted-foreground/50',
    bgClass: 'bg-muted/30',
    borderClass: 'border-muted/50',
  },
};

export const getQCStatusConfig = (status: QCStatus) => {
  if (!status) return STATUS_CONFIG.not_started;
  return STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
};

export const QCStatusIndicator = ({ 
  status, 
  label, 
  size = 'md',
  showIcon = true 
}: QCStatusIndicatorProps) => {
  const config = getQCStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-xs px-2.5 py-0.5',
    lg: 'text-sm px-3 py-1',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-3.5 w-3.5',
    lg: 'h-4 w-4',
  };

  return (
    <Badge 
      variant="outline" 
      className={cn(
        "font-medium inline-flex items-center gap-1",
        config.badgeClass,
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {label || config.label}
    </Badge>
  );
};

// Standalone icon for use in cards/summaries
interface QCStatusIconProps {
  status: QCStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const QCStatusIcon = ({ status, size = 'md', className }: QCStatusIconProps) => {
  const config = getQCStatusConfig(status);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return <Icon className={cn(sizeClasses[size], config.iconClass, className)} />;
};

export default QCStatusIndicator;
