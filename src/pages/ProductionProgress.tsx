/**
 * Production Progress Page
 * 
 * THE AUTHORITATIVE VIEW for historical production analytics.
 * 
 * Tabs:
 * 1. Blockers - WO buckets showing blocked/ready states (existing)
 * 2. WO Analytics - WO-wise historical metrics with filters
 * 
 * Metrics calculated from daily_production_logs:
 * - Target Qty = Σ target_quantity
 * - Actual Qty = Σ actual_quantity
 * - OK Qty = Σ ok_quantity
 * - Scrap Qty = Σ total_rejection_quantity
 * - Remaining Qty = ordered_quantity - OK Qty
 * - Progress % = (OK Qty ÷ Ordered Qty) × 100
 * - Efficiency % = (OK Qty ÷ Target Qty) × 100
 * 
 * Updates immediately via realtime subscription on daily_production_logs.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { 
  FlaskConical,
  ExternalLink,
  Beaker,
  PlayCircle,
  Truck,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  Package,
  AlertTriangle,
  CheckCircle2,
  Search,
  Filter,
  CalendarIcon,
  Download,
  BarChart3,
  Target,
  XCircle,
  TrendingUp
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, parseISO, format, subDays, startOfMonth, endOfMonth } from "date-fns";

// === Types ===

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
  // Derived from production logs
  target_qty: number;
  actual_qty: number;
  ok_qty: number;
  scrap_qty: number;
  remaining_qty: number;
  progress_pct: number;
  efficiency_pct: number;
}

type BucketType = 'material_qc' | 'first_piece_qc' | 'ready_not_started' | 'external_processing';

interface BucketItem {
  wo: WorkOrder;
  aging_hours: number;
}

// === Helper Functions ===

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

    if (!wo.qc_material_passed) {
      buckets.material_qc.push(item);
      return;
    }

    if (!wo.qc_first_piece_passed) {
      buckets.first_piece_qc.push(item);
      return;
    }

    if (wo.external_status === 'pending' || wo.external_status === 'in_progress') {
      buckets.external_processing.push(item);
      return;
    }

    if (wo.progress_pct === 0) {
      buckets.ready_not_started.push(item);
      return;
    }
  });

  const severityOrder = { red: 0, amber: 1, green: 2 };
  Object.keys(buckets).forEach(key => {
    buckets[key as BucketType].sort((a, b) => {
      const aSeverity = getAgingSeverity(a.aging_hours);
      const bSeverity = getAgingSeverity(b.aging_hours);
      
      if (severityOrder[aSeverity] !== severityOrder[bSeverity]) {
        return severityOrder[aSeverity] - severityOrder[bSeverity];
      }
      
      return b.aging_hours - a.aging_hours;
    });
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
  actionLabel: string;
  getActionPath: (woId: string) => string;
  owner: string;
}> = {
  material_qc: { 
    title: 'Blocked – Material QC', 
    icon: Beaker, 
    color: 'text-red-700 dark:text-red-300',
    bgColor: 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800',
    description: 'Awaiting material inspection approval',
    isBlocker: true,
    actionLabel: 'Approve Material QC',
    getActionPath: (woId) => `/work-orders/${woId}?tab=qc`,
    owner: 'Quality'
  },
  first_piece_qc: { 
    title: 'Blocked – First Piece QC', 
    icon: FlaskConical, 
    color: 'text-amber-700 dark:text-amber-300',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800',
    description: 'Awaiting first piece approval',
    isBlocker: true,
    actionLabel: 'Perform First Piece Inspection',
    getActionPath: (woId) => `/work-orders/${woId}?tab=qc`,
    owner: 'QC / Production'
  },
  ready_not_started: { 
    title: 'Ready but Not Started', 
    icon: PlayCircle, 
    color: 'text-blue-700 dark:text-blue-300',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
    description: 'All gates passed, awaiting production start',
    isBlocker: true,
    actionLabel: 'Start Production',
    getActionPath: (woId) => `/work-orders/${woId}?tab=production`,
    owner: 'Production Planning'
  },
  external_processing: { 
    title: 'External Processing', 
    icon: Truck, 
    color: 'text-slate-700 dark:text-slate-300',
    bgColor: 'bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-700',
    description: 'At external partner – informational',
    isBlocker: false,
    actionLabel: 'View External Status',
    getActionPath: (woId) => `/work-orders/${woId}?tab=external`,
    owner: 'Procurement / External Ops'
  }
};

// === Main Component ===

export default function ProductionProgress() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"blockers" | "analytics">("blockers");
  const navigate = useNavigate();

  // Filters for analytics tab
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 30),
    end: new Date()
  });

  const loadWorkOrders = useCallback(async () => {
    try {
      // 1. Load work orders (active and recently completed)
      const { data: woData, error: woError } = await supabase
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
        .in("status", ["in_progress", "pending", "completed"])
        .order("due_date", { ascending: true });

      if (woError) throw woError;

      if (!woData || woData.length === 0) {
        setWorkOrders([]);
        setLoading(false);
        return;
      }

      const woIds = woData.map(wo => wo.id);

      // 2. Load production logs aggregated by WO - SINGLE SOURCE OF TRUTH
      const { data: logData, error: logError } = await supabase
        .from("daily_production_logs")
        .select("wo_id, target_quantity, actual_quantity, ok_quantity, total_rejection_quantity")
        .in("wo_id", woIds);

      if (logError) throw logError;

      // Aggregate production log data by WO
      const logAggregates = new Map<string, { 
        target_qty: number; 
        actual_qty: number; 
        ok_qty: number; 
        scrap_qty: number 
      }>();
      
      (logData || []).forEach((log: any) => {
        if (!log.wo_id) return;
        const existing = logAggregates.get(log.wo_id) || { 
          target_qty: 0, 
          actual_qty: 0, 
          ok_qty: 0, 
          scrap_qty: 0 
        };
        existing.target_qty += log.target_quantity ?? 0;
        existing.actual_qty += log.actual_quantity ?? 0;
        existing.ok_qty += log.ok_quantity ?? 0;
        existing.scrap_qty += log.total_rejection_quantity ?? 0;
        logAggregates.set(log.wo_id, existing);
      });

      // 3. Load external moves status
      const { data: externalData } = await supabase
        .from("wo_external_moves")
        .select("work_order_id, status")
        .in("work_order_id", woIds)
        .in("status", ["pending", "in_progress"]);

      const externalStatus = new Map<string, string>();
      (externalData || []).forEach((m: any) => {
        externalStatus.set(m.work_order_id, m.status);
      });

      // 4. Enrich work orders with production log derived metrics
      const enriched: WorkOrder[] = woData.map((wo) => {
        const logAggregate = logAggregates.get(wo.id) || { 
          target_qty: 0, 
          actual_qty: 0, 
          ok_qty: 0, 
          scrap_qty: 0 
        };
        const target_qty = logAggregate.target_qty;
        const actual_qty = logAggregate.actual_qty;
        const ok_qty = logAggregate.ok_qty;
        const scrap_qty = logAggregate.scrap_qty;
        const remaining_qty = Math.max(0, wo.quantity - ok_qty);
        const progress_pct = wo.quantity > 0 
          ? Math.min(100, Math.round((ok_qty / wo.quantity) * 100)) 
          : 0;
        const efficiency_pct = target_qty > 0
          ? Math.round((ok_qty / target_qty) * 100)
          : 0;

        return {
          ...wo,
          target_qty,
          actual_qty,
          ok_qty,
          scrap_qty,
          remaining_qty,
          progress_pct,
          efficiency_pct,
          external_status: externalStatus.get(wo.id) || null
        };
      });

      setWorkOrders(enriched);
    } catch (error: any) {
      toast.error(error.message || "Failed to load work orders");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel("production_progress_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => loadWorkOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, () => loadWorkOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_production_logs" }, () => loadWorkOrders())
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_external_moves" }, () => loadWorkOrders())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadWorkOrders]);

  // Buckets for blocker view
  const buckets = useMemo(() => {
    const activeWOs = workOrders.filter(wo => wo.status !== 'completed');
    return categorizeToBuckets(activeWOs);
  }, [workOrders]);

  const totalBlockers = buckets.material_qc.length + buckets.first_piece_qc.length + buckets.ready_not_started.length;
  
  // Flow health
  const flowHealth = useMemo(() => {
    const allItems = [
      ...buckets.material_qc,
      ...buckets.first_piece_qc,
      ...buckets.ready_not_started
    ];
    
    const redCount = allItems.filter(i => i.aging_hours >= 72).length;
    const amberCount = allItems.filter(i => i.aging_hours >= 24 && i.aging_hours < 72).length;
    
    if (redCount > 0) {
      return { 
        status: 'RED' as const, 
        reason: `${redCount} WO${redCount > 1 ? 's' : ''} blocked >3 days`
      };
    }
    if (amberCount > 0) {
      return { 
        status: 'AMBER' as const, 
        reason: `${amberCount} WO${amberCount > 1 ? 's' : ''} blocked >24h`
      };
    }
    if (totalBlockers > 0) {
      return { 
        status: 'GREEN' as const, 
        reason: `${totalBlockers} blocker${totalBlockers > 1 ? 's' : ''}, all <24h`
      };
    }
    return { 
      status: 'GREEN' as const, 
      reason: 'No blockers'
    };
  }, [buckets, totalBlockers]);

  // Summary stats for blocker tab
  const blockerSummary = useMemo(() => {
    const activeWOs = workOrders.filter(wo => wo.status !== 'completed');
    const totalOk = activeWOs.reduce((sum, wo) => sum + wo.ok_qty, 0);
    const totalScrap = activeWOs.reduce((sum, wo) => sum + wo.scrap_qty, 0);
    const totalOrdered = activeWOs.reduce((sum, wo) => sum + wo.quantity, 0);
    const totalRemaining = activeWOs.reduce((sum, wo) => sum + wo.remaining_qty, 0);
    const avgProgress = activeWOs.length > 0 
      ? Math.round(activeWOs.reduce((sum, wo) => sum + wo.progress_pct, 0) / activeWOs.length)
      : 0;
    const inProgress = activeWOs.filter(wo => wo.progress_pct > 0 && wo.progress_pct < 100).length;
    
    return { totalOk, totalScrap, totalOrdered, totalRemaining, avgProgress, inProgress };
  }, [workOrders]);

  // Filtered WOs for analytics tab
  const filteredWOs = useMemo(() => {
    let result = workOrders;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(wo => 
        wo.display_id?.toLowerCase().includes(term) ||
        wo.customer?.toLowerCase().includes(term) ||
        wo.item_code?.toLowerCase().includes(term) ||
        wo.customer_po?.toLowerCase().includes(term)
      );
    }

    // Customer filter
    if (customerFilter !== "all") {
      result = result.filter(wo => wo.customer === customerFilter);
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter(wo => wo.status === statusFilter);
    }

    return result;
  }, [workOrders, searchTerm, customerFilter, statusFilter]);

  // Analytics summary
  const analyticsSummary = useMemo(() => {
    const totalTarget = filteredWOs.reduce((sum, wo) => sum + wo.target_qty, 0);
    const totalActual = filteredWOs.reduce((sum, wo) => sum + wo.actual_qty, 0);
    const totalOk = filteredWOs.reduce((sum, wo) => sum + wo.ok_qty, 0);
    const totalScrap = filteredWOs.reduce((sum, wo) => sum + wo.scrap_qty, 0);
    const totalOrdered = filteredWOs.reduce((sum, wo) => sum + wo.quantity, 0);
    const avgProgress = filteredWOs.length > 0 
      ? Math.round(filteredWOs.reduce((sum, wo) => sum + wo.progress_pct, 0) / filteredWOs.length)
      : 0;
    const avgEfficiency = totalTarget > 0
      ? Math.round((totalOk / totalTarget) * 100)
      : 0;
    const scrapRate = totalActual > 0
      ? Math.round((totalScrap / totalActual) * 100 * 10) / 10
      : 0;
    
    return { 
      totalTarget, 
      totalActual, 
      totalOk, 
      totalScrap, 
      totalOrdered,
      avgProgress, 
      avgEfficiency,
      scrapRate,
      woCount: filteredWOs.length
    };
  }, [filteredWOs]);

  // Unique customers for filter
  const uniqueCustomers = useMemo(() => {
    return [...new Set(workOrders.map(wo => wo.customer).filter(Boolean))].sort();
  }, [workOrders]);

  // Export to CSV
  const exportCSV = () => {
    const headers = ["WO ID", "Customer", "Item Code", "Ordered", "Target", "Actual", "OK Qty", "Rejected", "Progress %", "Efficiency %", "Status"];
    const rows = filteredWOs.map(wo => [
      wo.display_id,
      wo.customer,
      wo.item_code,
      wo.quantity,
      wo.target_qty,
      wo.actual_qty,
      wo.ok_qty,
      wo.scrap_qty,
      wo.progress_pct,
      wo.efficiency_pct,
      wo.status
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-progress-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-blue-600 dark:text-blue-400";
    if (pct >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const getSubtitle = (bucketType: BucketType): string => {
    switch (bucketType) {
      case 'material_qc':
        return `${buckets.material_qc.length} WO${buckets.material_qc.length !== 1 ? 's' : ''} blocked from entering Cutting`;
      case 'ready_not_started':
        return `${buckets.ready_not_started.length} WO${buckets.ready_not_started.length !== 1 ? 's' : ''} idle despite available capacity`;
      case 'first_piece_qc':
        return `${buckets.first_piece_qc.length} WO${buckets.first_piece_qc.length !== 1 ? 's' : ''} awaiting first piece approval`;
      case 'external_processing':
        return `${buckets.external_processing.length} WO${buckets.external_processing.length !== 1 ? 's' : ''} at external partners`;
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Production Progress</h1>
          <p className="text-sm text-muted-foreground">
            The AUTHORITATIVE view for production progress and WO-wise analytics
          </p>
        </div>

        {/* Read-only notice */}
        <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            All metrics derived from Production Log entries (single source of truth). 
          </span>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "blockers" | "analytics")}>
          <TabsList className="grid w-full md:w-auto grid-cols-2 md:inline-flex">
            <TabsTrigger value="blockers" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Blockers
              {totalBlockers > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 text-[10px]">
                  {totalBlockers}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              WO Analytics
            </TabsTrigger>
          </TabsList>

          {/* === BLOCKERS TAB === */}
          <TabsContent value="blockers" className="mt-6 space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                    <p className="text-xs text-muted-foreground">Net Completed</p>
                    <p className="text-lg font-bold text-green-600">{blockerSummary.totalOk.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <AlertTriangle className="h-5 w-5 mx-auto text-red-600 mb-1" />
                    <p className="text-xs text-muted-foreground">Scrap Qty</p>
                    <p className="text-lg font-bold text-red-600">{blockerSummary.totalScrap.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <Package className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                    <p className="text-xs text-muted-foreground">Remaining</p>
                    <p className="text-lg font-bold text-amber-600">{blockerSummary.totalRemaining.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <Clock className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                    <p className="text-xs text-muted-foreground">In Progress</p>
                    <p className="text-lg font-bold text-blue-600">{blockerSummary.inProgress}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <div className="h-5 w-5 mx-auto mb-1 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Avg Progress</p>
                    <p className="text-lg font-bold">{blockerSummary.avgProgress}%</p>
                    <Progress value={blockerSummary.avgProgress} className="h-1.5 mt-1" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Flow Health Indicator */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm py-2 -mx-4 px-4 sm:-mx-6 sm:px-6 border-b border-border/50">
              <div className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full border",
                flowHealth.status === 'GREEN' && "bg-green-100 dark:bg-green-950/50 border-green-300 dark:border-green-700",
                flowHealth.status === 'AMBER' && "bg-amber-100 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700",
                flowHealth.status === 'RED' && "bg-red-100 dark:bg-red-950/50 border-red-300 dark:border-red-700"
              )}>
                <span className={cn(
                  "text-xs font-bold",
                  flowHealth.status === 'GREEN' && "text-green-700 dark:text-green-300",
                  flowHealth.status === 'AMBER' && "text-amber-700 dark:text-amber-300",
                  flowHealth.status === 'RED' && "text-red-700 dark:text-red-300"
                )}>
                  Flow: {flowHealth.status}
                </span>
                <span className="text-xs text-muted-foreground">
                  {flowHealth.reason}
                </span>
              </div>
            </div>

            {/* Buckets Grid */}
            <div className="grid gap-4 md:grid-cols-2">
              {(Object.keys(bucketConfig) as BucketType[])
                .filter((bucketKey) => buckets[bucketKey].length > 0)
                .map((bucketKey) => (
                  <BucketCard
                    key={bucketKey}
                    bucketType={bucketKey}
                    items={buckets[bucketKey]}
                    navigate={navigate}
                    subtitle={getSubtitle(bucketKey)}
                  />
                ))}
            </div>

            {/* Empty State */}
            {totalBlockers === 0 && buckets.external_processing.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No blockers — all clear!</p>
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
          </TabsContent>

          {/* === WO ANALYTICS TAB === */}
          <TabsContent value="analytics" className="mt-6 space-y-6">
            {/* Filters */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                  <div className="flex flex-wrap gap-3 items-center">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search WO, customer, item..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9 w-[200px]"
                      />
                    </div>

                    {/* Customer Filter */}
                    <Select value={customerFilter} onValueChange={setCustomerFilter}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="All Customers" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Customers</SelectItem>
                        {uniqueCustomers.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* Status Filter */}
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="All Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>

                    {(searchTerm || customerFilter !== "all" || statusFilter !== "all") && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => {
                          setSearchTerm("");
                          setCustomerFilter("all");
                          setStatusFilter("all");
                        }}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>

                  <Button variant="outline" onClick={exportCSV} disabled={filteredWOs.length === 0}>
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Analytics Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Work Orders</p>
                    <p className="text-xl font-bold">{analyticsSummary.woCount}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <Target className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Target Qty</p>
                    <p className="text-xl font-bold">{analyticsSummary.totalTarget.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <Package className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Actual Qty</p>
                    <p className="text-xl font-bold">{analyticsSummary.totalActual.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <CheckCircle2 className="h-4 w-4 mx-auto text-green-600 mb-1" />
                    <p className="text-xs text-muted-foreground">OK Qty</p>
                    <p className="text-xl font-bold text-green-600">{analyticsSummary.totalOk.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <XCircle className="h-4 w-4 mx-auto text-red-600 mb-1" />
                    <p className="text-xs text-muted-foreground">Rejected</p>
                    <p className="text-xl font-bold text-red-600">{analyticsSummary.totalScrap.toLocaleString()}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Avg Progress</p>
                    <p className="text-xl font-bold">{analyticsSummary.avgProgress}%</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <TrendingUp className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
                    <p className="text-xs text-muted-foreground">Avg Efficiency</p>
                    <p className={cn("text-xl font-bold", getEfficiencyColor(analyticsSummary.avgEfficiency))}>
                      {analyticsSummary.avgEfficiency}%
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-4 pb-3">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Scrap Rate</p>
                    <p className={cn("text-xl font-bold", analyticsSummary.scrapRate > 3 ? "text-red-600" : "text-green-600")}>
                      {analyticsSummary.scrapRate}%
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* WO Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Work Order Analytics
                </CardTitle>
                <CardDescription>
                  WO-wise target vs actual, OK/rejection quantities, and progress metrics
                </CardDescription>
              </CardHeader>
              <CardContent>
                {filteredWOs.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">No work orders found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your filters</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>WO ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">Target</TableHead>
                          <TableHead className="text-right">Actual</TableHead>
                          <TableHead className="text-right">OK Qty</TableHead>
                          <TableHead className="text-right">Rejected</TableHead>
                          <TableHead className="text-center">Progress</TableHead>
                          <TableHead className="text-right">Efficiency</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWOs.map((wo) => (
                          <TableRow 
                            key={wo.id}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/work-orders/${wo.id}`)}
                          >
                            <TableCell className="font-mono font-semibold">{wo.display_id}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{wo.customer}</TableCell>
                            <TableCell className="font-mono text-sm">{wo.item_code}</TableCell>
                            <TableCell className="text-right tabular-nums">{wo.quantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{wo.target_qty.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums">{wo.actual_qty.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums text-green-600 font-medium">
                              {wo.ok_qty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-red-600">
                              {wo.scrap_qty.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 justify-center">
                                <Progress value={wo.progress_pct} className="h-2 w-16" />
                                <span className="text-xs font-medium w-10 text-right">{wo.progress_pct}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={cn("font-medium", getEfficiencyColor(wo.efficiency_pct))}>
                                {wo.efficiency_pct}%
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={wo.status === 'completed' ? 'default' : 'secondary'}
                                className="capitalize text-xs"
                              >
                                {wo.status.replace('_', ' ')}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Calculation Footer */}
            <div className="bg-muted/30 border rounded-lg p-4">
              <h4 className="text-sm font-medium mb-2">Calculation Formulas</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground font-mono">
                <div>Progress % = (OK Qty ÷ Ordered Qty) × 100</div>
                <div>Efficiency % = (OK Qty ÷ Target Qty) × 100</div>
                <div>Scrap Rate = (Rejected ÷ Actual) × 100</div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// === BucketCard Component ===

const DEFAULT_VISIBLE_ROWS = 8;

function BucketCard({ 
  bucketType, 
  items, 
  navigate,
  subtitle
}: { 
  bucketType: BucketType; 
  items: BucketItem[]; 
  navigate: (path: string) => void;
  subtitle: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = bucketConfig[bucketType];
  const Icon = config.icon;
  
  const visibleItems = expanded ? items : items.slice(0, DEFAULT_VISIBLE_ROWS);
  const hasMore = items.length > DEFAULT_VISIBLE_ROWS;

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
        <p className="text-xs text-muted-foreground font-medium">{subtitle}</p>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            None
          </div>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b">
                    <th className="text-left py-2 px-1 font-medium">WO ID</th>
                    <th className="text-left py-2 px-1 font-medium">Item</th>
                    <th className="text-right py-2 px-1 font-medium">OK / Ord</th>
                    <th className="text-center py-2 px-1 font-medium">Progress</th>
                    <th className="text-center py-2 px-1 font-medium">Age</th>
                    <th className="text-left py-2 px-1 font-medium">Owner</th>
                    <th className="text-right py-2 px-1 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const severity = getAgingSeverity(item.aging_hours);
                    const isLongBlocked = item.aging_hours >= 72;
                    const isOverdue = item.wo.due_date && new Date(item.wo.due_date) < new Date();
                    
                    return (
                      <tr
                        key={item.wo.id}
                        className={cn(
                          "border-b border-muted/30 last:border-0",
                          isLongBlocked && "bg-red-50/50 dark:bg-red-950/30"
                        )}
                      >
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-semibold">{item.wo.display_id}</span>
                            {isOverdue && (
                              <Badge variant="destructive" className="text-[9px] px-1 py-0">LATE</Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1 text-muted-foreground max-w-[100px] truncate">
                          {item.wo.item_code}
                        </td>
                        <td className="py-2 px-1 text-right tabular-nums text-xs">
                          <span className="text-green-600 font-medium">{item.wo.ok_qty.toLocaleString()}</span>
                          <span className="text-muted-foreground"> / {item.wo.quantity.toLocaleString()}</span>
                        </td>
                        <td className="py-2 px-1">
                          <div className="flex items-center gap-1.5 justify-center">
                            <Progress value={item.wo.progress_pct} className="h-1.5 w-12" />
                            <span className="text-xs font-medium">{item.wo.progress_pct}%</span>
                          </div>
                        </td>
                        <td className="py-2 px-1 text-center">
                          <Badge 
                            variant="outline" 
                            className={cn(
                              "text-[10px] font-medium gap-0.5 border px-1.5",
                              severity === 'green' && "bg-green-100 dark:bg-green-950/50 text-green-700 dark:text-green-300 border-green-300 dark:border-green-700",
                              severity === 'amber' && "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-700",
                              severity === 'red' && "bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300 border-red-300 dark:border-red-700"
                            )}
                          >
                            <Clock className="h-2.5 w-2.5" />
                            {formatAgingDisplay(item.aging_hours)}
                          </Badge>
                        </td>
                        <td className="py-2 px-1">
                          <span className="text-xs text-muted-foreground">{config.owner}</span>
                        </td>
                        <td className="py-2 px-1 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => navigate(config.getActionPath(item.wo.id))}
                          >
                            Go
                            <ExternalLink className="h-3 w-3 ml-1" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? (
                  <>Show Less <ChevronUp className="h-3 w-3 ml-1" /></>
                ) : (
                  <>Show {items.length - DEFAULT_VISIBLE_ROWS} More <ChevronDown className="h-3 w-3 ml-1" /></>
                )}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
