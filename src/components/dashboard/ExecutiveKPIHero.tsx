/**
 * ExecutiveKPIHero - 5 key factory health metrics
 */
import { useNavigate } from "react-router-dom";
import { FileText, Clock, Shield, Truck, AlertOctagon } from "lucide-react";
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
  activeOrders, onTimeRate, rejectionRate, externalOverdue, externalTotal, blockedOrders,
}: ExecutiveKPIHeroProps) => {
  const navigate = useNavigate();
  const qualityYield = Math.max(0, 100 - rejectionRate);
  const externalSlaRate = externalTotal > 0 ? Math.round(((externalTotal - externalOverdue) / externalTotal) * 100) : 100;

  const kpis = [
    {
      label: "Active Orders", value: activeOrders.toString(), icon: FileText,
      status: activeOrders > 50 ? "warning" as const : "neutral" as const,
      onClick: () => navigate("/work-orders"),
    },
    {
      label: "On-Time Delivery", value: `${onTimeRate}%`, icon: Clock,
      status: onTimeRate >= 90 ? "good" as const : onTimeRate >= 75 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/reports"),
    },
    {
      label: "Quality Yield", value: `${qualityYield.toFixed(1)}%`, icon: Shield,
      status: qualityYield >= 97 ? "good" as const : qualityYield >= 95 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/quality/analytics"),
    },
    {
      label: "External SLA", value: `${externalSlaRate}%`,
      subtext: externalOverdue > 0 ? `${externalOverdue} overdue` : undefined,
      icon: Truck,
      status: externalOverdue === 0 ? "good" as const : externalOverdue <= 3 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/partners"),
    },
    {
      label: "Blocked", value: blockedOrders.toString(), icon: AlertOctagon,
      status: blockedOrders === 0 ? "good" as const : blockedOrders <= 3 ? "warning" as const : "critical" as const,
      onClick: () => navigate("/work-orders?filter=blocked"),
    },
  ];

  const statusStyles = {
    good: { text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/5 border-emerald-500/15 dark:bg-emerald-500/10", icon: "text-emerald-500/60" },
    warning: { text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/5 border-amber-500/15 dark:bg-amber-500/10", icon: "text-amber-500/60" },
    critical: { text: "text-destructive", bg: "bg-destructive/5 border-destructive/15 dark:bg-destructive/10", icon: "text-destructive/60" },
    neutral: { text: "text-foreground", bg: "bg-card border-border", icon: "text-muted-foreground/50" },
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      {kpis.map((kpi) => {
        const s = statusStyles[kpi.status];
        const Icon = kpi.icon;
        return (
          <button
            key={kpi.label}
            onClick={kpi.onClick}
            className={cn(
              "flex flex-col items-start p-4 rounded-xl border transition-all",
              "hover:shadow-md hover:-translate-y-0.5 active:translate-y-0",
              s.bg
            )}
          >
            <Icon className={cn("h-4 w-4 mb-2", s.icon)} />
            <div className={cn("text-2xl font-bold tracking-tight leading-none", s.text)}>
              {kpi.value}
            </div>
            <div className="text-[11px] text-muted-foreground mt-1.5 font-medium leading-none">
              {kpi.label}
            </div>
            {kpi.subtext && (
              <div className={cn(
                "text-[10px] mt-1 leading-none",
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
