import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Clock, Ban, AlertTriangle, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QC STATUS TERMINOLOGY GUIDE (System-Wide Standard)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PASSED / PASS   → Inspection completed successfully. Green. ✓
 * FAILED / FAIL   → Inspection completed with rejection. Red. ✗
 * PENDING         → Awaiting inspection, CAN be acted upon now. Amber/Yellow.
 * BLOCKED         → Cannot proceed until prerequisite is complete. Gray with lock.
 * WAIVED          → Intentionally skipped with authorization. Muted blue/purple.
 * HOLD            → Temporarily paused, requires attention. Orange.
 * NOT_STARTED     → No action taken yet, neutral state. Gray.
 * 
 * KEY DISTINCTIONS:
 * - PENDING = Ready for action (amber, attention-grabbing)
 * - BLOCKED = Cannot act, dependency issue (gray + lock icon, less urgent)
 * - WAIVED = Intentional skip (muted, clearly authorized, not an error)
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type QCStatus = 
  | 'passed' | 'pass' 
  | 'failed' | 'fail' 
  | 'pending' 
  | 'blocked' 
  | 'waived' 
  | 'hold' 
  | 'not_started' 
  | null;

interface QCStatusIndicatorProps {
  status: QCStatus;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

// Unified status configuration for consistent visual language across all QC pages
const STATUS_CONFIG = {
  // ─── SUCCESS STATES ───
  passed: {
    icon: CheckCircle2,
    label: 'Passed',
    badgeClass: 'bg-emerald-600 text-white hover:bg-emerald-600 border-emerald-600',
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
  },
  pass: {
    icon: CheckCircle2,
    label: 'Passed',
    badgeClass: 'bg-emerald-600 text-white hover:bg-emerald-600 border-emerald-600',
    iconClass: 'text-emerald-600',
    bgClass: 'bg-emerald-50 dark:bg-emerald-950/30',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
  },

  // ─── FAILURE STATES ───
  failed: {
    icon: XCircle,
    label: 'Failed',
    badgeClass: 'bg-destructive text-destructive-foreground hover:bg-destructive border-destructive',
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
    borderClass: 'border-destructive/30',
  },
  fail: {
    icon: XCircle,
    label: 'Failed',
    badgeClass: 'bg-destructive text-destructive-foreground hover:bg-destructive border-destructive',
    iconClass: 'text-destructive',
    bgClass: 'bg-destructive/10',
    borderClass: 'border-destructive/30',
  },

  // ─── ATTENTION STATES ───
  pending: {
    icon: Clock,
    label: 'Pending',
    badgeClass: 'bg-amber-500 text-white hover:bg-amber-500 border-amber-500',
    iconClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-950/30',
    borderClass: 'border-amber-200 dark:border-amber-800',
  },
  hold: {
    icon: AlertTriangle,
    label: 'On Hold',
    badgeClass: 'bg-orange-500 text-white hover:bg-orange-500 border-orange-500',
    iconClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    borderClass: 'border-orange-200 dark:border-orange-800',
  },

  // ─── BLOCKED STATE (distinct from pending) ───
  blocked: {
    icon: Lock,
    label: 'Blocked',
    badgeClass: 'bg-slate-400 text-white hover:bg-slate-400 border-slate-400 dark:bg-slate-600',
    iconClass: 'text-slate-500 dark:text-slate-400',
    bgClass: 'bg-slate-100 dark:bg-slate-900/30',
    borderClass: 'border-slate-200 dark:border-slate-700',
  },

  // ─── INTENTIONAL SKIP (not an error) ───
  waived: {
    icon: Ban,
    label: 'Waived',
    badgeClass: 'bg-violet-100 text-violet-700 hover:bg-violet-100 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700',
    iconClass: 'text-violet-600 dark:text-violet-400',
    bgClass: 'bg-violet-50 dark:bg-violet-950/30',
    borderClass: 'border-violet-200 dark:border-violet-800',
  },

  // ─── NEUTRAL / NOT STARTED ───
  not_started: {
    icon: Clock,
    label: 'Not Started',
    badgeClass: 'bg-muted text-muted-foreground hover:bg-muted border-border',
    iconClass: 'text-muted-foreground',
    bgClass: 'bg-muted/30',
    borderClass: 'border-muted',
  },
};

export const getQCStatusConfig = (status: QCStatus) => {
  if (!status) return STATUS_CONFIG.not_started;
  return STATUS_CONFIG[status] || STATUS_CONFIG.not_started;
};

/**
 * Get the appropriate status for a QC gate based on its completion and blocking state
 */
export const resolveQCGateStatus = (
  status: QCStatus, 
  isBlocked: boolean
): QCStatus => {
  // If blocked and not yet completed, show as blocked instead of pending
  if (isBlocked && (status === 'pending' || status === 'not_started' || !status)) {
    return 'blocked';
  }
  return status;
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
