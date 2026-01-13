/**
 * Production Progress - Executive Control View
 * 
 * Focus: Flow, Risk, and Decision-Making
 * 
 * Key Features:
 * - Global date filter (Today, Yesterday, This Week, Custom)
 * - "Data as of" timestamp from latest production log
 * - Throughput vs Plan indicator (On Track / Behind)
 * - At Risk Work Orders (predictive, not just current blockers)
 * - Blockers grouped by functional owner
 * - Capacity context (active vs total machines)
 * - Default sorting: blocked → oldest → lowest progress
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchBatchQuantitiesMultiple } from "@/hooks/useBatchQuantities";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  AlertTriangle,
  CheckCircle2,
  Search,
  CalendarIcon,
  Download,
  BarChart3,
  XCircle,
  TrendingDown,
  Activity,
  Users,
  Zap,
  RefreshCw
} from "lucide-react";
import { cn } from "@/lib/utils";
import { 
  differenceInHours, 
  differenceInDays,
  parseISO, 
  format, 
  subDays, 
  startOfDay,
  endOfDay,
  startOfWeek,
  isWithinInterval
} from "date-fns";

// === Types ===

type DatePreset = 'today' | 'yesterday' | 'this_week' | 'custom';

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
  // Derived metrics
  ok_qty: number;
  scrap_qty: number;
  remaining_qty: number;
  progress_pct: number;
  // Risk metrics
  is_blocked: boolean;
  block_reason?: string;
  block_owner?: string;
  aging_hours: number;
  is_at_risk: boolean;
  risk_reason?: string;
  days_to_due: number;
}

type BlockOwner = 'Quality' | 'Production' | 'Planning' | 'Procurement';

interface OwnerBlockCount {
  owner: BlockOwner;
  count: number;
  wos: WorkOrder[];
}

// === Helper Functions ===

function getAgingHours(dateStr: string): number {
  try {
    return differenceInHours(new Date(), parseISO(dateStr));
  } catch {
    return 0;
  }
}

function getDaysToDate(dateStr: string | null): number {
  if (!dateStr) return 999;
  try {
    return differenceInDays(parseISO(dateStr), new Date());
  } catch {
    return 999;
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

function getBlockInfo(wo: WorkOrder): { blocked: boolean; reason: string; owner: BlockOwner } | null {
  if (!wo.qc_material_passed) {
    return { blocked: true, reason: 'Material QC Pending', owner: 'Quality' };
  }
  if (!wo.qc_first_piece_passed) {
    return { blocked: true, reason: 'First Piece QC Pending', owner: 'Quality' };
  }
  if (wo.progress_pct === 0 && wo.status !== 'completed') {
    return { blocked: true, reason: 'Ready but Not Started', owner: 'Planning' };
  }
  if (wo.external_status === 'pending' || wo.external_status === 'in_progress') {
    return { blocked: true, reason: 'At External Partner', owner: 'Procurement' };
  }
  return null;
}

// Calculate if WO is at risk based on remaining qty vs time vs historical rate
function calculateRisk(wo: WorkOrder, avgDailyRate: number): { atRisk: boolean; reason: string } {
  if (wo.status === 'completed' || wo.remaining_qty === 0) {
    return { atRisk: false, reason: '' };
  }
  
  const daysToComplete = avgDailyRate > 0 ? wo.remaining_qty / avgDailyRate : 999;
  const daysRemaining = getDaysToDate(wo.due_date);
  
  // Already past due
  if (daysRemaining < 0) {
    return { atRisk: true, reason: `${Math.abs(daysRemaining)}d overdue` };
  }
  
  // Will likely miss deadline (need 20% more time than available)
  if (daysToComplete > daysRemaining * 1.2) {
    return { atRisk: true, reason: `Needs ${Math.ceil(daysToComplete)}d, only ${daysRemaining}d left` };
  }
  
  // Very low progress with deadline approaching
  if (wo.progress_pct < 30 && daysRemaining < 7) {
    return { atRisk: true, reason: `Only ${wo.progress_pct}% done, due in ${daysRemaining}d` };
  }
  
  return { atRisk: false, reason: '' };
}

// Sort: blocked first, then oldest age, then lowest progress
function executiveSortWOs(wos: WorkOrder[]): WorkOrder[] {
  return [...wos].sort((a, b) => {
    // Blocked WOs first
    if (a.is_blocked !== b.is_blocked) {
      return a.is_blocked ? -1 : 1;
    }
    // At risk WOs second
    if (a.is_at_risk !== b.is_at_risk) {
      return a.is_at_risk ? -1 : 1;
    }
    // Oldest age (highest aging_hours first)
    if (a.aging_hours !== b.aging_hours) {
      return b.aging_hours - a.aging_hours;
    }
    // Lowest progress first
    return a.progress_pct - b.progress_pct;
  });
}

// === Date Range Helpers ===

function getDateRangeFromPreset(preset: DatePreset): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { start: startOfDay(now), end: endOfDay(now) };
    case 'yesterday':
      const yesterday = subDays(now, 1);
      return { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    case 'this_week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) };
    case 'custom':
    default:
      return { start: subDays(now, 7), end: endOfDay(now) };
  }
}

// === Main Component ===

export default function ProductionProgress() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"blockers" | "analytics">("blockers");
  const [lastDataTimestamp, setLastDataTimestamp] = useState<string | null>(null);
  const [machineStats, setMachineStats] = useState({ active: 0, total: 0 });
  const navigate = useNavigate();

  // Date filter state
  const [datePreset, setDatePreset] = useState<DatePreset>('today');
  const [customDateRange, setCustomDateRange] = useState<{ start: Date; end: Date }>({
    start: subDays(new Date(), 7),
    end: new Date()
  });
  const [showCustomCalendar, setShowCustomCalendar] = useState(false);

  const dateRange = useMemo(() => {
    if (datePreset === 'custom') {
      return customDateRange;
    }
    return getDateRangeFromPreset(datePreset);
  }, [datePreset, customDateRange]);

  // Filters for analytics tab
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");

  const loadData = useCallback(async () => {
    try {
      // 1. Load work orders
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
        .in("status", ["in_progress", "pending"])
        .order("due_date", { ascending: true });

      if (woError) throw woError;

      if (!woData || woData.length === 0) {
        setWorkOrders([]);
        setLoading(false);
        return;
      }

      const woIds = woData.map(wo => wo.id);

      // 2. Load batch quantities
      const batchQuantities = await fetchBatchQuantitiesMultiple(woIds);

      // 3. Load external status
      const { data: externalData } = await supabase
        .from("wo_external_moves")
        .select("work_order_id, status")
        .in("work_order_id", woIds)
        .in("status", ["pending", "in_progress"]);

      const externalStatus = new Map<string, string>();
      (externalData || []).forEach((m: any) => {
        externalStatus.set(m.work_order_id, m.status);
      });

      // 4. Get latest production log timestamp for "Data as of"
      const { data: latestLog } = await supabase
        .from("daily_production_logs")
        .select("created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      
      if (latestLog) {
        setLastDataTimestamp(latestLog.created_at);
      }

      // 5. Get machine stats
      const { data: machines } = await supabase
        .from("machines")
        .select("id, status");
      
      if (machines) {
        const activeMachines = machines.filter((m: any) => m.status === 'running' || m.status === 'on_cycle');
        setMachineStats({ active: activeMachines.length, total: machines.length });
      }

      // 6. Calculate average daily production rate (for risk calculation)
      const { data: prodLogs } = await supabase
        .from("daily_production_logs")
        .select("ok_quantity, log_date")
        .gte("log_date", format(subDays(new Date(), 30), 'yyyy-MM-dd'))
        .lte("log_date", format(new Date(), 'yyyy-MM-dd'));
      
      const totalOkLast30Days = (prodLogs || []).reduce((sum, log) => sum + (log.ok_quantity || 0), 0);
      const avgDailyRate = totalOkLast30Days / 30;

      // 7. Enrich work orders
      const enriched: WorkOrder[] = woData.map((wo) => {
        const bq = batchQuantities.get(wo.id);
        const ok_qty = bq?.producedQty || 0;
        const scrap_qty = bq?.qcRejectedQty || 0;
        const remaining_qty = Math.max(0, wo.quantity - ok_qty);
        const progress_pct = wo.quantity > 0 ? Math.min(100, Math.round((ok_qty / wo.quantity) * 100)) : 0;
        const aging_hours = getAgingHours(wo.created_at);
        const days_to_due = getDaysToDate(wo.due_date);
        
        const blockInfo = getBlockInfo({
          ...wo,
          ok_qty,
          scrap_qty,
          remaining_qty,
          progress_pct,
          aging_hours,
          days_to_due,
          external_status: externalStatus.get(wo.id) || null,
          is_blocked: false,
          is_at_risk: false
        } as WorkOrder);
        
        const riskInfo = calculateRisk({
          ...wo,
          ok_qty,
          remaining_qty,
          progress_pct,
          status: wo.status
        } as WorkOrder, avgDailyRate);

        return {
          ...wo,
          ok_qty,
          scrap_qty,
          remaining_qty,
          progress_pct,
          aging_hours,
          days_to_due,
          external_status: externalStatus.get(wo.id) || null,
          is_blocked: !!blockInfo,
          block_reason: blockInfo?.reason,
          block_owner: blockInfo?.owner,
          is_at_risk: riskInfo.atRisk,
          risk_reason: riskInfo.reason
        };
      });

      // Sort with executive priority
      setWorkOrders(executiveSortWOs(enriched));
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("production_progress_executive")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "production_batches" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_production_logs" }, () => loadData())
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_external_moves" }, () => loadData())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadData]);

  // === Computed Values ===

  // Blockers grouped by owner
  const blockersByOwner = useMemo((): OwnerBlockCount[] => {
    const blockedWOs = workOrders.filter(wo => wo.is_blocked);
    const byOwner = new Map<BlockOwner, WorkOrder[]>();
    
    blockedWOs.forEach(wo => {
      const owner = wo.block_owner as BlockOwner;
      if (!byOwner.has(owner)) {
        byOwner.set(owner, []);
      }
      byOwner.get(owner)!.push(wo);
    });

    const ownerOrder: BlockOwner[] = ['Quality', 'Production', 'Planning', 'Procurement'];
    return ownerOrder
      .filter(owner => byOwner.has(owner))
      .map(owner => ({
        owner,
        count: byOwner.get(owner)!.length,
        wos: byOwner.get(owner)!
      }));
  }, [workOrders]);

  const totalBlockers = useMemo(() => {
    return workOrders.filter(wo => wo.is_blocked).length;
  }, [workOrders]);

  // At Risk WOs (not blocked but at risk)
  const atRiskWOs = useMemo(() => {
    return workOrders.filter(wo => wo.is_at_risk && !wo.is_blocked);
  }, [workOrders]);

  // Summary metrics (actionable only)
  const summary = useMemo(() => {
    const activeWOs = workOrders.filter(wo => wo.status !== 'completed');
    const totalOk = activeWOs.reduce((sum, wo) => sum + wo.ok_qty, 0);
    const totalScrap = activeWOs.reduce((sum, wo) => sum + wo.scrap_qty, 0);
    const totalRemaining = activeWOs.reduce((sum, wo) => sum + wo.remaining_qty, 0);
    const inProgressCount = activeWOs.filter(wo => wo.progress_pct > 0 && wo.progress_pct < 100).length;
    
    return { totalOk, totalScrap, totalRemaining, inProgressCount, activeCount: activeWOs.length };
  }, [workOrders]);

  // Throughput vs Plan
  const throughputStatus = useMemo(() => {
    const totalOrdered = workOrders.reduce((sum, wo) => sum + wo.quantity, 0);
    const totalOk = workOrders.reduce((sum, wo) => sum + wo.ok_qty, 0);
    
    // Simple calculation: are we keeping up with expected progress?
    // Expected = total ordered * (days elapsed / avg lead time)
    // For simplicity: compare ok_qty vs remaining_qty ratio
    const completionRatio = totalOrdered > 0 ? totalOk / totalOrdered : 0;
    
    // Factor in blocked and at-risk counts
    const riskFactor = (totalBlockers + atRiskWOs.length) / Math.max(1, workOrders.length);
    
    // On Track if >40% complete with <20% at risk/blocked
    const isOnTrack = completionRatio > 0.3 && riskFactor < 0.3;
    
    return {
      status: isOnTrack ? 'On Track' as const : 'Behind' as const,
      okQty: totalOk,
      orderedQty: totalOrdered,
      pct: Math.round(completionRatio * 100)
    };
  }, [workOrders, totalBlockers, atRiskWOs.length]);

  // Flow health
  const flowHealth = useMemo(() => {
    const redCount = workOrders.filter(wo => wo.is_blocked && wo.aging_hours >= 72).length;
    const amberCount = workOrders.filter(wo => wo.is_blocked && wo.aging_hours >= 24 && wo.aging_hours < 72).length;
    
    if (redCount > 0) {
      return { status: 'RED' as const, reason: `${redCount} blocked >3 days` };
    }
    if (amberCount > 0) {
      return { status: 'AMBER' as const, reason: `${amberCount} blocked >24h` };
    }
    if (totalBlockers > 0) {
      return { status: 'GREEN' as const, reason: `${totalBlockers} blocker${totalBlockers > 1 ? 's' : ''}, all <24h` };
    }
    return { status: 'GREEN' as const, reason: 'No blockers' };
  }, [workOrders, totalBlockers]);

  // Filtered WOs for analytics tab
  const filteredWOs = useMemo(() => {
    let result = workOrders;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(wo => 
        wo.display_id?.toLowerCase().includes(term) ||
        wo.customer?.toLowerCase().includes(term) ||
        wo.item_code?.toLowerCase().includes(term)
      );
    }

    if (customerFilter !== "all") {
      result = result.filter(wo => wo.customer === customerFilter);
    }

    return executiveSortWOs(result);
  }, [workOrders, searchTerm, customerFilter]);

  // Unique customers
  const uniqueCustomers = useMemo(() => {
    return [...new Set(workOrders.map(wo => wo.customer).filter(Boolean))].sort();
  }, [workOrders]);

  // Export CSV
  const exportCSV = () => {
    const headers = ["WO ID", "Customer", "Item Code", "Ordered", "OK Qty", "Scrap", "Remaining", "Progress %", "Blocked", "At Risk", "Days to Due"];
    const rows = filteredWOs.map(wo => [
      wo.display_id,
      wo.customer,
      wo.item_code,
      wo.quantity,
      wo.ok_qty,
      wo.scrap_qty,
      wo.remaining_qty,
      wo.progress_pct,
      wo.is_blocked ? 'Yes' : 'No',
      wo.is_at_risk ? 'Yes' : 'No',
      wo.days_to_due
    ]);

    const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-control-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
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
            <p className="text-sm text-muted-foreground">
              Executive view: Flow, Risk, and Intervention
            </p>
          </div>
          
          {/* Date Filter */}
          <div className="flex items-center gap-2">
            <Select value={datePreset} onValueChange={(v) => setDatePreset(v as DatePreset)}>
              <SelectTrigger className="w-[140px]">
                <CalendarIcon className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="this_week">This Week</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>
            
            {datePreset === 'custom' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{format(customDateRange.start, 'MMM d')} - {format(customDateRange.end, 'MMM d')}</span>
              </div>
            )}
            
            <Button variant="ghost" size="icon" onClick={loadData}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Data Timestamp + Capacity Context */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {lastDataTimestamp && (
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Data as of: {format(parseISO(lastDataTimestamp), 'MMM d, h:mm a')}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5" />
            <span>Machines: {machineStats.active} active / {machineStats.total} total</span>
          </div>
        </div>

        {/* Executive Summary Strip */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Throughput vs Plan */}
          <Card className={cn(
            "col-span-2 md:col-span-1",
            throughputStatus.status === 'On Track' 
              ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
          )}>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                {throughputStatus.status === 'On Track' ? (
                  <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                ) : (
                  <TrendingDown className="h-5 w-5 mx-auto text-red-600 mb-1" />
                )}
                <p className="text-xs text-muted-foreground">Throughput vs Plan</p>
                <p className={cn(
                  "text-lg font-bold",
                  throughputStatus.status === 'On Track' ? "text-green-600" : "text-red-600"
                )}>
                  {throughputStatus.status}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {throughputStatus.pct}% complete
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <CheckCircle2 className="h-5 w-5 mx-auto text-green-600 mb-1" />
                <p className="text-xs text-muted-foreground">OK Quantity</p>
                <p className="text-lg font-bold text-green-600">{summary.totalOk.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <XCircle className="h-5 w-5 mx-auto text-red-600 mb-1" />
                <p className="text-xs text-muted-foreground">Scrap Quantity</p>
                <p className="text-lg font-bold text-red-600">{summary.totalScrap.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <Zap className="h-5 w-5 mx-auto text-amber-600 mb-1" />
                <p className="text-xs text-muted-foreground">Remaining</p>
                <p className="text-lg font-bold text-amber-600">{summary.totalRemaining.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-center">
                <Activity className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                <p className="text-xs text-muted-foreground">In Progress WOs</p>
                <p className="text-lg font-bold text-blue-600">{summary.inProgressCount}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "blockers" | "analytics")}>
          <TabsList className="grid w-full md:w-auto grid-cols-2 md:inline-flex">
            <TabsTrigger value="blockers" className="gap-2">
              <AlertTriangle className="h-4 w-4" />
              Flow & Risk
              {(totalBlockers + atRiskWOs.length) > 0 && (
                <Badge variant="destructive" className="ml-1 h-5 text-[10px]">
                  {totalBlockers + atRiskWOs.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              WO Analytics
            </TabsTrigger>
          </TabsList>

          {/* === FLOW & RISK TAB === */}
          <TabsContent value="blockers" className="mt-6 space-y-6">
            {/* Flow Health Indicator */}
            <div className="flex items-center gap-4">
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

            {/* Blockers by Owner */}
            {blockersByOwner.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Blockers by Responsibility
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Owner summary chips */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    {blockersByOwner.map(({ owner, count }) => (
                      <Badge 
                        key={owner} 
                        variant="outline" 
                        className={cn(
                          "text-sm py-1 px-3",
                          count > 3 && "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700"
                        )}
                      >
                        <span className="font-semibold mr-1">{owner}:</span>
                        <span className={cn(count > 3 ? "text-red-600" : "")}>{count}</span>
                      </Badge>
                    ))}
                  </div>
                  
                  {/* Blocked WO table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>WO ID</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead>Block Reason</TableHead>
                          <TableHead>Owner</TableHead>
                          <TableHead className="text-center">Age</TableHead>
                          <TableHead className="text-center">Progress</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {workOrders.filter(wo => wo.is_blocked).slice(0, 15).map((wo) => {
                          const severity = getAgingSeverity(wo.aging_hours);
                          return (
                            <TableRow key={wo.id} className={cn(wo.aging_hours >= 72 && "bg-red-50/50 dark:bg-red-950/20")}>
                              <TableCell className="font-mono font-semibold">
                                <div className="flex items-center gap-1.5">
                                  {wo.display_id}
                                  {wo.days_to_due < 0 && (
                                    <Badge variant="destructive" className="text-[9px] px-1 py-0">LATE</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{wo.item_code}</TableCell>
                              <TableCell>{wo.block_reason}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">{wo.block_owner}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge 
                                  variant="outline" 
                                  className={cn(
                                    "text-[10px]",
                                    severity === 'green' && "bg-green-100 dark:bg-green-950/50 text-green-700",
                                    severity === 'amber' && "bg-amber-100 dark:bg-amber-950/50 text-amber-700",
                                    severity === 'red' && "bg-red-100 dark:bg-red-950/50 text-red-700"
                                  )}
                                >
                                  <Clock className="h-2.5 w-2.5 mr-0.5" />
                                  {formatAgingDisplay(wo.aging_hours)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-1.5 justify-center">
                                  <Progress value={wo.progress_pct} className="h-1.5 w-12" />
                                  <span className="text-xs">{wo.progress_pct}%</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => navigate(`/work-orders/${wo.id}`)}
                                >
                                  Go <ExternalLink className="h-3 w-3 ml-1" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* At Risk Work Orders */}
            {atRiskWOs.length > 0 && (
              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-950/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="h-4 w-4" />
                    At Risk Work Orders
                    <Badge variant="outline" className="ml-2 text-amber-700 border-amber-300">
                      {atRiskWOs.length}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    WOs likely to miss deadline based on remaining qty vs available time
                  </p>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>WO ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead>Risk Reason</TableHead>
                          <TableHead className="text-center">Days to Due</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {atRiskWOs.slice(0, 10).map((wo) => (
                          <TableRow key={wo.id}>
                            <TableCell className="font-mono font-semibold">{wo.display_id}</TableCell>
                            <TableCell className="max-w-[100px] truncate">{wo.customer}</TableCell>
                            <TableCell className="text-muted-foreground">{wo.item_code}</TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-amber-600">
                              {wo.remaining_qty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm text-amber-700 dark:text-amber-300">
                              {wo.risk_reason}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={wo.days_to_due < 0 ? "destructive" : "secondary"}
                                className="text-xs"
                              >
                                {wo.days_to_due < 0 ? `${Math.abs(wo.days_to_due)}d overdue` : `${wo.days_to_due}d`}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 px-2 text-xs"
                                onClick={() => navigate(`/work-orders/${wo.id}`)}
                              >
                                Go <ExternalLink className="h-3 w-3 ml-1" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Empty State */}
            {totalBlockers === 0 && atRiskWOs.length === 0 && (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium text-muted-foreground">All clear — no blockers or at-risk WOs</p>
              </div>
            )}
          </TabsContent>

          {/* === WO ANALYTICS TAB === */}
          <TabsContent value="analytics" className="mt-6 space-y-6">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search WO, customer, item..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 w-[200px]"
                  />
                </div>

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

                {(searchTerm || customerFilter !== "all") && (
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => {
                      setSearchTerm("");
                      setCustomerFilter("all");
                    }}
                  >
                    Clear
                  </Button>
                )}
              </div>

              <Button variant="outline" onClick={exportCSV} disabled={filteredWOs.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* WO Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Work Orders ({filteredWOs.length})
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Sorted: Blocked → Oldest → Lowest Progress
                </p>
              </CardHeader>
              <CardContent>
                {filteredWOs.length === 0 ? (
                  <div className="text-center py-12">
                    <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                    <p className="text-lg font-medium text-muted-foreground">No work orders found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Status</TableHead>
                          <TableHead>WO ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Item Code</TableHead>
                          <TableHead className="text-right">Ordered</TableHead>
                          <TableHead className="text-right">OK Qty</TableHead>
                          <TableHead className="text-right">Scrap</TableHead>
                          <TableHead className="text-right">Remaining</TableHead>
                          <TableHead className="text-center">Progress</TableHead>
                          <TableHead className="text-center">Due</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredWOs.map((wo) => (
                          <TableRow 
                            key={wo.id}
                            className={cn(
                              "cursor-pointer hover:bg-muted/50",
                              wo.is_blocked && "bg-red-50/50 dark:bg-red-950/20",
                              !wo.is_blocked && wo.is_at_risk && "bg-amber-50/50 dark:bg-amber-950/20"
                            )}
                            onClick={() => navigate(`/work-orders/${wo.id}`)}
                          >
                            <TableCell>
                              {wo.is_blocked ? (
                                <Badge variant="destructive" className="text-[10px]">Blocked</Badge>
                              ) : wo.is_at_risk ? (
                                <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-700 border-amber-300">At Risk</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-[10px]">Active</Badge>
                              )}
                            </TableCell>
                            <TableCell className="font-mono font-semibold">{wo.display_id}</TableCell>
                            <TableCell className="max-w-[120px] truncate">{wo.customer}</TableCell>
                            <TableCell className="font-mono text-sm">{wo.item_code}</TableCell>
                            <TableCell className="text-right tabular-nums">{wo.quantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right tabular-nums text-green-600 font-medium">
                              {wo.ok_qty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-red-600">
                              {wo.scrap_qty.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-medium text-amber-600">
                              {wo.remaining_qty.toLocaleString()}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 justify-center">
                                <Progress value={wo.progress_pct} className="h-2 w-16" />
                                <span className="text-xs font-medium w-10 text-right">{wo.progress_pct}%</span>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge 
                                variant={wo.days_to_due < 0 ? "destructive" : wo.days_to_due < 3 ? "outline" : "secondary"}
                                className="text-[10px]"
                              >
                                {wo.days_to_due < 0 ? `${Math.abs(wo.days_to_due)}d late` : `${wo.days_to_due}d`}
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
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
