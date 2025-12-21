import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Info, CheckCircle2, XCircle, Clock, AlertTriangle, Package } from "lucide-react";
import { cn } from "@/lib/utils";

// ═══════════════════════════════════════════════════════════════════════════
// QC Summary Stats - Consistent summary card pattern
// ═══════════════════════════════════════════════════════════════════════════

interface QCSummaryStat {
  label: string;
  value: number;
  type: 'total' | 'passed' | 'failed' | 'pending' | 'neutral';
  icon?: ReactNode;
}

interface QCSummaryStatsProps {
  stats: QCSummaryStat[];
}

export const QCSummaryStats = ({ stats }: QCSummaryStatsProps) => {
  const getStatStyle = (type: QCSummaryStat['type']) => {
    switch (type) {
      case 'passed':
        return {
          card: 'bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
          icon: 'text-emerald-600 dark:text-emerald-400',
          value: 'text-emerald-700 dark:text-emerald-300',
        };
      case 'failed':
        return {
          card: 'bg-gradient-to-br from-destructive/10 to-destructive/5 border-destructive/20',
          icon: 'text-destructive',
          value: 'text-destructive',
        };
      case 'pending':
        return {
          card: 'bg-gradient-to-br from-amber-500/10 to-amber-500/5 border-amber-500/20',
          icon: 'text-amber-600 dark:text-amber-400',
          value: 'text-amber-700 dark:text-amber-300',
        };
      case 'total':
        return {
          card: 'bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20',
          icon: 'text-primary',
          value: 'text-foreground',
        };
      default:
        return {
          card: 'bg-gradient-to-br from-muted/30 to-muted/10',
          icon: 'text-muted-foreground',
          value: 'text-foreground',
        };
    }
  };

  const getDefaultIcon = (type: QCSummaryStat['type']) => {
    switch (type) {
      case 'passed': return <CheckCircle2 className="h-6 w-6" />;
      case 'failed': return <XCircle className="h-6 w-6" />;
      case 'pending': return <Clock className="h-6 w-6" />;
      case 'total': return <Package className="h-6 w-6" />;
      default: return <Package className="h-6 w-6" />;
    }
  };

  return (
    <div className={cn("grid gap-4", `grid-cols-${Math.min(stats.length, 5)} md:grid-cols-${stats.length}`)}>
      {stats.map((stat, idx) => {
        const style = getStatStyle(stat.type);
        return (
          <Card key={idx} className={style.card}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className={cn("text-2xl font-bold", style.value)}>{stat.value}</p>
                </div>
                <div className={style.icon}>
                  {stat.icon || getDefaultIcon(stat.type)}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// QC Info Alert - Consistent info banner
// ═══════════════════════════════════════════════════════════════════════════

interface QCInfoAlertProps {
  title: string;
  description: string;
}

export const QCInfoAlert = ({ title, description }: QCInfoAlertProps) => (
  <Alert className="bg-muted/30 border-muted">
    <Info className="h-4 w-4" />
    <AlertTitle className="text-sm font-medium">{title}</AlertTitle>
    <AlertDescription className="text-xs text-muted-foreground">
      {description}
    </AlertDescription>
  </Alert>
);

// ═══════════════════════════════════════════════════════════════════════════
// QC Section - Consistent section wrapper with headers
// ═══════════════════════════════════════════════════════════════════════════

interface QCSectionProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  variant?: 'default' | 'warning' | 'action';
  children: ReactNode;
  className?: string;
}

export const QCSection = ({ 
  title, 
  description, 
  icon, 
  variant = 'default',
  children,
  className 
}: QCSectionProps) => {
  const variantStyles = {
    default: '',
    warning: 'border-amber-500/30',
    action: 'border-primary/30',
  };

  return (
    <Card className={cn(variantStyles[variant], className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════════════════════
// QC Action Required Section - For items needing attention
// ═══════════════════════════════════════════════════════════════════════════

interface QCActionRequiredProps {
  title?: string;
  description?: string;
  count?: number;
  children: ReactNode;
}

export const QCActionRequired = ({ 
  title = "Action Required", 
  description,
  count,
  children 
}: QCActionRequiredProps) => (
  <Card className="border-amber-500/40 bg-amber-500/5">
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-5 w-5" />
        {title}
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-sm font-normal bg-amber-500/20 px-2 py-0.5 rounded">
            {count} pending
          </span>
        )}
      </CardTitle>
      {description && (
        <CardDescription className="text-xs">{description}</CardDescription>
      )}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);

// ═══════════════════════════════════════════════════════════════════════════
// QC History Section - For completed records
// ═══════════════════════════════════════════════════════════════════════════

interface QCHistoryProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export const QCHistory = ({ 
  title = "QC History", 
  description,
  children,
  className
}: QCHistoryProps) => (
  <Card className={className}>
    <CardHeader className="pb-3">
      <CardTitle className="flex items-center gap-2 text-base">
        <Package className="h-5 w-5 text-muted-foreground" />
        {title}
      </CardTitle>
      {description && (
        <CardDescription className="text-xs">{description}</CardDescription>
      )}
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
