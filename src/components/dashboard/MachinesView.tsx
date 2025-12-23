/**
 * MachinesView - Action-Oriented Machine Overview
 * 
 * Shows for each machine:
 * - Current state (running/idle/down)
 * - Downtime today (from production logs)
 * - Block reason (from QC states)
 * 
 * All values derived from Production Logs.
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  Factory,
  PlayCircle,
  PauseCircle,
  AlertOctagon,
  Clock,
  AlertTriangle,
  ArrowRight,
  Wrench,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineData {
  id: string;
  machine_id: string;
  name: string;
  status: 'running' | 'idle' | 'down' | 'maintenance';
  current_wo_id: string | null;
  current_wo_display: string | null;
  downtimeToday: number; // minutes
  runtimeToday: number; // minutes
  blockReason: string | null;
  okQtyToday: number;
  rejectionQtyToday: number;
}

interface MachinesViewProps {
  productionLogs: any[];
}

export const MachinesView = ({ productionLogs }: MachinesViewProps) => {
  const navigate = useNavigate();
  const [machines, setMachines] = useState<MachineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);

  useEffect(() => {
    loadMachines();
  }, [productionLogs]);

  const loadMachines = async () => {
    try {
      // Fetch machines with current work order info
      const { data: machinesData, error: machinesError } = await supabase
        .from('machines')
        .select(`
          id,
          machine_id,
          name,
          status,
          current_wo_id,
          work_orders:current_wo_id (
            display_id,
            qc_material_passed,
            qc_first_piece_passed
          )
        `)
        .order('machine_id', { ascending: true });

      if (machinesError) throw machinesError;

      const today = new Date().toISOString().split('T')[0];

      // Aggregate today's production logs per machine
      const logsByMachine = new Map<string, { 
        downtime: number; 
        runtime: number; 
        okQty: number; 
        rejectionQty: number;
      }>();

      productionLogs
        .filter(log => log.log_date === today)
        .forEach(log => {
          const existing = logsByMachine.get(log.machine_id) || { 
            downtime: 0, 
            runtime: 0, 
            okQty: 0, 
            rejectionQty: 0 
          };
          existing.downtime += log.total_downtime_minutes || 0;
          existing.runtime += log.actual_runtime_minutes || 0;
          existing.okQty += log.ok_quantity || 0;
          existing.rejectionQty += log.total_rejection_quantity || 0;
          logsByMachine.set(log.machine_id, existing);
        });

      const processedMachines: MachineData[] = (machinesData || []).map(m => {
        const logs = logsByMachine.get(m.id) || { downtime: 0, runtime: 0, okQty: 0, rejectionQty: 0 };
        const wo = m.work_orders as any;

        // Determine block reason from QC states
        let blockReason: string | null = null;
        if (wo && !wo.qc_material_passed) {
          blockReason = 'Material QC pending';
        } else if (wo && !wo.qc_first_piece_passed) {
          blockReason = 'First Piece QC pending';
        } else if (m.status === 'maintenance' || m.status === 'down') {
          blockReason = 'Machine down/maintenance';
        }

        return {
          id: m.id,
          machine_id: m.machine_id,
          name: m.name,
          status: (m.status as MachineData['status']) || 'idle',
          current_wo_id: m.current_wo_id,
          current_wo_display: wo?.display_id || null,
          downtimeToday: logs.downtime,
          runtimeToday: logs.runtime,
          blockReason,
          okQtyToday: logs.okQty,
          rejectionQtyToday: logs.rejectionQty,
        };
      });

      setMachines(processedMachines);
    } catch (error) {
      console.error('Error loading machines:', error);
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const running = machines.filter(m => m.status === 'running' || m.current_wo_id).length;
    const idle = machines.filter(m => m.status === 'idle' && !m.current_wo_id).length;
    const down = machines.filter(m => m.status === 'down' || m.status === 'maintenance').length;
    const blocked = machines.filter(m => m.blockReason).length;
    const totalDowntime = machines.reduce((sum, m) => sum + m.downtimeToday, 0);
    const totalRuntime = machines.reduce((sum, m) => sum + m.runtimeToday, 0);

    return { running, idle, down, blocked, totalDowntime, totalRuntime, total: machines.length };
  }, [machines]);

  const getStatusIcon = (status: string, hasBlocker: boolean) => {
    if (hasBlocker) return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    switch (status) {
      case 'running': return <PlayCircle className="h-4 w-4 text-green-500" />;
      case 'idle': return <PauseCircle className="h-4 w-4 text-muted-foreground" />;
      case 'down':
      case 'maintenance': return <AlertOctagon className="h-4 w-4 text-destructive" />;
      default: return <Factory className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running': return <Badge className="bg-green-500 text-white">Running</Badge>;
      case 'idle': return <Badge variant="secondary">Idle</Badge>;
      case 'down': return <Badge variant="destructive">Down</Badge>;
      case 'maintenance': return <Badge className="bg-orange-500 text-white">Maintenance</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
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
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Strip */}
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-green-500" />
          <span className="font-medium text-green-600">{summary.running}</span>
          <span className="text-muted-foreground">running</span>
        </div>
        <div className="flex items-center gap-2">
          <PauseCircle className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium">{summary.idle}</span>
          <span className="text-muted-foreground">idle</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertOctagon className="h-4 w-4 text-destructive" />
          <span className="font-medium text-destructive">{summary.down}</span>
          <span className="text-muted-foreground">down</span>
        </div>
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <span className="font-medium text-amber-600">{summary.blocked}</span>
          <span className="text-muted-foreground">blocked</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">
            Total downtime: <span className="font-medium text-foreground">{formatMinutes(summary.totalDowntime)}</span>
          </span>
        </div>
      </div>

      {/* Machine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {machines.map((machine) => {
          const utilization = machine.runtimeToday > 0 
            ? (machine.runtimeToday / (machine.runtimeToday + machine.downtimeToday)) * 100 
            : 0;
          const isExpanded = expandedMachine === machine.id;

          return (
            <Card
              key={machine.id}
              className={cn(
                "transition-all",
                machine.blockReason && "border-l-4 border-l-amber-500",
                (machine.status === 'down' || machine.status === 'maintenance') && "border-l-4 border-l-destructive"
              )}
            >
              <CardContent className="p-3 space-y-2">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(machine.status, !!machine.blockReason)}
                    <span className="font-medium text-sm">{machine.machine_id}</span>
                  </div>
                  {getStatusBadge(machine.status)}
                </div>

                <p className="text-xs text-muted-foreground">{machine.name}</p>

                {/* Current WO */}
                {machine.current_wo_display && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Current:</span>
                    <Badge
                      variant="outline"
                      className="cursor-pointer hover:bg-muted"
                      onClick={() => navigate(`/work-orders/${machine.current_wo_id}`)}
                    >
                      {machine.current_wo_display}
                    </Badge>
                  </div>
                )}

                {/* Downtime Today */}
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Downtime today</span>
                  <span className={cn(
                    "font-medium",
                    machine.downtimeToday > 60 && "text-amber-600",
                    machine.downtimeToday > 120 && "text-destructive"
                  )}>
                    {formatMinutes(machine.downtimeToday)}
                  </span>
                </div>

                {/* Runtime Progress */}
                {machine.runtimeToday > 0 && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>Utilization</span>
                      <span>{Math.round(utilization)}%</span>
                    </div>
                    <Progress value={utilization} className="h-1.5" />
                  </div>
                )}

                {/* Block Reason */}
                {machine.blockReason && (
                  <div className="bg-amber-50 dark:bg-amber-950/30 rounded p-2 flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500 flex-shrink-0" />
                    <span className="text-xs text-amber-700 dark:text-amber-400">
                      {machine.blockReason}
                    </span>
                  </div>
                )}

                {/* Production Stats */}
                {(machine.okQtyToday > 0 || machine.rejectionQtyToday > 0) && (
                  <div className="flex gap-2 text-xs">
                    <span className="text-green-600">
                      OK: {machine.okQtyToday.toLocaleString()}
                    </span>
                    {machine.rejectionQtyToday > 0 && (
                      <span className="text-destructive">
                        Rej: {machine.rejectionQtyToday.toLocaleString()}
                      </span>
                    )}
                  </div>
                )}
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

      {/* Read-only indicator */}
      <p className="text-[10px] text-muted-foreground italic text-right">
        Values derived from production logs (read-only)
      </p>
    </div>
  );
};
