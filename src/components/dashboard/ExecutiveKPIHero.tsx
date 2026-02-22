/**
 * ExecutiveKPIHero - Top-level factory health at a glance
 * 
 * Shows 5 executive KPIs in a clean, spacious row:
 * 1. Active Orders
 * 2. On-Time Rate (7d)
 * 3. Quality Yield
 * 4. External SLA
 * 5. Blocked Orders
 * 
 * Each KPI is clickable and color-coded by health status.
 */
import { useNavigate } from "react-router-dom";
import { 
  FileText, 
  Clock, 
  Shield, 
  Truck, 
  AlertOctagon 
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ExecutiveKPIHeroProps {
  activeOrders: number;
  onTimeRate: number;
  rejectionRate: number;
  externalOverdue: number;
  externalTotal: number;
  blockedOrders: number;
}

export const ExecutiveKPIHero = ({
  activeOrders,
  onTimeRate,
  rejectionRate,
  externalOverdue,
  externalTotal,
  blockedOrders,
}: ExecutiveKPIHeroProps) => {
  const navigate = useNavigate();

  const qualityYield = Math.max(0, 100 - rejectionRate);
  const externalSlaRate = externalTotal > 0 
    ? Math.round(((externalTotal - externalOverdue) / externalTotal) * 100) 
    : 100;

  const kpis = [
    {
      label: "Active Orders",
      value: activeOrders.toString(),
      icon: FileText,
      status: activeOrders > 50 ? "warning" as const : "neutral" as const,
      onClick: () => navigate("/work-orders"),
    },
    {
      label: "On-Time Delivery",
      value: `${onTimeRate}%`,
      icon: Clock,
      status: onTimeRate >= 90 ? "good" as const : onTimeRate >= 75 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/reports"),
    },
    {
      label: "Quality Yield",
      value: `${qualityYield.toFixed(1)}%`,
      icon: Shield,
      status: qualityYield >= 97 ? "good" as const : qualityYield >= 95 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/quality/analytics"),
    },
    {
      label: "External SLA",
      value: `${externalSlaRate}%`,
      subtext: externalOverdue > 0 ? `${externalOverdue} overdue` : "On track",
      icon: Truck,
      status: externalOverdue === 0 ? "good" as const : externalOverdue <= 3 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/partners"),
    },
    {
      label: "Blocked",
      value: blockedOrders.toString(),
      icon: AlertOctagon,
      status: blockedOrders === 0 ? "good" as const : blockedOrders <= 3 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/work-orders?filter=blocked"),
    },
  ];

  const statusColors = {
    good: {
      value: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/5 dark:bg-emerald-500/10",
      icon: "text-emerald-500/70",
      border: "border-emerald-500/20",
    },
    warning: {
      value: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/5 dark:bg-amber-500/10",
      icon: "text-amber-500/70",
      border: "border-amber-500/20",
    },
    critical: {
      value: "text-destructive",
      bg: "bg-destructive/5 dark:bg-destructive/10",
      icon: "text-destructive/70",
      border: "border-destructive/20",
    },
    neutral: {
      value: "text-foreground",
      bg: "bg-muted/30",
      icon: "text-muted-foreground/70",
      border: "border-border",
    },
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const colors = statusColors[kpi.status];
        const Icon = kpi.icon;
        return (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className={cn(
              "relative flex flex-col items-start p-4 rounded-xl border transition-all",
              "hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
              colors.bg,
              colors.border
            )}
          >
            <Icon className={cn("h-4 w-4 mb-3", colors.icon)} />
            <div className={cn("text-3xl font-bold tracking-tight", colors.value)}>
              {kpi.value}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 font-medium">
              {kpi.label}
            </div>
            {kpi.subtext && (
              <div className={cn(
                "text-[10px] mt-0.5",
                kpi.status === "critical" ? "text-destructive" : "text-muted-foreground"
              )}>
                {kpi.subtext}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
};
