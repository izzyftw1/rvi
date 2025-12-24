/**
 * FloorDashboard - PRIMARY OPERATIONAL CONTROL PAGE
 * 
 * SINGLE SOURCE OF TRUTH: All stage-level counts derived from production_batches.
 * A Work Order may have multiple active batches across different stages simultaneously.
 * 
 * production_batches is the source of truth for:
 * - Stage location (cutting, production, external, qc, packing, dispatched)
 * - Quantity in each stage (batch_quantity)
 * - Internal vs External processing
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
import { ActionableBlockers } from "@/components/dashboard/ActionableBlockers";
import { BlockedWorkOrdersTable } from "@/components/dashboard/BlockedWorkOrdersTable";
import { ThresholdAlerts } from "@/components/dashboard/ThresholdAlerts";
import { NCRBlockerAlert } from "@/components/ncr/NCRBlockerAlert";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Factory, 
  AlertTriangle, 
  Clock, 
  ArrowRight,
  CheckCircle,
  RefreshCw,
  Layers,
  Package,
  Truck
} from "lucide-react";
import { cn } from "@/lib/utils";

interface BatchStageSummary {
  stage: string;
  totalQuantity: number;
  batchCount: number;
  inProgress: number;
}

const FloorDashboard = () => {
  const navigate = useNavigate();
  const [batchSummary, setBatchSummary] = useState<BatchStageSummary[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [externalMoves, setExternalMoves] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(Date.now());

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      const today = new Date().toISOString().split('T')[0];
      
      const [batchResult, machinesResult, logsResult, woResult, externalResult] = await Promise.all([
        // Fetch batch stage summary with work_orders join for quantity fallback
        supabase
          .from("production_batches")
          .select(`
            id, wo_id, batch_quantity, stage_type, batch_status, external_process_type,
            work_orders!inner(quantity)
          `)
          .is("ended_at", null), // Only active batches
        
        supabase
          .from("machines")
          .select("id, machine_id, name, status, current_wo_id")
          .order("machine_id", { ascending: true }),

        // Fetch today's production logs for machine metrics
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

        // Still need work orders for blocker calculations (QC states)
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
            qc_material_passed,
            qc_first_piece_passed,
            machine_id
          `)
          .in("status", ["pending", "in_progress"]),

        // External moves with quantity for external WIP calculation
        supabase
          .from("wo_external_moves")
          .select("id, work_order_id, process, status, expected_return_date, quantity_sent, quantity_returned")
          .not("status", "in", '("received_full","cancelled")')
      ]);

      if (batchResult.error) throw batchResult.error;
      if (machinesResult.error) throw machinesResult.error;
      if (logsResult.error) throw logsResult.error;
      if (woResult.error) throw woResult.error;
      if (externalResult.error) throw externalResult.error;

      // Calculate external WIP from moves (source of truth for external)
      const externalMovesData = externalResult.data || [];
      let externalWipTotal = 0;
      let externalMoveCount = 0;
      externalMovesData.forEach((move: any) => {
        const wip = (move.quantity_sent || 0) - (move.quantity_returned || 0);
        if (wip > 0) {
          externalWipTotal += wip;
          externalMoveCount += 1;
        }
      });

      // Aggregate batch data by stage
      const batches = batchResult.data || [];
      const stageMap = new Map<string, BatchStageSummary>();
      
      batches.forEach((batch: any) => {
        const stage = batch.stage_type || 'production';
        // Skip external - we'll calculate from moves
        if (stage === 'external') return;
        
        const existing = stageMap.get(stage) || {
          stage,
          totalQuantity: 0,
          batchCount: 0,
          inProgress: 0
        };
        // Use batch_quantity if set, otherwise fall back to WO quantity
        const qty = batch.batch_quantity > 0 ? batch.batch_quantity : (batch.work_orders?.quantity || 0);
        existing.totalQuantity += qty;
        existing.batchCount += 1;
        if (batch.batch_status === 'in_progress') {
          existing.inProgress += 1;
        }
        stageMap.set(stage, existing);
      });

      // Add external stage from moves data
      stageMap.set('external', {
        stage: 'external',
        totalQuantity: externalWipTotal,
        batchCount: externalMoveCount,
        inProgress: externalMoveCount
      });

      setBatchSummary(Array.from(stageMap.values()));
      setMachines(machinesResult.data || []);
      setProductionLogs(logsResult.data || []);
      setWorkOrders(woResult.data || []);
      setExternalMoves(externalMovesData);
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
      .on("postgres_changes", { event: "*", schema: "public", table: "production_batches" }, () => {
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

  // Calculate stats from batch-level data - SOURCE OF TRUTH
  const batchStats = useMemo(() => {
    const totalQuantity = batchSummary.reduce((sum, s) => sum + s.totalQuantity, 0);
    const totalBatches = batchSummary.reduce((sum, s) => sum + s.batchCount, 0);
    const inProgressBatches = batchSummary.reduce((sum, s) => sum + s.inProgress, 0);
    
    const productionStage = batchSummary.find(s => s.stage === 'production');
    const externalStage = batchSummary.find(s => s.stage === 'external');
    const qcStage = batchSummary.find(s => s.stage === 'qc');
    const packingStage = batchSummary.find(s => s.stage === 'packing');

    const activeMachines = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idleMachines = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;

    return {
      totalQuantity,
      totalBatches,
      inProgressBatches,
      productionQty: productionStage?.totalQuantity || 0,
      productionBatches: productionStage?.batchCount || 0,
      externalQty: externalStage?.totalQuantity || 0,
      externalBatches: externalStage?.batchCount || 0,
      qcQty: qcStage?.totalQuantity || 0,
      qcBatches: qcStage?.batchCount || 0,
      packingQty: packingStage?.totalQuantity || 0,
      packingBatches: packingStage?.batchCount || 0,
      activeMachines,
      idleMachines,
      totalMachines: machines.length
    };
  }, [batchSummary, machines]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header with Action Focus */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              Floor Dashboard
              <Badge variant="outline" className="text-sm font-normal">
                {batchStats.totalBatches} batches
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Batch-level view: quantities tracked per stage from production_batches
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

        {/* Batch-Based Stage Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Card className="border-l-4 border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20">
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Production</span>
                <Factory className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-blue-700 dark:text-blue-400">
                {batchStats.productionQty.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">{batchStats.productionBatches} batches</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            batchStats.externalBatches > 0 ? "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">External</span>
                <Truck className={cn("h-4 w-4", batchStats.externalBatches > 0 ? "text-purple-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", batchStats.externalBatches > 0 && "text-purple-700 dark:text-purple-400")}>
                {batchStats.externalQty.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">{batchStats.externalBatches} batches</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            batchStats.qcBatches > 0 ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">QC</span>
                <CheckCircle className={cn("h-4 w-4", batchStats.qcBatches > 0 ? "text-amber-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", batchStats.qcBatches > 0 && "text-amber-700 dark:text-amber-400")}>
                {batchStats.qcQty.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">{batchStats.qcBatches} batches</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            batchStats.packingBatches > 0 ? "border-l-green-500 bg-green-50/50 dark:bg-green-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Packing</span>
                <Package className={cn("h-4 w-4", batchStats.packingBatches > 0 ? "text-green-500" : "text-muted-foreground/30")} />
              </div>
              <p className={cn("text-xl font-bold", batchStats.packingBatches > 0 && "text-green-700 dark:text-green-400")}>
                {batchStats.packingQty.toLocaleString()}
              </p>
              <p className="text-[10px] text-muted-foreground">{batchStats.packingBatches} batches</p>
            </CardContent>
          </Card>

          <Card className={cn(
            "border-l-4",
            batchStats.idleMachines > 0 && batchStats.productionBatches > 0 ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" : "border-l-muted"
          )}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Machines</span>
                <Factory className={cn("h-4 w-4", batchStats.activeMachines > 0 ? "text-blue-500" : "text-muted-foreground/30")} />
              </div>
              <p className="text-xl font-bold">
                <span className="text-green-600">{batchStats.activeMachines}</span>
                <span className="text-muted-foreground text-sm"> / {batchStats.totalMachines}</span>
              </p>
              <p className="text-[10px] text-muted-foreground">{batchStats.idleMachines} idle</p>
            </CardContent>
          </Card>
        </div>

        {/* Priority Action Alert */}
        {batchStats.idleMachines > 0 && batchStats.productionBatches > 0 && (
          <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {batchStats.idleMachines} machine{batchStats.idleMachines > 1 ? 's' : ''} idle with {batchStats.productionBatches} batches in production queue
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
          <TabsList className="grid w-full md:w-auto grid-cols-3">
            <TabsTrigger value="stages" className="gap-2">
              <Layers className="h-4 w-4" />
              Stages
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Factory className="h-4 w-4" />
              Machines
            </TabsTrigger>
            <TabsTrigger value="blockers" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
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
              <StageView />
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

          {/* Operators Tab - DISABLED: Operator data is post-shift, not real-time.
              Access operator analytics via /operator-efficiency page instead. */}

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
