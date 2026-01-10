/**
 * Production Performance Dashboard
 * 
 * CONSOLIDATED PRIMARY MANAGEMENT VIEW
 * Replaces: MachineUtilisation, OperatorEfficiency, SetterEfficiency, DowntimeAnalytics
 * 
 * Powered entirely by Daily Production Logs + CNC Programmer Activity.
 * Read-only analytics view with comprehensive filtering.
 */

import { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import {
  CalendarIcon, Activity, Clock, AlertTriangle, Trash2, Users, Wrench, TrendingUp,
  TrendingDown, Factory, Zap, Target, XCircle, Download, Info, DollarSign,
  BarChart3, PieChart as PieChartIcon, Settings2, Repeat, Timer, Award, Filter, RefreshCw
} from "lucide-react";
import { useProductionPerformanceMetrics } from "@/hooks/useProductionPerformanceMetrics";
import { CATEGORY_COLORS, type DowntimeCategory } from "@/config/downtimeConfig";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, ComposedChart, Area,
} from "recharts";

type PeriodType = "today" | "week" | "month" | "custom";
type ViewTab = "overview" | "downtime" | "efficiency" | "advanced";

function formatMinutes(minutes: number): string {
  if (!minutes || minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString()}`;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--destructive))",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

export default function ProductionPerformanceDashboard() {
  // Default to "custom" which shows last 30 days to ensure data is visible
  const [period, setPeriod] = useState<PeriodType>("custom");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [customStartDate, setCustomStartDate] = useState<Date>(subDays(new Date(), 30));
  const [customEndDate, setCustomEndDate] = useState<Date>(new Date());
  const [activeTab, setActiveTab] = useState<ViewTab>("overview");
  
  // Filters
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [shiftFilter, setShiftFilter] = useState<string>("all");
  const [processFilter, setProcessFilter] = useState<string>("all");
  const [itemFilter, setItemFilter] = useState<string>("all");

  // Calculate date range based on period selection
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "today":
        const today = format(now, "yyyy-MM-dd");
        return { start: today, end: today };
      case "week":
        // Last 7 days ending today
        return {
          start: format(subDays(now, 6), "yyyy-MM-dd"),
          end: format(now, "yyyy-MM-dd"),
        };
      case "month":
        // Last 30 days ending today
        return {
          start: format(subDays(now, 29), "yyyy-MM-dd"),
          end: format(now, "yyyy-MM-dd"),
        };
      case "custom":
      default:
        // Custom date range
        return {
          start: format(customStartDate, "yyyy-MM-dd"),
          end: format(customEndDate, "yyyy-MM-dd"),
        };
    }
  }, [period, customStartDate, customEndDate]);

  // Load metrics
  const { metrics, loading, error, refresh } = useProductionPerformanceMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
    period: "custom",
    machineId: machineFilter !== "all" ? machineFilter : undefined,
    operatorId: operatorFilter !== "all" ? operatorFilter : undefined,
    shiftFilter: shiftFilter !== "all" ? shiftFilter : undefined,
    processFilter: processFilter !== "all" ? processFilter : undefined,
    itemFilter: itemFilter !== "all" ? itemFilter : undefined,
  });

  const clearFilters = () => {
    setMachineFilter("all");
    setOperatorFilter("all");
    setShiftFilter("all");
    setProcessFilter("all");
    setItemFilter("all");
  };

  const hasActiveFilters = machineFilter !== "all" || operatorFilter !== "all" || 
    shiftFilter !== "all" || processFilter !== "all" || itemFilter !== "all";

  // Prepare chart data
  const categoryPieData = useMemo(() => {
    return metrics.downtimeByCategory.map(c => ({
      name: c.category,
      value: c.totalMinutes,
      hours: c.hours,
      color: CATEGORY_COLORS[c.category as DowntimeCategory] || "#6b7280",
    }));
  }, [metrics]);

  const shiftComparisonData = useMemo(() => {
    return metrics.shiftComparison.map(s => ({
      name: s.shift === "day" ? "Day Shift" : s.shift === "night" ? "Night Shift" : s.shift,
      downtime: Math.round(s.totalMinutes / 60 * 10) / 10,
      percent: s.percentOfTotal,
    }));
  }, [metrics]);

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-blue-600 dark:text-blue-400";
    if (pct >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getUtilizationColor = (pct: number) => {
    if (pct >= 85) return "text-green-600 dark:text-green-400";
    if (pct >= 70) return "text-blue-600 dark:text-blue-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getRankBadge = (rank: "high" | "medium" | "low") => {
    switch (rank) {
      case "high":
        return <Badge className="bg-green-600">Top</Badge>;
      case "low":
        return <Badge variant="destructive">Low</Badge>;
      default:
        return <Badge variant="secondary">Mid</Badge>;
    }
  };

  const exportCSV = () => {
    // Operators export
    const headers = ["Type", "Name", "Output", "Target", "Efficiency %", "Rejections", "Scrap %"];
    const rows = metrics.operators.map(op => [
      "Operator",
      op.operatorName,
      op.totalActual,
      op.totalTarget,
      op.efficiencyPercent,
      op.totalRejections,
      op.scrapPercent,
    ]);

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `production-performance-${dateRange.start}-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported");
  };

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Production Performance Dashboard"
        description="Consolidated analytics: Utilisation, Efficiency, Downtime & Quality"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>
          All metrics derived from Daily Production Logs + CNC Programmer Activity. Read-only analytics view.
        </span>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Period & Date */}
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex flex-wrap gap-3 items-center">
              <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                <TabsList>
                  <TabsTrigger value="today">Today</TabsTrigger>
                  <TabsTrigger value="week">This Week</TabsTrigger>
                  <TabsTrigger value="month">This Month</TabsTrigger>
                  <TabsTrigger value="custom">Custom</TabsTrigger>
                </TabsList>
              </Tabs>

              {period === "custom" && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[140px]">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(customStartDate, "MMM d")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customStartDate}
                        onSelect={(date) => date && setCustomStartDate(date)}
                        disabled={(date) => date > customEndDate}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <span className="text-muted-foreground">to</span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-[140px]">
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {format(customEndDate, "MMM d")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={customEndDate}
                        onSelect={(date) => date && setCustomEndDate(date)}
                        disabled={(date) => date < customStartDate || date > new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </>
              )}

              <Badge variant="outline" className="text-xs font-mono">
                {dateRange.start} → {dateRange.end}
              </Badge>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={refresh}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters:
            </div>

            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="All Shifts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Shifts</SelectItem>
                {metrics.availableShifts.map(s => (
                  <SelectItem key={s} value={s}>{s === "day" ? "Day" : s === "night" ? "Night" : s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Machines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {metrics.availableMachines.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name.split(" - ")[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={operatorFilter} onValueChange={setOperatorFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Operators" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Operators</SelectItem>
                {metrics.availableOperators.map(o => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={processFilter} onValueChange={setProcessFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All Processes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Processes</SelectItem>
                {metrics.availableProcesses.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={itemFilter} onValueChange={setItemFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Items" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Items</SelectItem>
                {metrics.availableItems.slice(0, 50).map(item => (
                  <SelectItem key={item} value={item}>{item.length > 25 ? item.slice(0, 25) + "..." : item}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear all
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* View Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ViewTab)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">
            <Factory className="h-4 w-4 mr-2" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="downtime">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Downtime & Loss
          </TabsTrigger>
          <TabsTrigger value="efficiency">
            <TrendingUp className="h-4 w-4 mr-2" />
            Efficiency & Quality
          </TabsTrigger>
          <TabsTrigger value="advanced">
            <BarChart3 className="h-4 w-4 mr-2" />
            Advanced Reports
          </TabsTrigger>
        </TabsList>

        {loading ? (
          <div className="space-y-4 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-28" />)}
            </div>
            <Skeleton className="h-[400px]" />
          </div>
        ) : (
          <>
            {/* ============= OVERVIEW TAB ============= */}
            <TabsContent value="overview" className="space-y-6 mt-6">
              {/* KPI Cards Row 1: Capacity */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Factory className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Manned Shifts</span>
                    </div>
                    <p className="text-2xl font-bold">{metrics.capacity.totalMannedShifts}</p>
                    <p className="text-xs text-muted-foreground">
                      Day: {metrics.capacity.dayShifts} | Night: {metrics.capacity.nightShifts}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Paid Capacity</span>
                    </div>
                    <p className="text-2xl font-bold">{formatMinutes(metrics.capacity.totalPaidCapacityMinutes)}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-muted-foreground">Productive Runtime</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatMinutes(metrics.capacity.totalProductiveRuntimeMinutes)}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Activity className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Utilisation</span>
                    </div>
                    <p className={cn("text-2xl font-bold", getUtilizationColor(metrics.capacity.utilizationPercent))}>
                      {metrics.capacity.utilizationPercent}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Settings2 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Machines</span>
                    </div>
                    <p className="text-2xl font-bold">
                      <span className="text-green-600">{metrics.capacity.activeMachines}</span>
                      <span className="text-muted-foreground text-lg"> / </span>
                      <span className="text-muted-foreground">{metrics.capacity.activeMachines + metrics.capacity.inactiveMachines}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">Active / Total</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Downtime</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">
                      {formatMinutes(metrics.capacity.totalDowntimeMinutes)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* KPI Cards Row 2: Efficiency */}
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Actual Output</span>
                    </div>
                    <p className="text-2xl font-bold">{metrics.efficiency.globalActualOutput.toLocaleString()}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Target className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Target Output</span>
                    </div>
                    <p className="text-2xl font-bold text-muted-foreground">{metrics.efficiency.globalTargetOutput.toLocaleString()}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      <span className="text-xs text-muted-foreground">Global Efficiency</span>
                    </div>
                    <p className={cn("text-2xl font-bold", getEfficiencyColor(metrics.efficiency.globalEfficiencyPercent))}>
                      {metrics.efficiency.globalEfficiencyPercent}%
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trash2 className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-muted-foreground">Rejections</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{metrics.efficiency.totalRejections.toLocaleString()}</p>
                    <p className="text-xs text-red-500">{metrics.efficiency.globalRejectionPercent}% of output</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Loss Cost</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(metrics.financialImpact.totalLossCost)}</p>
                    <p className="text-xs text-muted-foreground">Estimated</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Production Logs</span>
                    </div>
                    <p className="text-2xl font-bold">{metrics.logCount}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Charts Row */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Machine Utilisation */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" />
                      Machine Utilisation
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.machines.length === 0 ? (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={metrics.machines.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" domain={[0, 100]} />
                          <YAxis dataKey="machineName" type="category" width={80} tick={{ fontSize: 10 }} />
                          <Tooltip 
                            formatter={(value: number) => [`${value}%`, "Utilisation"]}
                            contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          />
                          <Bar dataKey="utilizationPercent" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* Top Operators */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Operator Efficiency
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {metrics.operators.length === 0 ? (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={metrics.operators.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" domain={[0, 120]} />
                          <YAxis dataKey="operatorName" type="category" width={80} tick={{ fontSize: 10 }} />
                          <Tooltip 
                            formatter={(value: number) => [`${value}%`, "Efficiency"]}
                            contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          />
                          <Bar dataKey="efficiencyPercent" fill="#10b981" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ============= DOWNTIME TAB ============= */}
            <TabsContent value="downtime" className="space-y-6 mt-6">
              {/* Downtime Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Total Downtime</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{formatMinutes(metrics.capacity.totalDowntimeMinutes)}</p>
                    <p className="text-xs text-muted-foreground">
                      {metrics.capacity.totalPaidCapacityMinutes > 0 
                        ? `${Math.round((metrics.capacity.totalDowntimeMinutes / metrics.capacity.totalPaidCapacityMinutes) * 100)}% of capacity`
                        : ""}
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Zap className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-muted-foreground">Active Paid Capacity</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {formatMinutes(metrics.capacity.activePaidCapacityMinutes)}
                    </p>
                    <p className="text-xs text-muted-foreground">Paid - Downtime</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Idle Time</span>
                    </div>
                    <p className="text-2xl font-bold">{formatMinutes(metrics.capacity.idleTimeMinutes)}</p>
                    <p className="text-xs text-muted-foreground">Runtime gap</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-muted-foreground">Downtime Cost</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.financialImpact.downtimeCostEstimate)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Downtime Charts */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* Pareto by Reason */}
                <Card>
                  <CardHeader>
                    <CardTitle>Top Downtime Reasons (Pareto)</CardTitle>
                    <CardDescription>Hours lost by reason</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metrics.downtimeLosses.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">No downtime recorded</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={metrics.downtimeLosses.slice(0, 10)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" />
                          <YAxis dataKey="reason" type="category" width={100} tick={{ fontSize: 10 }} />
                          <Tooltip 
                            formatter={(value: number, name: string) => 
                              name === "hours" ? [`${value}h`, "Duration"] : [`${value}%`, "% of Downtime"]
                            }
                            contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          />
                          <Bar dataKey="hours" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                {/* By Category Pie */}
                <Card>
                  <CardHeader>
                    <CardTitle>Downtime by Category</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {categoryPieData.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <ResponsiveContainer width="60%" height={250}>
                          <PieChart>
                            <Pie
                              data={categoryPieData}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                              label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              labelLine={false}
                            >
                              {categoryPieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip formatter={(value: number) => [formatMinutes(value), "Duration"]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="space-y-2">
                          {categoryPieData.slice(0, 6).map(cat => (
                            <div key={cat.name} className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded" style={{ backgroundColor: cat.color }} />
                              <span className="text-sm">{cat.name}: {cat.hours}h</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Downtime by Machine & Shift Tables */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Downtime by Machine</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[300px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Machine</TableHead>
                            <TableHead className="text-right">Duration</TableHead>
                            <TableHead className="text-right">Events</TableHead>
                            <TableHead>Top Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.downtimeByMachine.map(m => (
                            <TableRow key={m.machineId}>
                              <TableCell className="font-medium">{m.machineName.split(" - ")[0]}</TableCell>
                              <TableCell className="text-right text-amber-600">{formatMinutes(m.totalMinutes)}</TableCell>
                              <TableCell className="text-right">{m.occurrences}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{m.topReason}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Downtime by Shift</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {shiftComparisonData.length === 0 ? (
                      <div className="h-[300px] flex items-center justify-center text-muted-foreground">No data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={shiftComparisonData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip 
                            formatter={(value: number) => [`${value}h`, "Downtime"]}
                            contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          />
                          <Bar dataKey="downtime" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ============= EFFICIENCY TAB ============= */}
            <TabsContent value="efficiency" className="space-y-6 mt-6">
              {/* Efficiency Summary */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4 text-green-600" />
                      <span className="text-xs text-muted-foreground">Top Operators</span>
                    </div>
                    <p className="text-2xl font-bold text-green-600">
                      {metrics.operators.filter(o => o.rank === "high").length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingDown className="h-4 w-4 text-red-600" />
                      <span className="text-xs text-muted-foreground">Low Performers</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">
                      {metrics.operators.filter(o => o.rank === "low").length}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Trash2 className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-muted-foreground">Rejection Cost</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.financialImpact.rejectionCostEstimate)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Repeat className="h-4 w-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground">Rework Cost</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{formatCurrency(metrics.financialImpact.reworkCostEstimate)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-4 w-4 text-red-500" />
                      <span className="text-xs text-muted-foreground">Total Loss</span>
                    </div>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(metrics.financialImpact.totalLossCost)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Operator & Machine Rankings */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Operator Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Operator</TableHead>
                            <TableHead className="text-right">Efficiency</TableHead>
                            <TableHead className="text-right">Scrap %</TableHead>
                            <TableHead>Rank</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.operators.map(op => (
                            <TableRow key={op.operatorId}>
                              <TableCell className="font-medium">{op.operatorName}</TableCell>
                              <TableCell className={cn("text-right font-medium", getEfficiencyColor(op.efficiencyPercent))}>
                                {op.efficiencyPercent}%
                              </TableCell>
                              <TableCell className="text-right text-red-600">{op.scrapPercent}%</TableCell>
                              <TableCell>{getRankBadge(op.rank)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" />
                      Machine Rankings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[350px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Machine</TableHead>
                            <TableHead className="text-right">Utilisation</TableHead>
                            <TableHead className="text-right">Output</TableHead>
                            <TableHead>Rank</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.machines.map(m => (
                            <TableRow key={m.machineId}>
                              <TableCell className="font-medium">{m.machineName.split(" - ")[0]}</TableCell>
                              <TableCell className={cn("text-right font-medium", getUtilizationColor(m.utilizationPercent))}>
                                {m.utilizationPercent}%
                              </TableCell>
                              <TableCell className="text-right">{m.totalOutput.toLocaleString()}</TableCell>
                              <TableCell>{getRankBadge(m.rank)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Rejection Analysis */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Rejection Pareto</CardTitle>
                    <CardDescription>Top rejection reasons by count</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metrics.rejectionPareto.length === 0 ? (
                      <div className="h-[250px] flex items-center justify-center text-muted-foreground">No rejections</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={metrics.rejectionPareto.slice(0, 8)} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis type="number" />
                          <YAxis dataKey="reason" type="category" width={80} tick={{ fontSize: 10 }} />
                          <Tooltip 
                            formatter={(value: number, name: string) => [value.toLocaleString(), name === "count" ? "Count" : "Percentage"]}
                            contentStyle={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                          />
                          <Bar dataKey="count" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Top Rejection Items</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[250px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Rejections</TableHead>
                            <TableHead>Top Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.rejectionByItem.slice(0, 10).map(item => (
                            <TableRow key={item.itemCode}>
                              <TableCell className="font-medium max-w-[150px] truncate">{item.itemCode}</TableCell>
                              <TableCell className="text-right text-red-600">{item.total}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">{item.reasons[0]?.reason || "-"}</Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              {/* Setter Efficiency */}
              {metrics.setters.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench className="h-5 w-5" />
                      Setter Performance
                    </CardTitle>
                    <CardDescription>Setup efficiency from CNC Programmer Activity</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Setter</TableHead>
                          <TableHead className="text-right">Setups</TableHead>
                          <TableHead className="text-right">Avg Setup Time</TableHead>
                          <TableHead className="text-right">Avg Approval Delay</TableHead>
                          <TableHead className="text-right">Repeat Setups</TableHead>
                          <TableHead className="text-right">Score</TableHead>
                          <TableHead>Rank</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.setters.map(s => (
                          <TableRow key={s.setterId}>
                            <TableCell className="font-medium">{s.setterName}</TableCell>
                            <TableCell className="text-right">{s.totalSetups}</TableCell>
                            <TableCell className="text-right">{formatMinutes(s.avgSetupDurationMinutes)}</TableCell>
                            <TableCell className="text-right">{formatMinutes(s.avgApprovalDelayMinutes)}</TableCell>
                            <TableCell className="text-right text-amber-600">{s.repeatSetupCount}</TableCell>
                            <TableCell className="text-right font-medium">{s.efficiencyScore}</TableCell>
                            <TableCell>{getRankBadge(s.rank)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* ============= ADVANCED TAB ============= */}
            <TabsContent value="advanced" className="space-y-6 mt-6">
              {/* Setup Loss Analysis */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Total Setup Time</span>
                    </div>
                    <p className="text-2xl font-bold">{formatMinutes(metrics.setupLossAnalysis.totalSetupTimeMinutes)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Setup Time %</span>
                    </div>
                    <p className="text-2xl font-bold">{metrics.setupLossAnalysis.setupTimePercent}%</p>
                    <p className="text-xs text-muted-foreground">of productive time</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Changeovers</span>
                    </div>
                    <p className="text-2xl font-bold">{metrics.setupLossAnalysis.changeoverCount}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Timer className="h-4 w-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Avg Setup</span>
                    </div>
                    <p className="text-2xl font-bold">{formatMinutes(metrics.setupLossAnalysis.avgSetupDuration)}</p>
                  </CardContent>
                </Card>
              </div>

              {/* Repeat Offenders & Process Productivity */}
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                      Repeat Downtime Offenders
                    </CardTitle>
                    <CardDescription>Machines with recurring issues</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metrics.repeatDowntimeOffenders.length === 0 ? (
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">No repeat offenders</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Machine</TableHead>
                            <TableHead className="text-right">Events</TableHead>
                            <TableHead className="text-right">Duration</TableHead>
                            <TableHead>Top Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.repeatDowntimeOffenders.map(o => (
                            <TableRow key={o.id}>
                              <TableCell className="font-medium">{o.name.split(" - ")[0]}</TableCell>
                              <TableCell className="text-right">{o.occurrences}</TableCell>
                              <TableCell className="text-right text-amber-600">{formatMinutes(o.totalMinutes || 0)}</TableCell>
                              <TableCell><Badge variant="outline" className="text-xs">{o.topReason}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <XCircle className="h-5 w-5 text-red-500" />
                      Repeat Rejection Offenders
                    </CardTitle>
                    <CardDescription>Items with high rejection rates</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {metrics.repeatRejectionOffenders.length === 0 ? (
                      <div className="h-[200px] flex items-center justify-center text-muted-foreground">No repeat offenders</div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead className="text-right">Defect Types</TableHead>
                            <TableHead>Top Reason</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {metrics.repeatRejectionOffenders.map(o => (
                            <TableRow key={o.id}>
                              <TableCell className="font-medium max-w-[200px] truncate">{o.name}</TableCell>
                              <TableCell className="text-right">{o.occurrences}</TableCell>
                              <TableCell><Badge variant="destructive" className="text-xs">{o.topReason}</Badge></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Process Productivity */}
              <Card>
                <CardHeader>
                  <CardTitle>Process-wise Productivity</CardTitle>
                </CardHeader>
                <CardContent>
                  {metrics.processesByProductivity.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">No process data</div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Process</TableHead>
                          <TableHead className="text-right">Output</TableHead>
                          <TableHead className="text-right">Rejections</TableHead>
                          <TableHead className="text-right">Efficiency</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.processesByProductivity.map(p => (
                          <TableRow key={p.process}>
                            <TableCell className="font-medium">{p.process}</TableCell>
                            <TableCell className="text-right">{p.totalOutput.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-red-600">{p.totalRejections}</TableCell>
                            <TableCell className={cn("text-right font-medium", getEfficiencyColor(p.avgEfficiency))}>
                              {p.avgEfficiency}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Low-Efficiency Items */}
              <Card>
                <CardHeader>
                  <CardTitle>Low-Efficiency Items</CardTitle>
                  <CardDescription>Items with efficiency below target</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[300px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead className="text-right">Output</TableHead>
                          <TableHead className="text-right">Rejections</TableHead>
                          <TableHead className="text-right">Yield %</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {metrics.items.filter(i => i.rank === "low").map(item => (
                          <TableRow key={item.itemCode}>
                            <TableCell className="font-medium max-w-[200px] truncate">{item.itemCode}</TableCell>
                            <TableCell className="text-right">{item.totalOutput.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-red-600">{item.totalRejections}</TableCell>
                            <TableCell className={cn("text-right font-medium", getEfficiencyColor(item.avgEfficiency))}>
                              {item.avgEfficiency}%
                            </TableCell>
                            <TableCell>{getRankBadge(item.rank)}</TableCell>
                          </TableRow>
                        ))}
                        {metrics.items.filter(i => i.rank === "low").length === 0 && (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                              All items performing well
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </CardContent>
              </Card>
            </TabsContent>
          </>
        )}
      </Tabs>

      {/* Footer */}
      <div className="bg-muted/30 border rounded-lg p-4 text-xs text-muted-foreground">
        <h4 className="font-medium mb-2">Calculation Formulas</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 font-mono">
          <div>Utilisation % = (Runtime ÷ Paid Capacity) × 100</div>
          <div>Efficiency % = (OK Qty ÷ Target Qty) × 100</div>
          <div>Active Capacity = Paid Capacity − Downtime</div>
        </div>
      </div>
    </div>
  );
}
