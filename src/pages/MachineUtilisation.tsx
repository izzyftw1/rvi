/**
 * Machine Utilisation Analytics Page
 * 
 * HISTORICAL ANALYTICS ONLY - No real-time states.
 * All data derived from Production Logs via useProductionLogMetrics.
 * 
 * Views:
 * - Daily / Weekly / Monthly utilisation trends
 * - Downtime breakdown by reason (Pareto)
 * - Scrap contribution by machine
 */

import { useState, useMemo } from "react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths } from "date-fns";
import { CalendarIcon, Activity, Clock, AlertTriangle, Trash2, BarChart3, TrendingUp, Info } from "lucide-react";
import { useProductionLogMetrics } from "@/hooks/useProductionLogMetrics";
import { CATEGORY_COLORS, getCategoryForReason, DOWNTIME_CATEGORIES, type DowntimeCategory } from "@/config/downtimeConfig";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
} from "recharts";

type PeriodType = "daily" | "weekly" | "monthly";

// Helper to format minutes as hours:minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hours}h ${mins}m`;
}

export default function MachineUtilisation() {
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [selectedDate, setSelectedDate] = useState<Date>(subDays(new Date(), 1));
  const [machineFilter, setMachineFilter] = useState<string>("all");

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    switch (period) {
      case "daily":
        // Last 7 days
        return {
          start: format(subDays(selectedDate, 6), "yyyy-MM-dd"),
          end: format(selectedDate, "yyyy-MM-dd"),
        };
      case "weekly":
        // Last 4 weeks
        return {
          start: format(subWeeks(startOfWeek(selectedDate, { weekStartsOn: 1 }), 3), "yyyy-MM-dd"),
          end: format(endOfWeek(selectedDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "monthly":
        // Last 3 months
        return {
          start: format(subMonths(startOfMonth(selectedDate), 2), "yyyy-MM-dd"),
          end: format(endOfMonth(selectedDate), "yyyy-MM-dd"),
        };
    }
  }, [period, selectedDate]);

  // Single source of truth: useProductionLogMetrics
  const { metrics, loading } = useProductionLogMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
    period: "custom",
    machineId: machineFilter !== "all" ? machineFilter : undefined,
  });

  // Available machines for filter dropdown
  const availableMachines = useMemo(() => {
    if (!metrics) return [];
    return metrics.machineMetrics.map((m) => ({
      id: m.machineId,
      name: m.machineName,
    }));
  }, [metrics]);

  // Aggregate downtime by category for Pareto
  const downtimeByCategory = useMemo(() => {
    if (!metrics?.downtimePareto) return [];
    
    const categoryTotals = new Map<DowntimeCategory, number>();
    
    metrics.downtimePareto.forEach((d) => {
      const category = getCategoryForReason(d.reason);
      categoryTotals.set(category, (categoryTotals.get(category) || 0) + d.minutes);
    });

    return DOWNTIME_CATEGORIES
      .map((cat) => ({
        category: cat,
        minutes: categoryTotals.get(cat) || 0,
        hours: Math.round((categoryTotals.get(cat) || 0) / 60 * 10) / 10,
        color: CATEGORY_COLORS[cat],
      }))
      .filter((c) => c.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [metrics]);

  // Scrap contribution by machine
  const scrapByMachine = useMemo(() => {
    if (!metrics?.machineMetrics) return [];
    
    return metrics.machineMetrics
      .filter((m) => m.totalRejections > 0)
      .map((m) => ({
        name: m.machineName.split(' - ')[0], // Short name
        fullName: m.machineName,
        scrap: m.totalRejections,
        output: m.totalOutput,
        scrapPercent: m.totalOutput + m.totalRejections > 0
          ? Math.round((m.totalRejections / (m.totalOutput + m.totalRejections)) * 100 * 10) / 10
          : 0,
      }))
      .sort((a, b) => b.scrap - a.scrap);
  }, [metrics]);

  // Utilisation trend data
  const utilisationTrend = useMemo(() => {
    if (!metrics?.dailyMetrics) return [];
    
    return metrics.dailyMetrics.map((d) => {
      const expectedRuntime = 690; // Default shift minutes per day
      const utilizationPct = expectedRuntime > 0 
        ? Math.round((d.totalRuntimeMinutes / expectedRuntime) * 100)
        : 0;
      
      return {
        date: format(new Date(d.date), "MMM dd"),
        fullDate: d.date,
        runtime: Math.round(d.totalRuntimeMinutes),
        downtime: Math.round(d.totalDowntimeMinutes),
        utilization: Math.min(utilizationPct, 100),
        efficiency: Math.round(d.avgEfficiency),
      };
    });
  }, [metrics]);

  // Machine utilisation breakdown
  const machineUtilisation = useMemo(() => {
    if (!metrics?.machineMetrics) return [];
    
    return metrics.machineMetrics
      .map((m) => ({
        name: m.machineName.split(' - ')[0],
        fullName: m.machineName,
        runtime: m.totalRuntime,
        expected: m.expectedRuntime,
        utilization: m.utilizationPercent,
        downtime: m.totalDowntime,
        efficiency: m.avgEfficiency,
      }))
      .sort((a, b) => b.utilization - a.utilization);
  }, [metrics]);

  const getUtilisationColor = (pct: number) => {
    if (pct >= 85) return "text-green-600 dark:text-green-400";
    if (pct >= 70) return "text-blue-600 dark:text-blue-400";
    if (pct >= 50) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getProgressColor = (pct: number) => {
    if (pct >= 85) return "bg-green-500";
    if (pct >= 70) return "bg-blue-500";
    if (pct >= 50) return "bg-amber-500";
    return "bg-red-500";
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Machine Utilisation Analytics"
        description="Historical analysis of machine utilisation, downtime, and scrap contribution"
      />

      {/* Read-only notice */}
      <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Info className="h-4 w-4 shrink-0" />
        <span>
          All metrics derived from Production Log entries. This is a historical analytics view — no real-time states displayed.
        </span>
      </div>

      {/* Period Controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-wrap gap-4 items-center">
              {/* Period Tabs */}
              <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>

              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[180px] justify-start text-left font-normal")}>
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(selectedDate, "PPP")}
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

              {/* Machine Filter */}
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  {availableMachines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name.split(' - ')[0]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Badge variant="secondary" className="text-xs">
              {dateRange.start} → {dateRange.end}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Avg Utilisation</p>
                <p className={cn("text-2xl font-bold", getUtilisationColor(metrics?.utilizationPercent || 0))}>
                  {loading ? "—" : `${Math.round(metrics?.utilizationPercent || 0)}%`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Total Runtime</p>
                <p className="text-2xl font-bold">
                  {loading ? "—" : formatMinutes(metrics?.totalRuntimeMinutes || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Downtime</p>
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {loading ? "—" : formatMinutes(metrics?.totalDowntimeMinutes || 0)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <Trash2 className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-sm text-muted-foreground">Total Scrap</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {loading ? "—" : `${metrics?.totalRejections?.toLocaleString() || 0} pcs`}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-[300px] w-full" />
          <div className="grid md:grid-cols-2 gap-4">
            <Skeleton className="h-[300px]" />
            <Skeleton className="h-[300px]" />
          </div>
        </div>
      ) : (
        <>
          {/* Utilisation Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Utilisation Trend ({period === "daily" ? "Last 7 Days" : period === "weekly" ? "Last 4 Weeks" : "Last 3 Months"})
              </CardTitle>
              <CardDescription>
                Runtime vs downtime and utilisation percentage over time
              </CardDescription>
            </CardHeader>
            <CardContent>
              {utilisationTrend.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data available for the selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={utilisationTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" className="text-xs" />
                    <YAxis yAxisId="left" className="text-xs" />
                    <YAxis yAxisId="right" orientation="right" domain={[0, 100]} className="text-xs" />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                      labelStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Legend />
                    <Bar yAxisId="left" dataKey="runtime" name="Runtime (min)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    <Bar yAxisId="left" dataKey="downtime" name="Downtime (min)" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="utilization" name="Utilisation %" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Two Column Layout: Downtime Pareto & Scrap by Machine */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Downtime Breakdown by Category */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Downtime by Category (Pareto)
                </CardTitle>
                <CardDescription>
                  Total downtime grouped by reason category
                </CardDescription>
              </CardHeader>
              <CardContent>
                {downtimeByCategory.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No downtime recorded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={downtimeByCategory} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="category" type="category" width={80} className="text-xs" />
                      <Tooltip 
                        formatter={(value: number) => [`${formatMinutes(value * 60)}`, 'Duration']}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="hours" name="Hours" radius={[0, 4, 4, 0]}>
                        {downtimeByCategory.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* Category Legend */}
                <div className="flex flex-wrap gap-2 mt-4">
                  {downtimeByCategory.slice(0, 5).map((cat) => (
                    <Badge key={cat.category} variant="secondary" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                      {cat.category}: {cat.hours}h
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Scrap Contribution by Machine */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trash2 className="h-5 w-5" />
                  Scrap by Machine
                </CardTitle>
                <CardDescription>
                  Rejection contribution from each machine
                </CardDescription>
              </CardHeader>
              <CardContent>
                {scrapByMachine.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No scrap recorded
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={scrapByMachine.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" className="text-xs" />
                      <YAxis dataKey="name" type="category" width={60} className="text-xs" />
                      <Tooltip 
                        formatter={(value: number, name: string) => [
                          name === 'scrap' ? `${value} pcs` : `${value}%`,
                          name === 'scrap' ? 'Scrap Qty' : 'Scrap %'
                        ]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Bar dataKey="scrap" name="Scrap Qty" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Machine Utilisation Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Machine Utilisation Breakdown
              </CardTitle>
              <CardDescription>
                Detailed utilisation metrics per machine for the selected period
              </CardDescription>
            </CardHeader>
            <CardContent>
              {machineUtilisation.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No machine data for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Machine</TableHead>
                        <TableHead className="text-right">Expected</TableHead>
                        <TableHead className="text-right">Runtime</TableHead>
                        <TableHead className="text-right">Downtime</TableHead>
                        <TableHead className="w-[200px]">Utilisation</TableHead>
                        <TableHead className="text-right">Efficiency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {machineUtilisation.map((machine) => (
                        <TableRow key={machine.fullName}>
                          <TableCell>
                            <span className="font-mono text-sm font-medium">
                              {machine.name}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatMinutes(machine.expected)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            {formatMinutes(machine.runtime)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm text-amber-600 dark:text-amber-400">
                            {formatMinutes(machine.downtime)}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-sm">
                                <span className={cn("font-bold", getUtilisationColor(machine.utilization))}>
                                  {Math.round(machine.utilization)}%
                                </span>
                              </div>
                              <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                <div 
                                  className={cn("h-full transition-all", getProgressColor(machine.utilization))}
                                  style={{ width: `${Math.min(machine.utilization, 100)}%` }}
                                />
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant={machine.efficiency >= 80 ? "secondary" : "outline"}>
                              {Math.round(machine.efficiency)}%
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

          {/* Downtime Details Table */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                Downtime Breakdown by Reason
              </CardTitle>
              <CardDescription>
                Individual downtime reasons sorted by duration
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(!metrics?.downtimePareto || metrics.downtimePareto.length === 0) ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No downtime events recorded.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reason</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Duration</TableHead>
                        <TableHead className="w-[200px]">% of Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {metrics.downtimePareto.slice(0, 15).map((dt) => {
                        const category = getCategoryForReason(dt.reason);
                        return (
                          <TableRow key={dt.reason}>
                            <TableCell className="font-medium">{dt.reason}</TableCell>
                            <TableCell>
                              <Badge 
                                variant="secondary" 
                                style={{ 
                                  backgroundColor: `${CATEGORY_COLORS[category]}20`, 
                                  color: CATEGORY_COLORS[category] 
                                }}
                              >
                                {category}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {formatMinutes(dt.minutes)}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <div className="w-full bg-muted rounded-full h-2 overflow-hidden flex-1">
                                  <div 
                                    className="h-full bg-primary transition-all"
                                    style={{ width: `${Math.min(dt.percent, 100)}%` }}
                                  />
                                </div>
                                <span className="text-sm text-muted-foreground w-12 text-right">
                                  {Math.round(dt.percent)}%
                                </span>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Formula explanation */}
          <Card className="bg-muted/30 border-dashed">
            <CardContent className="py-3">
              <p className="text-xs font-mono text-muted-foreground">
                <span className="font-semibold text-foreground">Formulas:</span>{" "}
                Utilisation % = (Runtime ÷ Expected) × 100 | 
                Scrap % = (Rejections ÷ Total Produced) × 100 | 
                All data from daily_production_logs
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
