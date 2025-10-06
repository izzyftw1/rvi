import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, AlertTriangle, Clock } from "lucide-react";
import { differenceInMinutes, startOfDay, endOfDay } from "date-fns";

export const MachineUtilizationDashboard = () => {
  const [metrics, setMetrics] = useState({
    totalMachines: 0,
    runningMachines: 0,
    utilizationRate: 0,
    averageIdleTime: 0,
    bottleneckMachines: [] as any[],
    topPerformers: [] as any[],
  });

  useEffect(() => {
    calculateMetrics();

    const interval = setInterval(calculateMetrics, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  const calculateMetrics = async () => {
    try {
      // Get all machines
      const { data: machines, error: machinesError } = await supabase
        .from("machines")
        .select("*");

      if (machinesError) throw machinesError;

      const totalMachines = machines?.length || 0;
      const runningMachines = machines?.filter((m) => m.status === "running").length || 0;

      // Calculate utilization for today
      const today = new Date();
      const dayStart = startOfDay(today);
      const dayEnd = endOfDay(today);
      const totalMinutesInDay = differenceInMinutes(dayEnd, dayStart);

      const { data: todayAssignments, error: assignmentsError } = await supabase
        .from("wo_machine_assignments")
        .select("machine_id, scheduled_start, scheduled_end, actual_start, actual_end, status")
        .gte("scheduled_start", dayStart.toISOString())
        .lte("scheduled_end", dayEnd.toISOString());

      if (assignmentsError) throw assignmentsError;

      // Calculate utilization per machine
      const machineUtilization = new Map<string, number>();
      
      todayAssignments?.forEach((assignment) => {
        const start = assignment.actual_start
          ? new Date(assignment.actual_start)
          : new Date(assignment.scheduled_start);
        const end = assignment.actual_end
          ? new Date(assignment.actual_end)
          : assignment.status === "running"
          ? new Date()
          : new Date(assignment.scheduled_end);

        const runMinutes = differenceInMinutes(end, start);
        const current = machineUtilization.get(assignment.machine_id) || 0;
        machineUtilization.set(assignment.machine_id, current + runMinutes);
      });

      // Calculate overall utilization rate
      let totalUtilizedMinutes = 0;
      machineUtilization.forEach((minutes) => {
        totalUtilizedMinutes += minutes;
      });

      const utilizationRate =
        totalMachines > 0
          ? (totalUtilizedMinutes / (totalMinutesInDay * totalMachines)) * 100
          : 0;

      // Find bottlenecks (machines with longest queue times)
      const { data: queuedJobs, error: queueError } = await supabase
        .from("wo_machine_assignments")
        .select(`
          machine_id,
          machines(machine_id, name),
          scheduled_start,
          scheduled_end
        `)
        .eq("status", "scheduled")
        .order("scheduled_start", { ascending: true });

      if (queueError) throw queueError;

      const machineQueue = new Map<string, number>();
      queuedJobs?.forEach((job: any) => {
        const count = machineQueue.get(job.machine_id) || 0;
        machineQueue.set(job.machine_id, count + 1);
      });

      const bottleneckMachines = Array.from(machineQueue.entries())
        .map(([machineId, count]) => {
          const machine = machines?.find((m) => m.id === machineId);
          return { machine, queueLength: count };
        })
        .sort((a, b) => b.queueLength - a.queueLength)
        .slice(0, 5);

      // Find top performers (highest utilization)
      const topPerformers = Array.from(machineUtilization.entries())
        .map(([machineId, minutes]) => {
          const machine = machines?.find((m) => m.id === machineId);
          const utilization = (minutes / totalMinutesInDay) * 100;
          return { machine, utilization };
        })
        .sort((a, b) => b.utilization - a.utilization)
        .slice(0, 5);

      // Calculate average idle time
      const idleMachines = machines?.filter((m) => m.status === "idle") || [];
      const averageIdleTime = idleMachines.length;

      setMetrics({
        totalMachines,
        runningMachines,
        utilizationRate: Math.round(utilizationRate),
        averageIdleTime,
        bottleneckMachines,
        topPerformers,
      });
    } catch (error) {
      console.error("Error calculating metrics:", error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Overall Utilization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Overall Utilization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-3xl font-bold">
              {metrics.utilizationRate}%
            </div>
            <Progress value={metrics.utilizationRate} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {metrics.runningMachines} of {metrics.totalMachines} machines running
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Active Machines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-green-600" />
            Active Machines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-green-600">
              {metrics.runningMachines}
            </div>
            <p className="text-xs text-muted-foreground">
              Currently in production
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Idle Machines */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-gray-600" />
            Idle Machines
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-gray-600">
              {metrics.averageIdleTime}
            </div>
            <p className="text-xs text-muted-foreground">
              Available for assignment
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Bottleneck Alert */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            Bottlenecks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="text-3xl font-bold text-orange-600">
              {metrics.bottleneckMachines.length}
            </div>
            <p className="text-xs text-muted-foreground">
              Machines with long queues
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Top Performers */}
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Top Performing Machines (Today)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.topPerformers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data available</p>
          ) : (
            <div className="space-y-3">
              {metrics.topPerformers.map((performer, idx) => (
                <div key={idx} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {performer.machine?.machine_id} - {performer.machine?.name}
                    </p>
                    <Progress value={performer.utilization} className="h-2 mt-1" />
                  </div>
                  <Badge variant="secondary" className="ml-2">
                    {Math.round(performer.utilization)}%
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottleneck Machines */}
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Machines with Longest Queues
          </CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.bottleneckMachines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No queued jobs</p>
          ) : (
            <div className="space-y-2">
              {metrics.bottleneckMachines.map((bottleneck, idx) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-muted rounded">
                  <p className="text-sm font-medium">
                    {bottleneck.machine?.machine_id} - {bottleneck.machine?.name}
                  </p>
                  <Badge variant="destructive">
                    {bottleneck.queueLength} jobs queued
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
