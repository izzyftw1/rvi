import { useState, useEffect, useMemo } from "react";
import { format, subDays, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Clock, 
  AlertTriangle, 
  TrendingUp, 
  Wrench, 
  Users, 
  Zap,
  Package,
  ClipboardCheck,
  MoreHorizontal,
  Cpu,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from "recharts";
import { 
  DOWNTIME_CATEGORIES, 
  CATEGORY_COLORS, 
  getCategoryForReason,
  type DowntimeCategory 
} from "@/config/downtimeConfig";

type PeriodType = "daily" | "weekly" | "monthly";

interface DowntimeEvent {
  reason: string;
  duration_minutes: number;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

interface ProductionLog {
  id: string;
  machine_id: string;
  operator_id: string | null;
  log_date: string;
  downtime_events: DowntimeEvent[] | null;
  total_downtime_minutes: number;
  machines?: { name: string; machine_id: string } | null;
  people?: { full_name: string } | null;
}

interface DowntimeByReason {
  reason: string;
  category: DowntimeCategory;
  totalMinutes: number;
  occurrences: number;
  percentage: number;
}

interface DowntimeByMachine {
  machineId: string;
  machineName: string;
  totalMinutes: number;
  occurrences: number;
  topReason: string;
  trend: number; // percentage change from previous period
}

interface DowntimeByOperator {
  operatorId: string;
  operatorName: string;
  totalMinutes: number;
  occurrences: number;
  topReason: string;
  isRepeatOffender: boolean;
}

interface DowntimeByCategory {
  category: DowntimeCategory;
  totalMinutes: number;
  percentage: number;
}

const DowntimeAnalytics = () => {
  const [period, setPeriod] = useState<PeriodType>("daily");
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [previousLogs, setPreviousLogs] = useState<ProductionLog[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string>("all");
  const [machines, setMachines] = useState<Array<{ id: string; name: string; machine_id: string }>>([]);

  // Calculate date range based on period
  const getDateRange = (periodType: PeriodType, offset = 0) => {
    const today = new Date();
    let start: Date;
    let end: Date;

    switch (periodType) {
      case "daily":
        start = subDays(today, offset);
        end = subDays(today, offset);
        break;
      case "weekly":
        const weekStart = startOfWeek(subDays(today, offset * 7), { weekStartsOn: 1 });
        start = weekStart;
        end = endOfWeek(weekStart, { weekStartsOn: 1 });
        break;
      case "monthly":
        const monthStart = startOfMonth(subDays(today, offset * 30));
        start = monthStart;
        end = endOfMonth(monthStart);
        break;
    }

    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
    };
  };

  useEffect(() => {
    loadData();
  }, [period, selectedMachine]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load machines
      const { data: machinesData } = await supabase
        .from("machines")
        .select("id, name, machine_id")
        .order("name");
      
      if (machinesData) {
        setMachines(machinesData);
      }

      const currentRange = getDateRange(period, 0);
      const previousRange = getDateRange(period, 1);

      // Build query for current period
      let currentQuery = supabase
        .from("daily_production_logs")
        .select(`
          id,
          machine_id,
          operator_id,
          log_date,
          downtime_events,
          total_downtime_minutes,
          machines:machine_id(name, machine_id),
          people:operator_id(full_name)
        `)
        .gte("log_date", currentRange.start)
        .lte("log_date", currentRange.end)
        .gt("total_downtime_minutes", 0);

      if (selectedMachine !== "all") {
        currentQuery = currentQuery.eq("machine_id", selectedMachine);
      }

      const { data: currentData } = await currentQuery;

      // Build query for previous period (for trend comparison)
      let previousQuery = supabase
        .from("daily_production_logs")
        .select(`
          id,
          machine_id,
          operator_id,
          log_date,
          downtime_events,
          total_downtime_minutes,
          machines:machine_id(name, machine_id),
          people:operator_id(full_name)
        `)
        .gte("log_date", previousRange.start)
        .lte("log_date", previousRange.end)
        .gt("total_downtime_minutes", 0);

      if (selectedMachine !== "all") {
        previousQuery = previousQuery.eq("machine_id", selectedMachine);
      }

      const { data: previousData } = await previousQuery;

      // Process the data with proper typing
      const processLogs = (data: any[]): ProductionLog[] => {
        return data.map(log => ({
          ...log,
          machines: log.machines && typeof log.machines === 'object' && !Array.isArray(log.machines) 
            ? log.machines 
            : null,
          people: log.people && typeof log.people === 'object' && !Array.isArray(log.people) 
            ? log.people 
            : null,
          downtime_events: Array.isArray(log.downtime_events) 
            ? log.downtime_events as DowntimeEvent[]
            : null
        }));
      };

      setLogs(processLogs(currentData || []));
      setPreviousLogs(processLogs(previousData || []));
    } catch (error) {
      console.error("Error loading downtime data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate analytics
  const analytics = useMemo(() => {
    // Total downtime
    const totalDowntime = logs.reduce((sum, log) => sum + (log.total_downtime_minutes || 0), 0);
    const previousTotalDowntime = previousLogs.reduce((sum, log) => sum + (log.total_downtime_minutes || 0), 0);
    const downtimeTrend = previousTotalDowntime > 0 
      ? ((totalDowntime - previousTotalDowntime) / previousTotalDowntime) * 100 
      : 0;

    // Downtime by reason
    const reasonMap = new Map<string, { minutes: number; occurrences: number }>();
    logs.forEach(log => {
      if (log.downtime_events && Array.isArray(log.downtime_events)) {
        log.downtime_events.forEach((event: DowntimeEvent) => {
          const reason = event.reason || "Unknown";
          const existing = reasonMap.get(reason) || { minutes: 0, occurrences: 0 };
          reasonMap.set(reason, {
            minutes: existing.minutes + (event.duration_minutes || 0),
            occurrences: existing.occurrences + 1,
          });
        });
      }
    });

    const downtimeByReason: DowntimeByReason[] = Array.from(reasonMap.entries())
      .map(([reason, data]) => ({
        reason,
        category: getCategoryForReason(reason),
        totalMinutes: data.minutes,
        occurrences: data.occurrences,
        percentage: totalDowntime > 0 ? (data.minutes / totalDowntime) * 100 : 0,
      }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Downtime by category
    const categoryMap = new Map<DowntimeCategory, number>();
    DOWNTIME_CATEGORIES.forEach(cat => categoryMap.set(cat, 0));
    
    downtimeByReason.forEach(item => {
      const current = categoryMap.get(item.category) || 0;
      categoryMap.set(item.category, current + item.totalMinutes);
    });

    const downtimeByCategory: DowntimeByCategory[] = Array.from(categoryMap.entries())
      .map(([category, totalMinutes]) => ({
        category,
        totalMinutes,
        percentage: totalDowntime > 0 ? (totalMinutes / totalDowntime) * 100 : 0,
      }))
      .filter(item => item.totalMinutes > 0)
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Downtime by machine
    const machineMap = new Map<string, { 
      name: string; 
      minutes: number; 
      occurrences: number; 
      reasons: Map<string, number>;
    }>();

    logs.forEach(log => {
      const machineId = log.machine_id;
      const machineName = log.machines?.name || log.machines?.machine_id || "Unknown";
      const existing = machineMap.get(machineId) || { 
        name: machineName, 
        minutes: 0, 
        occurrences: 0,
        reasons: new Map(),
      };

      existing.minutes += log.total_downtime_minutes || 0;
      existing.occurrences += 1;

      if (log.downtime_events && Array.isArray(log.downtime_events)) {
        log.downtime_events.forEach((event: DowntimeEvent) => {
          const reason = event.reason || "Unknown";
          const currentReasonMinutes = existing.reasons.get(reason) || 0;
          existing.reasons.set(reason, currentReasonMinutes + (event.duration_minutes || 0));
        });
      }

      machineMap.set(machineId, existing);
    });

    // Calculate previous period by machine for trends
    const previousMachineMap = new Map<string, number>();
    previousLogs.forEach(log => {
      const current = previousMachineMap.get(log.machine_id) || 0;
      previousMachineMap.set(log.machine_id, current + (log.total_downtime_minutes || 0));
    });

    const downtimeByMachine: DowntimeByMachine[] = Array.from(machineMap.entries())
      .map(([machineId, data]) => {
        const previousMinutes = previousMachineMap.get(machineId) || 0;
        const trend = previousMinutes > 0 
          ? ((data.minutes - previousMinutes) / previousMinutes) * 100 
          : 0;

        // Find top reason
        let topReason = "N/A";
        let maxMinutes = 0;
        data.reasons.forEach((minutes, reason) => {
          if (minutes > maxMinutes) {
            maxMinutes = minutes;
            topReason = reason;
          }
        });

        return {
          machineId,
          machineName: data.name,
          totalMinutes: data.minutes,
          occurrences: data.occurrences,
          topReason,
          trend,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Downtime by operator
    const operatorMap = new Map<string, { 
      name: string; 
      minutes: number; 
      occurrences: number;
      reasons: Map<string, number>;
    }>();

    logs.forEach(log => {
      if (!log.operator_id) return;
      
      const operatorId = log.operator_id;
      const operatorName = log.people?.full_name || "Unknown";
      const existing = operatorMap.get(operatorId) || { 
        name: operatorName, 
        minutes: 0, 
        occurrences: 0,
        reasons: new Map(),
      };

      existing.minutes += log.total_downtime_minutes || 0;
      existing.occurrences += 1;

      if (log.downtime_events && Array.isArray(log.downtime_events)) {
        log.downtime_events.forEach((event: DowntimeEvent) => {
          const reason = event.reason || "Unknown";
          const currentReasonMinutes = existing.reasons.get(reason) || 0;
          existing.reasons.set(reason, currentReasonMinutes + (event.duration_minutes || 0));
        });
      }

      operatorMap.set(operatorId, existing);
    });

    // Calculate average downtime per operator
    const avgDowntimePerOperator = operatorMap.size > 0 
      ? Array.from(operatorMap.values()).reduce((sum, op) => sum + op.minutes, 0) / operatorMap.size
      : 0;

    const downtimeByOperator: DowntimeByOperator[] = Array.from(operatorMap.entries())
      .map(([operatorId, data]) => {
        // Find top reason
        let topReason = "N/A";
        let maxMinutes = 0;
        data.reasons.forEach((minutes, reason) => {
          if (minutes > maxMinutes) {
            maxMinutes = minutes;
            topReason = reason;
          }
        });

        return {
          operatorId,
          operatorName: data.name,
          totalMinutes: data.minutes,
          occurrences: data.occurrences,
          topReason,
          // Mark as repeat offender if >50% above average
          isRepeatOffender: data.minutes > avgDowntimePerOperator * 1.5,
        };
      })
      .sort((a, b) => b.totalMinutes - a.totalMinutes);

    // Repeat offenders (machines with consistently high downtime)
    const repeatOffenderMachines = downtimeByMachine
      .filter(m => m.trend > 20) // 20% increase from previous period
      .slice(0, 5);

    return {
      totalDowntime,
      downtimeTrend,
      downtimeByReason,
      downtimeByCategory,
      downtimeByMachine,
      downtimeByOperator,
      repeatOffenderMachines,
      totalEvents: logs.length,
    };
  }, [logs, previousLogs]);

  const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  const getCategoryIcon = (category: DowntimeCategory) => {
    switch (category) {
      case "Material": return <Package className="h-4 w-4" />;
      case "Machine": return <Wrench className="h-4 w-4" />;
      case "Power": return <Zap className="h-4 w-4" />;
      case "QC": return <ClipboardCheck className="h-4 w-4" />;
      case "Operator": return <Users className="h-4 w-4" />;
      case "Tooling": return <Cpu className="h-4 w-4" />;
      default: return <MoreHorizontal className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">Downtime Analytics</h1>
          <p className="text-muted-foreground">
            Analyze downtime patterns and identify improvement opportunities
          </p>
        </div>

        <div className="flex gap-3">
          <Select value={selectedMachine} onValueChange={setSelectedMachine}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Machines" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Machines</SelectItem>
              {machines.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <TabsList>
              <TabsTrigger value="daily">Daily</TabsTrigger>
              <TabsTrigger value="weekly">Weekly</TabsTrigger>
              <TabsTrigger value="monthly">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Downtime
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{formatMinutes(analytics.totalDowntime)}</span>
              {analytics.downtimeTrend !== 0 && (
                <Badge variant={analytics.downtimeTrend > 0 ? "destructive" : "default"} className="gap-1">
                  {analytics.downtimeTrend > 0 ? (
                    <ArrowUpRight className="h-3 w-3" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3" />
                  )}
                  {Math.abs(analytics.downtimeTrend).toFixed(1)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">vs previous {period}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{analytics.totalEvents}</div>
            <p className="text-xs text-muted-foreground mt-1">downtime incidents</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Top Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            {analytics.downtimeByCategory[0] ? (
              <>
                <div className="flex items-center gap-2">
                  <div 
                    className="h-3 w-3 rounded-full" 
                    style={{ backgroundColor: CATEGORY_COLORS[analytics.downtimeByCategory[0].category] }}
                  />
                  <span className="text-2xl font-bold">{analytics.downtimeByCategory[0].category}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {analytics.downtimeByCategory[0].percentage.toFixed(1)}% of total
                </p>
              </>
            ) : (
              <span className="text-muted-foreground">No data</span>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Repeat Offenders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-destructive">
              {analytics.repeatOffenderMachines.length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">machines with rising downtime</p>
          </CardContent>
        </Card>
      </div>

      {/* Repeat Offenders Alert */}
      {analytics.repeatOffenderMachines.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="ml-2">
            <strong>Attention Required:</strong> The following machines show increasing downtime trends:{" "}
            {analytics.repeatOffenderMachines.map(m => m.machineName).join(", ")}
          </AlertDescription>
        </Alert>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Downtime Reasons (Pareto) */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Top Downtime Reasons</CardTitle>
            <CardDescription>Pareto analysis of downtime causes</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.downtimeByReason.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No downtime recorded for this period</p>
            ) : (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.downtimeByReason.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="reason" type="category" width={150} tick={{ fontSize: 12 }} />
                    <Tooltip 
                      formatter={(value: number) => [formatMinutes(value), "Duration"]}
                      labelFormatter={(label) => label}
                    />
                    <Bar 
                      dataKey="totalMinutes" 
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Downtime by Category */}
        <Card>
          <CardHeader>
            <CardTitle>By Category</CardTitle>
            <CardDescription>Downtime distribution by category</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.downtimeByCategory.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={analytics.downtimeByCategory}
                      dataKey="totalMinutes"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      label={({ category, percentage }) => `${category}: ${percentage.toFixed(0)}%`}
                    >
                      {analytics.downtimeByCategory.map((entry) => (
                        <Cell key={entry.category} fill={CATEGORY_COLORS[entry.category]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMinutes(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Category Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.downtimeByCategory.map(cat => (
                <div key={cat.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(cat.category)}
                      <span>{cat.category}</span>
                    </div>
                    <span className="font-medium">{formatMinutes(cat.totalMinutes)}</span>
                  </div>
                  <Progress 
                    value={cat.percentage} 
                    className="h-2"
                    style={{ 
                      // @ts-ignore
                      "--progress-background": CATEGORY_COLORS[cat.category] 
                    }}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Machine */}
        <Card>
          <CardHeader>
            <CardTitle>Downtime by Machine</CardTitle>
            <CardDescription>Top machines with most downtime</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Machine</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Top Reason</TableHead>
                  <TableHead className="text-right">Trend</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.downtimeByMachine.slice(0, 10).map(machine => (
                  <TableRow key={machine.machineId}>
                    <TableCell className="font-medium">{machine.machineName}</TableCell>
                    <TableCell className="text-right">{formatMinutes(machine.totalMinutes)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {machine.topReason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {machine.trend !== 0 && (
                        <span className={machine.trend > 0 ? "text-destructive" : "text-green-600"}>
                          {machine.trend > 0 ? "+" : ""}{machine.trend.toFixed(0)}%
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {analytics.downtimeByMachine.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No machine downtime data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* By Operator */}
        <Card>
          <CardHeader>
            <CardTitle>Downtime by Operator</CardTitle>
            <CardDescription>Operators with most downtime incidents</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operator</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead>Top Reason</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {analytics.downtimeByOperator.slice(0, 10).map(operator => (
                  <TableRow key={operator.operatorId}>
                    <TableCell className="font-medium">{operator.operatorName}</TableCell>
                    <TableCell className="text-right">{formatMinutes(operator.totalMinutes)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {operator.topReason}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {operator.isRepeatOffender && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          High
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {analytics.downtimeByOperator.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No operator downtime data
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DowntimeAnalytics;
