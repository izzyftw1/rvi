import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { CalendarIcon, Users, TrendingUp, Clock, Target, XCircle, Download, Info, Filter, ChevronRight, Percent } from "lucide-react";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface OperatorEfficiencyData {
  operatorId: string;
  operatorName: string;
  machineId: string;
  machineName: string;
  totalRuntimeMinutes: number;
  totalActualQuantity: number;
  totalOkQuantity: number;
  totalRejectionQuantity: number;
  totalTargetQuantity: number;
  efficiencyPercentage: number;
  scrapPercentage: number;
  logCount: number;
  productionLogIds: string[];
}

interface ProductionLogDetail {
  id: string;
  log_date: string;
  shift: string;
  actual_runtime_minutes: number;
  actual_quantity: number;
  ok_quantity: number;
  total_rejection_quantity: number;
  target_quantity: number;
  efficiency_percentage: number;
  wo_id: string | null;
  work_order?: { display_id: string } | null;
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

type PeriodFilter = "daily" | "weekly" | "monthly";

function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

export default function OperatorEfficiency() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [efficiencyData, setEfficiencyData] = useState<OperatorEfficiencyData[]>([]);
  
  // Filters
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [processes, setProcesses] = useState<string[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<string>("all");
  
  // Drill-down
  const [selectedOperator, setSelectedOperator] = useState<OperatorEfficiencyData | null>(null);
  const [drillDownLogs, setDrillDownLogs] = useState<ProductionLogDetail[]>([]);
  const [loadingDrillDown, setLoadingDrillDown] = useState(false);

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
    const totalOk = efficiencyData.reduce((sum, d) => sum + d.totalOkQuantity, 0);
    const totalRejection = efficiencyData.reduce((sum, d) => sum + d.totalRejectionQuantity, 0);
    const avgEfficiency = efficiencyData.length > 0
      ? Math.round(efficiencyData.reduce((sum, d) => sum + d.efficiencyPercentage, 0) / efficiencyData.length)
      : 0;
    const avgScrap = totalActual > 0 ? Math.round((totalRejection / totalActual) * 100 * 10) / 10 : 0;
    return { totalOperators, totalMachines, totalRuntime, totalActual, totalOk, totalRejection, avgEfficiency, avgScrap };
  }, [efficiencyData]);

  // Load machines and processes for filters
  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadData();
  }, [dateRange, selectedMachine, selectedProcess]);

  const loadFilters = async () => {
    try {
      const [machinesRes, processesRes] = await Promise.all([
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
        supabase.from("operation_routes").select("process_name").not("process_name", "is", null)
      ]);
      
      if (machinesRes.data) setMachines(machinesRes.data);
      if (processesRes.data) {
        const uniqueProcesses = [...new Set(processesRes.data.map(r => r.process_name).filter(Boolean))] as string[];
        setProcesses(uniqueProcesses);
      }
    } catch (error) {
      console.error("Error loading filters:", error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      // Build query with filters
      let query = supabase
        .from("operator_production_ledger")
        .select(`
          id,
          production_log_id,
          operator_id,
          machine_id,
          runtime_minutes,
          actual_qty,
          ok_qty,
          rejection_qty,
          target_qty,
          efficiency_pct,
          operator:operator_id(full_name),
          machine:machine_id(name, machine_id)
        `)
        .gte("log_date", dateRange.start)
        .lte("log_date", dateRange.end);

      if (selectedMachine !== "all") {
        query = query.eq("machine_id", selectedMachine);
      }

      const { data: ledgerData, error } = await query;

      if (error) throw error;

      // If process filter is active, we need to filter by checking production logs
      let filteredData = ledgerData || [];
      
      if (selectedProcess !== "all" && filteredData.length > 0) {
        const logIds = [...new Set(filteredData.map(d => d.production_log_id))];
        const { data: logs } = await supabase
          .from("daily_production_logs")
          .select("id, operation_code")
          .in("id", logIds);
        
        const matchingLogIds = new Set(
          (logs || [])
            .filter(log => log.operation_code?.toLowerCase().includes(selectedProcess.toLowerCase()))
            .map(log => log.id)
        );
        
        filteredData = filteredData.filter(d => matchingLogIds.has(d.production_log_id));
      }

      // Aggregate data by operator
      const aggregatedMap = new Map<string, OperatorEfficiencyData>();

      filteredData.forEach((entry: any) => {
        if (!entry.operator_id) return;

        const key = entry.operator_id;
        const existing = aggregatedMap.get(key);

        if (existing) {
          existing.totalRuntimeMinutes += entry.runtime_minutes || 0;
          existing.totalActualQuantity += entry.actual_qty || 0;
          existing.totalOkQuantity += entry.ok_qty || 0;
          existing.totalRejectionQuantity += entry.rejection_qty || 0;
          existing.totalTargetQuantity += entry.target_qty || 0;
          existing.logCount++;
          existing.productionLogIds.push(entry.production_log_id);
          // Track all machines used
          if (entry.machine?.machine_id && !existing.machineName.includes(entry.machine.machine_id)) {
            existing.machineName += `, ${entry.machine.machine_id}`;
          }
        } else {
          aggregatedMap.set(key, {
            operatorId: entry.operator_id,
            operatorName: entry.operator?.full_name || "Unknown",
            machineId: entry.machine_id,
            machineName: entry.machine?.machine_id || "Unknown",
            totalRuntimeMinutes: entry.runtime_minutes || 0,
            totalActualQuantity: entry.actual_qty || 0,
            totalOkQuantity: entry.ok_qty || 0,
            totalRejectionQuantity: entry.rejection_qty || 0,
            totalTargetQuantity: entry.target_qty || 0,
            efficiencyPercentage: 0,
            scrapPercentage: 0,
            logCount: 1,
            productionLogIds: [entry.production_log_id],
          });
        }
      });

      // Calculate efficiency and scrap % for each aggregated entry
      const result = Array.from(aggregatedMap.values()).map((entry) => ({
        ...entry,
        efficiencyPercentage: entry.totalTargetQuantity > 0
          ? Math.round((entry.totalActualQuantity / entry.totalTargetQuantity) * 100 * 10) / 10
          : 0,
        scrapPercentage: entry.totalActualQuantity > 0
          ? Math.round((entry.totalRejectionQuantity / entry.totalActualQuantity) * 100 * 10) / 10
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

  // Drill-down to production logs
  const handleOperatorClick = async (operator: OperatorEfficiencyData) => {
    setSelectedOperator(operator);
    setLoadingDrillDown(true);
    
    try {
      const uniqueLogIds = [...new Set(operator.productionLogIds)];
      
      const { data, error } = await supabase
        .from("daily_production_logs")
        .select(`
          id,
          log_date,
          shift,
          actual_runtime_minutes,
          actual_quantity,
          ok_quantity,
          total_rejection_quantity,
          target_quantity,
          efficiency_percentage,
          wo_id,
          work_order:wo_id(display_id)
        `)
        .in("id", uniqueLogIds)
        .order("log_date", { ascending: false });
      
      if (error) throw error;
      setDrillDownLogs((data as ProductionLogDetail[]) || []);
    } catch (error) {
      console.error("Error loading drill-down:", error);
      toast({ title: "Error", description: "Failed to load production logs", variant: "destructive" });
    } finally {
      setLoadingDrillDown(false);
    }
  };

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
    const headers = ["Operator", "Machines", "Runtime", "Target Qty", "Actual Qty", "OK Qty", "Rejection Qty", "Efficiency %", "Scrap %"];
    const rows = efficiencyData.map((d) => [
      d.operatorName,
      d.machineName,
      formatMinutes(d.totalRuntimeMinutes),
      d.totalTargetQuantity,
      d.totalActualQuantity,
      d.totalOkQuantity,
      d.totalRejectionQuantity,
      d.efficiencyPercentage.toFixed(1),
      d.scrapPercentage.toFixed(1),
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
    setSelectedMachine("all");
    setSelectedProcess("all");
  };

  const hasActiveFilters = selectedMachine !== "all" || selectedProcess !== "all";

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Operator Efficiency"
        description="Analytics derived from Operator Production Ledger"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>All metrics are calculated from production log entries. Click an operator row to drill down.</span>
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

            <Button variant="outline" onClick={exportCSV}>
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
            <Select value={selectedMachine} onValueChange={setSelectedMachine}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Machines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Machines</SelectItem>
                {machines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>{m.machine_id} - {m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Process Filter */}
            <Select value={selectedProcess} onValueChange={setSelectedProcess}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Processes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Processes</SelectItem>
                {processes.map((p) => (
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <Users className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Operators</p>
              <p className="text-lg font-bold">{summary.totalOperators}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <Target className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Machines</p>
              <p className="text-lg font-bold">{summary.totalMachines}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <Clock className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Runtime</p>
              <p className="text-lg font-bold">{formatMinutes(summary.totalRuntime)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <Target className="h-5 w-5 mx-auto text-blue-500 mb-1" />
              <p className="text-xs text-muted-foreground">Target</p>
              <p className="text-lg font-bold">{summary.totalActual > 0 ? Math.round(summary.totalActual / (summary.avgEfficiency / 100)).toLocaleString() : 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-green-500 mb-1" />
              <p className="text-xs text-muted-foreground">Actual</p>
              <p className="text-lg font-bold">{summary.totalActual.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <XCircle className="h-5 w-5 mx-auto text-red-500 mb-1" />
              <p className="text-xs text-muted-foreground">Rejected</p>
              <p className="text-lg font-bold text-red-600">{summary.totalRejection.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <TrendingUp className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Efficiency</p>
              <p className={cn("text-lg font-bold", getEfficiencyColor(summary.avgEfficiency))}>
                {summary.avgEfficiency}%
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="text-center">
              <Percent className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
              <p className="text-xs text-muted-foreground">Scrap</p>
              <p className={cn("text-lg font-bold", getScrapColor(summary.avgScrap))}>
                {summary.avgScrap}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Efficiency Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5" />
            Operator Performance - {dateRange.label}
            {hasActiveFilters && (
              <Badge variant="secondary" className="text-xs">Filtered</Badge>
            )}
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
              <p className="text-sm">Data is derived from Production Logs via the Operator Ledger.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Operator</TableHead>
                    <TableHead>Machine(s)</TableHead>
                    <TableHead className="text-right">Runtime</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Efficiency</TableHead>
                    <TableHead className="text-right">Scrap %</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {efficiencyData.map((data, idx) => (
                    <TableRow 
                      key={`${data.operatorId}-${idx}`}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleOperatorClick(data)}
                    >
                      <TableCell className="font-medium">{data.operatorName}</TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{data.machineName}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatMinutes(data.totalRuntimeMinutes)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {data.totalTargetQuantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {data.totalActualQuantity.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <span className={cn("font-bold", getEfficiencyColor(data.efficiencyPercentage))}>
                            {data.efficiencyPercentage}%
                          </span>
                          <Progress 
                            value={Math.min(data.efficiencyPercentage, 120)} 
                            className="w-16 h-2"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={cn("font-medium", getScrapColor(data.scrapPercentage))}>
                          {data.scrapPercentage}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Drill-down Sheet */}
      <Sheet open={!!selectedOperator} onOpenChange={() => setSelectedOperator(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              {selectedOperator?.operatorName}
            </SheetTitle>
            <SheetDescription>
              Production logs for {dateRange.label}
            </SheetDescription>
          </SheetHeader>

          {selectedOperator && (
            <div className="mt-6 space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xs text-muted-foreground">Runtime</p>
                  <p className="font-bold">{formatMinutes(selectedOperator.totalRuntimeMinutes)}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xs text-muted-foreground">Efficiency</p>
                  <p className={cn("font-bold", getEfficiencyColor(selectedOperator.efficiencyPercentage))}>
                    {selectedOperator.efficiencyPercentage}%
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted text-center">
                  <p className="text-xs text-muted-foreground">Scrap</p>
                  <p className={cn("font-bold", getScrapColor(selectedOperator.scrapPercentage))}>
                    {selectedOperator.scrapPercentage}%
                  </p>
                </div>
              </div>

              {/* Logs List */}
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Production Logs ({drillDownLogs.length})</h4>
                
                {loadingDrillDown ? (
                  <div className="space-y-2">
                    {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                  </div>
                ) : drillDownLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No logs found</p>
                ) : (
                  <div className="space-y-2">
                    {drillDownLogs.map((log) => (
                      <div 
                        key={log.id}
                        className="p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => log.wo_id && navigate(`/work-orders/${log.wo_id}`)}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {format(new Date(log.log_date), "MMM d")}
                            </Badge>
                            <Badge variant="secondary" className="text-xs capitalize">
                              {log.shift}
                            </Badge>
                          </div>
                          {log.work_order?.display_id && (
                            <span className="text-xs text-primary font-medium">
                              {log.work_order.display_id}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs">
                          <div>
                            <span className="text-muted-foreground">Runtime: </span>
                            <span className="font-medium">{log.actual_runtime_minutes}m</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Actual: </span>
                            <span className="font-medium">{log.actual_quantity}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">OK: </span>
                            <span className="font-medium text-green-600">{log.ok_quantity}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Eff: </span>
                            <span className={cn("font-medium", getEfficiencyColor(log.efficiency_percentage || 0))}>
                              {log.efficiency_percentage}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
