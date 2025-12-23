/**
 * FloorDashboard - PRIMARY OPERATIONAL CONTROL PAGE
 * 
 * SINGLE SOURCE OF TRUTH for all stage-level insights:
 * - Fetches work_orders, wo_external_moves, machines, daily_production_logs once
 * - Passes data to child components (StageView, MachinesView, OperatorsView, etc.)
 * - All stage counts, blockers, and status logic derive from this dataset
 * - No child component should independently fetch work order or stage data
 * 
 * Access process-specific views via:
 * - Stage cards → /work-orders?stage=<stage> or /work-orders?type=external
 * - All filtering happens on the Work Orders page
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { StageView } from "@/components/dashboard/StageView";
import { MachinesView } from "@/components/dashboard/MachinesView";
import { OperatorsView } from "@/components/dashboard/OperatorsView";
import { ActionableBlockers } from "@/components/dashboard/ActionableBlockers";
import { BlockedWorkOrdersTable } from "@/components/dashboard/BlockedWorkOrdersTable";
import { ThresholdAlerts } from "@/components/dashboard/ThresholdAlerts";
import { NCRBlockerAlert } from "@/components/ncr/NCRBlockerAlert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Factory, 
  Users, 
  AlertTriangle, 
  Clock, 
  ArrowRight,
  CheckCircle,
  XCircle,
  RefreshCw,
  Layers
} from "lucide-react";
import { differenceInHours, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [externalMoves, setExternalMoves] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  const [operators, setOperators] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const today = new Date().toISOString().split('T')[0];
      
      const [woResult, machinesResult, externalResult, logsResult, operatorsResult] = await Promise.all([
        supabase
          .from("work_orders")
          .select(`
            id,
            wo_id,
            wo_number,
            display_id,
            customer,
            item_code,
            quantity,
            qty_completed,
            qty_rejected,
            qty_remaining,
            completion_pct,
            status,
            current_stage,
            due_date,
            created_at,
            stage_entered_at,
            qc_material_passed,
            qc_first_piece_passed,
            machine_id
          `)
          .in("status", ["pending", "in_progress"])
          .order("due_date", { ascending: true }),
        
        supabase
          .from("machines")
          .select("id, machine_id, name, status, current_wo_id")
          .order("machine_id", { ascending: true }),

        supabase
          .from("wo_external_moves")
          .select("id, work_order_id, process, status, expected_return_date")
          .eq("status", "sent"),

        // Fetch today's production logs for live metrics
        supabase
          .from("daily_production_logs")
          .select(`
            id,
            wo_id,
            machine_id,
            operator_id,
            log_date,
            ok_quantity,
            target_quantity,
            total_rejection_quantity,
            actual_runtime_minutes,
            total_downtime_minutes
          `)
          .eq("log_date", today),

        // Fetch operators
        supabase
          .from("people")
          .select("id, full_name, name")
          .eq("role", "operator")
          .eq("is_active", true)
      ]);

      if (woResult.error) throw woResult.error;
      if (machinesResult.error) throw machinesResult.error;
      if (externalResult.error) throw externalResult.error;
      if (logsResult.error) throw logsResult.error;
      if (operatorsResult.error) throw operatorsResult.error;

      setWorkOrders(woResult.data || []);
      setMachines(machinesResult.data || []);
      setExternalMoves(externalResult.data || []);
      setProductionLogs(logsResult.data || []);
      setOperators(operatorsResult.data || []);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_external_moves" }, () => {
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

  // Calculate blocker stats - LIVE STATE ONLY
  const blockerStats = useMemo(() => {
    const total = workOrders.length;
    const materialQcBlocked = workOrders.filter(wo => !wo.qc_material_passed).length;
    const firstPieceBlocked = workOrders.filter(wo => wo.qc_material_passed && !wo.qc_first_piece_passed).length;
    const externalBlocked = externalMoves.length;
    const ready = total - materialQcBlocked - firstPieceBlocked - externalBlocked;
    
    const activeMachines = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idleMachines = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;

    // Active operators today (from today's logs for context)
    const activeOperators = new Set(productionLogs.map(l => l.operator_id).filter(Boolean)).size;

    return {
      total,
      materialQcBlocked,
      firstPieceBlocked,
      externalBlocked,
      ready: Math.max(0, ready),
      activeMachines,
      idleMachines,
      totalMachines: machines.length,
      blockedTotal: materialQcBlocked + firstPieceBlocked + externalBlocked,
      activeOperators
    };
  }, [workOrders, externalMoves, machines, productionLogs]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header with Action Focus */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              Floor Dashboard
              {blockerStats.blockedTotal > 0 && (
                <Badge variant="destructive" className="text-sm">
                  {blockerStats.blockedTotal} Blocked
                </Badge>
              )}
            </h1>
            <p className="text-sm text-muted-foreground">
              Live operational state: blockers, machine status, queue depth
            </p>
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadData}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Live State Cards - Current Status Only (NOT historical) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className={cn(
            "border-l-4",
            blockerStats.materialQcBlocked > 0 ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Material QC</span>
                <XCircle className={cn("h-4 w-4", blockerStats.materialQcBlocked > 0 ? "text-amber-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.materialQcBlocked > 0 && "text-amber-700 dark:text-amber-400")}>
                {blockerStats.materialQcBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: Quality</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.firstPieceBlocked > 0 ? "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">First Piece QC</span>
                <XCircle className={cn("h-4 w-4", blockerStats.firstPieceBlocked > 0 ? "text-orange-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.firstPieceBlocked > 0 && "text-orange-700 dark:text-orange-400")}>
                {blockerStats.firstPieceBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: QC / Production</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.externalBlocked > 0 ? "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">At External</span>
                <Clock className={cn("h-4 w-4", blockerStats.externalBlocked > 0 ? "text-purple-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", blockerStats.externalBlocked > 0 && "text-purple-700 dark:text-purple-400")}>
                {blockerStats.externalBlocked}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: External Ops</p>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-green-500 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Ready to Run</span>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </div>
              <p className="text-xl font-bold text-green-700 dark:text-green-400">
                {blockerStats.ready}
              </p>
              <p className="text-[10px] text-muted-foreground">Owner: Production</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            blockerStats.idleMachines > 0 && blockerStats.ready > 0 ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Machines</span>
                <Factory className={cn("h-4 w-4", blockerStats.activeMachines > 0 ? "text-blue-500" : "text-muted-foreground/30")} />
              </div>
              <p className="text-xl font-bold">
                <span className="text-green-600">{blockerStats.activeMachines}</span>
                <span className="text-muted-foreground text-sm"> / {blockerStats.totalMachines}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">{blockerStats.idleMachines} idle</p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Action Alert */}
        {blockerStats.idleMachines > 0 && blockerStats.ready > 0 && (
          <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {blockerStats.idleMachines} machine{blockerStats.idleMachines > 1 ? 's' : ''} idle with {blockerStats.ready} ready WOs
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Assign machines to start production
                    </p>
                  </div>
                </div>
                <Button 
                  variant="default" 
                  size="sm"
                  onClick={() => navigate('/production-progress?status=ready')}
                  className="gap-1"
                >
                  Assign Now <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content - Tabs */}
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-4">
            <TabsTrigger value="stages" className="gap-2">
              <Layers className="h-4 w-4" />
              Stages
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Factory className="h-4 w-4" />
              Machines
            </TabsTrigger>
            <TabsTrigger value="operators" className="gap-2">
              <Users className="h-4 w-4" />
              Operators
            </TabsTrigger>
            <TabsTrigger value="blockers" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
              {blockerStats.blockedTotal > 0 && (
                <Badge variant="destructive" className="h-5 text-[10px] px-1.5">
                  {blockerStats.blockedTotal}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Stages Tab */}
          <TabsContent value="stages" className="mt-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-48" />
                  ))}
                </div>
              </div>
            ) : (
              <StageView
                workOrders={workOrders}
                externalMoves={externalMoves}
                productionLogs={productionLogs}
              />
            )}
          </TabsContent>

          {/* Machines Tab */}
          <TabsContent value="machines" className="mt-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(i => (
                    <Skeleton key={i} className="h-32" />
                  ))}
                </div>
              </div>
            ) : (
              <MachinesView productionLogs={productionLogs} />
            )}
          </TabsContent>

          {/* Operators Tab */}
          <TabsContent value="operators" className="mt-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <Skeleton key={i} className="h-28" />
                  ))}
                </div>
              </div>
            ) : (
              <OperatorsView
                productionLogs={productionLogs}
                operators={operators}
              />
            )}
          </TabsContent>

          {/* Blockers Tab */}
          <TabsContent value="blockers" className="mt-6 space-y-6">
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-60 w-full" />
              </div>
            ) : (
              <>
                {/* Open NCRs as blockers */}
                <NCRBlockerAlert />

                {/* Threshold-based Performance Alerts */}
                <ThresholdAlerts />

                <ActionableBlockers />

                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        All Blocked Work Orders
                      </CardTitle>
                      <span className="text-xs text-muted-foreground">
                        Each row has one primary action
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <BlockedWorkOrdersTable 
                      workOrders={workOrders}
                      externalMoves={externalMoves}
                      machines={machines}
                    />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default FloorDashboard;
