/**
 * Quality Control Tower — Real-time, exception-focused operational dashboard.
 * State-driven by computed WO_QUALITY_STATE. No vanity metrics.
 * Answers: "Where is quality risk right now and what action is required?"
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageContainer } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { QCStatusIndicator } from "@/components/qc/QCStatusIndicator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Shield, AlertTriangle, Clock, Truck, ArrowRight, Search,
  Ban, Activity, Eye, Package, ExternalLink, Filter,
  ChevronRight, IndianRupee, XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInDays, differenceInHours, parseISO, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

type QualityState =
  | "BLOCKED_MATERIAL_QC"
  | "BLOCKED_FIRST_PIECE"
  | "BLOCKED_NCR"
  | "QC_OVERDUE"
  | "DISPATCH_AT_RISK"
  | "EXTERNAL_PENDING"
  | "IN_PROCESS"
  | "ON_TRACK";

type Segment = "all" | "incoming" | "first_piece" | "in_process" | "external" | "dispatch" | "blocked";

interface QCWorkOrder {
  id: string;
  wo_number: string;
  display_id: string;
  customer: string;
  item_code: string;
  status: string;
  order_qty: number;
  unit_rate: number | null;
  due_date: string | null;
  created_at: string;
  qc_material_status: string | null;
  qc_first_piece_status: string | null;
  quality_state: QualityState;
  days_in_state: number;
  risk_level: "critical" | "high" | "medium" | "low";
  order_value: number;
  supplier: string | null;
  machine_id: string | null;
  has_active_ncr: boolean;
  external_status: string | null;
  dispatch_qc_status: string | null;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUALITY STATE COMPUTER — Single source of truth
// ═══════════════════════════════════════════════════════════════════════════

const computeQualityState = (wo: any, ncrs: Set<string>, extMoves: Map<string, any>): {
  state: QualityState;
  daysInState: number;
  riskLevel: "critical" | "high" | "medium" | "low";
} => {
  const now = new Date();
  const dueDate = wo.due_date ? parseISO(wo.due_date) : null;
  const daysToDue = dueDate ? differenceInDays(dueDate, now) : 999;
  const createdDaysAgo = differenceInDays(now, parseISO(wo.created_at));

  // 1. NCR active → blocked
  if (ncrs.has(wo.id)) {
    return {
      state: "BLOCKED_NCR",
      daysInState: createdDaysAgo,
      riskLevel: daysToDue <= 1 ? "critical" : daysToDue <= 3 ? "high" : "medium",
    };
  }

  // 2. Material QC not passed
  const matStatus = wo.qc_material_status;
  if (!matStatus || matStatus === "pending" || matStatus === "failed") {
    return {
      state: "BLOCKED_MATERIAL_QC",
      daysInState: createdDaysAgo,
      riskLevel: matStatus === "failed" ? "critical" : daysToDue <= 3 ? "high" : "medium",
    };
  }

  // 3. First piece not passed
  const fpStatus = wo.qc_first_piece_status;
  if (!fpStatus || fpStatus === "pending" || fpStatus === "failed") {
    return {
      state: "BLOCKED_FIRST_PIECE",
      daysInState: createdDaysAgo,
      riskLevel: fpStatus === "failed" ? "critical" : daysToDue <= 3 ? "high" : "medium",
    };
  }

  // 4. External pending
  if (extMoves.has(wo.id)) {
    return {
      state: "EXTERNAL_PENDING",
      daysInState: createdDaysAgo,
      riskLevel: daysToDue <= 3 ? "high" : "medium",
    };
  }

  // 5. Dispatch at risk
  if (daysToDue <= 1 && wo.status !== "completed" && wo.status !== "shipped") {
    return {
      state: "DISPATCH_AT_RISK",
      daysInState: 0,
      riskLevel: daysToDue <= 0 ? "critical" : "high",
    };
  }

  // 6. In process (QC gates passed, production ongoing)
  if (wo.status === "in_progress" || wo.status === "qc") {
    return {
      state: "IN_PROCESS",
      daysInState: createdDaysAgo,
      riskLevel: daysToDue <= 3 ? "medium" : "low",
    };
  }

  return {
    state: "ON_TRACK",
    daysInState: createdDaysAgo,
    riskLevel: "low",
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// STATE BADGE CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const STATE_CONFIG: Record<QualityState, { label: string; className: string; icon: any }> = {
  BLOCKED_MATERIAL_QC: {
    label: "Material QC Blocked",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: Ban,
  },
  BLOCKED_FIRST_PIECE: {
    label: "First Piece Blocked",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: Ban,
  },
  BLOCKED_NCR: {
    label: "NCR Active",
    className: "bg-destructive/15 text-destructive border-destructive/40",
    icon: XCircle,
  },
  QC_OVERDUE: {
    label: "QC Overdue",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
    icon: Clock,
  },
  DISPATCH_AT_RISK: {
    label: "Dispatch at Risk",
    className: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-500/30",
    icon: Truck,
  },
  EXTERNAL_PENDING: {
    label: "External Pending",
    className: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30",
    icon: ExternalLink,
  },
  IN_PROCESS: {
    label: "In Process",
    className: "bg-primary/10 text-primary border-primary/30",
    icon: Activity,
  },
  ON_TRACK: {
    label: "On Track",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
    icon: Shield,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// SEGMENT CONFIG
// ═══════════════════════════════════════════════════════════════════════════

const SEGMENTS: { key: Segment; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: Shield },
  { key: "incoming", label: "Incoming", icon: Package },
  { key: "first_piece", label: "First Piece", icon: Activity },
  { key: "in_process", label: "In-Process", icon: Activity },
  { key: "external", label: "External", icon: ExternalLink },
  { key: "dispatch", label: "Dispatch", icon: Truck },
  { key: "blocked", label: "Blocked", icon: Ban },
];

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

const OperationalPanel = ({
  title, count, subtitle, icon: Icon, variant, onClick, className,
}: {
  title: string; count: number; subtitle: string;
  icon: any; variant: "danger" | "warning" | "alert";
  onClick?: () => void; className?: string;
}) => {
  const variantStyles = {
    danger: "border-destructive/30 bg-destructive/5",
    warning: "border-amber-500/30 bg-amber-500/5",
    alert: "border-orange-500/30 bg-orange-500/5",
  };
  const iconStyles = {
    danger: "text-destructive",
    warning: "text-amber-600 dark:text-amber-400",
    alert: "text-orange-600 dark:text-orange-400",
  };
  const countStyles = {
    danger: "text-destructive",
    warning: "text-amber-700 dark:text-amber-300",
    alert: "text-orange-700 dark:text-orange-300",
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        variantStyles[variant],
        className
      )}
      onClick={onClick}
    >
      <CardContent className="py-4 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className={cn("text-3xl font-bold tabular-nums", countStyles[variant])}>
              {count}
            </p>
            <p className="text-xs text-muted-foreground leading-tight">{subtitle}</p>
          </div>
          <div className={cn("p-2 rounded-lg bg-background/60", iconStyles[variant])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const QualityStateBadge = ({ state }: { state: QualityState }) => {
  const config = STATE_CONFIG[state];
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={cn("text-[11px] font-medium gap-1", config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

const RiskIndicator = ({ level }: { level: "critical" | "high" | "medium" | "low" }) => {
  const styles = {
    critical: "bg-destructive text-destructive-foreground",
    high: "bg-orange-500 text-white",
    medium: "bg-amber-500 text-white",
    low: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded", styles[level])}>
      {level}
    </span>
  );
};

const formatCurrency = (value: number) => {
  if (value >= 10000000) return `₹${(value / 10000000).toFixed(1)}Cr`;
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(0)}K`;
  return `₹${value.toFixed(0)}`;
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════

const Quality = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [workOrders, setWorkOrders] = useState<QCWorkOrder[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const segment = (searchParams.get("segment") as Segment) || "all";
  const setSegment = (s: Segment) => {
    const params = new URLSearchParams(searchParams);
    params.set("segment", s);
    setSearchParams(params, { replace: true });
  };

  // ─── Context filters ───
  const [filterCustomer, setFilterCustomer] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Parallel fetches
      const [woRes, ncrRes, extRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select("id, wo_number, display_id, customer, item_code, status, quantity, due_date, created_at, qc_material_status, qc_first_piece_status")
          .in("status", ["pending", "in_progress", "qc", "packing"])
          .order("created_at", { ascending: false })
          .limit(500),
        supabase
          .from("ncrs")
          .select("work_order_id, status")
          .in("status", ["OPEN", "ACTION_IN_PROGRESS"]),
        supabase
          .from("external_movements")
          .select("work_order_id, status, process_type")
          .eq("status", "sent"),
      ]);

      if (woRes.error) throw woRes.error;

      // Build lookup maps
      const activeNCRs = new Set<string>();
      (ncrRes.data || []).forEach((n) => {
        if (n.work_order_id) activeNCRs.add(n.work_order_id);
      });

      const extMap = new Map<string, any>();
      (extRes.data || []).forEach((e) => {
        if (e.work_order_id) extMap.set(e.work_order_id, e);
      });

      const mapped: QCWorkOrder[] = (woRes.data || []).map((wo: any) => {
        const { state, daysInState, riskLevel } = computeQualityState(wo, activeNCRs, extMap);
        const orderValue = wo.quantity || 0;
        return {
          id: wo.id,
          wo_number: wo.wo_number || "",
          display_id: wo.display_id || wo.wo_number || "—",
          customer: wo.customer || "—",
          item_code: wo.item_code || "—",
          status: wo.status,
          order_qty: wo.quantity || 0,
          unit_rate: null,
          due_date: wo.due_date,
          created_at: wo.created_at,
          qc_material_status: wo.qc_material_status,
          qc_first_piece_status: wo.qc_first_piece_status,
          quality_state: state,
          days_in_state: daysInState,
          risk_level: riskLevel,
          order_value: orderValue,
          supplier: null,
          machine_id: null,
          has_active_ncr: activeNCRs.has(wo.id),
          external_status: extMap.get(wo.id)?.process_type || null,
          dispatch_qc_status: null,
        };
      });

      // Default sort: highest risk first
      mapped.sort((a, b) => {
        const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        if (riskOrder[a.risk_level] !== riskOrder[b.risk_level]) {
          return riskOrder[a.risk_level] - riskOrder[b.risk_level];
        }
        return b.days_in_state - a.days_in_state;
      });

      setWorkOrders(mapped);
    } catch (error: any) {
      console.error("QC Control Tower load error:", error);
      toast({ variant: "destructive", title: "Error loading QC data", description: error.message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    const channel = supabase
      .channel("qc-control-tower")
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "ncrs" }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadData]);

  // ─── Computed aggregates ───
  const blockedCount = useMemo(
    () => workOrders.filter((w) => ["BLOCKED_MATERIAL_QC", "BLOCKED_FIRST_PIECE", "BLOCKED_NCR"].includes(w.quality_state)).length,
    [workOrders]
  );
  const blockedValue = useMemo(
    () => workOrders.filter((w) => ["BLOCKED_MATERIAL_QC", "BLOCKED_FIRST_PIECE", "BLOCKED_NCR"].includes(w.quality_state))
      .reduce((s, w) => s + w.order_value, 0),
    [workOrders]
  );
  const overdueCount = useMemo(
    () => workOrders.filter((w) => w.quality_state === "QC_OVERDUE" || (w.days_in_state > 2 && ["BLOCKED_MATERIAL_QC", "BLOCKED_FIRST_PIECE"].includes(w.quality_state))).length,
    [workOrders]
  );
  const dispatchRiskCount = useMemo(
    () => workOrders.filter((w) => w.quality_state === "DISPATCH_AT_RISK").length,
    [workOrders]
  );
  const dispatchRiskValue = useMemo(
    () => workOrders.filter((w) => w.quality_state === "DISPATCH_AT_RISK").reduce((s, w) => s + w.order_value, 0),
    [workOrders]
  );

  // ─── Segment filtering ───
  const segmentedOrders = useMemo(() => {
    let filtered = workOrders;

    switch (segment) {
      case "incoming":
        filtered = workOrders.filter((w) => w.quality_state === "BLOCKED_MATERIAL_QC");
        break;
      case "first_piece":
        filtered = workOrders.filter((w) => w.quality_state === "BLOCKED_FIRST_PIECE");
        break;
      case "in_process":
        filtered = workOrders.filter((w) => w.quality_state === "IN_PROCESS");
        break;
      case "external":
        filtered = workOrders.filter((w) => w.quality_state === "EXTERNAL_PENDING");
        break;
      case "dispatch":
        filtered = workOrders.filter((w) => w.quality_state === "DISPATCH_AT_RISK");
        break;
      case "blocked":
        filtered = workOrders.filter((w) =>
          ["BLOCKED_MATERIAL_QC", "BLOCKED_FIRST_PIECE", "BLOCKED_NCR"].includes(w.quality_state)
        );
        break;
    }

    // Apply search
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (w) =>
          w.wo_number.toLowerCase().includes(q) ||
          w.display_id.toLowerCase().includes(q) ||
          w.customer.toLowerCase().includes(q) ||
          w.item_code.toLowerCase().includes(q)
      );
    }

    // Apply context filters
    if (filterCustomer !== "all") {
      filtered = filtered.filter((w) => w.customer === filterCustomer);
    }
    if (filterRisk !== "all") {
      filtered = filtered.filter((w) => w.risk_level === filterRisk);
    }

    return filtered;
  }, [workOrders, segment, searchQuery, filterCustomer, filterRisk]);

  // Unique customers for filter
  const customers = useMemo(
    () => [...new Set(workOrders.map((w) => w.customer).filter(Boolean))].sort(),
    [workOrders]
  );

  // Quick action routing
  const getQuickAction = (wo: QCWorkOrder) => {
    switch (wo.quality_state) {
      case "BLOCKED_MATERIAL_QC":
        return { label: "Approve Material", path: `/work-orders/${wo.id}?tab=qc` };
      case "BLOCKED_FIRST_PIECE":
        return { label: "Approve FP", path: `/work-orders/${wo.id}?tab=qc` };
      case "BLOCKED_NCR":
        return { label: "View NCR", path: `/ncr?wo=${wo.id}` };
      case "EXTERNAL_PENDING":
        return { label: "Check External", path: `/work-orders/${wo.id}?tab=external` };
      case "DISPATCH_AT_RISK":
        return { label: "Dispatch QC", path: `/dispatch-qc?wo=${wo.id}` };
      default:
        return { label: "View", path: `/work-orders/${wo.id}` };
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <PageContainer maxWidth="2xl">
          <div className="space-y-5">
            <Skeleton className="h-8 w-72" />
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
            </div>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-96" />
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="2xl">
        <div className="space-y-5">

          {/* ═══ HEADER ═══ */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Quality Control Tower
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                Real-time exception view · {workOrders.length} active work orders
              </p>
            </div>
            {/* Financial impact indicator */}
            <div className="flex gap-4 text-right">
              {blockedValue > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Blocked Value</p>
                  <p className="text-lg font-bold text-destructive tabular-nums">{formatCurrency(blockedValue)}</p>
                </div>
              )}
              {dispatchRiskValue > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">Dispatch Risk</p>
                  <p className="text-lg font-bold text-orange-600 dark:text-orange-400 tabular-nums">{formatCurrency(dispatchRiskValue)}</p>
                </div>
              )}
            </div>
          </div>

          {/* ═══ OPERATIONAL PANELS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <OperationalPanel
              title="Blocked Production"
              count={blockedCount}
              subtitle={`${formatCurrency(blockedValue)} order value impacted`}
              icon={Ban}
              variant="danger"
              onClick={() => setSegment("blocked")}
            />
            <OperationalPanel
              title="QC Overdue"
              count={overdueCount}
              subtitle="First Piece or Material QC pending >48h"
              icon={Clock}
              variant="warning"
              onClick={() => setSegment("incoming")}
            />
            <OperationalPanel
              title="Dispatch at Risk"
              count={dispatchRiskCount}
              subtitle={`Due <24h, QC incomplete · ${formatCurrency(dispatchRiskValue)}`}
              icon={Truck}
              variant="alert"
              onClick={() => setSegment("dispatch")}
            />
          </div>

          {/* ═══ SEGMENT TOGGLE ═══ */}
          <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg overflow-x-auto">
            {SEGMENTS.map((seg) => {
              const Icon = seg.icon;
              const isActive = segment === seg.key;
              const count = seg.key === "all"
                ? workOrders.length
                : seg.key === "blocked"
                ? blockedCount
                : seg.key === "incoming"
                ? workOrders.filter((w) => w.quality_state === "BLOCKED_MATERIAL_QC").length
                : seg.key === "first_piece"
                ? workOrders.filter((w) => w.quality_state === "BLOCKED_FIRST_PIECE").length
                : seg.key === "in_process"
                ? workOrders.filter((w) => w.quality_state === "IN_PROCESS").length
                : seg.key === "external"
                ? workOrders.filter((w) => w.quality_state === "EXTERNAL_PENDING").length
                : seg.key === "dispatch"
                ? workOrders.filter((w) => w.quality_state === "DISPATCH_AT_RISK").length
                : 0;

              return (
                <button
                  key={seg.key}
                  onClick={() => setSegment(seg.key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {seg.label}
                  {count > 0 && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full tabular-nums",
                      isActive ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ═══ CONTEXT FILTERS ═══ */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search WO, customer, item..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>

            <SafeSelect value={filterCustomer} onValueChange={setFilterCustomer}>
              <SafeSelectTrigger className="w-[160px] h-8 text-xs">
                <SafeSelectValue placeholder="Customer" />
              </SafeSelectTrigger>
              <SafeSelectContent>
                <SafeSelectItem value="all">All Customers</SafeSelectItem>
                {customers.map((c) => (
                  <SafeSelectItem key={c} value={c}>{c}</SafeSelectItem>
                ))}
              </SafeSelectContent>
            </SafeSelect>

            <SafeSelect value={filterRisk} onValueChange={setFilterRisk}>
              <SafeSelectTrigger className="w-[130px] h-8 text-xs">
                <SafeSelectValue placeholder="Risk" />
              </SafeSelectTrigger>
              <SafeSelectContent>
                <SafeSelectItem value="all">All Risk</SafeSelectItem>
                <SafeSelectItem value="critical">Critical</SafeSelectItem>
                <SafeSelectItem value="high">High</SafeSelectItem>
                <SafeSelectItem value="medium">Medium</SafeSelectItem>
                <SafeSelectItem value="low">Low</SafeSelectItem>
              </SafeSelectContent>
            </SafeSelect>

            {(filterCustomer !== "all" || filterRisk !== "all" || searchQuery) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setFilterCustomer("all");
                  setFilterRisk("all");
                  setSearchQuery("");
                }}
              >
                Clear filters
              </Button>
            )}

            <span className="text-[11px] text-muted-foreground ml-auto tabular-nums">
              {segmentedOrders.length} result{segmentedOrders.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* ═══ PRIMARY TABLE ═══ */}
          {segmentedOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  icon="quality"
                  title={segment === "all" ? "No Active QC Items" : `No ${SEGMENTS.find(s => s.key === segment)?.label} items`}
                  description="Work orders requiring quality attention will appear here."
                  size="md"
                />
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[110px]">WO ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead>Quality State</TableHead>
                      <TableHead className="text-center">Days</TableHead>
                      <TableHead className="text-center">Risk</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      {segment === "incoming" && <TableHead>Material QC</TableHead>}
                      {segment === "first_piece" && <TableHead>First Piece</TableHead>}
                      <TableHead className="text-right w-[130px]">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {segmentedOrders.map((wo) => {
                      const action = getQuickAction(wo);
                      return (
                        <TableRow
                          key={wo.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            wo.risk_level === "critical" && "bg-destructive/[0.03]",
                            wo.risk_level === "high" && "bg-orange-500/[0.02]"
                          )}
                          onClick={() => navigate(`/work-orders/${wo.id}`)}
                        >
                          <TableCell className="font-medium text-xs">
                            <div className="flex items-center gap-1.5">
                              {wo.risk_level === "critical" && (
                                <AlertTriangle className="h-3 w-3 text-destructive flex-shrink-0" />
                              )}
                              <span className="hover:underline">{wo.display_id}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs max-w-[140px] truncate">{wo.customer}</TableCell>
                          <TableCell className="text-xs">{wo.item_code}</TableCell>
                          <TableCell>
                            <QualityStateBadge state={wo.quality_state} />
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn(
                              "text-xs tabular-nums font-medium",
                              wo.days_in_state > 5 && "text-destructive",
                              wo.days_in_state > 2 && wo.days_in_state <= 5 && "text-amber-600 dark:text-amber-400"
                            )}>
                              {wo.days_in_state}d
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <RiskIndicator level={wo.risk_level} />
                          </TableCell>
                          <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                            {wo.order_value > 0 ? formatCurrency(wo.order_value) : "—"}
                          </TableCell>
                          {segment === "incoming" && (
                            <TableCell>
                              <QCStatusIndicator status={wo.qc_material_status as any} size="sm" />
                            </TableCell>
                          )}
                          {segment === "first_piece" && (
                            <TableCell>
                              <QCStatusIndicator status={wo.qc_first_piece_status as any} size="sm" />
                            </TableCell>
                          )}
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] gap-1"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(action.path);
                              }}
                            >
                              {action.label}
                              <ChevronRight className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}

        </div>
      </PageContainer>
    </div>
  );
};

export default Quality;
