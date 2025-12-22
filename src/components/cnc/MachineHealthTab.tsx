import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MachineCard } from "./MachineCard";
import { MachineHistoryDrawer } from "./MachineHistoryDrawer";
import { MaintenanceLogModal } from "./MaintenanceLogModal";
import { Activity, Circle, Wrench, AlertTriangle } from "lucide-react";

interface Machine {
  machine_id: string;
  machine_code: string;
  machine_name: string;
  current_state: string;
  running_wo: string | null;
  running_wo_display: string | null;
  downtime_hours: number;
  last_maintenance_date: string | null;
  uptime_7d: number;
  downtime_reason: string | null;
  // Production log metrics
  today_run_minutes?: number;
  today_downtime_minutes?: number;
  today_output?: number;
  today_ok_qty?: number;
  today_avg_efficiency?: number;
  last_log_at?: string | null;
  shift_a_output?: number;
  shift_b_output?: number;
  shift_c_output?: number;
  today_downtime_by_reason?: Array<{ reason: string; minutes: number }> | null;
}

export const MachineHealthTab = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);

  useEffect(() => {
    loadMachines();

    // Real-time subscriptions including daily_production_logs
    const channel = supabase
      .channel('machine-health-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, () => loadMachines())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maintenance_logs' }, () => loadMachines())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => loadMachines())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'daily_production_logs' }, () => loadMachines())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadMachines = async () => {
    try {
      const { data, error } = await supabase
        .from('machine_status_vw')
        .select('*')
        .order('machine_code');

      if (error) throw error;
      if (data) {
        // Cast the data to our Machine type, handling JSON fields
        const typedMachines: Machine[] = data.map((m) => ({
          machine_id: m.machine_id ?? '',
          machine_code: m.machine_code ?? '',
          machine_name: m.machine_name ?? '',
          current_state: m.current_state ?? 'idle',
          running_wo: m.running_wo,
          running_wo_display: m.running_wo_display,
          downtime_hours: m.downtime_hours ?? 0,
          last_maintenance_date: m.last_maintenance_date,
          uptime_7d: m.uptime_7d ?? 100,
          downtime_reason: m.downtime_reason,
          today_run_minutes: m.today_run_minutes ?? 0,
          today_downtime_minutes: m.today_downtime_minutes ?? 0,
          today_output: m.today_output ?? 0,
          today_ok_qty: m.today_ok_qty ?? 0,
          today_avg_efficiency: m.today_avg_efficiency ?? 0,
          last_log_at: m.last_log_at,
          shift_a_output: m.shift_a_output ?? 0,
          shift_b_output: m.shift_b_output ?? 0,
          shift_c_output: m.shift_c_output ?? 0,
          today_downtime_by_reason: Array.isArray(m.today_downtime_by_reason) 
            ? m.today_downtime_by_reason as Array<{ reason: string; minutes: number }>
            : null,
        }));
        setMachines(typedMachines);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading machines:', error);
      setLoading(false);
    }
  };

  const handleViewHistory = (machine: Machine) => {
    setSelectedMachine(machine);
    setHistoryDrawerOpen(true);
  };

  const handleAddMaintenance = (machine: Machine) => {
    setSelectedMachine(machine);
    setMaintenanceModalOpen(true);
  };

  const handleMaintenanceModalClose = () => {
    setMaintenanceModalOpen(false);
    setSelectedMachine(null);
    loadMachines(); // Refresh data
  };

  // Calculate summary metrics
  const totalMachines = machines.length;
  const runningCount = machines.filter(m => m.current_state === 'running').length;
  const idleCount = machines.filter(m => m.current_state === 'idle').length;
  const maintenanceCount = machines.filter(m => m.current_state === 'maintenance').length;
  const downCount = machines.filter(m => m.current_state === 'down').length;
  
  // Use actual production log data for utilization when available
  const machinesWithLogs = machines.filter(m => (m.today_run_minutes ?? 0) > 0);
  const utilizationFromLogs = machinesWithLogs.length > 0;
  const utilizationPct = utilizationFromLogs 
    ? (machinesWithLogs.reduce((sum, m) => sum + (m.today_run_minutes ?? 0), 0) / (machinesWithLogs.length * 480) * 100).toFixed(1)
    : totalMachines > 0 ? ((runningCount / totalMachines) * 100).toFixed(1) : '0';
  
  // Total output from logs today
  const totalOutputToday = machines.reduce((sum, m) => sum + (m.today_ok_qty ?? 0), 0);
  const totalDowntimeFromLogs = machines.reduce((sum, m) => sum + (m.today_downtime_minutes ?? 0), 0);
  
  const totalDowntimeToday = machines.reduce((sum, m) => {
    if (m.current_state === 'maintenance' || m.current_state === 'down') {
      return sum + m.downtime_hours;
    }
    return sum;
  }, 0);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-16 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-48 bg-muted animate-pulse rounded" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {utilizationFromLogs ? 'Actual Utilization' : 'Utilization'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{utilizationPct}%</div>
            <p className="text-xs text-muted-foreground">
              {utilizationFromLogs 
                ? `${machinesWithLogs.length} machines logged today`
                : `${runningCount} / ${totalMachines} running`
              }
            </p>
            {totalOutputToday > 0 && (
              <p className="text-xs text-green-600 font-medium mt-1">
                {totalOutputToday.toLocaleString()} pcs today
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Activity className="h-4 w-4 text-green-600" />
              Running
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{runningCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Circle className="h-4 w-4 text-blue-600" />
              Idle
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{idleCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <Wrench className="h-4 w-4 text-orange-600" />
              Maintenance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{maintenanceCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Down / Fault
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{downCount}</div>
            <p className="text-xs text-muted-foreground">
              {totalDowntimeToday.toFixed(1)}h today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alert for maintenance overdue */}
      {maintenanceCount > 3 && (
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
              <p className="text-sm font-medium text-orange-900 dark:text-orange-100">
                {maintenanceCount} machines currently under maintenance - review scheduling
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Machine Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {machines.map((machine) => (
          <MachineCard
            key={machine.machine_id}
            machine={machine}
            onViewHistory={() => handleViewHistory(machine)}
            onAddMaintenance={() => handleAddMaintenance(machine)}
          />
        ))}
      </div>

      {/* Machine History Drawer */}
      {selectedMachine && (
        <MachineHistoryDrawer
          open={historyDrawerOpen}
          onClose={() => {
            setHistoryDrawerOpen(false);
            setSelectedMachine(null);
          }}
          machineId={selectedMachine.machine_id}
          machineName={selectedMachine.machine_name}
        />
      )}

      {/* Maintenance Log Modal */}
      {selectedMachine && (
        <MaintenanceLogModal
          open={maintenanceModalOpen}
          onClose={handleMaintenanceModalClose}
          machineId={selectedMachine.machine_id}
          machineName={selectedMachine.machine_name}
        />
      )}
    </div>
  );
};
