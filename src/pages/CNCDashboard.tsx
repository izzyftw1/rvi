import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { 
  Settings, Calendar, AlertTriangle, Clock, TrendingUp, 
  TrendingDown, Activity, Package, RefreshCw, ChevronRight,
  AlertCircle
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, differenceInMinutes, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from "date-fns";
import { GanttScheduler } from "@/components/GanttScheduler";
import { OEEWidget } from "@/components/OEEWidget";

interface Machine {
  id: string;
  machine_id: string;
  name: string;
  status: string;
  current_wo_id: string | null;
  current_job_start: string | null;
  estimated_completion: string | null;
  current_wo?: any;
  current_operator?: any;
  assignments?: any[];
}

const CNCDashboard = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [queuePanelOpen, setQueuePanelOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [machineOEE, setMachineOEE] = useState<any>(null);

  useEffect(() => {
    loadMachines();

    const channel = supabase
      .channel("cnc-dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machines" },
        () => loadMachines()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wo_machine_assignments" },
        () => loadMachines()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMachines = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("machines")
        .select(`
          *,
          current_wo:work_orders!machines_current_wo_id_fkey(wo_id, display_id, item_code, quantity, customer),
          current_operator:profiles!machines_operator_id_fkey(full_name),
          assignments:wo_machine_assignments!wo_machine_assignments_machine_id_fkey(
            *,
            work_order:work_orders(wo_id, display_id, item_code, customer, quantity)
          )
        `)
        .order("machine_id", { ascending: true });

      if (error) throw error;
      setMachines(data || []);
    } catch (error: any) {
      console.error("Error loading machines:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Calculate KPIs
  const kpis = useMemo(() => {
    const total = machines.length;
    const running = machines.filter((m) => m.status === "running").length;
    const idle = machines.filter((m) => m.status === "idle").length;
    const utilizationRate = total > 0 ? Math.round((running / total) * 100) : 0;

    // Find bottlenecks (machines with queues > 3)
    const bottlenecks = machines.filter((m) => {
      const queuedJobs = m.assignments?.filter(
        (a: any) => a.status === "scheduled"
      );
      return (queuedJobs?.length ?? 0) > 3;
    });

    // Calculate progress for running machines
    const runningWithProgress = machines
      .filter((m) => m.status === "running" && m.current_job_start && m.estimated_completion)
      .map((m) => {
        const start = new Date(m.current_job_start!);
        const end = new Date(m.estimated_completion!);
        const now = new Date();
        const totalDuration = differenceInMinutes(end, start);
        const elapsed = differenceInMinutes(now, start);
        const progress = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
        return { ...m, progress };
      })
      .sort((a, b) => b.progress - a.progress)
      .slice(0, 5);

    return {
      total,
      running,
      idle,
      utilizationRate,
      bottleneckCount: bottlenecks.length,
      bottlenecks,
      topPerformers: runningWithProgress,
    };
  }, [machines]);

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      idle: "bg-gray-400",
      running: "bg-green-500",
      waiting_qc: "bg-yellow-500",
      down: "bg-red-500",
      maintenance: "bg-orange-500",
      paused: "bg-blue-400",
    };
    return colors[status] || "bg-gray-400";
  };

  const getStatusBadgeVariant = (status: string) => {
    const variants: Record<string, any> = {
      idle: "secondary",
      running: "default",
      waiting_qc: "outline",
      down: "destructive",
      maintenance: "outline",
      paused: "secondary",
    };
    return variants[status] || "secondary";
  };

  const calculateProgress = (machine: Machine) => {
    if (!machine.current_job_start || !machine.estimated_completion) return 0;
    
    const start = new Date(machine.current_job_start);
    const end = new Date(machine.estimated_completion);
    const now = new Date();
    const totalDuration = differenceInMinutes(end, start);
    const elapsed = differenceInMinutes(now, start);
    return Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
  };

  const getQueueCount = (machine: Machine) => {
    return machine.assignments?.filter((a: any) => a.status === "scheduled").length ?? 0;
  };

  const getNextJob = (machine: Machine) => {
    const scheduled = machine.assignments
      ?.filter((a: any) => a.status === "scheduled")
      .sort((a: any, b: any) => 
        new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
      );
    return scheduled?.[0];
  };

  const hasBottleneck = (machine: Machine) => {
    return getQueueCount(machine) > 3;
  };

  const openQueuePanel = async (machine: Machine) => {
    setSelectedMachine(machine);
    setQueuePanelOpen(true);
    
    // Load OEE metrics for this machine
    await loadMachineOEE(machine.id);
  };

  const loadMachineOEE = async (machineId: string) => {
    try {
      const today = format(new Date(), 'yyyy-MM-dd');
      const weekStart = format(startOfWeek(new Date()), 'yyyy-MM-dd');
      const weekEnd = format(endOfWeek(new Date()), 'yyyy-MM-dd');
      const monthStart = format(startOfMonth(new Date()), 'yyyy-MM-dd');
      const monthEnd = format(endOfMonth(new Date()), 'yyyy-MM-dd');

      // Fetch today's metrics
      const { data: todayData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .eq('machine_id', machineId)
        .eq('date', today)
        .single();

      // Fetch this week's metrics
      const { data: weekData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .eq('machine_id', machineId)
        .gte('date', weekStart)
        .lte('date', weekEnd);

      // Fetch this month's metrics
      const { data: monthData } = await supabase
        .from('machine_daily_metrics')
        .select('*')
        .eq('machine_id', machineId)
        .gte('date', monthStart)
        .lte('date', monthEnd);

      const calculateOEE = (data: any) => {
        if (!data) return { availability: 0, performance: 0, quality: 0, oee: 0 };
        
        const availability = data.availability_pct || 0;
        const performance = data.performance_pct || 0;
        const quality = data.quality_pct || 0;
        const oee = data.oee_pct || 0;

        return { availability, performance, quality, oee };
      };

      const calculateAverageOEE = (dataArray: any[]) => {
        if (!dataArray || dataArray.length === 0) {
          return { availability: 0, performance: 0, quality: 0, oee: 0 };
        }

        const totals = dataArray.reduce((acc, d) => ({
          availability: acc.availability + (d.availability_pct || 0),
          performance: acc.performance + (d.performance_pct || 0),
          quality: acc.quality + (d.quality_pct || 0),
          oee: acc.oee + (d.oee_pct || 0),
        }), { availability: 0, performance: 0, quality: 0, oee: 0 });

        return {
          availability: totals.availability / dataArray.length,
          performance: totals.performance / dataArray.length,
          quality: totals.quality / dataArray.length,
          oee: totals.oee / dataArray.length,
        };
      };

      setMachineOEE({
        today: calculateOEE(todayData),
        week: calculateAverageOEE(weekData || []),
        month: calculateAverageOEE(monthData || []),
      });
    } catch (error: any) {
      console.error('Error loading machine OEE:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader
        title="CNC Machine Dashboard"
        subtitle="Unified view: Status, Schedule, and Queue Management"
      />

      <div className="p-6 space-y-6">
        {/* KPI Section */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Utilization</p>
                  <p className="text-3xl font-bold text-primary">{kpis.utilizationRate}%</p>
                </div>
                <Clock className="h-8 w-8 text-muted-foreground" />
              </div>
              <Progress value={kpis.utilizationRate} className="mt-2 h-2" />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Running</p>
                  <p className="text-3xl font-bold text-green-600">{kpis.running}</p>
                </div>
                <Activity className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Active machines</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Idle</p>
                  <p className="text-3xl font-bold text-gray-600">{kpis.idle}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-gray-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Available</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Bottlenecks</p>
                  <p className="text-3xl font-bold text-orange-600">{kpis.bottleneckCount}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">Long queues</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Top Speed</p>
                  <p className="text-xl font-bold text-blue-600">
                    {kpis.topPerformers[0]?.machine_id ?? "—"}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-blue-600" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {kpis.topPerformers[0] ? `${Math.round(kpis.topPerformers[0].progress)}% done` : "No jobs"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Section */}
        {kpis.bottlenecks.length > 0 && (
          <Card className="border-orange-500">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2 text-orange-600">
                <AlertCircle className="h-5 w-5" />
                Bottleneck Alerts & Suggestions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {kpis.bottlenecks.slice(0, 3).map((machine) => {
                  const queue = getQueueCount(machine);
                  // Find idle machines for suggestion
                  const idleMachines = machines.filter(m => m.status === "idle").slice(0, 2);
                  return (
                    <div key={machine.id} className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-orange-600" />
                        <div>
                          <p className="text-sm font-medium">{machine.machine_id} has {queue} jobs queued</p>
                          {idleMachines.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              💡 Consider splitting work to {idleMachines.map(m => m.machine_id).join(", ")} to balance load
                            </p>
                          )}
                        </div>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => openQueuePanel(machine)}>
                        View Queue
                      </Button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Machine Grid/List Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>All CNC Machines ({machines.length})</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={viewMode === "grid" ? "default" : "outline"}
                  onClick={() => setViewMode("grid")}
                >
                  Grid
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "list" ? "default" : "outline"}
                  onClick={() => setViewMode("list")}
                >
                  List
                </Button>
                <Button size="sm" variant="outline" onClick={loadMachines}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => navigate("/admin")}>
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading machines...</div>
            ) : machines.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No machines available</div>
            ) : (
              <div className={viewMode === "grid" 
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
                : "space-y-2"
              }>
                {machines.map((machine) => {
                  const progress = calculateProgress(machine);
                  const queueCount = getQueueCount(machine);
                  const nextJob = getNextJob(machine);
                  const isBottleneck = hasBottleneck(machine);

                  if (viewMode === "list") {
                    return (
                      <div
                        key={machine.id}
                        className="flex items-center justify-between p-4 border rounded-lg hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => openQueuePanel(machine)}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-3 h-3 rounded-full ${getStatusColor(machine.status)}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{machine.machine_id}</p>
                              <Badge variant={getStatusBadgeVariant(machine.status)} className="text-xs">
                                {machine.status.replace("_", " ")}
                              </Badge>
                              {isBottleneck && (
                                <Badge variant="destructive" className="text-xs">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Queue: {queueCount}
                                </Badge>
                              )}
                            </div>
                            {machine.current_wo && (
                              <div className="flex items-center gap-4 mt-1">
                                <p className="text-sm text-muted-foreground truncate">
                                  {machine.current_wo?.display_id ?? machine.current_wo?.wo_id ?? "N/A"} - {machine.current_wo?.item_code ?? "N/A"}
                                </p>
                                <div className="flex items-center gap-2 min-w-[200px]">
                                  <Progress value={progress} className="h-2 flex-1" />
                                  <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    );
                  }

                  // Grid view
                  return (
                    <Card
                      key={machine.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow relative"
                      onClick={() => openQueuePanel(machine)}
                    >
                      {isBottleneck && (
                        <div className="absolute -top-2 -right-2 z-10">
                          <div className="relative">
                            <div className="absolute inset-0 bg-red-500 rounded-full animate-ping opacity-75" />
                            <Badge variant="destructive" className="relative">
                              <AlertTriangle className="h-3 w-3" />
                            </Badge>
                          </div>
                        </div>
                      )}
                      
                      <CardHeader className={`${getStatusColor(machine.status)} text-white`}>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg font-bold">
                            {machine.machine_id}
                          </CardTitle>
                          {queueCount > 0 && (
                            <Badge variant="secondary" className="bg-white text-black">
                              <Package className="h-3 w-3 mr-1" />
                              {queueCount}
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      
                      <CardContent className="pt-4 space-y-3">
                        <p className="text-sm font-medium truncate">{machine.name}</p>
                        
                        {machine.current_wo ? (
                          <>
                            <div className="pt-2 border-t space-y-1">
                              <p className="text-xs text-muted-foreground">Current Job:</p>
                              <p className="text-sm font-mono truncate">
                                {machine.current_wo?.display_id ?? machine.current_wo?.wo_id ?? "N/A"}
                              </p>
                              <p className="text-xs truncate">{machine.current_wo?.item_code ?? "N/A"}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {machine.current_wo?.customer ?? "N/A"}
                              </p>
                            </div>

                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Progress:</span>
                                <span className="font-medium">{Math.round(progress)}%</span>
                              </div>
                              <Progress value={progress} className="h-2" />
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground py-4 text-center">
                            {machine.status === "idle" ? "Available for assignment" : machine.status.replace("_", " ")}
                          </p>
                        )}

                        {nextJob && (
                          <div className="pt-2 border-t">
                            <p className="text-xs text-muted-foreground">Next Job:</p>
                            <p className="text-xs font-medium truncate">
                              {nextJob.work_order?.display_id ?? nextJob.work_order?.wo_id ?? "N/A"}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrated Gantt Scheduler */}
        <div id="gantt-scheduler">
          <GanttScheduler />
        </div>
      </div>

      {/* Queue Management Side Panel */}
      <Sheet open={queuePanelOpen} onOpenChange={setQueuePanelOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedMachine?.machine_id} - Queue Management
            </SheetTitle>
            <SheetDescription>
              View job history, current job, and upcoming queue
            </SheetDescription>
          </SheetHeader>

          {selectedMachine && (
            <div className="mt-6 space-y-6">
              {/* Current Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Current Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <Badge className={getStatusColor(selectedMachine.status)}>
                      {selectedMachine.status.replace("_", " ").toUpperCase()}
                    </Badge>
                    {selectedMachine.current_wo && (
                      <div className="text-sm flex-1">
                        <p className="font-medium">
                          {selectedMachine.current_wo?.display_id ?? selectedMachine.current_wo?.wo_id ?? "N/A"}
                        </p>
                        <p className="text-muted-foreground">
                          {selectedMachine.current_wo?.item_code ?? "N/A"}
                        </p>
                        <div className="mt-2">
                          <Progress value={calculateProgress(selectedMachine)} className="h-2" />
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* OEE Metrics */}
              {machineOEE && (
                <OEEWidget 
                  metrics={machineOEE}
                  title={`OEE - ${selectedMachine.machine_id}`}
                />
              )}

              {/* Upcoming Queue */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Upcoming Queue ({getQueueCount(selectedMachine)} jobs)</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedMachine.assignments
                    ?.filter((a: any) => a.status === "scheduled")
                    .sort((a: any, b: any) =>
                      new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
                    )
                    .map((assignment: any, idx: number) => (
                      <div
                        key={assignment.id}
                        className="border rounded-lg p-3 mb-2 hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/work-order/${assignment.wo_id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                            <div>
                              <p className="text-sm font-medium">
                                {assignment.work_order?.display_id ?? assignment.work_order?.wo_id ?? "N/A"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {assignment.work_order?.item_code ?? "N/A"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">
                              Qty: {assignment?.quantity_allocated ?? 0}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {assignment?.scheduled_start ? format(new Date(assignment.scheduled_start), "MMM dd, HH:mm") : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  {getQueueCount(selectedMachine) === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No queued jobs
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Job History */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Recent History (Last 5 jobs)</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedMachine.assignments
                    ?.filter((a: any) => a.status === "completed")
                    .sort((a: any, b: any) =>
                      new Date(b.actual_end || b.scheduled_end).getTime() -
                      new Date(a.actual_end || a.scheduled_end).getTime()
                    )
                    .slice(0, 5)
                    .map((assignment: any) => (
                      <div
                        key={assignment.id}
                        className="border rounded-lg p-3 mb-2 hover:bg-muted/50 cursor-pointer"
                        onClick={() => navigate(`/work-order/${assignment.wo_id}`)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">
                              {assignment.work_order?.display_id ?? assignment.work_order?.wo_id ?? "N/A"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {assignment.work_order?.item_code ?? "N/A"}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge variant="secondary" className="text-xs">
                              Completed
                            </Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              {assignment?.actual_end ? format(new Date(assignment.actual_end), "MMM dd") : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  {selectedMachine.assignments?.filter((a: any) => a.status === "completed").length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No completed jobs
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default CNCDashboard;
