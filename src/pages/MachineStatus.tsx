/**
 * Machine Status Page
 * 
 * REAL-TIME OPERATIONAL STATE ONLY:
 * - Running / Idle / Blocked / Maintenance states
 * - Current job info
 * - Live status updates
 * 
 * NO historical metrics - those belong in Production → Machine Utilisation
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Settings, AlertTriangle, Activity, Pause, Wrench, Clock, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, differenceInMinutes } from "date-fns";
import { useSiteContext } from "@/hooks/useSiteContext";
import { cn } from "@/lib/utils";

type OperationalState = "running" | "idle" | "blocked" | "maintenance" | "down" | "waiting_qc" | "paused";

const MachineStatus = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { currentSite } = useSiteContext();
  const [machines, setMachines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<any>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    if (currentSite) {
      loadMachines();
    }
  }, [currentSite]);

  useEffect(() => {
    if (!currentSite) return;

    const channel = supabase
      .channel("machines-realtime-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "machines" },
        () => loadMachines()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maintenance_logs" },
        () => loadMachines()
      )
      .subscribe();

    // Refresh every 30 seconds for live status
    const interval = setInterval(loadMachines, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [currentSite]);

  const loadMachines = async () => {
    if (!currentSite) return;
    
    try {
      setLoading(true);
      
      // Get machines with current state info
      const { data, error } = await supabase
        .from("machines")
        .select(`
          *,
          current_wo:work_orders!machines_current_wo_id_fkey(wo_id, display_id, item_code, quantity, customer),
          current_operator:profiles!machines_operator_id_fkey(full_name)
        `)
        .eq("site_id", currentSite.id)
        .order("machine_id", { ascending: true });

      if (error) throw error;

      // Check for active maintenance (blocks the machine)
      const machineIds = (data || []).map(m => m.id);
      const { data: activeMaintenance } = await supabase
        .from("maintenance_logs")
        .select("machine_id, start_time, downtime_reason")
        .in("machine_id", machineIds)
        .is("end_time", null);

      const maintenanceMap = new Map((activeMaintenance || []).map(m => [m.machine_id, m]));

      // Enrich with operational state
      const enriched = (data || []).map(machine => {
        const maintenance = maintenanceMap.get(machine.id);
        
        // Determine operational state
        let operationalState: OperationalState = "idle";
        let stateReason: string | null = null;
        
        if (maintenance) {
          const reason = maintenance.downtime_reason?.toLowerCase() || "";
          if (reason.includes("maintenance") || reason.includes("service")) {
            operationalState = "maintenance";
            stateReason = maintenance.downtime_reason;
          } else {
            operationalState = "blocked";
            stateReason = maintenance.downtime_reason;
          }
        } else if (machine.status === "down" || machine.status === "fault") {
          operationalState = "down";
          stateReason = "Machine fault reported";
        } else if (machine.status === "waiting_qc") {
          operationalState = "waiting_qc";
          stateReason = "Awaiting QC approval";
        } else if (machine.status === "paused") {
          operationalState = "paused";
        } else if (machine.current_wo_id || machine.status === "running") {
          operationalState = "running";
        }

        return {
          ...machine,
          operationalState,
          stateReason,
        };
      });

      setMachines(enriched);
    } catch (error: any) {
      console.error("Error loading machines:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const getStateConfig = (state: OperationalState) => {
    const configs: Record<OperationalState, { label: string; color: string; bgColor: string; icon: React.ElementType }> = {
      running: { label: "Running", color: "text-green-600", bgColor: "bg-green-500", icon: Activity },
      idle: { label: "Idle", color: "text-gray-500", bgColor: "bg-gray-400", icon: Pause },
      blocked: { label: "Blocked", color: "text-red-600", bgColor: "bg-red-500", icon: AlertTriangle },
      maintenance: { label: "Maintenance", color: "text-orange-600", bgColor: "bg-orange-500", icon: Wrench },
      down: { label: "Down", color: "text-red-600", bgColor: "bg-red-600", icon: AlertTriangle },
      waiting_qc: { label: "Waiting QC", color: "text-yellow-600", bgColor: "bg-yellow-500", icon: Clock },
      paused: { label: "Paused", color: "text-blue-500", bgColor: "bg-blue-400", icon: Pause },
    };
    return configs[state] || configs.idle;
  };

  const getTimeRunning = (machine: any) => {
    if (!machine.current_job_start || machine.operationalState !== "running") {
      return null;
    }
    const mins = differenceInMinutes(new Date(), new Date(machine.current_job_start));
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  };

  const viewDetail = (machine: any) => {
    setSelectedMachine(machine);
    setDetailOpen(true);
  };

  // Summary counts
  const stateCounts = {
    running: machines.filter(m => m.operationalState === "running").length,
    idle: machines.filter(m => m.operationalState === "idle").length,
    blocked: machines.filter(m => m.operationalState === "blocked" || m.operationalState === "down").length,
    maintenance: machines.filter(m => m.operationalState === "maintenance").length,
    waiting_qc: machines.filter(m => m.operationalState === "waiting_qc").length,
    paused: machines.filter(m => m.operationalState === "paused").length,
  };

  const filteredMachines =
    filterStatus === "all"
      ? machines
      : machines.filter((m) => m.operationalState === filterStatus);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader
        title="Machine Status"
        subtitle="Real-time operational state of all CNC machines"
      />

      <div className="p-6 space-y-6">
        {/* Real-time notice */}
        <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Live operational states. For historical utilisation analytics, see Production → Machine Utilisation.
          </span>
        </div>

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
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="idle">Idle</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="waiting_qc">Waiting QC</SelectItem>
                    <SelectItem value="paused">Paused</SelectItem>
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

        {/* Summary Stats - Operational States Only */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-green-600">{stateCounts.running}</p>
              <p className="text-sm text-muted-foreground">Running</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-gray-600">{stateCounts.idle}</p>
              <p className="text-sm text-muted-foreground">Idle</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-red-600">{stateCounts.blocked}</p>
              <p className="text-sm text-muted-foreground">Blocked/Down</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-orange-600">{stateCounts.maintenance}</p>
              <p className="text-sm text-muted-foreground">Maintenance</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-yellow-600">{stateCounts.waiting_qc}</p>
              <p className="text-sm text-muted-foreground">Waiting QC</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <p className="text-3xl font-bold text-blue-600">{stateCounts.paused}</p>
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
            {filteredMachines.map((machine) => {
              const config = getStateConfig(machine.operationalState);
              const Icon = config.icon;
              const runTime = getTimeRunning(machine);
              
              return (
                <Card
                  key={machine.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => viewDetail(machine)}
                >
                  <CardHeader className={cn(config.bgColor, "text-white")}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-bold">
                        {machine.machine_id}
                      </CardTitle>
                      <Badge variant="secondary" className="bg-white/90 text-black">
                        {config.label}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-2">
                    <p className="text-sm font-medium truncate">{machine.name}</p>

                    {/* Running Job Info */}
                    {machine.current_wo && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-muted-foreground">Current Job:</p>
                        <p className="text-sm font-mono truncate">
                          {machine.current_wo.display_id || machine.current_wo.wo_id}
                        </p>
                        <p className="text-xs truncate">{machine.current_wo.item_code}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {machine.current_wo.customer}
                        </p>
                        {runTime && (
                          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            Running: {runTime}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Operator */}
                    {machine.current_operator?.full_name && (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Operator:</span>{" "}
                        {machine.current_operator.full_name}
                      </p>
                    )}

                    {/* Idle state */}
                    {machine.operationalState === "idle" && !machine.current_wo && (
                      <p className="text-xs text-muted-foreground py-4 text-center">
                        Available for assignment
                      </p>
                    )}

                    {/* Blocked/Down reason */}
                    {(machine.operationalState === "blocked" || machine.operationalState === "down") && machine.stateReason && (
                      <div className="flex items-start gap-2 text-red-600 text-xs pt-2">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{machine.stateReason}</span>
                      </div>
                    )}

                    {/* Maintenance reason */}
                    {machine.operationalState === "maintenance" && machine.stateReason && (
                      <div className="flex items-start gap-2 text-orange-600 text-xs pt-2">
                        <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>{machine.stateReason}</span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Machine Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedMachine?.machine_id} - {selectedMachine?.name}
            </DialogTitle>
            <DialogDescription>Current operational state</DialogDescription>
          </DialogHeader>

          {selectedMachine && (
            <div className="space-y-4">
              {/* Current Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Current Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <Badge className={getStateConfig(selectedMachine.operationalState).bgColor}>
                        {getStateConfig(selectedMachine.operationalState).label}
                      </Badge>
                      {selectedMachine.stateReason && (
                        <span className="text-sm text-muted-foreground">
                          {selectedMachine.stateReason}
                        </span>
                      )}
                    </div>
                    
                    {selectedMachine.current_wo && (
                      <div className="pt-2 border-t">
                        <p className="text-sm font-medium mb-1">Current Job:</p>
                        <div 
                          className="p-2 rounded bg-muted/50 cursor-pointer hover:bg-muted transition-colors"
                          onClick={() => {
                            setDetailOpen(false);
                            navigate(`/work-orders/${selectedMachine.current_wo.id}`);
                          }}
                        >
                          <p className="font-mono font-semibold">
                            {selectedMachine.current_wo.display_id || selectedMachine.current_wo.wo_id}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {selectedMachine.current_wo.item_code} • {selectedMachine.current_wo.quantity?.toLocaleString()} pcs
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {selectedMachine.current_wo.customer}
                          </p>
                        </div>
                      </div>
                    )}

                    {selectedMachine.current_operator?.full_name && (
                      <div className="pt-2 border-t">
                        <p className="text-sm">
                          <span className="text-muted-foreground">Current Operator:</span>{" "}
                          {selectedMachine.current_operator.full_name}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1"
                  onClick={() => {
                    setDetailOpen(false);
                    navigate("/cnc-dashboard");
                  }}
                >
                  Open CNC Dashboard
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MachineStatus;
