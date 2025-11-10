import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Activity, 
  Wrench, 
  AlertTriangle, 
  Circle,
  Clock,
  FileText
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineCardProps {
  machine: {
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
  };
  onViewHistory: () => void;
  onAddMaintenance: () => void;
}

export const MachineCard = ({ machine, onViewHistory, onAddMaintenance }: MachineCardProps) => {
  const getStateConfig = (state: string) => {
    const configs = {
      running: {
        label: 'Running',
        color: 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200',
        icon: Activity,
        iconColor: 'text-green-600'
      },
      idle: {
        label: 'Idle',
        color: 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200',
        icon: Circle,
        iconColor: 'text-blue-600'
      },
      maintenance: {
        label: 'Maintenance',
        color: 'bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300 border-orange-200',
        icon: Wrench,
        iconColor: 'text-orange-600'
      },
      down: {
        label: 'Down / Fault',
        color: 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200',
        icon: AlertTriangle,
        iconColor: 'text-red-600'
      }
    };
    return configs[state as keyof typeof configs] || configs.idle;
  };

  const stateConfig = getStateConfig(machine.current_state);
  const StateIcon = stateConfig.icon;

  const formatDowntime = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  return (
    <Card className="hover:shadow-lg transition-all">
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-lg">{machine.machine_name}</h3>
            <p className="text-sm text-muted-foreground">{machine.machine_code}</p>
          </div>
          <StateIcon className={cn("h-5 w-5", stateConfig.iconColor)} />
        </div>

        {/* Status Badge */}
        <Badge variant="outline" className={cn("w-full justify-center py-1", stateConfig.color)}>
          {stateConfig.label}
        </Badge>

        {/* Running WO or Downtime Info */}
        {machine.current_state === 'running' && machine.running_wo_display && (
          <div className="bg-muted/50 rounded p-2 text-sm">
            <p className="text-muted-foreground text-xs">Running WO:</p>
            <p className="font-medium">{machine.running_wo_display}</p>
          </div>
        )}

        {(machine.current_state === 'maintenance' || machine.current_state === 'down') && (
          <div className="bg-orange-50 dark:bg-orange-950/20 rounded p-2 text-sm">
            <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400">
              <Clock className="h-3 w-3" />
              <span>Downtime: {formatDowntime(machine.downtime_hours)}</span>
            </div>
            {machine.downtime_reason && (
              <p className="text-xs text-muted-foreground mt-1">{machine.downtime_reason}</p>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Uptime (7d)</p>
            <p className="font-semibold text-green-600">{machine.uptime_7d.toFixed(1)}%</p>
          </div>
          <div>
            <p className="text-muted-foreground">Last Service</p>
            <p className="font-medium">
              {machine.last_maintenance_date 
                ? new Date(machine.last_maintenance_date).toLocaleDateString()
                : 'Never'}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onViewHistory}
          >
            <FileText className="h-3 w-3 mr-1" />
            History
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            className="flex-1"
            onClick={onAddMaintenance}
          >
            <Wrench className="h-3 w-3 mr-1" />
            Log
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
