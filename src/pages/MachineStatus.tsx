import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Settings, Calendar, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, differenceInMinutes } from "date-fns";
import { GanttScheduler } from "@/components/GanttScheduler";
import { MachineUtilizationDashboard } from "@/components/MachineUtilizationDashboard";

const MachineStatus = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    loadMachines();

    const channel = supabase
      .channel("machines-realtime")
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

  const getTimeRemaining = (machine: any) => {
    if (!machine.estimated_completion || machine.status !== "running") {
      return null;
    }

    const now = new Date();
    const end = new Date(machine.estimated_completion);
    const mins = differenceInMinutes(end, now);

    if (mins < 0) return "Overdue";
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  const viewSchedule = (machine: any) => {
    setSelectedMachine(machine);
    setScheduleOpen(true);
  };

  const filteredMachines =
    filterStatus === "all"
      ? machines
      : machines.filter((m) => m.status === filterStatus);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader
        title="CNC Machine Status"
        subtitle="Live status and scheduling for all 35 CNC machines"
      />

      <div className="p-6 space-y-6">
        <Tabs defaultValue="status" className="w-full">
          <TabsList>
            <TabsTrigger value="status">Live Status</TabsTrigger>
            <TabsTrigger value="gantt">Gantt Scheduler</TabsTrigger>
            <TabsTrigger value="metrics">Utilization Metrics</TabsTrigger>
          </TabsList>

          <TabsContent value="status" className="space-y-6 mt-6">
        {/* Filter Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Machines</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="waiting_qc">Waiting QC</SelectItem>
                    <SelectItem value="down">Down</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => navigate("/admin")} variant="outline">
                <Settings className="h-4 w-4 mr-2" />
                Manage Machines
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-600">
                {machines.filter((m) => m.status === "running").length}
              </p>
              <p className="text-sm text-muted-foreground">Running</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-gray-600">
                {machines.filter((m) => m.status === "idle").length}
              </p>
              <p className="text-sm text-muted-foreground">Idle</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-yellow-600">
                {machines.filter((m) => m.status === "waiting_qc").length}
              </p>
              <p className="text-sm text-muted-foreground">Waiting QC</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-600">
                {machines.filter((m) => m.status === "down").length}
              </p>
              <p className="text-sm text-muted-foreground">Down</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-orange-600">
                {machines.filter((m) => m.status === "maintenance").length}
              </p>
              <p className="text-sm text-muted-foreground">Maintenance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-blue-600">
                {machines.filter((m) => m.status === "paused").length}
              </p>
              <p className="text-sm text-muted-foreground">Paused</p>
            </CardContent>
          </Card>
        </div>

        {/* Machine Grid */}
        {loading ? (
          <div className="text-center py-8">Loading machines...</div>
        ) : filteredMachines.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No machines found
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {filteredMachines.map((machine) => (
              <Card
                key={machine.id}
                className="cursor-pointer hover:shadow-lg transition-shadow"
                onClick={() => viewSchedule(machine)}
              >
                <CardHeader className={`${getStatusColor(machine.status)} text-white`}>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-bold">
                      {machine.machine_id}
                    </CardTitle>
                    <Badge variant="secondary" className="bg-white text-black">
                      {machine.status.replace("_", " ").toUpperCase()}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-4 space-y-2">
                  <p className="text-sm font-medium truncate">{machine.name}</p>

                  {machine.current_wo && (
                    <>
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">Current Job:</p>
                        <p className="text-sm font-mono truncate">
                          {machine.current_wo.display_id || machine.current_wo.wo_id}
                        </p>
                        <p className="text-xs truncate">{machine.current_wo.item_code}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {machine.current_wo.customer}
                        </p>
                      </div>

                      <p className="text-xs">
                        <span className="text-muted-foreground">Operator:</span>{" "}
                        {machine.current_operator?.full_name || "Unassigned"}
                      </p>

                      {getTimeRemaining(machine) && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Time left:</span>
                          <Badge variant="outline" className="text-xs">
                            {getTimeRemaining(machine)}
                          </Badge>
                        </div>
                      )}
                    </>
                  )}

                  {!machine.current_wo && machine.status === "idle" && (
                    <p className="text-xs text-muted-foreground py-4 text-center">
                      Available for assignment
                    </p>
                  )}

                  {machine.status === "down" && (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      <p className="text-xs">Machine Down</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
        </TabsContent>

        <TabsContent value="gantt" className="mt-6">
          <GanttScheduler />
        </TabsContent>

        <TabsContent value="metrics" className="mt-6">
          <MachineUtilizationDashboard />
        </TabsContent>
      </Tabs>
      </div>

      {/* Schedule Dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedMachine?.machine_id} - {selectedMachine?.name} Schedule
            </DialogTitle>
            <DialogDescription>View machine status and scheduled jobs</DialogDescription>
          </DialogHeader>

          {selectedMachine && (
            <div className="space-y-4">
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
                      <div className="text-sm">
                        <p className="font-medium">
                          {selectedMachine.current_wo.display_id || selectedMachine.current_wo.wo_id}
                        </p>
                        <p className="text-muted-foreground">
                          {selectedMachine.current_wo.item_code}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Schedule Timeline */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Scheduled Jobs</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedMachine.assignments && selectedMachine.assignments.length > 0 ? (
                    <div className="space-y-3">
                      {selectedMachine.assignments
                        .filter((a: any) => a.status !== "completed" && a.status !== "cancelled")
                        .sort((a: any, b: any) =>
                          new Date(a.scheduled_start).getTime() -
                          new Date(b.scheduled_start).getTime()
                        )
                        .map((assignment: any) => (
                          <div
                            key={assignment.id}
                            className="border rounded-lg p-3 hover:bg-muted/50 cursor-pointer"
                            onClick={() => navigate(`/work-order/${assignment.wo_id}`)}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">
                                  {assignment.work_order?.display_id || assignment.work_order?.wo_id}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  {assignment.work_order?.item_code}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {assignment.work_order?.customer}
                                </p>
                              </div>
                              <div className="text-right">
                                <Badge
                                  variant={
                                    assignment.status === "running"
                                      ? "default"
                                      : "secondary"
                                  }
                                >
                                  {assignment.status}
                                </Badge>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Qty: {assignment.quantity_allocated}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              <p>
                                Start: {format(new Date(assignment.scheduled_start), "MMM dd, HH:mm")}
                              </p>
                              <p>
                                End: {format(new Date(assignment.scheduled_end), "MMM dd, HH:mm")}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No scheduled jobs
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MachineStatus;
