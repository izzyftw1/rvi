import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Package, 
  Truck, 
  FlaskConical,
  PlayCircle,
  ArrowRight,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, differenceInHours, parseISO } from "date-fns";

interface WorkOrder {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  customer_po: string;
  item_code: string;
  quantity: number;
  status: string;
  due_date: string;
  created_at: string;
  qc_material_passed: boolean;
  qc_first_piece_passed: boolean;
  external_status?: string;
  progress_percentage?: number;
}

type BlockerType = 'material_qc' | 'first_piece_qc' | 'external' | 'ready_not_started';
type BlockerTypeOrNull = BlockerType | null;

interface BlockerBucket {
  id: BlockerType;
  label: string;
  description: string;
  icon: React.ElementType;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}

const BLOCKER_BUCKETS: BlockerBucket[] = [
  {
    id: 'material_qc',
    label: 'Material QC',
    description: 'Awaiting material quality approval',
    icon: FlaskConical,
    colorClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-950/30',
    borderClass: 'border-red-200 dark:border-red-900'
  },
  {
    id: 'first_piece_qc',
    label: 'First Piece QC',
    description: 'Material passed, awaiting first piece',
    icon: CheckCircle2,
    colorClass: 'text-orange-600 dark:text-orange-400',
    bgClass: 'bg-orange-50 dark:bg-orange-950/30',
    borderClass: 'border-orange-200 dark:border-orange-900'
  },
  {
    id: 'external',
    label: 'External Processing',
    description: 'Waiting on external partner',
    icon: Truck,
    colorClass: 'text-purple-600 dark:text-purple-400',
    bgClass: 'bg-purple-50 dark:bg-purple-950/30',
    borderClass: 'border-purple-200 dark:border-purple-900'
  },
  {
    id: 'ready_not_started',
    label: 'Ready, Not Started',
    description: 'All gates passed, no production logged',
    icon: PlayCircle,
    colorClass: 'text-blue-600 dark:text-blue-400',
    bgClass: 'bg-blue-50 dark:bg-blue-950/30',
    borderClass: 'border-blue-200 dark:border-blue-900'
  }
];

function getBlockerType(wo: WorkOrder): BlockerType {
  if (!wo.qc_material_passed) return 'material_qc';
  if (!wo.qc_first_piece_passed) return 'first_piece_qc';
  if (wo.external_status === 'pending' || wo.external_status === 'in_progress') return 'external';
  if ((wo.progress_percentage ?? 0) === 0 && wo.qc_material_passed && wo.qc_first_piece_passed) return 'ready_not_started';
  return null;
}

function getAgingHours(wo: WorkOrder): number {
  try {
    return differenceInHours(new Date(), parseISO(wo.created_at));
  } catch {
    return 0;
  }
}

type FlowHealth = 'green' | 'amber' | 'red';

function calculateFlowHealth(workOrders: WorkOrder[], blockedCounts: Record<BlockerType, number>): { health: FlowHealth; reasons: string[] } {
  const reasons: string[] = [];
  
  const totalBlocked = Object.values(blockedCounts).reduce((a, b) => a + b, 0);
  const totalActive = workOrders.filter(wo => wo.status === 'in_progress' || wo.status === 'pending').length;
  const blockedRatio = totalActive > 0 ? totalBlocked / totalActive : 0;

  // Check aging - WOs blocked for more than 48 hours
  const severelyAged = workOrders.filter(wo => {
    const blocker = getBlockerType(wo);
    return blocker !== null && getAgingHours(wo) > 48;
  }).length;

  // Check stage imbalance - if one blocker has more than 50% of blocked items
  const maxBlocker = Math.max(...Object.values(blockedCounts));
  const hasImbalance = totalBlocked > 0 && maxBlocker / totalBlocked > 0.6;

  // Determine health
  let health: FlowHealth = 'green';

  if (blockedRatio > 0.5 || severelyAged > 3) {
    health = 'red';
    if (blockedRatio > 0.5) reasons.push(`${Math.round(blockedRatio * 100)}% of WOs are blocked`);
    if (severelyAged > 3) reasons.push(`${severelyAged} WOs blocked >48h`);
  } else if (blockedRatio > 0.25 || severelyAged > 0 || hasImbalance) {
    health = 'amber';
    if (blockedRatio > 0.25) reasons.push(`${Math.round(blockedRatio * 100)}% of WOs are blocked`);
    if (severelyAged > 0) reasons.push(`${severelyAged} WO${severelyAged > 1 ? 's' : ''} blocked >48h`);
    if (hasImbalance) reasons.push('Stage imbalance detected');
  }

  if (reasons.length === 0) {
    reasons.push('Production flowing smoothly');
  }

  return { health, reasons };
}

