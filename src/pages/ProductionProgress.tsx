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
  Truck, 
  FlaskConical,
  ArrowRight,
  Zap,
  AlertCircle,
  Target,
  Timer,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow, differenceInHours, parseISO, format } from "date-fns";

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
  blocking_reason?: string;
  aging_hours?: number;
  priority_score?: number;
}

type ExceptionType = 'critical' | 'urgent' | 'action_needed';

interface Exception {
  id: string;
  wo: WorkOrder;
  type: ExceptionType;
  reason: string;
  action: string;
  aging_hours: number;
}

function getAgingHours(dateStr: string): number {
  try {
    return differenceInHours(new Date(), parseISO(dateStr));
  } catch {
    return 0;
  }
}

function buildExceptions(workOrders: WorkOrder[]): Exception[] {
  const exceptions: Exception[] = [];

  workOrders.forEach(wo => {
    const agingHours = getAgingHours(wo.created_at);
    const isOverdue = wo.due_date && new Date(wo.due_date) < new Date();
    
    // CRITICAL: Overdue + Blocked
    if (isOverdue && !wo.qc_material_passed) {
      exceptions.push({
        id: `${wo.id}-mat-overdue`,
        wo,
        type: 'critical',
        reason: 'Overdue & blocked by Material QC',
        action: 'Approve material QC immediately',
        aging_hours: agingHours
      });
      return;
    }

    if (isOverdue && !wo.qc_first_piece_passed) {
      exceptions.push({
        id: `${wo.id}-fp-overdue`,
        wo,
        type: 'critical',
        reason: 'Overdue & blocked by First Piece QC',
        action: 'Complete first piece inspection',
        aging_hours: agingHours
      });
      return;
    }

    if (isOverdue && wo.external_status === 'pending') {
      exceptions.push({
        id: `${wo.id}-ext-overdue`,
        wo,
        type: 'critical',
        reason: 'Overdue & waiting on external partner',
        action: 'Escalate with vendor',
        aging_hours: agingHours
      });
      return;
    }

    // URGENT: Long aging blockers (>24h)
    if (!wo.qc_material_passed && agingHours > 24) {
      exceptions.push({
        id: `${wo.id}-mat-aging`,
        wo,
        type: 'urgent',
        reason: `Material QC pending ${Math.floor(agingHours / 24)}d`,
        action: 'Review material documentation',
        aging_hours: agingHours
      });
      return;
    }

    if (!wo.qc_first_piece_passed && wo.qc_material_passed && agingHours > 24) {
      exceptions.push({
        id: `${wo.id}-fp-aging`,
        wo,
        type: 'urgent',
        reason: `First Piece QC pending ${Math.floor(agingHours / 24)}d`,
        action: 'Schedule first piece run',
        aging_hours: agingHours
      });
      return;
    }

    if (wo.external_status === 'in_progress' && agingHours > 72) {
      exceptions.push({
        id: `${wo.id}-ext-aging`,
        wo,
        type: 'urgent',
        reason: `At external partner >3 days`,
        action: 'Follow up with partner',
        aging_hours: agingHours
      });
      return;
    }

    // ACTION NEEDED: Standard blockers
    if (!wo.qc_material_passed) {
      exceptions.push({
        id: `${wo.id}-mat`,
        wo,
        type: 'action_needed',
        reason: 'Awaiting Material QC',
        action: 'Perform material inspection',
        aging_hours: agingHours
      });
      return;
    }

    if (!wo.qc_first_piece_passed && wo.qc_material_passed) {
      exceptions.push({
        id: `${wo.id}-fp`,
        wo,
        type: 'action_needed',
        reason: 'Awaiting First Piece QC',
        action: 'Run first piece sample',
        aging_hours: agingHours
      });
      return;
    }

    if (wo.external_status === 'pending' || wo.external_status === 'in_progress') {
      exceptions.push({
        id: `${wo.id}-ext`,
        wo,
        type: 'action_needed',
        reason: 'At external processing',
        action: 'Track partner status',
        aging_hours: agingHours
      });
      return;
    }

    // Ready but not started (all gates passed, 0 progress)
    if (wo.qc_material_passed && wo.qc_first_piece_passed && (wo.progress_percentage ?? 0) === 0) {
      exceptions.push({
        id: `${wo.id}-ready`,
        wo,
        type: 'action_needed',
        reason: 'Ready for production',
        action: 'Assign to machine',
        aging_hours: agingHours
      });
    }
  });

  // Sort by priority: critical first, then urgent, then by aging
  return exceptions.sort((a, b) => {
    const typeOrder = { critical: 0, urgent: 1, action_needed: 2 };
    if (typeOrder[a.type] !== typeOrder[b.type]) {
      return typeOrder[a.type] - typeOrder[b.type];
    }
    return b.aging_hours - a.aging_hours;
  });
}

