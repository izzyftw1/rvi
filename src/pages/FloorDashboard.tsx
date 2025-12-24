/**
 * FloorDashboard - PRIMARY OPERATIONAL CONTROL PAGE
 * 
 * SINGLE SOURCE OF TRUTH: production_batches
 * - current_location_type (factory | external_partner | transit | packed | dispatched)
 * - current_process (cutting | production | plating | etc.)
 * - batch_quantity (with work_orders.quantity fallback)
 * 
 * NO DEPENDENCY on work_order.stage
 * 
 * Features:
 * - View by quantity (pcs/kg) or batch count toggle
 * - All stages derived from production_batches
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { StageView } from "@/components/dashboard/StageView";
import { MachinesView } from "@/components/dashboard/MachinesView";
import { Skeleton } from "@/components/ui/skeleton";
import { useBatchDashboard } from "@/hooks/useBatchDashboard";
import { 
  Factory, 
  AlertTriangle, 
  ArrowRight,
  CheckCircle,
  RefreshCw,
  Layers,
  Package,
  Truck,
  Box,
  Scissors,
  Hash
} from "lucide-react";
import { cn } from "@/lib/utils";

type ViewMode = 'quantity' | 'batches';

const FloorDashboard = () => {
  const navigate = useNavigate();
  const { summary, loading: batchLoading, refresh } = useBatchDashboard();
  const [viewMode, setViewMode] = useState<ViewMode>('quantity');
  const [machines, setMachines] = useState<any[]>([]);
  const [productionLogs, setProductionLogs] = useState<any[]>([]);
  const [machinesLoading, setMachinesLoading] = useState(true);

  // Load machine data separately
  const loadMachineData = useCallback(async () => {
    try {
      setMachinesLoading(true);
      const today = new Date().toISOString().split('T')[0];
      
      const [machinesResult, logsResult] = await Promise.all([
        supabase
          .from("machines")
          .select("id, machine_id, name, status, current_wo_id")
          .order("machine_id", { ascending: true }),
        supabase
          .from("daily_production_logs")
          .select(`
            id, wo_id, machine_id, operator_id, log_date,
            ok_quantity, target_quantity, total_rejection_quantity,
            actual_runtime_minutes, total_downtime_minutes
          `)
          .eq("log_date", today),
      ]);

      if (machinesResult.error) throw machinesResult.error;
      if (logsResult.error) throw logsResult.error;

      setMachines(machinesResult.data || []);
      setProductionLogs(logsResult.data || []);
    } catch (error) {
      console.error("Error loading machine data:", error);
    } finally {
      setMachinesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMachineData();
    const interval = setInterval(loadMachineData, 60000);
    return () => clearInterval(interval);
  }, [loadMachineData]);

  // Machine stats
  const machineStats = useMemo(() => {
    const activeMachines = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idleMachines = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;
    return { activeMachines, idleMachines, totalMachines: machines.length };
  }, [machines]);

  // Calculate factory-internal process breakdown
  const factoryBreakdown = useMemo(() => {
    const byProcess = summary.factory.byProcess;
    return {
      cutting: byProcess['cutting'] || { quantity: 0, batchCount: 0 },
      production: byProcess['production'] || { quantity: 0, batchCount: 0 },
      qc: (byProcess['qc'] || { quantity: 0, batchCount: 0 }).quantity + 
          (byProcess['post_external_qc'] || { quantity: 0, batchCount: 0 }).quantity,
      qcBatches: (byProcess['qc']?.batchCount || 0) + (byProcess['post_external_qc']?.batchCount || 0),
    };
  }, [summary]);

  const loading = batchLoading || machinesLoading;

  // Get display value based on view mode
  const getDisplayValue = (qty: number, batches: number) => {
    return viewMode === 'quantity' ? qty : batches;
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              Floor Dashboard
              <Badge variant="outline" className="text-sm font-normal">
                {summary.totalBatches} batches
              </Badge>
            </h1>
            <p className="text-sm text-muted-foreground">
              Real-time batch tracking from production_batches
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <ToggleGroup 
              type="single" 
              value={viewMode} 
              onValueChange={(v) => v && setViewMode(v as ViewMode)}
              className="border rounded-md"
            >
              <ToggleGroupItem value="quantity" aria-label="View by quantity" className="gap-1 text-xs px-3">
                <Package className="h-3 w-3" />
                Qty
              </ToggleGroupItem>
              <ToggleGroupItem value="batches" aria-label="View by batch count" className="gap-1 text-xs px-3">
                <Hash className="h-3 w-3" />
                Batches
              </ToggleGroupItem>
            </ToggleGroup>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={refresh}
              className="gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Batch-Based Location Summary Cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            {/* Cutting */}
            <Card className={cn(
              "border-l-4",
              factoryBreakdown.cutting.batchCount > 0 
                ? "border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Cutting</span>
                  <Scissors className={cn(
                    "h-4 w-4",
                    factoryBreakdown.cutting.batchCount > 0 ? "text-orange-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  factoryBreakdown.cutting.batchCount > 0 && "text-orange-700 dark:text-orange-400"
                )}>
                  {getDisplayValue(factoryBreakdown.cutting.quantity, factoryBreakdown.cutting.batchCount).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {viewMode === 'quantity' ? `${factoryBreakdown.cutting.batchCount} batches` : 'batches'}
                </p>
              </CardContent>
            </Card>

            {/* Production */}
            <Card className={cn(
              "border-l-4",
              factoryBreakdown.production.batchCount > 0 
                ? "border-l-blue-500 bg-blue-50/50 dark:bg-blue-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Production</span>
                  <Factory className={cn(
                    "h-4 w-4",
                    factoryBreakdown.production.batchCount > 0 ? "text-blue-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  factoryBreakdown.production.batchCount > 0 && "text-blue-700 dark:text-blue-400"
                )}>
                  {getDisplayValue(factoryBreakdown.production.quantity, factoryBreakdown.production.batchCount).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {viewMode === 'quantity' ? `${factoryBreakdown.production.batchCount} batches` : 'batches'}
                </p>
              </CardContent>
            </Card>

            {/* External */}
            <Card className={cn(
              "border-l-4",
              summary.external_partner.batchCount > 0 
                ? "border-l-purple-500 bg-purple-50/50 dark:bg-purple-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">External</span>
                  <Truck className={cn(
                    "h-4 w-4",
                    summary.external_partner.batchCount > 0 ? "text-purple-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  summary.external_partner.batchCount > 0 && "text-purple-700 dark:text-purple-400"
                )}>
                  {getDisplayValue(summary.external_partner.total, summary.external_partner.batchCount).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {viewMode === 'quantity' ? `${summary.external_partner.batchCount} batches` : 'batches'}
                </p>
              </CardContent>
            </Card>

            {/* QC */}
            <Card className={cn(
              "border-l-4",
              factoryBreakdown.qcBatches > 0 
                ? "border-l-amber-500 bg-amber-50/50 dark:bg-amber-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">QC</span>
                  <CheckCircle className={cn(
                    "h-4 w-4",
                    factoryBreakdown.qcBatches > 0 ? "text-amber-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  factoryBreakdown.qcBatches > 0 && "text-amber-700 dark:text-amber-400"
                )}>
                  {getDisplayValue(factoryBreakdown.qc, factoryBreakdown.qcBatches).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {viewMode === 'quantity' ? `${factoryBreakdown.qcBatches} batches` : 'batches'}
                </p>
              </CardContent>
            </Card>

            {/* Packed */}
            <Card className={cn(
              "border-l-4",
              summary.packed.batchCount > 0 
                ? "border-l-green-500 bg-green-50/50 dark:bg-green-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Packed</span>
                  <Box className={cn(
                    "h-4 w-4",
                    summary.packed.batchCount > 0 ? "text-green-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className={cn(
                  "text-xl font-bold",
                  summary.packed.batchCount > 0 && "text-green-700 dark:text-green-400"
                )}>
                  {getDisplayValue(summary.packed.total, summary.packed.batchCount).toLocaleString()}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {viewMode === 'quantity' ? `${summary.packed.batchCount} batches` : 'batches'}
                </p>
              </CardContent>
            </Card>

            {/* Machines */}
            <Card className={cn(
              "border-l-4",
              machineStats.activeMachines > 0 
                ? "border-l-cyan-500 bg-cyan-50/50 dark:bg-cyan-950/20" 
                : "border-l-muted"
            )}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Machines</span>
                  <Factory className={cn(
                    "h-4 w-4",
                    machineStats.activeMachines > 0 ? "text-cyan-500" : "text-muted-foreground/30"
                  )} />
                </div>
                <p className="text-xl font-bold">
                  <span className="text-green-600">{machineStats.activeMachines}</span>
                  <span className="text-muted-foreground text-sm"> / {machineStats.totalMachines}</span>
                </p>
                <p className="text-[10px] text-muted-foreground">{machineStats.idleMachines} idle</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Action Alert */}
        {machineStats.idleMachines > 0 && factoryBreakdown.production.batchCount > 0 && (
          <Card className="border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  <div>
                    <p className="font-medium text-blue-800 dark:text-blue-200">
                      {machineStats.idleMachines} machine{machineStats.idleMachines > 1 ? 's' : ''} idle with {factoryBreakdown.production.batchCount} batches ready
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
                  Assign <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs defaultValue="stages" className="w-full">
          <TabsList className="grid w-full md:w-auto grid-cols-2">
            <TabsTrigger value="stages" className="gap-2">
              <Layers className="h-4 w-4" />
              Stages
            </TabsTrigger>
            <TabsTrigger value="machines" className="gap-2">
              <Factory className="h-4 w-4" />
              Machines
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="machines" className="mt-6">
            {machinesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : (
              <MachinesView productionLogs={productionLogs} />
            )}
          </TabsContent>
        </Tabs>

        {/* Source indicator */}
        <p className="text-[10px] text-muted-foreground italic text-right">
          All data derived from production_batches (current_location_type, current_process)
        </p>
      </div>
    </div>
  );
};

export default FloorDashboard;
