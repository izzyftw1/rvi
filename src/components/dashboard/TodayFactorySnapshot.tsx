/**
 * Today's Factory Snapshot
 * 
 * READ-ONLY view of today's production metrics.
 * All metrics derived from useProductionLogMetrics hook (single source of truth).
 */
import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ClipboardList, 
  Cpu, 
  Target, 
  AlertTriangle, 
  TrendingUp,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";
import { format } from "date-fns";

export const TodayFactorySnapshot = () => {
  const today = format(new Date(), 'yyyy-MM-dd');
  
  // SINGLE SOURCE: useProductionLogMetrics for today
  const { metrics, loading } = useProductionLogMetrics({
    startDate: today,
    endDate: today,
    period: 'today',
  });

  // Derived metrics from hook
  const snapshotMetrics = useMemo(() => {
    if (!metrics) {
      return {
        productionToday: 0,
        targetToday: 0,
        rejectionPcs: 0,
        rejectionPercent: 0,
        machinesWithLogs: 0,
        logCount: 0,
      };
    }

    return {
      productionToday: metrics.totalOutput || 0,
      targetToday: metrics.totalTarget || 0,
      rejectionPcs: metrics.totalRejections || 0,
      rejectionPercent: metrics.rejectionRate || 0,
      machinesWithLogs: metrics.machineMetrics?.length || 0,
      logCount: metrics.logCount || 0,
    };
  }, [metrics]);

  const productionProgress = snapshotMetrics.targetToday > 0 
    ? Math.min((snapshotMetrics.productionToday / snapshotMetrics.targetToday) * 100, 100) 
    : 0;

  if (loading) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <div className="h-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
    <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Today's Factory Snapshot</h3>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3 w-3 text-muted-foreground" />
            </TooltipTrigger>
            <TooltipContent>
              <p className="text-xs">All metrics from Production Log entries (single source)</p>
            </TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Production Logs Today */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardList className="h-3 w-3" />
              <span>Logs Today</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {snapshotMetrics.logCount}
            </div>
          </div>

          {/* Machines with Logs */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu className="h-3 w-3" />
              <span>Machines Active</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {snapshotMetrics.machinesWithLogs}
            </div>
          </div>

          {/* Production vs Target */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Output vs Target</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                productionProgress >= 80 ? "text-emerald-600 dark:text-emerald-400" : 
                productionProgress >= 50 ? "text-amber-600 dark:text-amber-400" : 
                "text-foreground"
              )}>
                {snapshotMetrics.productionToday.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">/ {snapshotMetrics.targetToday.toLocaleString()}</span>
            </div>
            <Progress value={productionProgress} className="h-1" />
          </div>

          {/* Rejection Today */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>Rejections</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                snapshotMetrics.rejectionPercent > 3 ? "text-destructive" : 
                snapshotMetrics.rejectionPercent > 1 ? "text-amber-600 dark:text-amber-400" : 
                "text-emerald-600 dark:text-emerald-400"
              )}>
                {snapshotMetrics.rejectionPcs}
              </span>
              <span className={cn(
                "text-sm",
                snapshotMetrics.rejectionPercent > 3 ? "text-destructive" : "text-muted-foreground"
              )}>
                ({snapshotMetrics.rejectionPercent.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
};
