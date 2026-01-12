import { memo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Package, Truck, AlertTriangle, TrendingUp, Clock, Boxes } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogisticsMetrics } from "@/hooks/useLogisticsData";

interface ExecutiveSnapshotProps {
  metrics: LogisticsMetrics;
  onKPIClick?: (kpi: string) => void;
}

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
  highlight?: "success" | "warning" | "danger" | "neutral";
  onClick?: () => void;
}

const KPICard = memo(({ title, value, subtitle, icon, highlight = "neutral", onClick }: KPICardProps) => {
  const highlightClasses = {
    success: "border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20",
    warning: "border-l-4 border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20",
    danger: "border-l-4 border-l-red-500 bg-red-50/50 dark:bg-red-950/20",
    neutral: "border-l-4 border-l-primary/30",
  };

  return (
    <Card 
      className={cn(
        "transition-all hover:shadow-md cursor-pointer",
        highlightClasses[highlight]
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
              {title}
            </p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
          <div className={cn(
            "p-2 rounded-lg",
            highlight === "success" && "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400",
            highlight === "warning" && "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400",
            highlight === "danger" && "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-400",
            highlight === "neutral" && "bg-primary/10 text-primary"
          )}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

KPICard.displayName = "KPICard";

export const ExecutiveSnapshot = memo(({ metrics, onKPIClick }: ExecutiveSnapshotProps) => {
  const formatCurrency = (value: number) => {
    if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
    if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
    if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
    return `₹${value.toLocaleString()}`;
  };

  const formatQty = (qty: number) => {
    if (qty >= 1000000) return `${(qty / 1000000).toFixed(1)}M`;
    if (qty >= 1000) return `${(qty / 1000).toFixed(1)}K`;
    return qty.toLocaleString();
  };

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Executive Snapshot
      </h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard
          title="Packed (Not Dispatched)"
          value={formatQty(metrics.packedNotDispatched.qty)}
          subtitle={`${metrics.packedNotDispatched.cartons} cartons • ${formatCurrency(metrics.packedNotDispatched.value)}`}
          icon={<Package className="h-5 w-5" />}
          highlight={metrics.packedNotDispatched.qty > 0 ? "warning" : "neutral"}
          onClick={() => onKPIClick?.("packed")}
        />

        <KPICard
          title="Dispatched Today"
          value={formatQty(metrics.dispatchedToday.qty)}
          subtitle={`${metrics.dispatchedToday.cartons} shipments`}
          icon={<Truck className="h-5 w-5" />}
          highlight={metrics.dispatchedToday.qty > 0 ? "success" : "neutral"}
          onClick={() => onKPIClick?.("today")}
        />

        <KPICard
          title="Dispatched MTD"
          value={formatQty(metrics.dispatchedMTD.qty)}
          subtitle="Month to date"
          icon={<TrendingUp className="h-5 w-5" />}
          highlight="neutral"
          onClick={() => onKPIClick?.("mtd")}
        />

        <KPICard
          title="Ageing Exposure"
          value={formatCurrency(metrics.ageingExposure.value)}
          subtitle={`${formatQty(metrics.ageingExposure.qty)} pcs >15d old`}
          icon={<AlertTriangle className="h-5 w-5" />}
          highlight={metrics.ageingExposure.value > 0 ? "danger" : "neutral"}
          onClick={() => onKPIClick?.("ageing")}
        />

        <KPICard
          title="Packed Stock"
          value={formatQty(metrics.inventoryByState.packed)}
          subtitle="In cartons"
          icon={<Boxes className="h-5 w-5" />}
          highlight="neutral"
          onClick={() => onKPIClick?.("packed-stock")}
        />

        <KPICard
          title="FG Inventory"
          value={formatQty(metrics.inventoryByState.unpacked)}
          subtitle={`${formatQty(metrics.inventoryByState.reserved)} reserved`}
          icon={<Clock className="h-5 w-5" />}
          highlight={metrics.inventoryByState.unpacked > 0 ? "warning" : "neutral"}
          onClick={() => onKPIClick?.("fg-inventory")}
        />
      </div>
    </div>
  );
});

ExecutiveSnapshot.displayName = "ExecutiveSnapshot";
