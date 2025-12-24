/**
 * StageView - Batch-Based Stage Overview with Drilldown
 * 
 * SINGLE SOURCE OF TRUTH: All counts derived from production_batches.
 * A Work Order may have multiple active batches across different stages simultaneously.
 * Counts represent batch_quantity sums, not work order counts.
 * 
 * Clicking a stage card opens a drilldown drawer showing:
 * - Batch ID
 * - Work Order link
 * - Quantity
 * - Partner (for external)
 * - Age in stage
 */
import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowRight,
  Package,
  Scissors,
  Factory,
  Truck,
  CheckCircle,
  AlertTriangle,
  Clock,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BatchDrilldownDrawer } from "./BatchDrilldownDrawer";

interface BatchData {
  id: string;
  wo_id: string;
  batch_number: number;
  batch_quantity: number;
  stage_type: string;
  external_process_type: string | null;
  batch_status: string;
  stage_entered_at: string | null;
  external_partner_id: string | null;
  wo_quantity?: number; // fallback from work_orders
}

interface ExternalMoveData {
  id: string;
  work_order_id: string;
  process: string;
  quantity_sent: number;
  quantity_returned: number;
  status: string;
  partner_id: string | null;
  dispatch_date: string | null;
}

interface StageData {
  key: string;
  label: string;
  icon: React.ElementType;
  totalQuantity: number;
  batchCount: number;
  inQueue: number;
  inProgress: number;
  completed: number;
  capacity: number;
  route: string;
  externalBreakdown?: { process: string; quantity: number; count: number }[];
}

const STAGE_CONFIG = [
  { key: 'cutting', label: 'Cutting', icon: Scissors, capacity: 5000, route: '/work-orders?stage=cutting_queue' },
  { key: 'production', label: 'Production', icon: Factory, capacity: 10000, route: '/work-orders?stage=production' },
  { key: 'external', label: 'External Processes', icon: Truck, capacity: 20000, route: '/work-orders?type=external' },
  { key: 'qc', label: 'Final QC', icon: CheckCircle, capacity: 5000, route: '/work-orders?stage=qc' },
  { key: 'packing', label: 'Packing', icon: Package, capacity: 5000, route: '/work-orders?stage=packing' },
];

