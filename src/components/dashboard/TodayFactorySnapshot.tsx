import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ClipboardList, 
  Cpu, 
  Target, 
  AlertTriangle, 
  ClipboardCheck,
  TrendingUp,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SnapshotMetrics {
  activeWorkOrders: number;
  machinesRunning: number;
  machinesTotal: number;
  productionToday: number;
  targetToday: number;
  rejectionPcs: number;
  rejectionPercent: number;
  ipqcDue: number;
  ipqcCompleted: number;
}

export const TodayFactorySnapshot = () => {
  const [metrics, setMetrics] = useState<SnapshotMetrics>({
    activeWorkOrders: 0,
    machinesRunning: 0,
    machinesTotal: 0,
    productionToday: 0,
    targetToday: 0,
    rejectionPcs: 0,
    rejectionPercent: 0,
    ipqcDue: 0,
    ipqcCompleted: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTodayMetrics();

    const channel = supabase
      .channel('today-snapshot')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, loadTodayMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, loadTodayMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_qc_checks' }, loadTodayMetrics)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadTodayMetrics)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadTodayMetrics = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      const [
        productionLogs,
        machines,
        ipqcChecks,
        workOrders
      ] = await Promise.all([
        // Daily production logs for today
        supabase
          .from('daily_production_logs')
          .select('actual_quantity, target_quantity, total_rejection_quantity, ok_quantity')
          .eq('log_date', today),
        // All machines with their status
        supabase
          .from('machines')
          .select('id, status'),
        // IPQC checks for today
        supabase
          .from('hourly_qc_checks')
          .select('id, status, check_datetime')
          .gte('check_datetime', `${today}T00:00:00`)
          .lte('check_datetime', `${today}T23:59:59`),
        // Active work orders (in production today)
        supabase
          .from('work_orders')
          .select('id, status')
          .in('status', ['in_progress', 'qc', 'packing'])
      ]);

      // Calculate production metrics from daily logs
      const logs = productionLogs.data || [];
      const productionToday = logs.reduce((sum, log) => sum + (log.actual_quantity || log.ok_quantity || 0), 0);
      const targetToday = logs.reduce((sum, log) => sum + (log.target_quantity || 0), 0);
      const rejectionPcs = logs.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0);
      const totalProduced = productionToday + rejectionPcs;
      const rejectionPercent = totalProduced > 0 ? (rejectionPcs / totalProduced) * 100 : 0;

      // Calculate machine metrics
      const allMachines = machines.data || [];
      const machinesTotal = allMachines.length;
      const machinesRunning = allMachines.filter(m => m.status === 'running').length;

      // Calculate IPQC metrics
      const ipqcRecords = ipqcChecks.data || [];
      const ipqcCompleted = ipqcRecords.length;
      // Estimate due checks: assume 1 check per running machine per 2 hours in an 8-hour shift = 4 checks per machine
      const hoursElapsed = new Date().getHours() - 8; // Assuming shift starts at 8 AM
      const checksPerMachine = Math.max(0, Math.floor(hoursElapsed / 2));
      const ipqcDue = machinesRunning * Math.max(1, checksPerMachine);

      // Active work orders
      const activeWorkOrders = (workOrders.data || []).length;

      const safeRejectionPercent = Number.isFinite(rejectionPercent) ? rejectionPercent : 0;
      
      setMetrics({
        activeWorkOrders,
        machinesRunning,
        machinesTotal,
        productionToday,
        targetToday,
        rejectionPcs,
        rejectionPercent: parseFloat(safeRejectionPercent.toFixed(1)),
        ipqcDue: Math.max(ipqcDue, ipqcCompleted),
        ipqcCompleted
      });

      setLoading(false);
    } catch (error) {
      console.error('Error loading today metrics:', error);
      setLoading(false);
    }
  };

  const productionProgress = metrics.targetToday > 0 
    ? Math.min((metrics.productionToday / metrics.targetToday) * 100, 100) 
    : 0;

  const machineUtilization = metrics.machinesTotal > 0 
    ? (metrics.machinesRunning / metrics.machinesTotal) * 100 
    : 0;

  const ipqcProgress = metrics.ipqcDue > 0 
    ? Math.min((metrics.ipqcCompleted / metrics.ipqcDue) * 100, 100) 
    : 100;

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
              <p className="text-xs">Read-only metrics derived from Production Logs</p>
            </TooltipContent>
          </Tooltip>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Active Work Orders */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardList className="h-3 w-3" />
              <span>Active WOs</span>
            </div>
            <div className="text-2xl font-bold text-foreground">
              {metrics.activeWorkOrders}
            </div>
          </div>

          {/* Machines Running */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Cpu className="h-3 w-3" />
              <span>Machines</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                machineUtilization >= 70 ? "text-emerald-600 dark:text-emerald-400" : 
                machineUtilization >= 40 ? "text-amber-600 dark:text-amber-400" : 
                "text-destructive"
              )}>
                {metrics.machinesRunning}
              </span>
              <span className="text-sm text-muted-foreground">/ {metrics.machinesTotal}</span>
            </div>
            <Progress value={machineUtilization} className="h-1" />
          </div>

          {/* Production vs Target */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              <span>Production</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                productionProgress >= 80 ? "text-emerald-600 dark:text-emerald-400" : 
                productionProgress >= 50 ? "text-amber-600 dark:text-amber-400" : 
                "text-foreground"
              )}>
                {metrics.productionToday.toLocaleString()}
              </span>
              <span className="text-sm text-muted-foreground">/ {metrics.targetToday.toLocaleString()}</span>
            </div>
            <Progress value={productionProgress} className="h-1" />
          </div>

          {/* Rejection Today */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>Rejection</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                metrics.rejectionPercent > 3 ? "text-destructive" : 
                metrics.rejectionPercent > 1 ? "text-amber-600 dark:text-amber-400" : 
                "text-emerald-600 dark:text-emerald-400"
              )}>
                {metrics.rejectionPcs}
              </span>
              <span className={cn(
                "text-sm",
                metrics.rejectionPercent > 3 ? "text-destructive" : "text-muted-foreground"
              )}>
                ({metrics.rejectionPercent}%)
              </span>
            </div>
          </div>

          {/* IPQC Checks */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ClipboardCheck className="h-3 w-3" />
              <span>IPQC Checks</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span className={cn(
                "text-2xl font-bold",
                ipqcProgress >= 80 ? "text-emerald-600 dark:text-emerald-400" : 
                ipqcProgress >= 50 ? "text-amber-600 dark:text-amber-400" : 
                "text-destructive"
              )}>
                {metrics.ipqcCompleted}
              </span>
              <span className="text-sm text-muted-foreground">/ {metrics.ipqcDue} due</span>
            </div>
            <Progress value={ipqcProgress} className="h-1" />
          </div>
        </div>
      </CardContent>
    </Card>
    </TooltipProvider>
  );
};
