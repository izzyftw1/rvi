/**
 * CNC Dashboard
 * 
 * EXECUTION FOCUS ONLY:
 * - Queues and job assignment
 * - Oldest job age
 * - Next action per machine
 * - Current blockers (from latest production log & QC state)
 * 
 * NO historical metrics (utilisation %, efficiency %) - those belong in Machine Utilisation
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Package,
  Info
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInMinutes, parseISO, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

type ReadinessStatus = 'ready' | 'setup_required' | 'maintenance_due' | 'running' | 'down' | 'qc_blocked';
type PriorityLevel = 'high' | 'medium' | 'low' | null;

interface MachineData {
  id: string;
  machine_id: string;
  name: string;
  status: string;
  current_wo_id: string | null;
  current_job_start: string | null;
  // Execution-focused fields
  readiness: ReadinessStatus;
  queueCount: number;
  oldestQueueAge: number; // in hours
  currentWO: any | null;
  flowImpact: string | null;
  priority: PriorityLevel;
  hasOverdueWOs: boolean;
  nextAction: string;
  blockers: string[];
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

// Helper to derive flow impact text from queued work orders' stages
const deriveFlowImpact = (stages: string[]): string | null => {
  if (stages.length === 0) return null;
  
  const stageCounts: Record<string, number> = {};
  stages.forEach(stage => {
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;
  });
  
  const primaryStage = Object.entries(stageCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0];
  
  if (!primaryStage) return null;
  
  const stageFlowMap: Record<string, string> = {
    'cutting': 'Blocking Cutting stage',
    'forging': 'Blocking Forging stage',
    'production': 'Feeds downstream stages',
    'external': 'Upstream of External processing',
    'qc': 'Feeds QC stage',
    'packing': 'Feeds Packing',
    'dispatch': 'Upstream of Dispatch',
  };
  
  return stageFlowMap[primaryStage.toLowerCase()] || null;
};

// Calculate priority based on queue metrics
const calculatePriority = (
  queueCount: number, 
  oldestQueueAge: number, 
  hasOverdueWOs: boolean
): PriorityLevel => {
  if (queueCount === 0) return null;
  if (hasOverdueWOs || queueCount >= 5 || oldestQueueAge >= 72) return 'high';
  if (queueCount >= 3 || oldestQueueAge >= 24) return 'medium';
  return 'low';
};

// Determine next action based on state
const getNextAction = (readiness: ReadinessStatus, queueCount: number): string => {
  switch (readiness) {
    case 'ready': return queueCount > 0 ? 'Assign from queue' : 'Assign new work';
    case 'running': return 'Monitor progress';
    case 'setup_required': return 'Complete setup';
    case 'maintenance_due': return 'Clear maintenance';
    case 'down': return 'Report issue';
    case 'qc_blocked': return 'Await QC clearance';
    default: return 'Review status';
  }
};

const CNCDashboard = () => {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [queueDialogOpen, setQueueDialogOpen] = useState(false);
  const [selectedMachine, setSelectedMachine] = useState<MachineData | null>(null);
  const [eligibleWOs, setEligibleWOs] = useState<EligibleWorkOrder[]>([]);
  const [queuedWOs, setQueuedWOs] = useState<any[]>([]);
  const [loadingWOs, setLoadingWOs] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const loadMachines = useCallback(async () => {
    try {
      setLoading(true);
      const today = new Date().toISOString().split('T')[0];

      // Get machines
      const { data: machinesData, error: machinesError } = await supabase
        .from("machines")
        .select(`id, machine_id, name, status, current_wo_id, current_job_start, qc_status`)
        .order("machine_id", { ascending: true });

      if (machinesError) throw machinesError;

      const machineIds = (machinesData || []).map(m => m.id);

      // Get latest production log for today to determine blockers
      const { data: productionLogs } = await supabase
        .from("daily_production_logs")
        .select("machine_id, wo_id, downtime_events")
        .in("machine_id", machineIds)
        .eq("log_date", today)
        .order("created_at", { ascending: false });

      // Get active maintenance (blocker)
      const { data: activeMaintenanceLogs } = await supabase
        .from("maintenance_logs")
        .select("machine_id, downtime_reason")
        .in("machine_id", machineIds)
        .is("end_time", null);

      // Get queued assignments
      const { data: queuedAssignments } = await supabase
        .from("wo_machine_assignments")
        .select("machine_id, scheduled_start, wo_id")
        .eq("status", "scheduled")
        .order("scheduled_start", { ascending: true });

      // Get WO details for current and queued
      const runningMachineWoIds = (machinesData || [])
        .filter(m => m.current_wo_id)
        .map(m => m.current_wo_id);
      const queuedWoIds = (queuedAssignments || []).map(a => a.wo_id);
      const allWoIds = [...new Set([...runningMachineWoIds, ...queuedWoIds])];

      let woDetails: Record<string, any> = {};
      if (allWoIds.length > 0) {
        const { data: woData } = await supabase
          .from("work_orders")
          .select("id, display_id, customer, item_code, quantity, current_stage, due_date")
          .in("id", allWoIds);
        
        if (woData) {
          woDetails = Object.fromEntries(woData.map(wo => [wo.id, wo]));
        }
      }

      // Create lookup maps
      const activeMaintenance = new Map((activeMaintenanceLogs || []).map(log => [log.machine_id, log]));
      const todayLogs = new Map<string, typeof productionLogs[0]>();
      (productionLogs || []).forEach(log => {
        if (!todayLogs.has(log.machine_id)) {
          todayLogs.set(log.machine_id, log);
        }
      });

      // Process machines
      const enrichedMachines: MachineData[] = (machinesData || []).map(machine => {
        const hasActiveMaintenance = activeMaintenance.has(machine.id);
        const maintenanceReason = activeMaintenance.get(machine.id)?.downtime_reason;
        const todayLog = todayLogs.get(machine.id);

        // Calculate queue info
        const machineQueue = (queuedAssignments || []).filter(a => a.machine_id === machine.id);
        const queueCount = machineQueue.length;
        const oldestQueueAge = machineQueue.length > 0
          ? Math.max(0, Math.floor(differenceInHours(new Date(), parseISO(machineQueue[0].scheduled_start))))
          : 0;

        // Derive flow impact
        const queuedWOsList = machineQueue.map(a => woDetails[a.wo_id]).filter(Boolean);
        const queuedStages = queuedWOsList.map(wo => wo?.current_stage).filter(Boolean);
        const flowImpact = deriveFlowImpact(queuedStages);

        // Check for overdue WOs
        const now = new Date();
        const hasOverdueWOs = queuedWOsList.some(wo => {
          if (!wo?.due_date) return false;
          return parseISO(wo.due_date) < now;
        });

        // Collect blockers from current state
        const blockers: string[] = [];
        
        // Check QC status from machine
        if (machine.qc_status === 'failed' || machine.qc_status === 'pending') {
          blockers.push('QC clearance required');
        }

        // Check active downtime from today's log
        if (todayLog?.downtime_events && Array.isArray(todayLog.downtime_events)) {
          const activeDowntime = (todayLog.downtime_events as any[]).find((e: any) => !e.resolved);
          if (activeDowntime) {
            blockers.push(`Active: ${activeDowntime.reason || 'Downtime event'}`);
          }
        }

        // Determine readiness status
        let readiness: ReadinessStatus = 'ready';
        
        if (hasActiveMaintenance) {
          const reason = maintenanceReason?.toLowerCase() || '';
          readiness = reason.includes('maintenance') || reason.includes('service') 
            ? 'maintenance_due' 
            : 'down';
          blockers.push(maintenanceReason || 'Maintenance in progress');
        } else if (machine.status === 'down' || machine.status === 'fault') {
          readiness = 'down';
          blockers.push('Machine fault');
        } else if (machine.qc_status === 'failed') {
          readiness = 'qc_blocked';
        } else if (machine.current_wo_id) {
          readiness = 'running';
        } else if (queueCount > 0 && machine.status !== 'running') {
          readiness = 'setup_required';
        }

        const priority = calculatePriority(queueCount, oldestQueueAge, hasOverdueWOs);
        const nextAction = getNextAction(readiness, queueCount);

        return {
          ...machine,
          readiness,
          queueCount,
          oldestQueueAge,
          currentWO: machine.current_wo_id ? woDetails[machine.current_wo_id] : null,
          flowImpact,
          priority,
          hasOverdueWOs,
          nextAction,
          blockers,
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
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_production_logs" }, () => loadMachines())
      .on("postgres_changes", { event: "*", schema: "public", table: "qc_records" }, () => loadMachines())
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

  const handleViewQueue = async (machine: MachineData) => {
    setSelectedMachine(machine);
    setQueueDialogOpen(true);
    setLoadingQueue(true);

    try {
      const { data: assignments, error: assignError } = await supabase
        .from("wo_machine_assignments")
        .select("wo_id, scheduled_start")
        .eq("machine_id", machine.id)
        .eq("status", "scheduled")
        .order("scheduled_start", { ascending: true });

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setQueuedWOs([]);
        return;
      }

      const woIds = assignments.map(a => a.wo_id);
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, quantity, due_date, current_stage")
        .in("id", woIds);

      if (woError) throw woError;

      const enriched = (wos || []).map(wo => {
        const assignment = assignments.find(a => a.wo_id === wo.id);
        return { ...wo, scheduledStart: assignment?.scheduled_start };
      }).sort((a, b) => {
        if (!a.scheduledStart || !b.scheduledStart) return 0;
        return new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime();
      });

      setQueuedWOs(enriched);
    } catch (error: any) {
      toast.error("Failed to load queued work orders");
      setQueuedWOs([]);
    } finally {
      setLoadingQueue(false);
    }
  };

  // Summary metrics (execution-focused only)
  const metrics = useMemo(() => {
    const ready = machines.filter(m => m.readiness === 'ready');
    const running = machines.filter(m => m.readiness === 'running');
    const blocked = machines.filter(m => 
      m.readiness === 'maintenance_due' || m.readiness === 'down' || m.readiness === 'qc_blocked'
    );
    const totalQueued = machines.reduce((sum, m) => sum + m.queueCount, 0);
    const oldestJobAge = Math.max(...machines.map(m => m.oldestQueueAge), 0);

    return {
      readyCount: ready.length,
      runningCount: running.length,
      blockedCount: blocked.length,
      totalQueued,
      oldestJobAge,
    };
  }, [machines]);

  // Sort: Ready first, then setup required, then running, then blocked
  const sortedMachines = useMemo(() => {
    const order: Record<ReadinessStatus, number> = { 
      ready: 0, 
      setup_required: 1, 
      running: 2, 
      qc_blocked: 3, 
      maintenance_due: 4, 
      down: 5 
    };
    return [...machines].sort((a, b) => order[a.readiness] - order[b.readiness]);
  }, [machines]);

  const readinessConfig: Record<ReadinessStatus, { label: string; color: string; icon: React.ElementType }> = {
    ready: { label: 'Ready', color: 'text-green-600 dark:text-green-400', icon: CheckCircle2 },
    running: { label: 'Running', color: 'text-blue-600 dark:text-blue-400', icon: Activity },
    setup_required: { label: 'Setup Required', color: 'text-amber-600 dark:text-amber-400', icon: Settings },
    maintenance_due: { label: 'Maintenance', color: 'text-orange-600 dark:text-orange-400', icon: Wrench },
    down: { label: 'Down', color: 'text-red-600 dark:text-red-400', icon: AlertTriangle },
    qc_blocked: { label: 'QC Blocked', color: 'text-purple-600 dark:text-purple-400', icon: Pause },
  };

  const getCardStyling = (machine: MachineData) => {
    if (machine.readiness === 'down') return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    if (machine.readiness === 'ready') return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
    if (machine.priority === 'high') return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    return 'bg-muted/20 border-muted';
  };

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
              Execution focus: queues, blockers, next actions
            </p>
          </div>

          {/* Quick Stats - Execution Only */}
          <div className="flex flex-wrap gap-2">
            <Badge className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">
              <CheckCircle2 className="h-3 w-3" />
              {metrics.readyCount} Ready
            </Badge>
            <Badge className="gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200">
              <Activity className="h-3 w-3" />
              {metrics.runningCount} Running
            </Badge>
            <Badge className="gap-1 bg-muted text-muted-foreground">
              <Package className="h-3 w-3" />
              {metrics.totalQueued} Queued
            </Badge>
            {metrics.blockedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangle className="h-3 w-3" />
                {metrics.blockedCount} Blocked
              </Badge>
            )}
          </div>
        </div>

        {/* Execution notice */}
        <div className="bg-muted/50 border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" />
          <span>
            Current state + blockers only. For historical analytics (utilisation %, efficiency %), see Production → Machine Utilisation.
          </span>
        </div>

        {/* Oldest Job Alert */}
        {metrics.oldestJobAge > 24 && (
          <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <Clock className="h-4 w-4" />
                <span className="text-sm font-medium">
                  Oldest queued job: {metrics.oldestJobAge}h — consider prioritizing
                </span>
              </div>
            </CardContent>
          </Card>
        )}

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

              return (
                <Card 
                  key={machine.id}
                  className={cn(
                    "transition-all border cursor-pointer hover:shadow-md",
                    getCardStyling(machine),
                    isEligibleForAssignment && "ring-2 ring-green-400/50"
                  )}
                  onClick={() => handleViewQueue(machine)}
                >
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate">{machine.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{machine.machine_id}</p>
                      </div>
                      <Icon className={cn("h-5 w-5 shrink-0", config.color)} />
                    </div>

                    {/* Status Badge */}
                    <Badge variant="outline" className={cn("w-full justify-center", config.color)}>
                      {config.label}
                    </Badge>

                    {/* Running Job Info */}
                    {machine.readiness === 'running' && machine.currentWO && (
                      <div 
                        className="bg-background/60 rounded p-2 cursor-pointer hover:bg-background/80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/work-orders/${machine.currentWO.id}`);
                        }}
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
                              ({machine.oldestQueueAge}h)
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Blockers */}
                    {machine.blockers.length > 0 && (
                      <div className="space-y-1">
                        {machine.blockers.slice(0, 2).map((blocker, idx) => (
                          <div key={idx} className="flex items-start gap-1 text-xs text-red-600 dark:text-red-400">
                            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                            <span className="truncate">{blocker}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Next Action */}
                    <div className="pt-2 border-t">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Next:</span> {machine.nextAction}
                      </p>
                    </div>

                    {/* Primary Action Button */}
                    {machine.readiness === 'ready' && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAssignDialog(machine);
                        }}
                      >
                        <Play className="h-4 w-4" />
                        Assign Work
                      </Button>
                    )}

                    {machine.readiness === 'maintenance_due' && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info("Maintenance clearance workflow coming soon");
                        }}
                      >
                        <Wrench className="h-4 w-4" />
                        Clear Maintenance
                      </Button>
                    )}

                    {machine.readiness === 'setup_required' && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info("Setup completion workflow coming soon");
                        }}
                      >
                        <Settings className="h-4 w-4" />
                        Complete Setup
                      </Button>
                    )}

                    {machine.readiness === 'down' && (
                      <Button 
                        className="w-full gap-2" 
                        size="sm"
                        variant="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          toast.info("Machine recovery workflow coming soon");
                        }}
                      >
                        <AlertTriangle className="h-4 w-4" />
                        Report Issue
                      </Button>
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

        {/* Queue View Dialog */}
        <Dialog open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Queued Work Orders – {selectedMachine?.name}</DialogTitle>
              <DialogDescription>
                {selectedMachine?.queueCount || 0} work order{(selectedMachine?.queueCount || 0) !== 1 ? 's' : ''} scheduled
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="max-h-[400px]">
              {loadingQueue ? (
                <div className="py-8 text-center text-muted-foreground">Loading...</div>
              ) : queuedWOs.length === 0 ? (
                <div className="py-8 text-center">
                  <Package className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                  <p className="text-muted-foreground">No work orders in queue</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {queuedWOs.map((wo, index) => {
                    const isOverdue = wo.due_date && new Date(wo.due_date) < new Date();
                    
                    return (
                      <div
                        key={wo.id}
                        onClick={() => {
                          setQueueDialogOpen(false);
                          navigate(`/work-orders/${wo.id}`);
                        }}
                        className={cn(
                          "p-3 rounded-lg border bg-card hover:bg-muted/50 cursor-pointer transition-colors group",
                          isOverdue && "border-red-300 dark:border-red-800"
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                #{index + 1}
                              </Badge>
                              <span className="font-mono font-semibold text-sm">{wo.display_id}</span>
                              {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">OVERDUE</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {wo.customer} • {wo.item_code} • {wo.quantity?.toLocaleString()} pcs
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
