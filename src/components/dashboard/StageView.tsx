/**
 * StageView - Batch-Based Stage Overview
 * 
 * SINGLE SOURCE OF TRUTH: production_batches.current_location_type + current_process
 * NO DEPENDENCY on work_order.stage
 * 
 * Features:
 * - View by quantity (pcs/kg) or batch count
 * - Groups by location_type and process
 * - Shows partial quantities simultaneously across locations
 */
import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  ArrowRight,
  Package,
  Scissors,
  Factory,
  Truck,
  CheckCircle,
  Clock,
  Layers,
  Hash,
  Box
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BatchDrilldownDrawer } from "./BatchDrilldownDrawer";
import { useBatchDashboard, BatchLocationType, filterBatchesByLocation } from "@/hooks/useBatchDashboard";

type ViewMode = 'quantity' | 'batches';

interface StageCardConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  capacity: number;
  route: string;
  locationType: BatchLocationType;
  processes?: string[]; // Optional filter to specific processes
}

const STAGE_CARDS: StageCardConfig[] = [
  { 
    key: 'cutting', 
    label: 'Cutting', 
    icon: Scissors, 
    capacity: 5000, 
    route: '/work-orders?stage=cutting',
    locationType: 'factory',
    processes: ['cutting']
  },
  { 
    key: 'production', 
    label: 'Production', 
    icon: Factory, 
    capacity: 10000, 
    route: '/work-orders?stage=production',
    locationType: 'factory',
    processes: ['production']
  },
  { 
    key: 'external', 
    label: 'External Partners', 
    icon: Truck, 
    capacity: 20000, 
    route: '/work-orders?type=external',
    locationType: 'external_partner'
  },
  { 
    key: 'transit', 
    label: 'In Transit', 
    icon: Truck, 
    capacity: 5000, 
    route: '/work-orders?location=transit',
    locationType: 'transit'
  },
  { 
    key: 'qc', 
    label: 'Final QC', 
    icon: CheckCircle, 
    capacity: 5000, 
    route: '/work-orders?stage=qc',
    locationType: 'factory',
    processes: ['qc', 'post_external_qc']
  },
  { 
    key: 'packing', 
    label: 'Packing', 
    icon: Box, 
    capacity: 5000, 
    route: '/work-orders?stage=packing',
    locationType: 'packed'
  },
];

