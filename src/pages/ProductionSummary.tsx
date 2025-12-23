/**
 * Production Summary Dashboard
 * 
 * READ-ONLY decision dashboard consuming metrics from the shared useProductionLogMetrics hook.
 * NO local calculations - all metrics derived from production logs.
 * 
 * Displays: Output vs Target, Scrap %, Operator Efficiency, Machine Utilization, External Delays
 * Filters: Date, Process, Customer
 */

import { useState, useMemo } from "react";
import { format, subDays } from "date-fns";
import { CalendarIcon, Target, TrendingUp, Users, Cpu, Truck, AlertTriangle, Filter, BarChart3, Info } from "lucide-react";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Helper to format minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export default function ProductionSummary() {
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const [selectedProcess, setSelectedProcess] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState<string>("all");

  // Single source of truth: useProductionLogMetrics
  const { metrics, loading, error } = useProductionLogMetrics({
    startDate: format(selectedDate, "yyyy-MM-dd"),
    endDate: format(selectedDate, "yyyy-MM-dd"),
    period: "custom",
    processFilter: selectedProcess,
    customerFilter: selectedCustomer,
  });

  // Derived values from shared hook
  const outputSummary = useMemo(() => {
    if (!metrics) return { totalActual: 0, totalTarget: 0, totalOk: 0, totalRejected: 0, achievementPct: 0 };
    const achievementPct = metrics.totalTarget > 0 
      ? Math.round((metrics.totalOutput / metrics.totalTarget) * 100) 
      : 0;
    return {
      totalActual: metrics.totalOutput,
      totalTarget: metrics.totalTarget,
      totalOk: metrics.totalOutput - metrics.totalRejections,
      totalRejected: metrics.totalRejections,
      achievementPct,
    };
  }, [metrics]);

  const scrapSummary = useMemo(() => {
    if (!metrics) return { totalRejected: 0, scrapPct: 0, okPct: 100, totalProduced: 0 };
    const totalProduced = metrics.totalOutput + metrics.totalRejections;
    const scrapPct = totalProduced > 0 
      ? Math.round((metrics.totalRejections / totalProduced) * 100 * 100) / 100 
      : 0;
    return {
      totalRejected: metrics.totalRejections,
      scrapPct,
      okPct: 100 - scrapPct,
      totalProduced,
    };
  }, [metrics]);

  const avgOperatorEfficiency = useMemo(() => {
    if (!metrics || metrics.operatorMetrics.length === 0) return 0;
    return Math.round(
      metrics.operatorMetrics.reduce((sum, op) => sum + op.efficiencyPercent, 0) / metrics.operatorMetrics.length
    );
  }, [metrics]);

  const avgMachineUtilization = useMemo(() => {
    if (!metrics || metrics.machineMetrics.length === 0) return 0;
    return Math.round(
      metrics.machineMetrics.reduce((sum, m) => sum + m.utilizationPercent, 0) / metrics.machineMetrics.length
    );
  }, [metrics]);

  const getEfficiencyColor = (pct: number) => {
    if (pct >= 100) return "text-green-600 dark:text-green-400";
    if (pct >= 80) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  if (error) {
    return (
      <div className="p-6">
        <PageHeader title="Production Summary" description="Error loading data" />
        <Card className="mt-4">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Production Summary"
        description="Read-only decision dashboard: Output, Scrap, Efficiency, Utilization, External Delays"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>All metrics derived from Production Log entries via shared calculation engine. No local overrides.</span>
      </div>

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
                {metrics?.availableProcesses.map(p => (
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
                {metrics?.availableCustomers.map(c => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Log count */}
            <Badge variant="secondary" className="ml-auto">
              {metrics?.logCount || 0} log entries
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Formula explanation */}
      <Card className="bg-muted/30 border-dashed">
        <CardContent className="py-3">
          <p className="text-xs font-mono text-muted-foreground">
            <span className="font-semibold text-foreground">Efficiency %</span> = (Actual ÷ Target) × 100 | 
            <span className="font-semibold text-foreground ml-2">Scrap %</span> = (Rejected ÷ Produced) × 100 | 
            <span className="font-semibold text-foreground ml-2">Utilisation %</span> = (Runtime ÷ Expected) × 100
          </p>
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
                  Avg of {metrics?.operatorMetrics.length || 0} operators
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
                  Avg of {metrics?.machineMetrics.length || 0} machines
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
                  External Delays
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  <span className={metrics?.externalDelays.overdueCount ? "text-red-600" : "text-green-600"}>
                    {metrics?.externalDelays.overdueCount || 0}
                  </span>
                  <span className="text-sm font-normal text-muted-foreground ml-1">overdue</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {metrics?.externalDelays.pendingCount || 0} pending returns
                </p>
                <div className="text-xs mt-2">
                  <span className="text-muted-foreground">Sent: </span>
                  <span className="font-medium">{(metrics?.externalDelays.totalSent || 0).toLocaleString()}</span>
                  <span className="text-muted-foreground ml-2">Returned: </span>
                  <span className="font-medium">{(metrics?.externalDelays.totalReturned || 0).toLocaleString()}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detail Tables */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Operator Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Operator Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics?.operatorMetrics.length === 0 ? (
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
                      {metrics?.operatorMetrics.slice(0, 10).map((op) => (
                        <TableRow key={op.operatorId}>
                          <TableCell className="font-medium">{op.operatorName}</TableCell>
                          <TableCell className="text-right">{op.totalActual.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{op.totalTarget.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn("font-bold", getEfficiencyColor(op.efficiencyPercent))}>
                              {op.efficiencyPercent}%
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
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Machine Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                {metrics?.machineMetrics.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No machine data</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead className="text-right">Runtime</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Utilization</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics?.machineMetrics.slice(0, 10).map((m) => (
                        <TableRow key={m.machineId}>
                          <TableCell className="font-medium">{m.machineName}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatMinutes(m.totalRuntime)}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{formatMinutes(m.expectedRuntime)}</TableCell>
                          <TableCell className="text-right">
                            <span className={cn("font-bold", getEfficiencyColor(m.utilizationPercent))}>
                              {m.utilizationPercent}%
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
        </>
      )}
    </div>
  );
}
