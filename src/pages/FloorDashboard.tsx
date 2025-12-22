import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { MachineUtilizationDashboard } from "@/components/MachineUtilizationDashboard";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Factory, 
  TrendingUp, 
  Users, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Hammer, 
  Package, 
  Inbox,
  Pause,
  ArrowRight,
  Zap,
  Activity
} from "lucide-react";
import { differenceInHours, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

// Stage configuration with daily capacity estimates
interface StageConfig {
  label: string;
  icon: React.ElementType;
  color: string;
  dailyCapacity: number; // estimated WOs per day
  isProduction: boolean;
}

const STAGE_CONFIG: Record<string, StageConfig> = {
  goods_in: { label: 'Goods In', icon: Inbox, color: 'hsl(var(--muted-foreground))', dailyCapacity: 20, isProduction: false },
  cutting_queue: { label: 'Cutting', icon: Package, color: 'hsl(210 90% 52%)', dailyCapacity: 8, isProduction: true },
  forging_queue: { label: 'Forging', icon: Hammer, color: 'hsl(38 92% 50%)', dailyCapacity: 6, isProduction: true },
  production: { label: 'CNC Production', icon: Factory, color: 'hsl(210 90% 42%)', dailyCapacity: 10, isProduction: true },
  qc: { label: 'Quality Check', icon: CheckCircle2, color: 'hsl(142 76% 36%)', dailyCapacity: 15, isProduction: false },
  packing: { label: 'Packing', icon: Package, color: 'hsl(210 70% 40%)', dailyCapacity: 12, isProduction: false },
  dispatch: { label: 'Dispatch', icon: Package, color: 'hsl(142 76% 40%)', dailyCapacity: 20, isProduction: false },
};

type LoadLevel = 'underloaded' | 'balanced' | 'overloaded';

interface StageStatus {
  stage: string;
  config: StageConfig;
  queuedCount: number;
  loadLevel: LoadLevel;
  loadPercent: number;
  blockedCount: number;
  readyCount: number;
  avgWaitHours: number;
  orders: any[];
}

function getLoadLevel(queuedCount: number, dailyCapacity: number): { level: LoadLevel; percent: number } {
  const percent = Math.round((queuedCount / dailyCapacity) * 100);
  if (percent <= 50) return { level: 'underloaded', percent };
  if (percent <= 120) return { level: 'balanced', percent };
  return { level: 'overloaded', percent };
}

function getAvgWaitHours(orders: any[]): number {
  if (orders.length === 0) return 0;
  const totalHours = orders.reduce((sum, wo) => {
    try {
      return sum + differenceInHours(new Date(), parseISO(wo.stage_entered_at || wo.created_at));
    } catch {
      return sum;
    }
  }, 0);
  return Math.round(totalHours / orders.length);
}

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const [woResult, machinesResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            id,
            wo_id,
            display_id,
            customer,
            item_code,
            quantity,
            status,
            current_stage,
            due_date,
            created_at,
            qc_material_passed,
            qc_first_piece_passed
          `)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true }),
        
        supabase
          .from("machines")
          .select("id, machine_id, name, status, current_wo_id")
          .order("machine_id", { ascending: true })
      ]);

      if (woResult.error) throw woResult.error;
      if (machinesResult.error) throw machinesResult.error;

      setWorkOrders(woResult.data || []);
      setMachines(machinesResult.data || []);
    } catch (error: any) {
      console.error("Error loading dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const refreshInterval = setInterval(loadData, 30000);

    let timeout: NodeJS.Timeout;
    const channel = supabase
      .channel("floor-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_production_logs" }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .subscribe();

    return () => {
      clearInterval(refreshInterval);
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  useEffect(() => {
    if (lastUpdate > 0) loadData();
  }, [lastUpdate, loadData]);

  // Calculate stage statuses with load balancing info
  const stageStatuses = useMemo((): StageStatus[] => {
    return Object.entries(STAGE_CONFIG)
      .map(([stage, config]) => {
        const orders = workOrders.filter((wo) => wo.current_stage === stage);
        const { level, percent } = getLoadLevel(orders.length, config.dailyCapacity);
        
        const blockedCount = orders.filter(wo => 
          !wo.qc_material_passed || !wo.qc_first_piece_passed
        ).length;
        
        const readyCount = orders.filter(wo => 
          wo.qc_material_passed && wo.qc_first_piece_passed
        ).length;

        return {
          stage,
          config,
          queuedCount: orders.length,
          loadLevel: level,
          loadPercent: percent,
          blockedCount,
          readyCount,
          avgWaitHours: getAvgWaitHours(orders),
          orders
        };
      })
      .filter(s => s.queuedCount > 0 || s.config.isProduction); // Hide irrelevant stages with no orders
  }, [workOrders]);

  // Overall balance metrics
  const balanceMetrics = useMemo(() => {
    const productionStages = stageStatuses.filter(s => s.config.isProduction);
    const overloadedStages = productionStages.filter(s => s.loadLevel === 'overloaded');
    const idleStages = productionStages.filter(s => s.loadLevel === 'underloaded' && s.queuedCount === 0);
    const totalQueued = stageStatuses.reduce((sum, s) => sum + s.queuedCount, 0);
    const totalBlocked = stageStatuses.reduce((sum, s) => sum + s.blockedCount, 0);
    
    const activeMachines = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idleMachines = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;

    return {
      overloadedCount: overloadedStages.length,
      idleStageCount: idleStages.length,
      totalQueued,
      totalBlocked,
      activeMachines,
      idleMachines,
      totalMachines: machines.length
    };
  }, [stageStatuses, machines]);

  const loadColors = {
    underloaded: 'text-blue-600 dark:text-blue-400',
    balanced: 'text-green-600 dark:text-green-400',
    overloaded: 'text-red-600 dark:text-red-400'
  };

  const loadBgColors = {
    underloaded: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800',
    balanced: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    overloaded: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
  };

  const loadLabels = {
    underloaded: 'Idle Capacity',
    balanced: 'Balanced',
    overloaded: 'Overloaded'
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Floor Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Load balancing & execution readiness
            </p>
          </div>

          {/* Quick Balance Summary - only show if issues exist */}
          <div className="flex flex-wrap gap-2">
            {balanceMetrics.overloadedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {balanceMetrics.overloadedCount} Overloaded
              </Badge>
            )}
            {balanceMetrics.totalBlocked > 0 && (
              <Badge variant="outline" className="gap-1">
                <Clock className="h-3 w-3" />
                {balanceMetrics.totalBlocked} Blocked
              </Badge>
            )}
          </div>
        </div>

        {/* Machine Utilization Strip */}
        <Card className="bg-muted/30">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{balanceMetrics.totalMachines} Machines</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    {balanceMetrics.activeMachines} Running
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-400" />
                    {balanceMetrics.idleMachines} Idle
                  </span>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {balanceMetrics.totalQueued} WOs in queue
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-3">
            <TabsTrigger value="stages" className="gap-2">
              <Zap className="h-4 w-4" />
              Stage Load
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Factory className="h-4 w-4" />
              Machines
            </TabsTrigger>
            <TabsTrigger value="operators" className="gap-2">
              <Users className="h-4 w-4" />
              Operators
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stages" className="mt-6">
            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-3">
                      <Skeleton className="h-6 w-1/2" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {stageStatuses.map((stageStatus) => {
                  const { stage, config, queuedCount, loadLevel, loadPercent, blockedCount, readyCount, avgWaitHours, orders } = stageStatus;
                  const Icon = config.icon;
                  const isIdle = queuedCount === 0;

                  return (
                    <Card 
                      key={stage} 
                      className={cn(
                        "transition-all border",
                        isIdle 
                          ? "border-muted bg-muted/20" 
                          : loadBgColors[loadLevel]
                      )}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-5 w-5", isIdle && "opacity-50")} style={{ color: isIdle ? undefined : config.color }} />
                            <CardTitle className={cn("text-base", isIdle && "text-muted-foreground")}>{config.label}</CardTitle>
                          </div>
                          {!isIdle && (
                            <Badge 
                              variant="secondary" 
                              className={cn("text-xs", loadColors[loadLevel])}
                            >
                              {loadLabels[loadLevel]}
                            </Badge>
                          )}
                          {isIdle && (
                            <span className="text-xs text-muted-foreground">0 WOs</span>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="space-y-4">
                        {isIdle ? (
                          <div className="py-2 text-xs text-muted-foreground">
                            No work orders in this stage
                          </div>
                        ) : (
                          <>
                            {/* Load Bar */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Queue vs Capacity</span>
                                <span className={cn("font-semibold", loadColors[loadLevel])}>
                                  {queuedCount} / {config.dailyCapacity}
                                </span>
                              </div>
                              <Progress 
                                value={Math.min(loadPercent, 150)} 
                                className={cn(
                                  "h-2",
                                  loadLevel === 'overloaded' && "[&>div]:bg-red-500",
                                  loadLevel === 'balanced' && "[&>div]:bg-green-500",
                                  loadLevel === 'underloaded' && "[&>div]:bg-blue-500"
                                )}
                              />
                              <p className="text-[10px] text-muted-foreground text-right">
                                {loadPercent}% of daily capacity
                              </p>
                            </div>

                            {/* Breakdown */}
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                                <span className="text-muted-foreground">Ready</span>
                                <span className="font-semibold text-green-600 dark:text-green-400">{readyCount}</span>
                              </div>
                              <div className="flex items-center justify-between p-2 rounded bg-muted/50">
                                <span className="text-muted-foreground">Blocked</span>
                                <span className={cn(
                                  "font-semibold",
                                  blockedCount > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground"
                                )}>
                                  {blockedCount}
                                </span>
                              </div>
                            </div>

                            {/* Guidance Text */}
                            <div className="text-xs text-muted-foreground italic px-1">
                              {blockedCount > 0 && blockedCount >= readyCount && (
                                <span>Primary blocker: {orders.some(o => !o.qc_material_passed) ? 'Material QC' : 'First Piece QC'}</span>
                              )}
                              {blockedCount === 0 && readyCount > 0 && loadLevel === 'underloaded' && (
                                <span>Capacity available, ready to execute</span>
                              )}
                              {blockedCount === 0 && readyCount > 0 && loadLevel === 'overloaded' && (
                                <span>Queue exceeds daily capacity</span>
                              )}
                              {blockedCount === 0 && readyCount > 0 && loadLevel === 'balanced' && (
                                <span>Load balanced, execution on track</span>
                              )}
                              {readyCount === 0 && blockedCount > 0 && (
                                <span>All WOs blocked, none ready to run</span>
                              )}
                            </div>

                            {/* Quick Actions */}
                            <div className="pt-2 border-t">
                              <button
                                onClick={() => navigate(`/production-progress?stage=${stage}`)}
                                className="w-full flex items-center justify-between text-xs text-primary hover:underline group"
                              >
                                <span>View {queuedCount} work orders</span>
                                <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Imbalance Alert */}
            {!loading && balanceMetrics.overloadedCount > 0 && balanceMetrics.idleStageCount > 0 && (
              <Card className="mt-6 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30">
                <CardContent className="py-4 px-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-200">Stage Imbalance Detected</p>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                        {balanceMetrics.overloadedCount} stage{balanceMetrics.overloadedCount > 1 ? 's are' : ' is'} overloaded while {balanceMetrics.idleStageCount} stage{balanceMetrics.idleStageCount > 1 ? 's are' : ' is'} idle. 
                        Consider reallocating resources or investigating blockers.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="machines" className="mt-6">
            <MachineUtilizationDashboard />
          </TabsContent>

          <TabsContent value="operators" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Operator Efficiency Tracking
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Operator efficiency metrics coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FloorDashboard;
