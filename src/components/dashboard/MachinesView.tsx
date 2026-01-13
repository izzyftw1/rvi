/**
 * MachinesView - Enhanced Machine View (Merged from CNC Dashboard)
 * 
 * Shows for each machine:
 * - Current job context (WO, Item, Customer, Process Type)
 * - Cycle time with source indication (Log / Item Master / WO)
 * - Real-time production snapshot (pieces today, expected per hour)
 * - Visual status indicators (On Cycle / At Risk / Blocked)
 * - Complete Setup action tied to setter efficiency workflow
 * - Queue info and blockers
 * 
 * All values derived from Production Logs + Machine state.
 */
import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Factory,
  PlayCircle,
  PauseCircle,
  AlertOctagon,
  Clock,
  AlertTriangle,
  ArrowRight,
  Wrench,
  Activity,
  CheckCircle2,
  Settings,
  Package,
  Timer,
  Target,
  TrendingUp,
  TrendingDown,
  Minus,
  Zap,
  Info
} from "lucide-react";
import { cn } from "@/lib/utils";
import { differenceInHours, differenceInMinutes, parseISO, format } from "date-fns";
import { toast } from "sonner";

type ReadinessStatus = 'ready' | 'setup_required' | 'maintenance_due' | 'running' | 'down' | 'qc_blocked';
type ProductionStatus = 'on_cycle' | 'at_risk' | 'blocked' | 'idle';
type PriorityLevel = 'high' | 'medium' | 'low' | null;

interface CurrentJobInfo {
  woId: string;
  woDisplayId: string;
  itemCode: string;
  itemName: string | null;
  customerCode: string;
  processType: string | null;
}

interface CycleTimeInfo {
  seconds: number | null;
  source: 'log' | 'item_master' | 'work_order' | null;
}

interface ProductionSnapshot {
  piecesToday: number;
  expectedPerHour: number | null;
  productionStatus: ProductionStatus;
}

interface MachineData {
  id: string;
  machine_id: string;
  name: string;
  status: string;
  current_wo_id: string | null;
  current_job_start: string | null;
  readiness: ReadinessStatus;
  queueCount: number;
  oldestQueueAge: number;
  currentWO: any | null;
  priority: PriorityLevel;
  hasOverdueWOs: boolean;
  nextAction: string;
  blockers: string[];
  currentJob: CurrentJobInfo | null;
  cycleTime: CycleTimeInfo;
  productionSnapshot: ProductionSnapshot;
  downtimeToday: number;
  runtimeToday: number;
  okQtyToday: number;
  rejectionQtyToday: number;
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

interface MachinesViewProps {
  productionLogs: any[];
}

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

// Calculate production status based on actual vs expected output
const calculateProductionStatus = (
  piecesToday: number,
  expectedPerHour: number | null,
  hoursRunning: number,
  hasBlockers: boolean
): ProductionStatus => {
  if (hasBlockers) return 'blocked';
  if (!expectedPerHour || expectedPerHour <= 0) return 'idle';
  
  const expectedTotal = expectedPerHour * hoursRunning;
  if (expectedTotal <= 0) return 'on_cycle';
  
  const ratio = piecesToday / expectedTotal;
  if (ratio >= 0.85) return 'on_cycle';
  if (ratio >= 0.6) return 'at_risk';
  return 'blocked';
};

export const MachinesView = ({ productionLogs }: MachinesViewProps) => {
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

      // Get today's production logs for each machine
      const { data: todayLogs } = await supabase
        .from("daily_production_logs")
        .select("machine_id, wo_id, ok_quantity, actual_quantity, cycle_time_seconds, downtime_events, total_downtime_minutes, actual_runtime_minutes, total_rejection_quantity")
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
          .select("id, display_id, customer, item_code, quantity, current_stage, due_date, cycle_time_seconds, external_process_type, qc_material_passed, qc_first_piece_passed")
          .in("id", allWoIds);
        
        if (woData) {
          woDetails = Object.fromEntries(woData.map(wo => [wo.id, wo]));
        }
      }

