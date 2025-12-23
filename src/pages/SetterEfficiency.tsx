import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Wrench, Clock, RefreshCw, AlertTriangle, Download, Info, Timer, Repeat, Zap } from "lucide-react";
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, differenceInDays } from "date-fns";
import { formatCount, formatPercent } from "@/lib/displayUtils";
import { Link } from "react-router-dom";

interface SetterActivityEntry {
  id: string;
  setter_id: string;
  work_order_id: string | null;
  machine_id: string;
  log_date: string;
  setup_number: string;
  setup_start_time: string | null;
  setup_end_time: string | null;
  setup_duration_minutes: number | null;
  is_repeat_setup: boolean;
  delay_caused_minutes: number;
  created_at: string;
}

interface Person {
  id: string;
  full_name: string;
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
  repeatSetups: number;
  newSetups: number;
  totalDelaysCaused: number;
  machines: string[];
  setupsPerDay: number;
}

type Period = 'daily' | 'weekly' | 'monthly';

const SetterEfficiency = () => {
  const [loading, setLoading] = useState(true);
  const [activities, setActivities] = useState<SetterActivityEntry[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [period, setPeriod] = useState<Period>('daily');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [selectedSetter, setSelectedSetter] = useState<SetterMetrics | null>(null);
  const [detailLogs, setDetailLogs] = useState<SetterActivityEntry[]>([]);

  // Get date range based on period
  const dateRange = useMemo(() => {
    const baseDate = parseISO(selectedDate);
    switch (period) {
      case 'daily':
        return { start: selectedDate, end: selectedDate };
      case 'weekly':
        return {
          start: format(startOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case 'monthly':
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
      // Build query
      let query = supabase
        .from("setter_activity_ledger")
        .select("*")
        .gte("log_date", dateRange.start)
        .lte("log_date", dateRange.end)
        .order("created_at", { ascending: false });

      if (machineFilter !== "all") {
        query = query.eq("machine_id", machineFilter);
      }

      const [activitiesRes, peopleRes, machinesRes] = await Promise.all([
        query,
        supabase.from("people").select("id, full_name").order("full_name"),
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (peopleRes.error) throw peopleRes.error;
      if (machinesRes.error) throw machinesRes.error;

      setActivities(activitiesRes.data || []);
      setPeople(peopleRes.data || []);
      setMachines(machinesRes.data || []);
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

    activities.forEach((activity) => {
      if (!activity.setter_id) return;

      const setterId = activity.setter_id;
      const setter = people.find((p) => p.id === setterId);
      const machine = machines.find((m) => m.id === activity.machine_id);

      if (!metricsMap.has(setterId)) {
        metricsMap.set(setterId, {
          setterId,
          setterName: setter?.full_name || "Unknown",
          totalSetups: 0,
          avgSetupTime: 0,
          totalSetupTime: 0,
          repeatSetups: 0,
          newSetups: 0,
          totalDelaysCaused: 0,
          machines: [],
          setupsPerDay: 0,
        });
      }

      const metrics = metricsMap.get(setterId)!;
      metrics.totalSetups++;
      metrics.totalSetupTime += activity.setup_duration_minutes || 0;
      metrics.totalDelaysCaused += activity.delay_caused_minutes || 0;

      if (activity.is_repeat_setup) {
        metrics.repeatSetups++;
      } else {
        metrics.newSetups++;
      }

      if (machine && !metrics.machines.includes(machine.machine_id)) {
        metrics.machines.push(machine.machine_id);
      }
    });

    // Calculate averages
    metricsMap.forEach((metrics) => {
      metrics.avgSetupTime = metrics.totalSetups > 0 
        ? Math.round(metrics.totalSetupTime / metrics.totalSetups) 
        : 0;
      metrics.setupsPerDay = Math.round((metrics.totalSetups / dayCount) * 10) / 10;
    });

    return Array.from(metricsMap.values()).sort((a, b) => b.totalSetups - a.totalSetups);
  }, [activities, people, machines, dateRange]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalSetups = setterMetrics.reduce((sum, m) => sum + m.totalSetups, 0);
    const totalTime = setterMetrics.reduce((sum, m) => sum + m.totalSetupTime, 0);
    const totalRepeats = setterMetrics.reduce((sum, m) => sum + m.repeatSetups, 0);
    const totalDelays = setterMetrics.reduce((sum, m) => sum + m.totalDelaysCaused, 0);
    const avgSetupTime = totalSetups > 0 ? Math.round(totalTime / totalSetups) : 0;
    const repeatRate = totalSetups > 0 ? Math.round((totalRepeats / totalSetups) * 100) : 0;

    return { totalSetups, avgSetupTime, totalRepeats, repeatRate, totalDelays, setterCount: setterMetrics.length };
  }, [setterMetrics]);

  const handleSetterClick = (metrics: SetterMetrics) => {
    setSelectedSetter(metrics);
    // Filter activities for this setter
    const logs = activities.filter((a) => a.setter_id === metrics.setterId);
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

    const headers = ["Setter Name", "Total Setups", "Avg Setup Time (min)", "Repeat Setups", "New Setups", "Delays Caused (min)", "Machines", "Setups/Day"];
    const rows = setterMetrics.map((m) => [
      m.setterName,
      m.totalSetups,
      m.avgSetupTime,
      m.repeatSetups,
      m.newSetups,
      m.totalDelaysCaused,
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
    <PageContainer>
      <PageHeader
        title="Setter Efficiency"
        description="Track setup times, repeated setups, and delays caused by setters/programmers"
        icon={<Wrench className="h-6 w-6" />}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        }
      />

      {/* Info Banner */}
      <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border text-sm mb-6">
        <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
        <div className="text-muted-foreground">
          <p>Setter activity is tracked separately from production efficiency. This data does NOT affect operator or machine efficiency metrics.</p>
          <p className="mt-1">
            <Link to="/cnc-programmer-activity" className="text-primary hover:underline font-medium">
              Log setter activity here →
            </Link>
          </p>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setters</span>
            </div>
            <div className="text-2xl font-bold">{summaryStats.setterCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Setups</span>
            </div>
            <div className="text-2xl font-bold">{summaryStats.totalSetups}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Setup Time</span>
            </div>
            <div className={`text-2xl font-bold ${getSetupTimeColor(summaryStats.avgSetupTime)}`}>
              {formatDuration(summaryStats.avgSetupTime)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Repeat Setups</span>
            </div>
            <div className="text-2xl font-bold">
              {summaryStats.totalRepeats}
              <span className="text-sm font-normal text-muted-foreground ml-1">
                ({summaryStats.repeatRate}%)
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Delays Caused</span>
            </div>
            <div className="text-2xl font-bold">{formatDuration(summaryStats.totalDelays)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setups/Day</span>
            </div>
            <div className="text-2xl font-bold">
              {setterMetrics.length > 0 
                ? Math.round(setterMetrics.reduce((sum, m) => sum + m.setupsPerDay, 0) * 10) / 10 
                : 0}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
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

            {/* Date Range Display */}
            <div className="ml-auto text-sm text-muted-foreground">
              Showing: {format(parseISO(dateRange.start), "MMM d")} - {format(parseISO(dateRange.end), "MMM d, yyyy")}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setter Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Setter Performance</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : setterMetrics.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <p>No setter activity recorded for this period.</p>
              <Link to="/cnc-programmer-activity" className="text-primary hover:underline mt-2 inline-block">
                Log setter activity →
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setter Name</TableHead>
                  <TableHead className="text-center">Total Setups</TableHead>
                  <TableHead className="text-center">Avg Setup Time</TableHead>
                  <TableHead className="text-center">Repeat Setups</TableHead>
                  <TableHead className="text-center">New Setups</TableHead>
                  <TableHead className="text-center">Delays Caused</TableHead>
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
                    <TableCell className="text-center">
                      {metrics.repeatSetups > 0 ? (
                        <Badge variant="destructive">{metrics.repeatSetups}</Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">{metrics.newSetups}</TableCell>
                    <TableCell className="text-center">
                      {metrics.totalDelaysCaused > 0 ? (
                        <span className="text-amber-600 font-medium">{formatDuration(metrics.totalDelaysCaused)}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
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
              Setup activity details for {format(parseISO(dateRange.start), "MMM d")} - {format(parseISO(dateRange.end), "MMM d, yyyy")}
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
                    <div className="text-xs text-muted-foreground mb-1">Repeat Setups</div>
                    <div className="text-xl font-bold">
                      {selectedSetter.repeatSetups}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        ({selectedSetter.totalSetups > 0 
                          ? Math.round((selectedSetter.repeatSetups / selectedSetter.totalSetups) * 100) 
                          : 0}%)
                      </span>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-3">
                    <div className="text-xs text-muted-foreground mb-1">Delays Caused</div>
                    <div className="text-xl font-bold text-amber-600">
                      {formatDuration(selectedSetter.totalDelaysCaused)}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Separator />

              {/* Activity Logs */}
              <div>
                <h4 className="font-medium mb-3">Setup Logs</h4>
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
                              {format(parseISO(log.log_date), "MMM d, yyyy")} • {getMachineName(log.machine_id)}
                            </div>
                          </div>
                          {log.is_repeat_setup && (
                            <Badge variant="destructive" className="text-xs">
                              <Repeat className="h-3 w-3 mr-1" />
                              Repeat
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Start:</span>{" "}
                            {log.setup_start_time || "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">End:</span>{" "}
                            {log.setup_end_time || "—"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Duration:</span>{" "}
                            <span className={getSetupTimeColor(log.setup_duration_minutes || 0)}>
                              {formatDuration(log.setup_duration_minutes)}
                            </span>
                          </div>
                        </div>
                        {log.work_order_id && (
                          <Link 
                            to={`/work-orders/${log.work_order_id}`} 
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
    </PageContainer>
  );
};

export default SetterEfficiency;
