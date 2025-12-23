/**
 * Operator Efficiency Page
 * 
 * READ-ONLY HISTORICAL ANALYTICS VIEW
 * All metrics derived exclusively from useProductionLogMetrics hook.
 * No local calculations or write actions.
 */

import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, Users, TrendingUp, Clock, Target, XCircle, Download, Info, Filter, ChevronRight, Percent } from "lucide-react";
import { useProductionLogMetrics, type OperatorMetrics } from "@/hooks/useProductionLogMetrics";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

type PeriodFilter = "daily" | "weekly" | "monthly";

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function OperatorEfficiency() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [processFilter, setProcessFilter] = useState<string>("all");

  // Calculate date range based on period filter
  const dateRange = useMemo(() => {
    const today = selectedDate;
    switch (periodFilter) {
      case "daily":
        return {
          start: format(today, "yyyy-MM-dd"),
          end: format(today, "yyyy-MM-dd"),
          label: format(today, "PPP"),
        };
      case "weekly":
        return {
          start: format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          label: `Week of ${format(startOfWeek(today, { weekStartsOn: 1 }), "MMM d")} - ${format(endOfWeek(today, { weekStartsOn: 1 }), "MMM d, yyyy")}`,
        };
      case "monthly":
        return {
          start: format(startOfMonth(today), "yyyy-MM-dd"),
          end: format(endOfMonth(today), "yyyy-MM-dd"),
          label: format(today, "MMMM yyyy"),
        };
    }
  }, [periodFilter, selectedDate]);

  // SINGLE SOURCE: useProductionLogMetrics
  const { metrics, loading } = useProductionLogMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
    period: 'custom',
    machineId: machineFilter !== "all" ? machineFilter : undefined,
    processFilter: processFilter !== "all" ? processFilter : undefined,
  });

  // Derived data from hook - NO LOCAL CALCULATIONS
  const operatorData = useMemo(() => {
    if (!metrics?.operatorMetrics) return [];
    return metrics.operatorMetrics
      .filter(op => op.logCount > 0)
      .sort((a, b) => b.efficiencyPercent - a.efficiencyPercent);
  }, [metrics]);

  // Summary statistics - derived from hook data only
  const summary = useMemo(() => {
    const totalOperators = operatorData.length;
    const totalRuntime = operatorData.reduce((sum, d) => sum + d.totalRuntime, 0);
    const totalActual = operatorData.reduce((sum, d) => sum + d.totalActual, 0);
    const totalOk = operatorData.reduce((sum, d) => sum + d.totalOk, 0);
    const totalRejection = operatorData.reduce((sum, d) => sum + d.totalRejections, 0);
    const avgEfficiency = operatorData.length > 0
      ? Math.round(operatorData.reduce((sum, d) => sum + d.efficiencyPercent, 0) / operatorData.length)
      : 0;
    const avgScrap = totalActual > 0 ? Math.round((totalRejection / totalActual) * 100 * 10) / 10 : 0;
    return { totalOperators, totalRuntime, totalActual, totalOk, totalRejection, avgEfficiency, avgScrap };
  }, [operatorData]);

  // Available machines from metrics for filter
  const availableMachines = useMemo(() => {
    if (!metrics?.machineMetrics) return [];
    return metrics.machineMetrics.map(m => ({
      id: m.machineId,
      name: m.machineName,
    }));
  }, [metrics]);

  // Available processes from metrics
  const availableProcesses = useMemo(() => {
    return metrics?.availableProcesses || [];
  }, [metrics]);

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-blue-600 dark:text-blue-400";
    if (pct >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getScrapColor = (pct: number) => {
    if (pct <= 1) return "text-green-600 dark:text-green-400";
    if (pct <= 3) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const exportCSV = () => {
    const headers = ["Operator", "Runtime", "Target Qty", "Actual Qty", "OK Qty", "Rejection Qty", "Efficiency %", "Scrap %"];
    const rows = operatorData.map((d) => [
      d.operatorName,
      formatMinutes(d.totalRuntime),
      d.totalTarget,
      d.totalActual,
      d.totalOk,
      d.totalRejections,
      d.efficiencyPercent.toFixed(1),
      d.scrapPercent.toFixed(1),
    ]);

    const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operator-efficiency-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Success", description: "CSV exported" });
  };

  const clearFilters = () => {
    setMachineFilter("all");
    setProcessFilter("all");
  };

  const hasActiveFilters = machineFilter !== "all" || processFilter !== "all";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Operator Efficiency"
        description="Historical analytics derived from Daily Production Logs"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-start gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          <span>All metrics derived from Production Log entries via shared calculation engine. This is a read-only view — no local calculations.</span>
          <br />
          <span className="text-xs">Efficiency = (OK Qty ÷ Target Qty) × 100 | Scrap % = (Rejection Qty ÷ Actual Qty) × 100</span>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="pt-6 space-y-4">
          {/* Period Toggle & Date */}
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Period Filter */}
              <Tabs value={periodFilter} onValueChange={(v) => setPeriodFilter(v as PeriodFilter)}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[240px] justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dateRange.label}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => date && setSelectedDate(date)}
                    disabled={(date) => date > new Date()}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <Button variant="outline" onClick={exportCSV} disabled={operatorData.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap gap-3 items-center pt-2 border-t">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters:
            </div>
            
            {/* Machine Filter */}
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Machines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {availableMachines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.name.split(' - ')[0]}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Process Filter */}
            <Select value={processFilter} onValueChange={setProcessFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Processes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Processes</SelectItem>
                {availableProcesses.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Operators</span>
            </div>
            {loading ? <Skeleton className="h-8 w-12" /> : (
              <p className="text-2xl font-bold">{summary.totalOperators}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Runtime</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold">{formatMinutes(summary.totalRuntime)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Actual Qty</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold">{summary.totalActual.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">OK Qty</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-green-600">{summary.totalOk.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <XCircle className="h-4 w-4 text-red-600" />
              <span className="text-xs text-muted-foreground">Rejections</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-red-600">{summary.totalRejection.toLocaleString()}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Efficiency</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className={cn("text-2xl font-bold", getEfficiencyColor(summary.avgEfficiency))}>
                {summary.avgEfficiency}%
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-1">
              <Percent className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Scrap</span>
            </div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <p className={cn("text-2xl font-bold", getScrapColor(summary.avgScrap))}>
                {summary.avgScrap}%
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operator Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Operator Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : operatorData.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">No operator data</h3>
              <p className="text-sm text-muted-foreground">
                No production logs with operator assignments for the selected period.
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead className="text-right">Runtime</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-right">Actual</TableHead>
                  <TableHead className="text-right">OK</TableHead>
                  <TableHead className="text-right">Rejected</TableHead>
                  <TableHead className="text-right">Efficiency</TableHead>
                  <TableHead className="text-right">Scrap %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {operatorData.map((op) => (
                  <TableRow key={op.operatorId}>
                    <TableCell className="font-medium">{op.operatorName}</TableCell>
                    <TableCell className="text-right">{formatMinutes(op.totalRuntime)}</TableCell>
                    <TableCell className="text-right">{op.totalTarget.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{op.totalActual.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-green-600">{op.totalOk.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-red-600">{op.totalRejections.toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-medium", getEfficiencyColor(op.efficiencyPercent))}>
                        {op.efficiencyPercent.toFixed(1)}%
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={cn("font-medium", getScrapColor(op.scrapPercent))}>
                        {op.scrapPercent.toFixed(1)}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="bg-muted/30 border rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Calculation Formulas</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-muted-foreground font-mono">
          <div>Efficiency % = (OK Qty ÷ Target Qty) × 100</div>
          <div>Scrap % = (Rejection Qty ÷ Actual Qty) × 100</div>
        </div>
      </div>
    </div>
  );
}