      // Get item master details for cycle time and item name
      const itemCodes = [...new Set(Object.values(woDetails).map((wo: any) => wo.item_code).filter(Boolean))];
      let itemMasterDetails: Record<string, any> = {};
      if (itemCodes.length > 0) {
        const { data: itemData } = await supabase
          .from("item_master")
          .select("item_code, item_name, cycle_time_seconds")
          .in("item_code", itemCodes);
        
        if (itemData) {
          itemMasterDetails = Object.fromEntries(itemData.map(item => [item.item_code, item]));
        }
      }

      // Create lookup maps
      const activeMaintenance = new Map((activeMaintenanceLogs || []).map(log => [log.machine_id, log]));
      
      // Group production logs by machine
      const productionLogsByMachine = new Map<string, any[]>();
      (todayLogs || []).forEach(log => {
        if (!productionLogsByMachine.has(log.machine_id)) {
          productionLogsByMachine.set(log.machine_id, []);
        }
        productionLogsByMachine.get(log.machine_id)!.push(log);
      });

      // Process machines
      const enrichedMachines: MachineData[] = (machinesData || []).map(machine => {
        const hasActiveMaintenance = activeMaintenance.has(machine.id);
        const maintenanceReason = activeMaintenance.get(machine.id)?.downtime_reason;
        const machineLogs = productionLogsByMachine.get(machine.id) || [];
        const latestLog = machineLogs[0];

        // Calculate aggregate stats from today's logs
        const downtimeToday = machineLogs.reduce((sum, log) => sum + (log.total_downtime_minutes || 0), 0);
        const runtimeToday = machineLogs.reduce((sum, log) => sum + (log.actual_runtime_minutes || 0), 0);
        const okQtyToday = machineLogs.reduce((sum, log) => sum + (log.ok_quantity || 0), 0);
        const rejectionQtyToday = machineLogs.reduce((sum, log) => sum + (log.total_rejection_quantity || 0), 0);

        // Calculate queue info
        const machineQueue = (queuedAssignments || []).filter(a => a.machine_id === machine.id);
        const queueCount = machineQueue.length;
        const oldestQueueAge = machineQueue.length > 0
          ? Math.max(0, Math.floor(differenceInHours(new Date(), parseISO(machineQueue[0].scheduled_start))))
          : 0;

        // Check for overdue WOs
        const now = new Date();
        const queuedWOsList = machineQueue.map(a => woDetails[a.wo_id]).filter(Boolean);
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

        // Check WO QC states
        const currentWO = machine.current_wo_id ? woDetails[machine.current_wo_id] : null;
        if (currentWO && !currentWO.qc_material_passed) {
          blockers.push('Material QC pending');
        } else if (currentWO && !currentWO.qc_first_piece_passed) {
          blockers.push('First Piece QC pending');
        }

        // Check active downtime from today's log
        if (latestLog?.downtime_events && Array.isArray(latestLog.downtime_events)) {
          const activeDowntime = (latestLog.downtime_events as any[]).find((e: any) => !e.resolved);
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

        // Build current job info
        let currentJob: CurrentJobInfo | null = null;
        
        if (currentWO) {
          const itemMaster = itemMasterDetails[currentWO.item_code];
          currentJob = {
            woId: currentWO.id,
            woDisplayId: currentWO.display_id,
            itemCode: currentWO.item_code,
            itemName: itemMaster?.item_name || null,
            customerCode: currentWO.customer,
            processType: currentWO.external_process_type || 'CNC Machining'
          };
        }

        // Determine cycle time with source
        let cycleTime: CycleTimeInfo = { seconds: null, source: null };
        
        // Priority 1: Latest production log cycle time for this WO + machine
        if (currentWO && machineLogs.length > 0) {
          const woLog = machineLogs.find(log => log.wo_id === currentWO.id && log.cycle_time_seconds);
          if (woLog?.cycle_time_seconds) {
            cycleTime = { seconds: woLog.cycle_time_seconds, source: 'log' };
          }
        }
        
        // Priority 2: Work order cycle time
        if (!cycleTime.seconds && currentWO?.cycle_time_seconds) {
          cycleTime = { seconds: currentWO.cycle_time_seconds, source: 'work_order' };
        }
        
        // Priority 3: Item master cycle time
        if (!cycleTime.seconds && currentWO) {
          const itemMaster = itemMasterDetails[currentWO.item_code];
          if (itemMaster?.cycle_time_seconds) {
            cycleTime = { seconds: itemMaster.cycle_time_seconds, source: 'item_master' };
          }
        }

        // Calculate production snapshot
        const piecesToday = machineLogs
          .filter(log => log.wo_id === machine.current_wo_id)
          .reduce((sum, log) => sum + (log.ok_quantity || log.actual_quantity || 0), 0);
        
        const expectedPerHour = cycleTime.seconds && cycleTime.seconds > 0
          ? Math.floor(3600 / cycleTime.seconds)
          : null;
        
        const hoursRunning = machine.current_job_start 
          ? differenceInHours(new Date(), parseISO(machine.current_job_start))
          : 0;
        
        const productionStatus = calculateProductionStatus(
          piecesToday,
          expectedPerHour,
          hoursRunning,
          blockers.length > 0
        );

        const productionSnapshot: ProductionSnapshot = {
          piecesToday,
          expectedPerHour,
          productionStatus
        };

        return {
          id: machine.id,
          machine_id: machine.machine_id,
          name: machine.name,
          status: machine.status,
          current_wo_id: machine.current_wo_id,
          current_job_start: machine.current_job_start,
          readiness,
          queueCount,
          oldestQueueAge,
          currentWO,
          priority,
          hasOverdueWOs,
          nextAction,
          blockers,
          currentJob,
          cycleTime,
          productionSnapshot,
          downtimeToday,
          runtimeToday,
          okQtyToday,
          rejectionQtyToday,
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
    const interval = setInterval(loadMachines, 30000);
    return () => clearInterval(interval);
  }, [loadMachines, productionLogs]);

  // Handle Complete Setup - redirect to SetterEfficiency with pre-filled context
  const handleCompleteSetup = (machine: MachineData, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!machine.currentWO) {
      toast.error("No work order assigned to this machine");
      return;
    }
    
    const params = new URLSearchParams({
      machine_id: machine.id,
      wo_id: machine.currentWO.id || '',
      item_code: machine.currentWO.item_code || '',
      party_code: machine.currentWO.customer || '',
      tab: 'activity'
    });
    
    navigate(`/setter-efficiency?${params.toString()}`);
  };

  const handleOpenAssignDialog = async (machine: MachineData, e: React.MouseEvent) => {
    e.stopPropagation();
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

  // Summary metrics
  const metrics = useMemo(() => {
    const ready = machines.filter(m => m.readiness === 'ready');
    const running = machines.filter(m => m.readiness === 'running');
    const blocked = machines.filter(m => 
      m.readiness === 'maintenance_due' || m.readiness === 'down' || m.readiness === 'qc_blocked'
    );
    const idle = machines.filter(m => m.readiness === 'ready' && m.queueCount === 0);
    const totalQueued = machines.reduce((sum, m) => sum + m.queueCount, 0);
    const totalDowntime = machines.reduce((sum, m) => sum + m.downtimeToday, 0);
    
    const onCycle = machines.filter(m => m.productionSnapshot.productionStatus === 'on_cycle' && m.readiness === 'running').length;
    const atRisk = machines.filter(m => m.productionSnapshot.productionStatus === 'at_risk').length;

    return {
      readyCount: ready.length,
      runningCount: running.length,
      blockedCount: blocked.length,
      idleCount: idle.length,
      totalQueued,
      totalDowntime,
      onCycleCount: onCycle,
      atRiskCount: atRisk,
      total: machines.length
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
    qc_blocked: { label: 'QC Blocked', color: 'text-purple-600 dark:text-purple-400', icon: PauseCircle },
  };

  const productionStatusConfig: Record<ProductionStatus, { label: string; color: string; icon: React.ElementType }> = {
    on_cycle: { label: 'On Cycle', color: 'text-green-600 bg-green-100 dark:bg-green-900/30', icon: TrendingUp },
    at_risk: { label: 'At Risk', color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30', icon: TrendingDown },
    blocked: { label: 'Blocked', color: 'text-red-600 bg-red-100 dark:bg-red-900/30', icon: AlertTriangle },
    idle: { label: 'Idle', color: 'text-muted-foreground bg-muted', icon: Minus },
  };

  const getCardStyling = (machine: MachineData) => {
    if (machine.readiness === 'down') return 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800';
    if (machine.readiness === 'ready') return 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800';
    if (machine.priority === 'high') return 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800';
    return 'bg-muted/20 border-muted';
  };

  const formatMinutes = (mins: number) => {
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    return `${hours}h ${remaining}m`;
  };

  if (loading) {
    return (
      <div className="space-y-4">
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
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="flex flex-wrap gap-3 text-sm">
        <Badge className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">
          <CheckCircle2 className="h-3 w-3" />
          {metrics.readyCount} Ready
        </Badge>
        <Badge className="gap-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-200">
          <Activity className="h-3 w-3" />
          {metrics.runningCount} Running
        </Badge>
        {metrics.onCycleCount > 0 && (
          <Badge className="gap-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">
            <TrendingUp className="h-3 w-3" />
            {metrics.onCycleCount} On Cycle
          </Badge>
        )}
        {metrics.atRiskCount > 0 && (
          <Badge className="gap-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200">
            <TrendingDown className="h-3 w-3" />
            {metrics.atRiskCount} At Risk
          </Badge>
        )}
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
        <div className="flex items-center gap-2 ml-auto text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Downtime: <span className="font-medium text-foreground">{formatMinutes(metrics.totalDowntime)}</span></span>
        </div>
      </div>

      {/* Action Hint */}
      {metrics.readyCount > 0 && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3 flex items-center gap-2 text-green-700 dark:text-green-300 text-sm">
          <Zap className="h-4 w-4 shrink-0" />
          <span>{metrics.readyCount} machine{metrics.readyCount > 1 ? 's' : ''} ready for work assignment</span>
        </div>
      )}

      {/* Machine Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {sortedMachines.map(machine => {
          const config = readinessConfig[machine.readiness];
          const Icon = config.icon;
          const isEligibleForAssignment = machine.readiness === 'ready';
          const jobDuration = machine.current_job_start 
            ? differenceInMinutes(new Date(), parseISO(machine.current_job_start))
            : 0;
          
          const prodConfig = productionStatusConfig[machine.productionSnapshot.productionStatus];
          const ProdIcon = prodConfig.icon;

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
                  <div className="flex items-center gap-1">
                    {/* Production Status Indicator */}
                    {(machine.readiness === 'running' || machine.readiness === 'setup_required') && (
                      <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0.5", prodConfig.color)}>
                        <ProdIcon className="h-3 w-3 mr-1" />
                        {prodConfig.label}
                      </Badge>
                    )}
                    <Icon className={cn("h-5 w-5 shrink-0 ml-1", config.color)} />
                  </div>
                </div>

                {/* Status Badge */}
                <Badge variant="outline" className={cn("w-full justify-center", config.color)}>
                  {config.label}
                </Badge>

                {/* Current Job Info - For Running or Setup Required */}
                {(machine.readiness === 'running' || machine.readiness === 'setup_required') && machine.currentJob && (
                  <div 
                    className="bg-background/60 rounded p-2 cursor-pointer hover:bg-background/80 transition-colors space-y-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/work-orders/${machine.currentJob!.woId}`);
                    }}
                  >
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-medium">Current Job</span>
                      {machine.readiness === 'running' && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {jobDuration < 60 ? `${jobDuration}m` : `${Math.floor(jobDuration / 60)}h ${jobDuration % 60}m`}
                        </span>
                      )}
                    </div>
                    <p className="font-mono font-medium text-sm">{machine.currentJob.woDisplayId}</p>
                    <p className="text-xs font-medium truncate">{machine.currentJob.itemCode}</p>
                    {machine.currentJob.itemName && (
                      <p className="text-xs text-muted-foreground truncate">{machine.currentJob.itemName}</p>
                    )}
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{machine.currentJob.customerCode}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {machine.currentJob.processType}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Cycle Time & Production Snapshot - For Running machines */}
                {machine.readiness === 'running' && (
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {/* Cycle Time */}
                    <div className="bg-background/40 rounded p-2">
                      <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <Timer className="h-3 w-3" />
                        <span>Cycle Time</span>
                      </div>
                      {machine.cycleTime.seconds ? (
                        <>
                          <p className="font-semibold">{machine.cycleTime.seconds}s</p>
                          <p className="text-[10px] text-muted-foreground">
                            from {machine.cycleTime.source === 'log' ? 'Log' : machine.cycleTime.source === 'item_master' ? 'Item Master' : 'WO'}
                          </p>
                        </>
                      ) : (
                        <p className="text-muted-foreground">N/A</p>
                      )}
                    </div>

                    {/* Production Snapshot */}
                    <div className="bg-background/40 rounded p-2">
                      <div className="flex items-center gap-1 text-muted-foreground mb-1">
                        <Target className="h-3 w-3" />
                        <span>Today</span>
                      </div>
                      <p className="font-semibold">{machine.productionSnapshot.piecesToday.toLocaleString()} pcs</p>
                      {machine.productionSnapshot.expectedPerHour && (
                        <p className="text-[10px] text-muted-foreground">
                          ~{machine.productionSnapshot.expectedPerHour}/hr
                        </p>
                      )}
                    </div>
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

                {/* Next Action Button */}
                <div className="pt-1">
                  {machine.readiness === 'ready' && (
                    <Button 
                      size="sm" 
                      className="w-full gap-1"
                      onClick={(e) => handleOpenAssignDialog(machine, e)}
                    >
                      <ArrowRight className="h-3 w-3" />
                      Assign Work
                    </Button>
                  )}
                  {machine.readiness === 'setup_required' && (
                    <Button 
                      size="sm" 
                      variant="secondary" 
                      className="w-full gap-1"
                      onClick={(e) => handleCompleteSetup(machine, e)}
                    >
                      <Wrench className="h-3 w-3" />
                      Complete Setup
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {machines.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <Factory className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>No machines configured</p>
        </div>
      )}

      {/* Assign Work Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Assign Work to {selectedMachine?.name}</DialogTitle>
            <DialogDescription>
              Select an eligible work order to assign to this machine
            </DialogDescription>
          </DialogHeader>
          
          {loadingWOs ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : eligibleWOs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No eligible work orders available</p>
              <p className="text-xs mt-1">Work orders must be in production stage with QC clearances</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {eligibleWOs.map(wo => (
                  <Card 
                    key={wo.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleAssignWork(wo.id)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-mono font-medium">{wo.display_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {wo.customer} • {wo.item_code}
                          </p>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-medium">{wo.quantity.toLocaleString()} pcs</p>
                          <p className="text-muted-foreground">
                            {wo.due_date ? format(parseISO(wo.due_date), "MMM d") : "No due date"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Queue Dialog */}
      <Dialog open={queueDialogOpen} onOpenChange={setQueueDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Queue for {selectedMachine?.name}</DialogTitle>
            <DialogDescription>
              {selectedMachine?.machine_id} • {selectedMachine?.queueCount || 0} jobs queued
            </DialogDescription>
          </DialogHeader>
          
          {loadingQueue ? (
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : queuedWOs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No jobs in queue</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {queuedWOs.map((wo, idx) => (
                  <Card 
                    key={wo.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate(`/work-orders/${wo.id}`)}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">#{idx + 1}</Badge>
                          <div>
                            <p className="font-mono font-medium">{wo.display_id}</p>
                            <p className="text-xs text-muted-foreground">
                              {wo.customer} • {wo.item_code}
                            </p>
                          </div>
                        </div>
                        <div className="text-right text-xs">
                          <p className="font-medium">{wo.quantity?.toLocaleString()} pcs</p>
                          <p className="text-muted-foreground">
                            {wo.due_date ? format(parseISO(wo.due_date), "MMM d") : "—"}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* Read-only indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        Data from machines, production logs, and work order assignments
      </p>
    </div>
  );
};
