import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { Wrench, Clock, RefreshCw, Download, Info, Timer, Zap } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, differenceInDays } from "date-fns";
import { Link } from "react-router-dom";

interface SetupLogEntry {
  id: string;
  setter_id: string | null;
  machine_id: string;
  wo_id: string | null;
  log_date: string;
  setup_number: string;
  setup_start_time_actual: string | null;
  setup_end_time_actual: string | null;
  setup_duration_minutes: number | null;
  shift: string;
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

interface SetterMetrics {
  setterId: string;
  setterName: string;
  totalSetups: number;
  avgSetupTime: number;
  totalSetupTime: number;
  machines: string[];
  setupsPerDay: number;
  logIds: string[];
}

type Period = "daily" | "weekly" | "monthly";

const SetterEfficiency = () => {
  const [loading, setLoading] = useState(true);
  const [setupLogs, setSetupLogs] = useState<SetupLogEntry[]>([]);
  const [setterNames, setSetterNames] = useState<Record<string, string>>({});
  const [machines, setMachines] = useState<Machine[]>([]);
  const [period, setPeriod] = useState<Period>("daily");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [selectedSetter, setSelectedSetter] = useState<SetterMetrics | null>(null);
  const [detailLogs, setDetailLogs] = useState<SetupLogEntry[]>([]);

  // Get date range based on period
  const dateRange = useMemo(() => {
    const baseDate = parseISO(selectedDate);
    switch (period) {
      case "daily":
        return { start: selectedDate, end: selectedDate };
      case "weekly":
        return {
          start: format(startOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "monthly":
        return {
          start: format(startOfMonth(baseDate), "yyyy-MM-dd"),
          end: format(endOfMonth(baseDate), "yyyy-MM-dd"),
        };
    }
  }, [period, selectedDate]);

  useEffect(() => {
    loadData();
  }, [dateRange, machineFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Query daily_production_logs for setup data
      let query = supabase
        .from("daily_production_logs")
        .select(`
          id,
          setter_id,
          machine_id,
          wo_id,
          log_date,
          setup_number,
          setup_start_time_actual,
          setup_end_time_actual,
          setup_duration_minutes,
          shift
        `)
        .gte("log_date", dateRange.start)
        .lte("log_date", dateRange.end)
        .not("setter_id", "is", null)
        .order("log_date", { ascending: false });

      if (machineFilter !== "all") {
        query = query.eq("machine_id", machineFilter);
      }

      const [logsRes, machinesRes] = await Promise.all([
        query,
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
      ]);

      if (logsRes.error) throw logsRes.error;
      if (machinesRes.error) throw machinesRes.error;

      const logs = logsRes.data || [];
      setSetupLogs(logs);
      setMachines(machinesRes.data || []);

      // Fetch setter names
      const setterIds = [...new Set(logs.map((l) => l.setter_id).filter(Boolean))];
      if (setterIds.length > 0) {
        const { data: people } = await supabase
          .from("people")
          .select("id, full_name")
          .in("id", setterIds);

        const names: Record<string, string> = {};
        (people || []).forEach((p) => {
          names[p.id] = p.full_name || "Unknown";
        });
        setSetterNames(names);
      } else {
        setSetterNames({});
      }
    } catch (error: any) {
      toast.error("Failed to load setter efficiency data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Calculate metrics per setter
  const setterMetrics = useMemo(() => {
    const metricsMap = new Map<string, SetterMetrics>();
    const dayCount = Math.max(1, differenceInDays(parseISO(dateRange.end), parseISO(dateRange.start)) + 1);

    setupLogs.forEach((log) => {
      if (!log.setter_id) return;

      const setterId = log.setter_id;
      const machine = machines.find((m) => m.id === log.machine_id);

      if (!metricsMap.has(setterId)) {
        metricsMap.set(setterId, {
          setterId,
          setterName: setterNames[setterId] || "Unknown",
          totalSetups: 0,
          avgSetupTime: 0,
          totalSetupTime: 0,
          machines: [],
          setupsPerDay: 0,
          logIds: [],
        });
      }

      const metrics = metricsMap.get(setterId)!;
      metrics.totalSetups++;
      metrics.totalSetupTime += log.setup_duration_minutes || 0;
      metrics.logIds.push(log.id);

      if (machine && !metrics.machines.includes(machine.machine_id)) {
        metrics.machines.push(machine.machine_id);
      }
    });

    // Calculate averages
    metricsMap.forEach((metrics) => {
      metrics.avgSetupTime =
        metrics.totalSetups > 0 ? Math.round(metrics.totalSetupTime / metrics.totalSetups) : 0;
      metrics.setupsPerDay = Math.round((metrics.totalSetups / dayCount) * 10) / 10;
    });

    return Array.from(metricsMap.values()).sort((a, b) => b.totalSetups - a.totalSetups);
  }, [setupLogs, setterNames, machines, dateRange]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalSetups = setterMetrics.reduce((sum, m) => sum + m.totalSetups, 0);
    const totalTime = setterMetrics.reduce((sum, m) => sum + m.totalSetupTime, 0);
    const avgSetupTime = totalSetups > 0 ? Math.round(totalTime / totalSetups) : 0;
    const dayCount = Math.max(1, differenceInDays(parseISO(dateRange.end), parseISO(dateRange.start)) + 1);
    const setupsPerDay = Math.round((totalSetups / dayCount) * 10) / 10;

    return {
      totalSetups,
      avgSetupTime,
      totalSetupTime: totalTime,
      setupsPerDay,
      setterCount: setterMetrics.length,
    };
  }, [setterMetrics, dateRange]);

  const handleSetterClick = (metrics: SetterMetrics) => {
    setSelectedSetter(metrics);
    const logs = setupLogs.filter((l) => l.setter_id === metrics.setterId);
    setDetailLogs(logs);
  };

  const getSetupTimeColor = (avgTime: number) => {
    if (avgTime <= 15) return "text-green-600 dark:text-green-400";
    if (avgTime <= 30) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getMachineName = (id: string) => machines.find((m) => m.id === id)?.machine_id || "—";

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const exportCSV = () => {
    if (setterMetrics.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Setter Name",
      "Total Setups",
      "Avg Setup Time (min)",
      "Total Setup Time (min)",
      "Machines",
      "Setups/Day",
    ];
    const rows = setterMetrics.map((m) => [
      m.setterName,
      m.totalSetups,
      m.avgSetupTime,
      m.totalSetupTime,
      m.machines.join(", "),
      m.setupsPerDay,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `setter-efficiency-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Setter Efficiency"
        description="Historical analytics derived from Daily Production Logs - Setup performance only"
      />

      {/* Info Banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All metrics derived from Production Log setup fields. This is a read-only historical analytics view.
          <br />
          <span className="text-xs text-muted-foreground">
            Setup data is separate from Operator Efficiency (production output) and Machine Utilisation.
          </span>
        </AlertDescription>
      </Alert>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setters</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summaryStats.setterCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Setups</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summaryStats.totalSetups}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Setup Time</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={`text-2xl font-bold ${getSetupTimeColor(summaryStats.avgSetupTime)}`}>
                {formatDuration(summaryStats.avgSetupTime)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Setup Time</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{formatDuration(summaryStats.totalSetupTime)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setups/Day</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summaryStats.setupsPerDay}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Period Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Period</Label>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
            </div>

            {/* Machine Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Machine</Label>
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All Machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.machine_id} - {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {format(parseISO(dateRange.start), "MMM d")} -{" "}
                {format(parseISO(dateRange.end), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setter Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Setter Performance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : setterMetrics.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-sm font-medium mb-1">No setter activity recorded</h3>
              <p className="text-sm text-muted-foreground mb-1">
                <span className="font-medium">Why:</span> No production logs with setters assigned for this period.
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                <span className="font-medium">How to populate:</span> Assign setters and log setup times in Daily Production Log.
              </p>
              <Button asChild variant="default" className="gap-2">
                <Link to="/daily-production-log">
                  Log Production
                  <Zap className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setter Name</TableHead>
                  <TableHead className="text-center">Total Setups</TableHead>
                  <TableHead className="text-center">Avg Setup Time</TableHead>
                  <TableHead className="text-center">Total Setup Time</TableHead>
                  <TableHead>Machines</TableHead>
                  <TableHead className="text-center">Setups/Day</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {setterMetrics.map((metrics) => (
                  <TableRow
                    key={metrics.setterId}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleSetterClick(metrics)}
                  >
                    <TableCell className="font-medium">{metrics.setterName}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{metrics.totalSetups}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`font-medium ${getSetupTimeColor(metrics.avgSetupTime)}`}>
                        {formatDuration(metrics.avgSetupTime)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">{formatDuration(metrics.totalSetupTime)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {metrics.machines.slice(0, 3).map((m) => (
                          <Badge key={m} variant="outline" className="text-xs">
                            {m}
                          </Badge>
                        ))}
                        {metrics.machines.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{metrics.machines.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">{metrics.setupsPerDay}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Drawer */}
      <Sheet open={!!selectedSetter} onOpenChange={() => setSelectedSetter(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedSetter?.setterName}</SheetTitle>
            <SheetDescription>
              Setup activity for {format(parseISO(dateRange.start), "MMM d")} -{" "}
              {format(parseISO(dateRange.end), "MMM d, yyyy")}
            </SheetDescription>
          </SheetHeader>

          {selectedSetter && (
            <div className="mt-6 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground mb-1">Total Setups</div>
                    <div className="text-xl font-bold">{selectedSetter.totalSetups}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground mb-1">Avg Time</div>
                    <div className={`text-xl font-bold ${getSetupTimeColor(selectedSetter.avgSetupTime)}`}>
                      {formatDuration(selectedSetter.avgSetupTime)}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground mb-1">Total Time</div>
                    <div className="text-xl font-bold">{formatDuration(selectedSetter.totalSetupTime)}</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground mb-1">Setups/Day</div>
                    <div className="text-xl font-bold">{selectedSetter.setupsPerDay}</div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Setup Logs */}
              <div>
                <h4 className="font-medium mb-3">Setup Logs ({detailLogs.length})</h4>
                {detailLogs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No logs found.</p>
                ) : (
                  <div className="space-y-2">
                    {detailLogs.map((log) => (
                      <Card key={log.id} className="p-3">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <div className="text-sm font-medium">{log.setup_number}</div>
                            <div className="text-xs text-muted-foreground">
                              {format(parseISO(log.log_date), "MMM d, yyyy")} • {getMachineName(log.machine_id)} • {log.shift}
                            </div>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {formatDuration(log.setup_duration_minutes)}
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Start:</span>{" "}
                            {log.setup_start_time_actual || "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">End:</span>{" "}
                            {log.setup_end_time_actual || "—"}
                          </div>
                        </div>
                        {log.wo_id && (
                          <Link
                            to={`/work-orders/${log.wo_id}`}
                            className="text-xs text-primary hover:underline mt-2 inline-block"
                          >
                            View Work Order →
                          </Link>
                        )}
                      </Card>
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
};

export default SetterEfficiency;