export const StageView = () => {
  const navigate = useNavigate();
  const { batches, summary, loading, error } = useBatchDashboard();
  const [viewMode, setViewMode] = useState<ViewMode>('quantity');
  
  // Drilldown drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<{ key: string; label: string; processType?: string } | null>(null);

  const handleStageClick = (stageKey: string, stageLabel: string, processType?: string) => {
    setSelectedStage({ key: stageKey, label: stageLabel, processType });
    setDrawerOpen(true);
  };

  // Calculate stage data from batches
  const stageData = useMemo(() => {
    return STAGE_CARDS.map(config => {
      let matchingBatches = batches.filter(b => b.current_location_type === config.locationType);
      
      // Filter by processes if specified
      if (config.processes && config.processes.length > 0) {
        matchingBatches = matchingBatches.filter(b => 
          config.processes!.includes(b.current_process || '')
        );
      }
      
      const totalQuantity = matchingBatches.reduce((sum, b) => {
        const qty = b.batch_quantity > 0 ? b.batch_quantity : b.wo_quantity || 0;
        return sum + qty;
      }, 0);
      
      const batchCount = matchingBatches.length;
      const inProgress = matchingBatches.filter(b => 
        b.batch_status === 'active' || b.batch_status === 'in_progress'
      ).length;
      const inQueue = matchingBatches.filter(b => b.batch_status === 'in_queue').length;
      const completed = matchingBatches.filter(b => b.batch_status === 'completed').length;

      // For external, get breakdown by process
      let externalBreakdown: { process: string; quantity: number; count: number }[] = [];
      if (config.locationType === 'external_partner') {
        const byProcess = new Map<string, { quantity: number; count: number }>();
        matchingBatches.forEach(b => {
          const process = b.current_process || 'Unknown';
          const existing = byProcess.get(process) || { quantity: 0, count: 0 };
          const qty = b.batch_quantity > 0 ? b.batch_quantity : b.wo_quantity || 0;
          existing.quantity += qty;
          existing.count += 1;
          byProcess.set(process, existing);
        });
        externalBreakdown = Array.from(byProcess.entries()).map(([process, data]) => ({
          process,
          quantity: data.quantity,
          count: data.count
        }));
      }

      return {
        ...config,
        totalQuantity,
        batchCount,
        inProgress,
        inQueue,
        completed,
        externalBreakdown
      };
    });
  }, [batches]);

  // Calculate totals
  const totals = useMemo(() => {
    const activeStages = stageData.filter(s => s.batchCount > 0);
    return {
      totalQuantity: stageData.reduce((sum, s) => sum + s.totalQuantity, 0),
      totalBatches: stageData.reduce((sum, s) => sum + s.batchCount, 0),
      activeStages: activeStages.length,
      inProgress: stageData.reduce((sum, s) => sum + s.inProgress, 0),
    };
  }, [stageData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">Error loading data: {error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Strip with Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totals.totalBatches}</span>
            <span className="text-muted-foreground">batches</span>
          </div>
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{totals.totalQuantity.toLocaleString()}</span>
            <span className="text-muted-foreground">pcs in flow</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-blue-600">{totals.inProgress}</span>
            <span className="text-muted-foreground">active</span>
          </div>
        </div>

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
      </div>

      {/* Stage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stageData.map((stage) => {
          const Icon = stage.icon;
          const displayValue = viewMode === 'quantity' ? stage.totalQuantity : stage.batchCount;
          const utilization = stage.capacity > 0 ? (stage.totalQuantity / stage.capacity) * 100 : 0;
          const isOverCapacity = utilization > 100;
          const isHighLoad = utilization > 75;
          const hasData = stage.batchCount > 0;

          return (
            <Card
              key={stage.key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                !hasData && "opacity-60",
                isOverCapacity && "ring-1 ring-destructive/40"
              )}
              onClick={() => handleStageClick(stage.key, stage.label)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", hasData ? "text-primary" : "text-muted-foreground")} />
                    {stage.label}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Main Value */}
                <div className="text-center py-2">
                  <p className={cn(
                    "text-3xl font-bold",
                    hasData ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {displayValue.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {viewMode === 'quantity' ? 'pcs' : 'batches'}
                    {viewMode === 'quantity' && stage.batchCount > 0 && (
                      <span className="ml-2">({stage.batchCount} batches)</span>
                    )}
                  </p>
                </div>

                {/* Capacity Progress (quantity mode only) */}
                {viewMode === 'quantity' && stage.capacity > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Capacity</span>
                      <span className={cn(
                        "font-medium",
                        isOverCapacity && "text-destructive",
                        isHighLoad && !isOverCapacity && "text-amber-600"
                      )}>
                        {Math.round(utilization)}%
                      </span>
                    </div>
                    <Progress
                      value={Math.min(utilization, 100)}
                      className={cn(
                        "h-1.5",
                        isOverCapacity && "[&>div]:bg-destructive",
                        isHighLoad && !isOverCapacity && "[&>div]:bg-amber-500"
                      )}
                    />
                  </div>
                )}

                {/* Status Breakdown */}
                {hasData && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline" className="flex-1 justify-center text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {stage.inQueue} queue
                    </Badge>
                    <Badge variant="outline" className="flex-1 justify-center border-blue-500 text-blue-600">
                      <Factory className="h-3 w-3 mr-1" />
                      {stage.inProgress} active
                    </Badge>
                  </div>
                )}

                {/* External Process Breakdown */}
                {stage.key === 'external' && stage.externalBreakdown.length > 0 && (
                  <div className="bg-muted/50 rounded-md p-2 space-y-1">
                    <div className="text-xs text-muted-foreground mb-1">By Process:</div>
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
                        <span className="font-medium">
                          {viewMode === 'quantity' 
                            ? `${quantity.toLocaleString()} pcs` 
                            : `${count} batches`
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {!hasData && (
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
        Source: production_batches (current_location_type + current_process)
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