export default function ProductionProgress() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBucket, setSelectedBucket] = useState<BlockerType>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel("production_control_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_orders" },
        () => loadWorkOrders()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWorkOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select(`
          id,
          wo_id,
          display_id,
          customer,
          customer_po,
          item_code,
          quantity,
          status,
          due_date,
          created_at,
          qc_material_passed,
          qc_first_piece_passed
        `)
        .in("status", ["in_progress", "pending"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with progress data
      const enriched = await Promise.all(
        (data || []).map(async (wo) => {
          const { data: progress } = await supabase.rpc("get_wo_progress", { _wo_id: wo.id });
          const progressInfo = progress?.[0];
          
          // Check external status
          const { data: externalMoves } = await supabase
            .from("wo_external_moves")
            .select("status")
            .eq("work_order_id", wo.id)
            .in("status", ["pending", "in_progress"])
            .limit(1);

          return {
            ...wo,
            progress_percentage: progressInfo?.progress_percentage ?? 0,
            external_status: externalMoves && externalMoves.length > 0 ? externalMoves[0].status : null
          };
        })
      );

      setWorkOrders(enriched);
    } catch (error: any) {
      toast.error(error.message || "Failed to load work orders");
    } finally {
      setLoading(false);
    }
  };

  const blockedCounts = useMemo(() => {
    const counts: Record<BlockerType, number> = {
      material_qc: 0,
      first_piece_qc: 0,
      external: 0,
      ready_not_started: 0
    };

    workOrders.forEach(wo => {
      const blocker = getBlockerType(wo);
      if (blocker) counts[blocker]++;
    });

    return counts;
  }, [workOrders]);

  const flowHealth = useMemo(() => 
    calculateFlowHealth(workOrders, blockedCounts), 
    [workOrders, blockedCounts]
  );

  const filteredWorkOrders = useMemo(() => {
    if (!selectedBucket) return [];
    return workOrders.filter(wo => getBlockerType(wo) === selectedBucket);
  }, [workOrders, selectedBucket]);

  const totalBlocked = blockedCounts.material_qc + blockedCounts.first_piece_qc + blockedCounts.external + blockedCounts.ready_not_started;
  const totalActive = workOrders.length;
  const flowing = totalActive - totalBlocked;

  const healthColors = {
    green: 'bg-green-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500'
  };

  const healthBgColors = {
    green: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800',
    amber: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800',
    red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Production Control</h1>
            <p className="text-muted-foreground text-sm">Exception-focused view • Surface problems, not progress</p>
          </div>
          
          {/* Flow Health Indicator */}
          <Card className={cn("border", healthBgColors[flowHealth.health])}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-4 h-4 rounded-full animate-pulse", healthColors[flowHealth.health])} />
              <div>
                <div className="text-sm font-semibold capitalize flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Flow Health: {flowHealth.health.toUpperCase()}
                </div>
                <div className="text-xs text-muted-foreground">
                  {flowHealth.reasons.join(' • ')}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Summary Strip */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="gap-1">
            <Package className="h-3 w-3" />
            {totalActive} Active WOs
          </Badge>
          <Badge variant="secondary" className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
            <CheckCircle2 className="h-3 w-3" />
            {flowing} Flowing
          </Badge>
          <Badge variant="secondary" className="gap-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            <AlertTriangle className="h-3 w-3" />
            {totalBlocked} Blocked
          </Badge>
        </div>

        {/* Blocker Buckets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {BLOCKER_BUCKETS.map((bucket) => {
            const count = blockedCounts[bucket.id] || 0;
            const isSelected = selectedBucket === bucket.id;
            const Icon = bucket.icon;

            return (
              <Card
                key={bucket.id}
                onClick={() => setSelectedBucket(isSelected ? null : bucket.id)}
                className={cn(
                  "cursor-pointer transition-all border-2",
                  bucket.borderClass,
                  bucket.bgClass,
                  isSelected && "ring-2 ring-primary ring-offset-2",
                  count === 0 && "opacity-50"
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <Icon className={cn("h-5 w-5", bucket.colorClass)} />
                    <span className={cn("text-3xl font-bold", bucket.colorClass)}>
                      {count}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <CardTitle className="text-sm font-medium">{bucket.label}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">{bucket.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Filtered Work Orders List */}
        {selectedBucket && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {BLOCKER_BUCKETS.find(b => b.id === selectedBucket)?.label} — {filteredWorkOrders.length} Work Orders
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setSelectedBucket(null)}>
                  Clear Filter
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {filteredWorkOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No work orders in this category
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredWorkOrders.map((wo) => {
                    const agingHours = getAgingHours(wo);
                    const isOverdue = wo.due_date && new Date(wo.due_date) < new Date();

                    return (
                      <div
                        key={wo.id}
                        onClick={() => navigate(`/work-orders/${wo.id}`)}
                        className={cn(
                          "flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group",
                          isOverdue && "border-red-300 dark:border-red-800"
                        )}
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm">{wo.display_id}</span>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {wo.customer} • {wo.item_code}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          <div className="text-right hidden sm:block">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {agingHours < 24 
                                ? `${agingHours}h` 
                                : formatDistanceToNow(parseISO(wo.created_at), { addSuffix: false })}
                            </div>
                            <div className="text-xs">
                              {wo.quantity.toLocaleString()} pcs
                            </div>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Empty State when no bucket selected */}
        {!selectedBucket && totalBlocked > 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg font-medium">Click a bucket above to see blocked work orders</p>
            <p className="text-sm">Each bucket represents a specific blocker type</p>
          </div>
        )}

        {!selectedBucket && totalBlocked === 0 && (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
            <p className="text-lg font-medium text-green-700 dark:text-green-400">All Clear!</p>
            <p className="text-sm text-muted-foreground">No blocked work orders at this time</p>
          </div>
        )}
      </div>
    </div>
  );
}