const typeConfig: Record<ExceptionType, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  critical: { 
    label: 'Critical', 
    icon: AlertCircle, 
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800'
  },
  urgent: { 
    label: 'Urgent', 
    icon: AlertTriangle, 
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
  },
  action_needed: { 
    label: 'Action Needed', 
    icon: Target, 
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800'
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

    // Auto-refresh every 60 seconds
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

      // Enrich with progress and external status
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

  const exceptions = useMemo(() => buildExceptions(workOrders), [workOrders]);

  const criticalCount = exceptions.filter(e => e.type === 'critical').length;
  const urgentCount = exceptions.filter(e => e.type === 'urgent').length;

  // Group exceptions by type for display
  const criticalExceptions = exceptions.filter(e => e.type === 'critical');
  const urgentExceptions = exceptions.filter(e => e.type === 'urgent');
  const actionExceptions = exceptions.filter(e => e.type === 'action_needed');

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading exceptions...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header - Minimal */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold">Production Control</h1>
            <p className="text-sm text-muted-foreground">
              What's blocking flow? What must be done next?
            </p>
          </div>
          
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Timer className="h-3 w-3" />
            Updated {format(new Date(), 'HH:mm')}
          </div>
        </div>

        {/* Exception Alert Banner - No KPIs, just the key message */}
        {exceptions.length > 0 ? (
          <div className={cn(
            "flex items-center gap-3 p-4 rounded-lg border-2",
            criticalCount > 0 ? "border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30" :
            urgentCount > 0 ? "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30" :
            "border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30"
          )}>
            {criticalCount > 0 ? (
              <>
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-700 dark:text-red-300">
                    {criticalCount} Critical — Immediate action required
                  </p>
                  <p className="text-xs text-red-600/80 dark:text-red-400/80">
                    Overdue WOs blocked
                  </p>
                </div>
              </>
            ) : urgentCount > 0 ? (
              <>
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    {urgentCount} Urgent — Attention needed today
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    Blockers aging &gt;24h
                  </p>
                </div>
              </>
            ) : (
              <>
                <Target className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-blue-700 dark:text-blue-300">
                    {exceptions.length} action item{exceptions.length > 1 ? 's' : ''} pending
                  </p>
                  <p className="text-xs text-blue-600/80 dark:text-blue-400/80">
                    Standard processing required
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 p-4 rounded-lg border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/30">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-700 dark:text-green-300">
                All Clear — No blockers
              </p>
              <p className="text-xs text-green-600/80 dark:text-green-400/80">
                Production flowing normally
              </p>
            </div>
          </div>
        )}

        {/* Exception Lists - Prioritized */}
        <div className="space-y-4">
          {/* Critical Section */}
          {criticalExceptions.length > 0 && (
            <ExceptionSection
              type="critical"
              exceptions={criticalExceptions}
              navigate={navigate}
            />
          )}

          {/* Urgent Section */}
          {urgentExceptions.length > 0 && (
            <ExceptionSection
              type="urgent"
              exceptions={urgentExceptions}
              navigate={navigate}
            />
          )}

          {/* Action Needed Section */}
          {actionExceptions.length > 0 && (
            <ExceptionSection
              type="action_needed"
              exceptions={actionExceptions}
              navigate={navigate}
            />
          )}
        </div>

        {/* All Clear State */}
        {exceptions.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle2 className="h-16 w-16 mx-auto mb-4 text-green-500" />
            <p className="text-xl font-semibold text-green-700 dark:text-green-400">Production Flowing Smoothly</p>
            <p className="text-muted-foreground mt-2">
              No blocked work orders at this time
            </p>
            <Button 
              variant="outline" 
              className="mt-6 gap-2"
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

// Exception Section Component
function ExceptionSection({ 
  type, 
  exceptions, 
  navigate 
}: { 
  type: ExceptionType; 
  exceptions: Exception[]; 
  navigate: (path: string) => void;
}) {
  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <Card className={cn("border-2", config.bgColor)}>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-5 w-5", config.color)} />
          <CardTitle className={cn("text-base", config.color)}>
            {config.label} ({exceptions.length})
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {exceptions.map((exc) => (
            <div
              key={exc.id}
              onClick={() => navigate(`/work-orders/${exc.wo.id}`)}
              className="flex items-center justify-between p-3 rounded-lg bg-background/60 hover:bg-background cursor-pointer transition-colors group border border-transparent hover:border-muted"
            >
              <div className="flex items-center gap-4 min-w-0 flex-1">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-semibold text-sm">{exc.wo.display_id}</span>
                    <span className="text-xs text-muted-foreground">•</span>
                    <span className="text-xs text-muted-foreground truncate">{exc.wo.customer}</span>
                    {exc.wo.due_date && new Date(exc.wo.due_date) < new Date() && (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className={cn("text-xs font-medium", config.color)}>{exc.reason}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right hidden sm:block">
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Zap className="h-2.5 w-2.5" />
                    {exc.action}
                  </Badge>
                  <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-end gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {exc.aging_hours < 24 
                      ? `${exc.aging_hours}h` 
                      : `${Math.floor(exc.aging_hours / 24)}d ${exc.aging_hours % 24}h`}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
