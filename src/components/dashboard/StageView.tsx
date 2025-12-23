/**
 * StageView - Action-Oriented Stage Overview
 * 
 * Shows for each stage:
 * - Queue vs capacity
 * - Ready vs blocked
 * - Primary blocker reason
 * 
 * All values derived from Production Logs and QC states.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Package,
  Scissors,
  Hammer,
  Factory,
  Truck,
  CheckCircle,
  AlertTriangle,
  Clock,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StageViewProps {
  workOrders: any[];
  externalMoves: any[];
  productionLogs: any[];
}

interface StageData {
  key: string;
  label: string;
  icon: React.ElementType;
  queue: number;
  capacity: number;
  ready: number;
  blocked: number;
  primaryBlocker: string | null;
  blockerOwner: string | null;
  route: string;
}

const STAGE_CONFIG = [
  { key: 'goods_in', label: 'Goods In', icon: Package, capacity: 50, route: '/work-orders?stage=goods_in' },
  { key: 'cutting', label: 'Cutting', icon: Scissors, capacity: 20, route: '/cutting' },
  { key: 'forging', label: 'Forging', icon: Hammer, capacity: 15, route: '/forging' },
  { key: 'production', label: 'Production', icon: Factory, capacity: 30, route: '/production-progress' },
  { key: 'external', label: 'External', icon: Truck, capacity: 25, route: '/external-efficiency' },
  { key: 'final_qc', label: 'Final QC', icon: CheckCircle, capacity: 20, route: '/final-qc' },
];

export const StageView = ({ workOrders, externalMoves, productionLogs }: StageViewProps) => {
  const navigate = useNavigate();

  // Build a map of WO ids at external
  const externalWoIds = useMemo(() => {
    return new Set(externalMoves.filter(m => m.status === 'sent').map(m => m.work_order_id));
  }, [externalMoves]);

  // Aggregate production log data per work order
  const productionByWo = useMemo(() => {
    const map = new Map<string, { okQty: number; rejectionQty: number }>();
    productionLogs.forEach(log => {
      if (!log.wo_id) return;
      const existing = map.get(log.wo_id) || { okQty: 0, rejectionQty: 0 };
      existing.okQty += log.ok_quantity || 0;
      existing.rejectionQty += log.total_rejection_quantity || 0;
      map.set(log.wo_id, existing);
    });
    return map;
  }, [productionLogs]);

  const stages = useMemo<StageData[]>(() => {
    return STAGE_CONFIG.map(config => {
      // Find WOs at this stage
      let stageWos = workOrders.filter(wo => {
        if (config.key === 'external') {
          return externalWoIds.has(wo.id);
        }
        return wo.current_stage === config.key && !externalWoIds.has(wo.id);
      });

      const queue = stageWos.length;

      // Determine ready vs blocked based on QC states
      let ready = 0;
      let blocked = 0;
      let blockerCounts: Record<string, number> = {
        'Material QC pending': 0,
        'First Piece QC pending': 0,
        'No machine assigned': 0,
        'Awaiting external return': 0,
      };

      stageWos.forEach(wo => {
        // Check QC blocking conditions
        if (!wo.qc_material_passed) {
          blocked++;
          blockerCounts['Material QC pending']++;
        } else if (!wo.qc_first_piece_passed && config.key === 'production') {
          blocked++;
          blockerCounts['First Piece QC pending']++;
        } else if (config.key === 'production' && !wo.machine_id) {
          blocked++;
          blockerCounts['No machine assigned']++;
        } else if (config.key === 'external') {
          blocked++;
          blockerCounts['Awaiting external return']++;
        } else {
          ready++;
        }
      });

      // Find primary blocker (highest count)
      let primaryBlocker: string | null = null;
      let maxCount = 0;
      Object.entries(blockerCounts).forEach(([reason, count]) => {
        if (count > maxCount) {
          maxCount = count;
          primaryBlocker = reason;
        }
      });

      // Map blocker to owner
      const blockerOwnerMap: Record<string, string> = {
        'Material QC pending': 'Quality',
        'First Piece QC pending': 'QC / Production',
        'No machine assigned': 'Production Planning',
        'Awaiting external return': 'Logistics',
      };

      return {
        key: config.key,
        label: config.label,
        icon: config.icon,
        queue,
        capacity: config.capacity,
        ready,
        blocked,
        primaryBlocker: blocked > 0 ? primaryBlocker : null,
        blockerOwner: primaryBlocker ? blockerOwnerMap[primaryBlocker] || null : null,
        route: config.route,
      };
    });
  }, [workOrders, externalWoIds, productionByWo]);

  const totalQueue = stages.reduce((sum, s) => sum + s.queue, 0);
  const totalBlocked = stages.reduce((sum, s) => sum + s.blocked, 0);
  const totalReady = stages.reduce((sum, s) => sum + s.ready, 0);

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{totalQueue}</span>
          <span className="text-muted-foreground">in queue</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <span className="font-medium text-green-600">{totalReady}</span>
          <span className="text-muted-foreground">ready</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-amber-600">{totalBlocked}</span>
          <span className="text-muted-foreground">blocked</span>
        </div>
      </div>

      {/* Stage Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stages.map((stage) => {
          const Icon = stage.icon;
          const utilization = stage.capacity > 0 ? (stage.queue / stage.capacity) * 100 : 0;
          const isOverCapacity = utilization > 100;
          const isHighLoad = utilization > 75;

          return (
            <Card
              key={stage.key}
              className={cn(
                "cursor-pointer transition-all hover:shadow-md",
                stage.blocked > 0 && "border-l-4 border-l-amber-500",
                isOverCapacity && "ring-1 ring-destructive/40"
              )}
              onClick={() => navigate(stage.route)}
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
                {/* Queue vs Capacity */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Queue / Capacity</span>
                    <span className={cn(
                      "font-medium",
                      isOverCapacity && "text-destructive",
                      isHighLoad && !isOverCapacity && "text-amber-600"
                    )}>
                      {stage.queue} / {stage.capacity}
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

                {/* Ready vs Blocked */}
                <div className="flex gap-2">
                  <Badge
                    variant="outline"
                    className="border-green-500 text-green-700 dark:text-green-400 flex-1 justify-center"
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    {stage.ready} Ready
                  </Badge>
                  <Badge
                    variant={stage.blocked > 0 ? "destructive" : "outline"}
                    className={cn(
                      "flex-1 justify-center",
                      stage.blocked === 0 && "text-muted-foreground"
                    )}
                  >
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {stage.blocked} Blocked
                  </Badge>
                </div>

                {/* Primary Blocker */}
                {stage.primaryBlocker && (
                  <div className="bg-muted/50 rounded-md p-2 space-y-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertTriangle className="h-3 w-3 text-amber-500" />
                      Primary Blocker
                    </div>
                    <p className="text-xs font-medium">{stage.primaryBlocker}</p>
                    {stage.blockerOwner && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">Owner: {stage.blockerOwner}</span>
                      </div>
                    )}
                  </div>
                )}

                {stage.queue === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    No items in queue
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Read-only indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        Values derived from work orders and QC states (read-only)
      </p>
    </div>
  );
};