export const StageView = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [externalMoves, setExternalMoves] = useState<ExternalMoveData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drilldown drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<{ key: string; label: string; processType?: string } | null>(null);

  const handleStageClick = (stageKey: string, stageLabel: string, processType?: string) => {
    setSelectedStage({ key: stageKey, label: stageLabel, processType });
    setDrawerOpen(true);
  };

  const loadData = useCallback(async () => {
    try {
      // Fetch batches with WO quantity fallback
      const batchPromise = supabase
        .from('production_batches')
        .select(`
          id, wo_id, batch_number, batch_quantity, stage_type, 
          external_process_type, batch_status, stage_entered_at, external_partner_id,
          work_orders!inner(quantity)
        `)
        .is('ended_at', null)
        .neq('stage_type', 'dispatched');

      // Fetch active external moves
      const externalPromise = supabase
        .from('wo_external_moves')
        .select('id, work_order_id, process, quantity_sent, quantity_returned, status, partner_id, dispatch_date')
        .not('status', 'in', '("received_full","cancelled")');

      const [batchResult, externalResult] = await Promise.all([batchPromise, externalPromise]);

      if (batchResult.error) throw batchResult.error;
      if (externalResult.error) throw externalResult.error;
      
      setBatches((batchResult.data || []).map((b: any) => ({
        id: b.id,
        wo_id: b.wo_id,
        batch_number: b.batch_number,
        batch_quantity: b.batch_quantity || 0,
        stage_type: b.stage_type,
        external_process_type: b.external_process_type,
        batch_status: b.batch_status,
        stage_entered_at: b.stage_entered_at,
        external_partner_id: b.external_partner_id,
        wo_quantity: b.work_orders?.quantity || 0,
      })));
      
      setExternalMoves((externalResult.data || []).map((m: any) => ({
        id: m.id,
        work_order_id: m.work_order_id,
        process: m.process || 'Unknown',
        quantity_sent: m.quantity_sent || 0,
        quantity_returned: m.quantity_returned || 0,
        status: m.status,
        partner_id: m.partner_id,
        dispatch_date: m.dispatch_date,
      })));
    } catch (err) {
      console.error('Error loading stage data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Real-time subscription
    const channel = supabase
      .channel('stage-view-batches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => loadData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wo_external_moves' },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  const stages = useMemo<StageData[]>(() => {
    // Compute external WIP from moves (source of truth for external)
    // Cutting is internal, tracked separately
    const externalWipByProcess = new Map<string, { quantity: number; count: number }>();
    let totalExternalWip = 0;
    let totalExternalMoveCount = 0;
    let cuttingWip = 0;
    let cuttingCount = 0;
    
    externalMoves.forEach(move => {
      const wip = move.quantity_sent - move.quantity_returned;
      if (wip > 0) {
        // Cutting is internal, not external
        if (move.process === 'Cutting') {
          cuttingWip += wip;
          cuttingCount += 1;
        } else {
          totalExternalWip += wip;
          totalExternalMoveCount += 1;
          const existing = externalWipByProcess.get(move.process) || { quantity: 0, count: 0 };
          existing.quantity += wip;
          existing.count += 1;
          externalWipByProcess.set(move.process, existing);
        }
      }
    });

    return STAGE_CONFIG.map(config => {
      // For cutting, combine batches + external moves (internal process tracked via wo_external_moves)
      if (config.key === 'cutting') {
        const stageBatches = batches.filter(b => b.stage_type === 'cutting');
        const batchQty = stageBatches.reduce((sum, b) => {
          const qty = b.batch_quantity > 0 ? b.batch_quantity : b.wo_quantity || 0;
          return sum + qty;
        }, 0);
        
        return {
          key: config.key,
          label: config.label,
          icon: config.icon,
          totalQuantity: batchQty + cuttingWip,
          batchCount: stageBatches.length + cuttingCount,
          inQueue: 0,
          inProgress: stageBatches.length + cuttingCount,
          completed: 0,
          capacity: config.capacity,
          route: config.route,
          externalBreakdown: []
        };
      }
      
      // For external, use external moves data (excluding Cutting)
      if (config.key === 'external') {
        const externalBreakdown = Array.from(externalWipByProcess.entries()).map(([process, data]) => ({
          process,
          quantity: data.quantity,
          count: data.count
        }));
        
        return {
          key: config.key,
          label: config.label,
          icon: config.icon,
          totalQuantity: totalExternalWip,
          batchCount: totalExternalMoveCount,
          inQueue: 0,
          inProgress: totalExternalMoveCount,
          completed: 0,
          capacity: config.capacity,
          route: config.route,
          externalBreakdown
        };
      }
      
      // For internal stages, use batches
      const stageBatches = batches.filter(b => b.stage_type === config.key);
      
      // Use batch_quantity if set, otherwise fall back to WO quantity
      const totalQuantity = stageBatches.reduce((sum, b) => {
        const qty = b.batch_quantity > 0 ? b.batch_quantity : b.wo_quantity || 0;
        return sum + qty;
      }, 0);
      const batchCount = stageBatches.length;
      const inQueue = stageBatches.filter(b => b.batch_status === 'in_queue').length;
      const inProgress = stageBatches.filter(b => b.batch_status === 'in_progress').length;
      const completed = stageBatches.filter(b => b.batch_status === 'completed').length;

      return {
        key: config.key,
        label: config.label,
        icon: config.icon,
        totalQuantity,
        batchCount,
        inQueue,
        inProgress,
        completed,
        capacity: config.capacity,
        route: config.route,
        externalBreakdown: []
      };
    });
  }, [batches, externalMoves]);

  const totalQuantity = stages.reduce((sum, s) => sum + s.totalQuantity, 0);
  const totalBatches = stages.reduce((sum, s) => sum + s.batchCount, 0);
  const totalInProgress = stages.reduce((sum, s) => sum + s.inProgress, 0);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Strip - Batch-based */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{totalBatches}</span>
          <span className="text-muted-foreground">batches</span>
        </div>
        <div className="flex items-center gap-2">
          <Package className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{totalQuantity.toLocaleString()}</span>
          <span className="text-muted-foreground">pcs in flow</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-blue-500" />
          <span className="font-medium text-blue-600">{totalInProgress}</span>
          <span className="text-muted-foreground">in progress</span>
        </div>
      </div>

      {/* Stage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const utilization = stage.capacity > 0 ? (stage.totalQuantity / stage.capacity) * 100 : 0;
          const isOverCapacity = utilization > 100;
          const isHighLoad = utilization > 75;

          return (
            <Card
              key={stage.key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                isOverCapacity && "ring-1 ring-destructive/40"
              )}
              onClick={() => handleStageClick(stage.key, stage.label)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" />
                    {stage.label}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Quantity vs Capacity */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Quantity / Capacity</span>
                    <span className={cn(
                      "font-medium",
                      isOverCapacity && "text-destructive",
                      isHighLoad && !isOverCapacity && "text-amber-600"
                    )}>
                      {stage.totalQuantity.toLocaleString()} / {stage.capacity.toLocaleString()}
                    </span>
                  </div>
                  <Progress
                    value={Math.min(utilization, 100)}
                    className={cn(
                      "h-2",
                      isOverCapacity && "[&>div]:bg-destructive",
                      isHighLoad && !isOverCapacity && "[&>div]:bg-amber-500"
                    )}
                  />
                </div>

                {/* Batch Count */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Batches</span>
                  <span className="font-medium">{stage.batchCount}</span>
                </div>

                {/* Status Breakdown */}
                <div className="flex gap-2 text-xs">
                  <Badge variant="outline" className="flex-1 justify-center text-muted-foreground">
                    <Clock className="h-3 w-3 mr-1" />
                    {stage.inQueue} queue
                  </Badge>
                  <Badge variant="outline" className="flex-1 justify-center border-blue-500 text-blue-600">
                    <Factory className="h-3 w-3 mr-1" />
                    {stage.inProgress} active
                  </Badge>
                  <Badge variant="outline" className="flex-1 justify-center border-green-500 text-green-600">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {stage.completed} done
                  </Badge>
                </div>

                {/* External Process Breakdown - Clickable rows */}
                {stage.key === 'external' && stage.externalBreakdown && stage.externalBreakdown.length > 0 && (
                  <div className="bg-muted/50 rounded-md p-2 space-y-1">
                    <div className="text-xs text-muted-foreground mb-1">By Process (click to drill down):</div>
                    {stage.externalBreakdown.map(({ process, quantity, count }) => (
                      <div 
                        key={process} 
                        className="flex justify-between text-xs cursor-pointer hover:bg-muted rounded px-1 py-0.5 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStageClick('external', `External - ${process}`, process);
                        }}
                      >
                        <span className="capitalize">{process}</span>
                        <span className="font-medium">{quantity.toLocaleString()} pcs ({count})</span>
                      </div>
                    ))}
                  </div>
                )}

                {stage.batchCount === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No batches in this stage
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Source indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        All values derived from production_batches (batch-level source of truth)
      </p>

      {/* Batch Drilldown Drawer */}
      {selectedStage && (
        <BatchDrilldownDrawer
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          stageType={selectedStage.key}
          stageLabel={selectedStage.label}
          processType={selectedStage.processType}
        />
      )}
    </div>
  );
};
