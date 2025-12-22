import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Activity, 
  ArrowRight,
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Wrench,
  Play,
  Pause,
  Zap,
  Settings,
  Package
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInMinutes, parseISO, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type ReadinessStatus = 'ready' | 'setup_required' | 'maintenance_due' | 'running' | 'down';

interface MachineData {
  id: string;
  machine_id: string;
  name: string;
  status: string;
  current_wo_id: string | null;
  current_job_start: string | null;
  last_qc_check_at: string | null;
  next_qc_check_due: string | null;
  // Calculated fields
  readiness: ReadinessStatus;
  queueCount: number;
  oldestQueueAge: number; // in hours
  currentWO: any | null;
  lastMaintenanceDate: string | null;
  daysSinceLastMaintenance: number;
}

interface EligibleWorkOrder {
  id: string;
  display_id: string;
  customer: string;
  item_code: string;
  quantity: number;
  due_date: string;
  waitingHours: number;
}

const MAINTENANCE_DUE_DAYS = 30;

const CNCDashboard = () => {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const [eligibleWOs, setEligibleWOs] = useState<EligibleWorkOrder[]>([]);
  const [loadingWOs, setLoadingWOs] = useState(false);

  const loadMachines = useCallback(async () => {
    try {
      setLoading(true);

      // Get machines
      const { data: machinesData, error: machinesError } = await supabase
        .from("machines")
        .select(`
          id,
          machine_id,
          name,
          status,
          current_wo_id,
          current_job_start,
          last_qc_check_at,
          next_qc_check_due
        `)
        .order("machine_id", { ascending: true });

      if (machinesError) throw machinesError;

      // Get maintenance logs for last maintenance dates
      const { data: maintenanceLogs } = await supabase
        .from("maintenance_logs")
        .select("machine_id, end_time")
        .not("end_time", "is", null)
        .order("end_time", { ascending: false });

      // Get queued assignments
      const { data: queuedAssignments } = await supabase
        .from("wo_machine_assignments")
        .select("machine_id, scheduled_start, wo_id")
        .eq("status", "scheduled")
        .order("scheduled_start", { ascending: true });

      // Get current WO details for running machines
      const runningMachineWoIds = (machinesData || [])
        .filter(m => m.current_wo_id)
        .map(m => m.current_wo_id);

      let currentWOs: Record<string, any> = {};
      if (runningMachineWoIds.length > 0) {
        const { data: woData } = await supabase
          .from("work_orders")
          .select("id, display_id, customer, item_code, quantity")
          .in("id", runningMachineWoIds);
        
        if (woData) {
          currentWOs = Object.fromEntries(woData.map(wo => [wo.id, wo]));
        }
      }

      // Process machines with calculated fields
      const enrichedMachines: MachineData[] = (machinesData || []).map(machine => {
        // Find last maintenance
        const lastMaintenance = (maintenanceLogs || []).find(log => log.machine_id === machine.id);
        const lastMaintenanceDate = lastMaintenance?.end_time || null;
        const daysSinceLastMaintenance = lastMaintenanceDate 
          ? Math.floor(differenceInHours(new Date(), parseISO(lastMaintenanceDate)) / 24)
          : 999;

        // Calculate queue info
        const machineQueue = (queuedAssignments || []).filter(a => a.machine_id === machine.id);
        const queueCount = machineQueue.length;
        const oldestQueueAge = machineQueue.length > 0
          ? Math.floor(differenceInHours(new Date(), parseISO(machineQueue[0].scheduled_start)))
          : 0;

        // Determine readiness status
        let readiness: ReadinessStatus = 'ready';
        if (machine.status === 'running' || machine.current_wo_id) {
          readiness = 'running';
        } else if (machine.status === 'down' || machine.status === 'fault') {
          readiness = 'down';
        } else if (daysSinceLastMaintenance >= MAINTENANCE_DUE_DAYS) {
          readiness = 'maintenance_due';
        } else if (machine.status === 'setup') {
          readiness = 'setup_required';
        }

        return {
          ...machine,
          readiness,
          queueCount,
          oldestQueueAge: Math.max(0, oldestQueueAge),
          currentWO: machine.current_wo_id ? currentWOs[machine.current_wo_id] : null,
          lastMaintenanceDate,
          daysSinceLastMaintenance
        };
      });

      setMachines(enrichedMachines);
    } catch (error: any) {
      console.error("Error loading machines:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMachines();

    const channel = supabase
      .channel("cnc-dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "machines" }, () => loadMachines())
      .on("postgres_changes", { event: "*", schema: "public", table: "wo_machine_assignments" }, () => loadMachines())
      .subscribe();

    const interval = setInterval(loadMachines, 30000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [loadMachines]);

  const handleOpenAssignDialog = async (machine: MachineData) => {
    setSelectedMachine(machine);
    setAssignDialogOpen(true);
    setLoadingWOs(true);

    try {
      // Get eligible work orders (in production stage, both QC gates passed)
      const { data, error } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, quantity, due_date, created_at")
        .in("status", ["pending", "in_progress"])
        .eq("current_stage", "production")
        .eq("qc_material_passed", true)
        .eq("qc_first_piece_passed", true)
        .order("due_date", { ascending: true })
        .limit(20);

      if (error) throw error;

      const enriched: EligibleWorkOrder[] = (data || []).map(wo => ({
        ...wo,
        waitingHours: Math.floor(differenceInHours(new Date(), parseISO(wo.created_at)))
      }));

      setEligibleWOs(enriched);
    } catch (error: any) {
      toast.error("Failed to load eligible work orders");
    } finally {
      setLoadingWOs(false);
    }
  };

  const handleAssignWork = async (woId: string) => {
    if (!selectedMachine) return;

    try {
      // Update machine with current WO
      const { error } = await supabase
        .from("machines")
        .update({ 
          current_wo_id: woId,
          current_job_start: new Date().toISOString(),
          status: 'running'
        })
        .eq("id", selectedMachine.id);

      if (error) throw error;

      toast.success(`Work assigned to ${selectedMachine.name}`);
      setAssignDialogOpen(false);
      loadMachines();
    } catch (error: any) {
      toast.error(error.message || "Failed to assign work");
    }
  };

  // Summary metrics
  const metrics = useMemo(() => {
    const ready = machines.filter(m => m.readiness === 'ready');
    const running = machines.filter(m => m.readiness === 'running');
    const needsAttention = machines.filter(m => 
      m.readiness === 'maintenance_due' || m.readiness === 'setup_required' || m.readiness === 'down'
    );
    const totalQueued = machines.reduce((sum, m) => sum + m.queueCount, 0);

    return {
      readyCount: ready.length,
      runningCount: running.length,
      needsAttentionCount: needsAttention.length,
      totalQueued,
      totalMachines: machines.length
    };
  }, [machines]);

  // Determine high-impact machines: highest queue (top 20%) or blocking overdue WOs (>48h oldest)
  const highImpactMachineIds = useMemo(() => {
    const ids = new Set<string>();
    
    // Find machines with highest queue counts (top 20% or at least 3+ queued)
    const machinesWithQueue = machines.filter(m => m.queueCount > 0);
    if (machinesWithQueue.length > 0) {
      const sortedByQueue = [...machinesWithQueue].sort((a, b) => b.queueCount - a.queueCount);
      const topCount = Math.max(1, Math.ceil(sortedByQueue.length * 0.2));
      const threshold = sortedByQueue[Math.min(topCount - 1, sortedByQueue.length - 1)]?.queueCount || 3;
      
      machinesWithQueue.forEach(m => {
        if (m.queueCount >= threshold || m.queueCount >= 3) {
          ids.add(m.id);
        }
      });
    }
    
    // Add machines blocking overdue WOs (oldest queue age > 48h)
    machines.forEach(m => {
      if (m.oldestQueueAge > 48) {
        ids.add(m.id);
      }
    });
    
    return ids;
  }, [machines]);

  // Neutral styling for low-impact machines, colored only for high-impact or critical states
  const getCardStyling = (machine: MachineData) => {
    const isHighImpact = highImpactMachineIds.has(machine.id);
    const isDown = machine.readiness === 'down';
    const isReady = machine.readiness === 'ready';
    
    // Always highlight: down machines and ready machines
    if (isDown) {
      return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    }
    if (isReady) {
      return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
    }
    
    // High-impact machines get colored backgrounds
    if (isHighImpact) {
      if (machine.readiness === 'running') {
        return 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800';
      }
      if (machine.readiness === 'maintenance_due') {
        return 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800';
      }
      if (machine.readiness === 'setup_required') {
        return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
      }
    }
    
    // Low-impact machines get neutral styling
    return 'bg-muted/20 border-muted';
  };

  const readinessConfig: Record<ReadinessStatus, { label: string; color: string; icon: React.ElementType }> = {
    ready: { label: 'Ready', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
    running: { label: 'Running', color: 'text-blue-600 dark:text-blue-400', icon: Activity },
    setup_required: { label: 'Setup Required', color: 'text-amber-600 dark:text-amber-400', icon: Settings },
    maintenance_due: { label: 'Maintenance Due', color: 'text-orange-600 dark:text-orange-400', icon: Wrench },
    down: { label: 'Down', color: 'text-red-600 dark:text-red-400', icon: AlertTriangle }
  };

  // Sort machines: Ready first, then running, then others
  const sortedMachines = useMemo(() => {
    const order: Record<ReadinessStatus, number> = { ready: 0, running: 1, setup_required: 2, maintenance_due: 3, down: 4 };
    return [...machines].sort((a, b) => order[a.readiness] - order[b.readiness]);
  }, [machines]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Activity className="h-7 w-7" />
              CNC Dashboard
            </h1>
            <p className="text-sm text-muted-foreground">
              Fast job assignment • Real-time machine readiness
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex flex-wrap gap-2">
            <Badge className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">
              <CheckCircle2 className="h-3 w-3" />
              {metrics.readyCount} Ready
            </Badge>
            <Badge className="gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200">
              <Activity className="h-3 w-3" />
              {metrics.runningCount} Running
            </Badge>
            {metrics.needsAttentionCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {metrics.needsAttentionCount} Need Attention
              </Badge>
            )}
          </div>
        </div>

        {/* Action Hint */}
        {metrics.readyCount > 0 && (
          <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <Zap className="h-4 w-4" />
                <span className="text-sm font-medium">
                  {metrics.readyCount} machine{metrics.readyCount > 1 ? 's' : ''} ready for work assignment
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Machine Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-4 space-y-3">
                  <div className="h-6 bg-muted rounded w-2/3" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-16 bg-muted rounded" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {sortedMachines.map(machine => {
              const config = readinessConfig[machine.readiness];
              const Icon = config.icon;
              const isEligibleForAssignment = machine.readiness === 'ready';
              const jobDuration = machine.current_job_start 
                ? differenceInMinutes(new Date(), parseISO(machine.current_job_start))
                : 0;

              const isHighImpact = highImpactMachineIds.has(machine.id);

              return (
                <Card 
                  key={machine.id}
                  className={cn(
                    "transition-all border",
                    getCardStyling(machine),
                    isEligibleForAssignment && "ring-2 ring-green-400/50 border-2"
                  )}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-lg">{machine.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{machine.machine_id}</p>
                      </div>
                      <Icon className={cn("h-5 w-5", config.color)} />
                    </div>

                    {/* Status Badge */}
                    <Badge variant="outline" className={cn("w-full justify-center", config.color)}>
                      {config.label}
                    </Badge>

                    {/* Running Job Info */}
                    {machine.readiness === 'running' && machine.currentWO && (
                      <div 
                        className="bg-background/60 rounded p-2 cursor-pointer hover:bg-background/80 transition-colors"
                        onClick={() => navigate(`/work-orders/${machine.currentWO.id}`)}
                      >
                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                          <span>Running:</span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {jobDuration < 60 ? `${jobDuration}m` : `${Math.floor(jobDuration / 60)}h ${jobDuration % 60}m`}
                          </span>
                        </div>
                        <p className="font-mono font-medium text-sm">{machine.currentWO.display_id}</p>
                        <p className="text-xs text-muted-foreground truncate">{machine.currentWO.item_code}</p>
                      </div>
                    )}

                    {/* Queue Info */}
                    {machine.queueCount > 0 && (
                      <div className="flex items-center justify-between text-xs p-2 bg-background/40 rounded">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          Queue
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{machine.queueCount} jobs</span>
                          {machine.oldestQueueAge > 0 && (
                            <span className={cn(
                              "text-[10px]",
                              machine.oldestQueueAge > 24 && "text-amber-600",
                              machine.oldestQueueAge > 48 && "text-red-600"
                            )}>
                              ({machine.oldestQueueAge}h oldest)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Maintenance Warning */}
                    {machine.readiness === 'maintenance_due' && (
                      <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                        <Wrench className="h-3 w-3" />
                        Last service: {machine.daysSinceLastMaintenance}d ago
                      </div>
                    )}

                    {/* Assign Work Button */}
                    {isEligibleForAssignment && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        onClick={() => handleOpenAssignDialog(machine)}
                      >
                        <Play className="h-4 w-4" />
                        Assign Work
                      </Button>
                    )}

                    {/* Idle machines that aren't ready */}
                    {machine.readiness !== 'ready' && machine.readiness !== 'running' && (
                      <div className="pt-1">
                        <p className="text-[10px] text-muted-foreground text-center">
                          Resolve {config.label.toLowerCase()} to enable assignment
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Assign Work Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Assign Work to {selectedMachine?.name}</DialogTitle>
              <DialogDescription>
                Select a work order ready for CNC production
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[400px]">
              {loadingWOs ? (
                <div className="py-8 text-center text-muted-foreground">Loading eligible work orders...</div>
              ) : eligibleWOs.length === 0 ? (
                <div className="py-8 text-center">
                  <Pause className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No eligible work orders</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    WOs must be in production stage with both QC gates passed
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {eligibleWOs.map(wo => {
                    const isOverdue = wo.due_date && new Date(wo.due_date) < new Date();
                    
                    return (
                      <div
                        key={wo.id}
                        onClick={() => handleAssignWork(wo.id)}
                        className={cn(
                          "p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group",
                          isOverdue && "border-red-300 dark:border-red-800"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-sm">{wo.display_id}</span>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                              )}
                              {wo.waitingHours > 24 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-amber-600">
                                  {wo.waitingHours}h waiting
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {wo.customer} • {wo.item_code} • {wo.quantity.toLocaleString()} pcs
                            </p>
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default CNCDashboard;
