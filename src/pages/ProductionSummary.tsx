import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { CalendarIcon, Target, TrendingUp, Users, Cpu, Truck, AlertTriangle, Filter, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ProductionLog {
  id: string;
  machine_id: string;
  wo_id: string | null;
  actual_quantity: number;
  target_quantity: number | null;
  ok_quantity: number | null;
  total_rejection_quantity: number | null;
  actual_runtime_minutes: number;
  efficiency_percentage: number | null;
  party_code: string | null;
  operation_code: string | null;
  machines: { name: string; machine_id: string } | null;
  work_orders: { display_id: string; customer: string | null } | null;
  operator: { full_name: string } | null;
}

interface ExternalMove {
  id: string;
  work_order_id: string;
  process: string;
  status: string;
  dispatch_date: string;
  expected_return_date: string | null;
  returned_date: string | null;
  quantity_sent: number;
  quantity_returned: number | null;
  work_orders: { display_id: string; customer: string | null } | null;
  partner: { name: string } | null;
}

interface OperatorSummary {
  operatorId: string;
  operatorName: string;
  totalActual: number;
  totalTarget: number;
  efficiencyPct: number;
}

interface MachineSummary {
  machineId: string;
  machineName: string;
  machineCode: string;
  totalRuntime: number;
  expectedRuntime: number;
  utilizationPct: number;
}

// Helper to format minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Default shift duration
const DEFAULT_SHIFT_MINUTES = 690;

export default function ProductionSummary() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const [selectedProcess, setSelectedProcess] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");
  
  const [productionLogs, setProductionLogs] = useState<ProductionLog[]>([]);
  const [externalMoves, setExternalMoves] = useState<ExternalMove[]>([]);
  const [customers, setCustomers] = useState<string[]>([]);
  const [processes, setProcesses] = useState<string[]>([]);

  // Filter production logs
  const filteredLogs = useMemo(() => {
    return productionLogs.filter(log => {
      if (selectedProcess !== "all" && log.operation_code !== selectedProcess) return false;
      if (selectedCustomer !== "all" && log.party_code !== selectedCustomer) return false;
      return true;
    });
  }, [productionLogs, selectedProcess, selectedCustomer]);

  // Filter external moves
  const filteredExternal = useMemo(() => {
    return externalMoves.filter(move => {
      if (selectedCustomer !== "all" && move.work_orders?.customer !== selectedCustomer) return false;
      if (selectedProcess !== "all" && move.process !== selectedProcess) return false;
      return true;
    });
  }, [externalMoves, selectedProcess, selectedCustomer]);

  // Calculate Output vs Target summary
  const outputSummary = useMemo(() => {
    const totalActual = filteredLogs.reduce((sum, log) => sum + (log.actual_quantity || 0), 0);
    const totalTarget = filteredLogs.reduce((sum, log) => sum + (log.target_quantity || 0), 0);
    const totalOk = filteredLogs.reduce((sum, log) => sum + (log.ok_quantity || 0), 0);
    const totalRejected = filteredLogs.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0);
    const achievementPct = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    
    return { totalActual, totalTarget, totalOk, totalRejected, achievementPct };
  }, [filteredLogs]);

  // Calculate Scrap %
  const scrapSummary = useMemo(() => {
    const totalProduced = outputSummary.totalActual;
    const totalRejected = outputSummary.totalRejected;
    const scrapPct = totalProduced > 0 ? Math.round((totalRejected / totalProduced) * 100 * 100) / 100 : 0;
    const okPct = 100 - scrapPct;
    
    return { totalRejected, scrapPct, okPct, totalProduced };
  }, [outputSummary]);

  // Calculate Operator Efficiency
  const operatorSummary = useMemo<OperatorSummary[]>(() => {
    const operatorMap = new Map<string, { name: string; actual: number; target: number }>();
    
    filteredLogs.forEach(log => {
      if (!log.operator) return;
      const existing = operatorMap.get(log.operator.full_name) || { name: log.operator.full_name, actual: 0, target: 0 };
      existing.actual += log.actual_quantity || 0;
      existing.target += log.target_quantity || 0;
      operatorMap.set(log.operator.full_name, existing);
    });

    return Array.from(operatorMap.entries()).map(([name, data]) => ({
      operatorId: name,
      operatorName: data.name,
      totalActual: data.actual,
      totalTarget: data.target,
      efficiencyPct: data.target > 0 ? Math.round((data.actual / data.target) * 100) : 0,
    })).sort((a, b) => b.efficiencyPct - a.efficiencyPct);
  }, [filteredLogs]);

  // Calculate Machine Utilization
  const machineSummary = useMemo<MachineSummary[]>(() => {
    const machineMap = new Map<string, { name: string; code: string; runtime: number; count: number }>();
    
    filteredLogs.forEach(log => {
      if (!log.machines) return;
      const key = log.machines.machine_id;
      const existing = machineMap.get(key) || { name: log.machines.name, code: log.machines.machine_id, runtime: 0, count: 0 };
      existing.runtime += log.actual_runtime_minutes || 0;
      existing.count += 1;
      machineMap.set(key, existing);
    });

    return Array.from(machineMap.entries()).map(([code, data]) => ({
      machineId: code,
      machineName: data.name,
      machineCode: data.code,
      totalRuntime: data.runtime,
      expectedRuntime: DEFAULT_SHIFT_MINUTES * data.count, // Expected based on shifts logged
      utilizationPct: data.count > 0 ? Math.round((data.runtime / (DEFAULT_SHIFT_MINUTES * data.count)) * 100) : 0,
    })).sort((a, b) => b.utilizationPct - a.utilizationPct);
  }, [filteredLogs]);

  // Calculate External Delays
  const externalDelaySummary = useMemo(() => {
    const today = new Date();
    const overdue = filteredExternal.filter(move => {
      if (move.status === 'returned') return false;
      if (!move.expected_return_date) return false;
      return new Date(move.expected_return_date) < today;
    });
    
    const pending = filteredExternal.filter(move => move.status === 'sent');
    const totalSent = filteredExternal.reduce((sum, m) => sum + (m.quantity_sent || 0), 0);
    const totalReturned = filteredExternal.reduce((sum, m) => sum + (m.quantity_returned || 0), 0);
    
    return { 
      overdueCount: overdue.length, 
      pendingCount: pending.length, 
      overdueItems: overdue,
      totalSent,
      totalReturned,
    };
  }, [filteredExternal]);

  // Overall averages
  const avgOperatorEfficiency = useMemo(() => {
    if (operatorSummary.length === 0) return 0;
    return Math.round(operatorSummary.reduce((sum, op) => sum + op.efficiencyPct, 0) / operatorSummary.length);
  }, [operatorSummary]);

  const avgMachineUtilization = useMemo(() => {
    if (machineSummary.length === 0) return 0;
    return Math.round(machineSummary.reduce((sum, m) => sum + m.utilizationPct, 0) / machineSummary.length);
  }, [machineSummary]);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = format(selectedDate, "yyyy-MM-dd");

      // Load production logs
      const { data: logsData, error: logsError } = await supabase
        .from("daily_production_logs")
        .select(`
          id,
          machine_id,
          wo_id,
          actual_quantity,
          target_quantity,
          ok_quantity,
          total_rejection_quantity,
          actual_runtime_minutes,
          efficiency_percentage,
          party_code,
          operation_code,
          machines:machine_id(name, machine_id),
          work_orders:wo_id(display_id, customer),
          operator:operator_id(full_name)
        `)
        .eq("log_date", dateStr);

      if (logsError) throw logsError;
      setProductionLogs((logsData as unknown as ProductionLog[]) || []);

      // Extract unique customers and processes
      const uniqueCustomers = [...new Set(logsData?.map(l => l.party_code).filter(Boolean) || [])];
      const uniqueProcesses = [...new Set(logsData?.map(l => l.operation_code).filter(Boolean) || [])];
      setCustomers(uniqueCustomers as string[]);
      setProcesses(uniqueProcesses as string[]);

      // Load external moves active on this date
      const { data: externalData, error: externalError } = await supabase
        .from("wo_external_moves")
        .select(`
          id,
          work_order_id,
          process,
          status,
          dispatch_date,
          expected_return_date,
          returned_date,
          quantity_sent,
          quantity_returned,
          work_orders:work_order_id(display_id, customer),
          partner:partner_id(name)
        `)
        .or(`dispatch_date.eq.${dateStr},and(dispatch_date.lte.${dateStr},or(returned_date.is.null,returned_date.gte.${dateStr}))`);

      if (externalError) throw externalError;
      setExternalMoves((externalData as unknown as ExternalMove[]) || []);

    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load production summary",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 100) return "bg-green-500";
    if (pct >= 80) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Production Summary"
        description="Read-only decision dashboard: Output, Scrap, Efficiency, Utilization, External Delays"
      />

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filters:</span>
            </div>

            {/* Date Picker */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className={cn("w-[200px] justify-start text-left font-normal")}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(selectedDate, "PPP")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => date && setSelectedDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {/* Process Filter */}
            <Select value={selectedProcess} onValueChange={setSelectedProcess}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Processes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Processes</SelectItem>
                {processes.map(p => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Customer Filter */}
            <Select value={selectedCustomer} onValueChange={setSelectedCustomer}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Customers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Customers</SelectItem>
                {customers.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Log count */}
            <Badge variant="secondary" className="ml-auto">
              {filteredLogs.length} log entries
            </Badge>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {/* Output vs Target */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Output vs Target
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getEfficiencyColor(outputSummary.achievementPct)}>
                    {outputSummary.achievementPct}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {outputSummary.totalActual.toLocaleString()} / {outputSummary.totalTarget.toLocaleString()}
                </p>
                <Progress value={Math.min(outputSummary.achievementPct, 100)} className="h-2 mt-2" />
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  = (Actual ÷ Target) × 100
                </p>
              </CardContent>
            </Card>

            {/* Scrap % */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500" />
                  Scrap Rate
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={scrapSummary.scrapPct > 5 ? "text-red-600" : scrapSummary.scrapPct > 2 ? "text-amber-600" : "text-green-600"}>
                    {scrapSummary.scrapPct}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {scrapSummary.totalRejected.toLocaleString()} rejected / {scrapSummary.totalProduced.toLocaleString()}
                </p>
                <div className="flex gap-1 mt-2">
                  <div className="h-2 bg-green-500 rounded" style={{ width: `${scrapSummary.okPct}%` }} />
                  <div className="h-2 bg-red-500 rounded" style={{ width: `${scrapSummary.scrapPct}%` }} />
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  = (Rejected ÷ Produced) × 100
                </p>
              </CardContent>
            </Card>

            {/* Operator Efficiency */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Operator Efficiency
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getEfficiencyColor(avgOperatorEfficiency)}>
                    {avgOperatorEfficiency}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg of {operatorSummary.length} operators
                </p>
                <Progress value={Math.min(avgOperatorEfficiency, 100)} className="h-2 mt-2" />
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  = Σ(Actual ÷ Target) / Operators
                </p>
              </CardContent>
            </Card>

            {/* Machine Utilization */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Machine Utilization
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={getEfficiencyColor(avgMachineUtilization)}>
                    {avgMachineUtilization}%
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Avg of {machineSummary.length} machines
                </p>
                <Progress value={Math.min(avgMachineUtilization, 100)} className="h-2 mt-2" />
                <p className="text-[10px] font-mono text-muted-foreground mt-1">
                  = (Runtime ÷ Expected) × 100
                </p>
              </CardContent>
            </Card>

            {/* External Delays */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Truck className="h-4 w-4" />
                  External Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={externalDelaySummary.overdueCount > 0 ? "text-red-600" : "text-green-600"}>
                    {externalDelaySummary.overdueCount}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground ml-1">overdue</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {externalDelaySummary.pendingCount} pending | {externalDelaySummary.totalSent.toLocaleString()} sent
                </p>
                <div className="flex gap-2 mt-2">
                  {externalDelaySummary.overdueCount > 0 && (
                    <Badge variant="destructive" className="text-xs">Action Required</Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detail Tables */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Operator Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Operator Performance
                </CardTitle>
                <CardDescription>Efficiency = (Actual ÷ Target) × 100</CardDescription>
              </CardHeader>
              <CardContent>
                {operatorSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No operator data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Operator</TableHead>
                        <TableHead className="text-right">Actual</TableHead>
                        <TableHead className="text-right">Target</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {operatorSummary.slice(0, 10).map((op) => (
                        <TableRow key={op.operatorId}>
                          <TableCell className="font-medium">{op.operatorName}</TableCell>
                          <TableCell className="text-right">{op.totalActual.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{op.totalTarget.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn("font-bold", getEfficiencyColor(op.efficiencyPct))}>
                              {op.efficiencyPct}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Machine Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Machine Utilization
                </CardTitle>
                <CardDescription>Utilization = (Runtime ÷ Expected) × 100</CardDescription>
              </CardHeader>
              <CardContent>
                {machineSummary.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No machine data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead className="text-right">Runtime</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Util %</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {machineSummary.slice(0, 10).map((m) => (
                        <TableRow key={m.machineId}>
                          <TableCell>
                            <span className="font-mono text-sm">{m.machineCode}</span>
                          </TableCell>
                          <TableCell className="text-right">{formatMinutes(m.totalRuntime)}</TableCell>
                          <TableCell className="text-right">{formatMinutes(m.expectedRuntime)}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn("font-bold", getEfficiencyColor(m.utilizationPct))}>
                              {m.utilizationPct}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          {/* External Delays Detail */}
          {externalDelaySummary.overdueCount > 0 && (
            <Card className="border-red-200 dark:border-red-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Overdue External Returns
                </CardTitle>
                <CardDescription>Items past expected return date - immediate follow-up required</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Order</TableHead>
                      <TableHead>Process</TableHead>
                      <TableHead>Partner</TableHead>
                      <TableHead className="text-right">Qty Sent</TableHead>
                      <TableHead>Expected</TableHead>
                      <TableHead>Days Overdue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {externalDelaySummary.overdueItems.map((move) => {
                      const daysOverdue = move.expected_return_date
                        ? Math.floor((new Date().getTime() - new Date(move.expected_return_date).getTime()) / (1000 * 60 * 60 * 24))
                        : 0;
                      return (
                        <TableRow key={move.id} className="bg-red-50 dark:bg-red-950/20">
                          <TableCell className="font-mono">{move.work_orders?.display_id || "-"}</TableCell>
                          <TableCell>{move.process}</TableCell>
                          <TableCell>{move.partner?.name || "-"}</TableCell>
                          <TableCell className="text-right">{move.quantity_sent?.toLocaleString()}</TableCell>
                          <TableCell>{move.expected_return_date ? format(new Date(move.expected_return_date), "dd MMM") : "-"}</TableCell>
                          <TableCell>
                            <Badge variant="destructive">{daysOverdue}d overdue</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
