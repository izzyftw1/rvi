import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { 
  FlaskConical,
  ArrowRight,
  Timer,
  ExternalLink,
  Beaker,
  PlayCircle,
  Truck,
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, parseISO, format } from "date-fns";

interface WorkOrder {
  id: string;
  display_id: string;
  customer: string;
  customer_po: string;
  item_code: string;
  quantity: number;
  status: string;
  due_date: string;
  created_at: string;
  current_stage: string;
  qc_material_passed: boolean;
  qc_first_piece_passed: boolean;
  external_status?: string;
  progress_percentage?: number;
}

type BucketType = 'material_qc' | 'first_piece_qc' | 'ready_not_started' | 'external_processing';

interface BucketItem {
  wo: WorkOrder;
  aging_hours: number;
}

function getAgingHours(dateStr: string): number {
  try {
    return differenceInHours(new Date(), parseISO(dateStr));
  } catch {
    return 0;
  }
}

type AgingSeverity = 'green' | 'amber' | 'red';

function getAgingSeverity(hours: number): AgingSeverity {
  if (hours < 24) return 'green';
  if (hours < 72) return 'amber';
  return 'red';
}

function formatAgingDisplay(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

interface Buckets {
  material_qc: BucketItem[];
  first_piece_qc: BucketItem[];
  ready_not_started: BucketItem[];
  external_processing: BucketItem[];
}

function categorizeToBuckets(workOrders: WorkOrder[]): Buckets {
  const buckets: Buckets = {
    material_qc: [],
    first_piece_qc: [],
    ready_not_started: [],
    external_processing: []
  };

  workOrders.forEach(wo => {
    const aging_hours = getAgingHours(wo.created_at);
    const item = { wo, aging_hours };

    // Mutually exclusive logic - first match wins
    
    // 1. Blocked – Material QC: material QC not passed
    if (!wo.qc_material_passed) {
      buckets.material_qc.push(item);
      return;
    }

    // 2. Blocked – First Piece QC: material passed but first piece not passed
    if (!wo.qc_first_piece_passed) {
      buckets.first_piece_qc.push(item);
      return;
    }

    // 3. External Processing: at external partner (informational)
    if (wo.external_status === 'pending' || wo.external_status === 'in_progress') {
      buckets.external_processing.push(item);
      return;
    }

    // 4. Ready but Not Started: all gates passed, 0% progress
    if ((wo.progress_percentage ?? 0) === 0) {
      buckets.ready_not_started.push(item);
      return;
    }

    // Otherwise: WO is in progress (not shown in any bucket)
  });

  // Sort each bucket by aging (oldest first)
  Object.keys(buckets).forEach(key => {
    buckets[key as BucketType].sort((a, b) => b.aging_hours - a.aging_hours);
  });

  return buckets;
}

const bucketConfig: Record<BucketType, { 
  title: string; 
  icon: React.ElementType; 
  color: string; 
  bgColor: string;
  description: string;
  isBlocker: boolean;
}> = {
  material_qc: { 
    title: 'Blocked – Material QC', 
    icon: Beaker, 
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
    description: 'Awaiting material inspection approval',
    isBlocker: true
  },
  first_piece_qc: { 
    title: 'Blocked – First Piece QC', 
    icon: FlaskConical, 
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    description: 'Awaiting first piece approval',
    isBlocker: true
  },
  ready_not_started: { 
    title: 'Ready but Not Started', 
    icon: PlayCircle, 
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    description: 'All gates passed, awaiting machine assignment',
    isBlocker: true
  },
  external_processing: { 
    title: 'External Processing', 
    icon: Truck, 
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-700',
    description: 'At external partner – informational',
    isBlocker: false
  }
};

export default function ProductionProgress() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel("production_control_changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => loadWorkOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, () => loadWorkOrders())
      .subscribe();

    const interval = setInterval(loadWorkOrders, 60000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const loadWorkOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("work_orders")
        .select(`
          id,
          display_id,
          customer,
          customer_po,
          item_code,
          quantity,
          status,
          due_date,
          created_at,
          current_stage,
          qc_material_passed,
          qc_first_piece_passed
        `)
        .in("status", ["in_progress", "pending"])
        .order("due_date", { ascending: true });

      if (error) throw error;

      const enriched = await Promise.all(
        (data || []).map(async (wo) => {
          const { data: progress } = await supabase.rpc("get_wo_progress", { _wo_id: wo.id });
          
          const { data: externalMoves } = await supabase
            .from("wo_external_moves")
            .select("status")
            .eq("work_order_id", wo.id)
            .in("status", ["pending", "in_progress"])
            .limit(1);

          return {
            ...wo,
            progress_percentage: progress?.[0]?.progress_percentage ?? 0,
            external_status: externalMoves?.[0]?.status ?? null
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

  const buckets = useMemo(() => categorizeToBuckets(workOrders), [workOrders]);

  const totalBlockers = buckets.material_qc.length + buckets.first_piece_qc.length + buckets.ready_not_started.length;

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
            <h1 className="text-2xl sm:text-3xl font-bold">Production Log</h1>
            <p className="text-sm text-muted-foreground">
              What's blocking flow? What must be done next?
            </p>
          </div>
          
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Updated {format(new Date(), 'HH:mm')}
          </div>
        </div>

        {/* Buckets Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {(Object.keys(bucketConfig) as BucketType[]).map((bucketKey) => (
            <BucketCard
              key={bucketKey}
              bucketType={bucketKey}
              items={buckets[bucketKey]}
              navigate={navigate}
            />
          ))}
        </div>

        {/* Empty State */}
        {totalBlockers === 0 && buckets.external_processing.length === 0 && (
          <div className="text-center py-12">
            <p className="text-lg font-medium text-muted-foreground">No active work orders in these states</p>
            <Button 
              variant="outline" 
              className="mt-4 gap-2"
              onClick={() => navigate('/work-orders')}
            >
              View All Work Orders
              <ExternalLink className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function BucketCard({ 
  bucketType, 
  items, 
  navigate 
}: { 
  bucketType: BucketType; 
  items: BucketItem[]; 
  navigate: (path: string) => void;
}) {
  const config = bucketConfig[bucketType];
  const Icon = config.icon;

  return (
    <Card className={cn("border", items.length > 0 ? config.bgColor : "bg-muted/30 border-muted")}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-5 w-5", items.length > 0 ? config.color : "text-muted-foreground")} />
            <CardTitle className={cn("text-base", items.length > 0 ? config.color : "text-muted-foreground")}>
              {config.title}
            </CardTitle>
          </div>
          <Badge 
            variant={items.length > 0 && config.isBlocker ? "destructive" : "secondary"}
            className="text-xs"
          >
            {items.length}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{config.description}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            None
          </div>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {items.map((item) => {
              const severity = getAgingSeverity(item.aging_hours);
              const isLongBlocked = item.aging_hours >= 72;
              
              return (
                <div
                  key={item.wo.id}
                  onClick={() => navigate(`/work-orders/${item.wo.id}`)}
                  className={cn(
                    "flex items-center justify-between p-2.5 rounded-md cursor-pointer transition-colors group",
                    isLongBlocked 
                      ? "bg-red-100/80 dark:bg-red-950/50 border-l-4 border-l-red-500 hover:bg-red-100 dark:hover:bg-red-950/70" 
                      : "bg-background/70 hover:bg-background border border-transparent hover:border-muted"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-semibold text-sm">{item.wo.display_id}</span>
                      <span className="text-xs text-muted-foreground truncate">{item.wo.customer}</span>
                      {item.wo.due_date && new Date(item.wo.due_date) < new Date() && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground">{item.wo.item_code}</span>
                    </div>
                  </div>
                  
                  {/* Severity-colored age badge */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge 
                      variant="outline" 
                      className={cn(
                        "text-xs font-medium gap-1 border",
                        severity === 'green' && "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700",
                        severity === 'amber' && "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700",
                        severity === 'red' && "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700"
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {formatAgingDisplay(item.aging_hours)}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
