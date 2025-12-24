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
  { key: 'cutting', label: 'Cutting', icon: Scissors, capacity: 5000, route: '/work-orders?stage=cutting' },
  { key: 'production', label: 'Production', icon: Factory, capacity: 10000, route: '/work-orders?stage=production' },
  { key: 'external', label: 'External Processes', icon: Truck, capacity: 20000, route: '/work-orders?type=external' },
  { key: 'qc', label: 'Final QC', icon: CheckCircle, capacity: 5000, route: '/work-orders?stage=qc' },
  { key: 'packing', label: 'Packing', icon: Package, capacity: 5000, route: '/work-orders?stage=packing' },
];

export const StageView = () => {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchData[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Drilldown drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<{ key: string; label: string; processType?: string } | null>(null);

  const handleStageClick = (stageKey: string, stageLabel: string, processType?: string) => {
    setSelectedStage({ key: stageKey, label: stageLabel, processType });
    setDrawerOpen(true);
  };

  const loadBatches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('production_batches')
        .select('id, wo_id, batch_number, batch_quantity, stage_type, external_process_type, batch_status, stage_entered_at, external_partner_id')
        .is('ended_at', null) // Only active batches
        .neq('stage_type', 'dispatched'); // Exclude dispatched

      if (error) throw error;
      setBatches((data as BatchData[]) || []);
    } catch (err) {
      console.error('Error loading batches:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();

    // Real-time subscription
    const channel = supabase
      .channel('stage-view-batches')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'production_batches' },
        () => loadBatches()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBatches]);

  const stages = useMemo<StageData[]>(() => {
    return STAGE_CONFIG.map(config => {
      const stageBatches = batches.filter(b => b.stage_type === config.key);
      
      const totalQuantity = stageBatches.reduce((sum, b) => sum + (b.batch_quantity || 0), 0);
      const batchCount = stageBatches.length;
      const inQueue = stageBatches.filter(b => b.batch_status === 'in_queue').length;
      const inProgress = stageBatches.filter(b => b.batch_status === 'in_progress').length;
      const completed = stageBatches.filter(b => b.batch_status === 'completed').length;

      // For external, group by process type
      let externalBreakdown: { process: string; quantity: number; count: number }[] = [];
      if (config.key === 'external') {
        const processMap = new Map<string, { quantity: number; count: number }>();
        stageBatches.forEach(b => {
          const process = b.external_process_type || 'Unknown';
          const existing = processMap.get(process) || { quantity: 0, count: 0 };
          existing.quantity += b.batch_quantity || 0;
          existing.count += 1;
          processMap.set(process, existing);
        });
        externalBreakdown = Array.from(processMap.entries()).map(([process, data]) => ({
          process,
          quantity: data.quantity,
          count: data.count
        }));
      }

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
        externalBreakdown
      };
    });
  }, [batches]);

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
