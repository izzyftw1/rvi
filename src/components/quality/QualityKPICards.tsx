import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock, Target, Percent, Users } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPI {
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  status?: "good" | "warning" | "critical";
  icon?: React.ReactNode;
}

interface QualityKPICardsProps {
  kpis: KPI[];
}

export function QualityKPICards({ kpis }: QualityKPICardsProps) {
  const getStatusColor = (status?: string) => {
    switch (status) {
      case "good":
        return "text-green-600 dark:text-green-400";
      case "warning":
        return "text-amber-600 dark:text-amber-400";
      case "critical":
        return "text-destructive";
      default:
        return "text-foreground";
    }
  };

  const getStatusBg = (status?: string) => {
    switch (status) {
      case "good":
        return "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800";
      case "warning":
        return "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
      case "critical":
        return "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800";
      default:
        return "";
    }
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {kpis.map((kpi, index) => (
        <Card key={index} className={cn("border", getStatusBg(kpi.status))}>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground truncate">{kpi.label}</p>
                <div className="flex items-baseline gap-1">
                  <span className={cn("text-2xl font-bold", getStatusColor(kpi.status))}>
                    {kpi.value}
                  </span>
                  {kpi.unit && <span className="text-sm text-muted-foreground">{kpi.unit}</span>}
                </div>
                {kpi.trend && kpi.trendValue && (
                  <div className={cn(
                    "flex items-center gap-1 text-xs",
                    kpi.trend === "up" ? "text-green-600" : kpi.trend === "down" ? "text-destructive" : "text-muted-foreground"
                  )}>
                    {kpi.trend === "up" ? <TrendingUp className="h-3 w-3" /> : kpi.trend === "down" ? <TrendingDown className="h-3 w-3" /> : null}
                    {kpi.trendValue}
                  </div>
                )}
              </div>
              {kpi.icon && (
                <div className={cn("p-1.5 rounded-md", getStatusColor(kpi.status))}>
                  {kpi.icon}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
