import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, Users, TrendingUp, Clock, Target, XCircle, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
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
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface OperatorEfficiencyData {
  operatorId: string;
  operatorName: string;
  machineId: string;
  machineName: string;
  totalRuntimeMinutes: number;
  totalActualQuantity: number;
  totalRejectionQuantity: number;
  totalTargetQuantity: number;
  efficiencyPercentage: number;
  logCount: number;
}

interface ProductionLogRow {
  id: string;
  operator_id: string | null;
  machine_id: string;
  actual_runtime_minutes: number | null;
  actual_quantity: number | null;
  total_rejection_quantity: number | null;
  target_quantity: number | null;
  efficiency_percentage: number | null;
  operator: { full_name: string } | null;
  machines: { name: string; machine_id: string } | null;
}

type PeriodFilter = "daily" | "weekly" | "monthly";

// Helper to format minutes as hours:minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function OperatorEfficiency() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [efficiencyData, setEfficiencyData] = useState<OperatorEfficiencyData[]>([]);

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

  // Summary statistics
  const summary = useMemo(() => {
    const totalOperators = new Set(efficiencyData.map(d => d.operatorId)).size;
    const totalMachines = new Set(efficiencyData.map(d => d.machineId)).size;
    const totalRuntime = efficiencyData.reduce((sum, d) => sum + d.totalRuntimeMinutes, 0);
    const totalActual = efficiencyData.reduce((sum, d) => sum + d.totalActualQuantity, 0);
    const totalRejection = efficiencyData.reduce((sum, d) => sum + d.totalRejectionQuantity, 0);
    const avgEfficiency = efficiencyData.length > 0
      ? Math.round(efficiencyData.reduce((sum, d) => sum + d.efficiencyPercentage, 0) / efficiencyData.length)
      : 0;
    return { totalOperators, totalMachines, totalRuntime, totalActual, totalRejection, avgEfficiency };
  }, [efficiencyData]);

  useEffect(() => {
    loadData();
  }, [dateRange]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load production logs for the date range with operator and machine details
      const { data: logsData, error } = await supabase
        .from("daily_production_logs")
        .select(`
          id,
          operator_id,
          machine_id,
          actual_runtime_minutes,
          actual_quantity,
          total_rejection_quantity,
          target_quantity,
          efficiency_percentage,
          operator:operator_id(full_name),
          machines:machine_id(name, machine_id)
        `)
        .gte("log_date", dateRange.start)
        .lte("log_date", dateRange.end)
        .not("operator_id", "is", null);

      if (error) throw error;

      // Aggregate data by operator + machine combination
      const aggregatedMap = new Map<string, OperatorEfficiencyData>();

      (logsData as unknown as ProductionLogRow[] || []).forEach((log) => {
        if (!log.operator_id) return;

        const key = `${log.operator_id}-${log.machine_id}`;
        const existing = aggregatedMap.get(key);

        if (existing) {
          existing.totalRuntimeMinutes += log.actual_runtime_minutes || 0;
          existing.totalActualQuantity += log.actual_quantity || 0;
          existing.totalRejectionQuantity += log.total_rejection_quantity || 0;
          existing.totalTargetQuantity += log.target_quantity || 0;
          existing.logCount++;
        } else {
          aggregatedMap.set(key, {
            operatorId: log.operator_id,
            operatorName: log.operator?.full_name || "Unknown",
            machineId: log.machine_id,
            machineName: log.machines?.machine_id ? `${log.machines.machine_id} - ${log.machines.name}` : "Unknown",
            totalRuntimeMinutes: log.actual_runtime_minutes || 0,
            totalActualQuantity: log.actual_quantity || 0,
            totalRejectionQuantity: log.total_rejection_quantity || 0,
            totalTargetQuantity: log.target_quantity || 0,
            efficiencyPercentage: 0,
            logCount: 1,
          });
        }
      });

      // Calculate efficiency for each aggregated entry
      const result = Array.from(aggregatedMap.values()).map((entry) => ({
        ...entry,
        efficiencyPercentage: entry.totalTargetQuantity > 0
          ? Math.round((entry.totalActualQuantity / entry.totalTargetQuantity) * 100 * 100) / 100
          : 0,
      }));

      // Sort by efficiency descending
      result.sort((a, b) => b.efficiencyPercentage - a.efficiencyPercentage);

      setEfficiencyData(result);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load efficiency data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-blue-600 dark:text-blue-400";
    if (pct >= 60) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return "bg-green-500";
    if (pct >= 80) return "bg-blue-500";
    if (pct >= 60) return "bg-amber-500";
    return "bg-red-500";
  };

  const exportCSV = () => {
    const headers = ["Operator", "Machine", "Runtime", "Actual Qty", "Rejection Qty", "Target Qty", "Efficiency %"];
    const rows = efficiencyData.map((d) => [
      d.operatorName,
      d.machineName,
      formatMinutes(d.totalRuntimeMinutes),
      d.totalActualQuantity,
      d.totalRejectionQuantity,
      d.totalTargetQuantity,
      d.efficiencyPercentage.toFixed(2),
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

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Operator Efficiency"
        description="Read-only analytics derived from Daily Production Logs"
      />

      {/* Controls */}
      <Card>
        <CardContent className="pt-6">
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
                      "w-[280px] justify-start text-left font-normal",
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

            <Button variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Users className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Operators</p>
                <p className="text-xl font-bold">{summary.totalOperators}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Target className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Machines</p>
                <p className="text-xl font-bold">{summary.totalMachines}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total Runtime</p>
                <p className="text-xl font-bold">{formatMinutes(summary.totalRuntime)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Actual</p>
                <p className="text-xl font-bold">{summary.totalActual.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <XCircle className="h-6 w-6 text-red-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Rejected</p>
                <p className="text-xl font-bold text-red-600 dark:text-red-400">
                  {summary.totalRejection.toLocaleString()}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Efficiency</p>
                <p className={cn("text-xl font-bold", getEfficiencyColor(summary.avgEfficiency))}>
                  {summary.avgEfficiency}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Efficiency Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Operator Performance - {dateRange.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : efficiencyData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No production logs found for this period.</p>
              <p className="text-sm">Data is derived from Daily Production Logs.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead className="text-right">Runtime</TableHead>
                    <TableHead className="text-right">Actual Qty</TableHead>
                    <TableHead className="text-right">Rejection Qty</TableHead>
                    <TableHead className="w-[200px]">Efficiency</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {efficiencyData.map((data, idx) => (
                    <TableRow key={`${data.operatorId}-${data.machineId}-${idx}`}>
                      <TableCell className="font-medium">{data.operatorName}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{data.machineName}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMinutes(data.totalRuntimeMinutes)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {data.totalActualQuantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {data.totalRejectionQuantity > 0 ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {data.totalRejectionQuantity.toLocaleString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className={cn("font-bold", getEfficiencyColor(data.efficiencyPercentage))}>
                              {data.efficiencyPercentage}%
                            </span>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "text-xs",
                                data.efficiencyPercentage >= 100
                                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                  : data.efficiencyPercentage >= 80
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                  : data.efficiencyPercentage >= 60
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                              )}
                            >
                              {data.logCount} log{data.logCount !== 1 ? "s" : ""}
                            </Badge>
                          </div>
                          <Progress
                            value={Math.min(data.efficiencyPercentage, 100)}
                            className="h-2"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
