import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineQCCardProps {
  machine: {
    id: string;
    name: string;
    machine_id: string;
    qc_status: string;
    last_qc_check_at: string | null;
    next_qc_check_due: string | null;
    current_wo_id: string | null;
    work_orders?: {
      display_id: string;
      item_code: string;
    };
  };
  onClick: () => void;
}

export const MachineQCCard = ({ machine, onClick }: MachineQCCardProps) => {
  const getQCStatusConfig = () => {
    switch (machine.qc_status) {
      case 'ok':
        return {
          icon: CheckCircle2,
          color: 'text-success',
          bgColor: 'bg-success/10 border-success/30',
          label: 'On Track'
        };
      case 'due':
        return {
          icon: Clock,
          color: 'text-warning',
          bgColor: 'bg-warning/10 border-warning/30',
          label: 'Check Due Soon'
        };
      case 'overdue':
        return {
          icon: AlertTriangle,
          color: 'text-destructive',
          bgColor: 'bg-destructive/10 border-destructive/30',
          label: 'Overdue!'
        };
      case 'deviation':
        return {
          icon: XCircle,
          color: 'text-destructive',
          bgColor: 'bg-destructive/10 border-destructive/30',
          label: 'Deviation Found'
        };
      default:
        return {
          icon: Clock,
          color: 'text-muted-foreground',
          bgColor: 'bg-muted',
          label: 'Idle'
        };
    }
  };

  const config = getQCStatusConfig();
  const Icon = config.icon;

  const getTimeSinceLastCheck = () => {
    if (!machine.last_qc_check_at) return 'Never';
    const diff = Date.now() - new Date(machine.last_qc_check_at).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  const getTimeUntilDue = () => {
    if (!machine.next_qc_check_due) return 'Not scheduled';
    const diff = new Date(machine.next_qc_check_due).getTime() - Date.now();
    if (diff < 0) return 'Overdue';
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) return `Due in ${minutes}m`;
    const hours = Math.floor(minutes / 60);
    return `Due in ${hours}h ${minutes % 60}m`;
  };

  if (!machine.current_wo_id) {
    return (
      <Card className="opacity-60">
        <CardContent className="p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{machine.name}</div>
              <Badge variant="outline" className="text-xs">Idle</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{machine.machine_id}</p>
            <p className="text-xs text-muted-foreground">No active work order</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "cursor-pointer hover:shadow-lg transition-all duration-300 border-2",
        config.bgColor
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold">{machine.name}</div>
            <Icon className={cn("h-5 w-5", config.color)} />
          </div>
          
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{machine.machine_id}</p>
            {machine.work_orders && (
              <>
                <p className="text-xs font-medium">WO: {machine.work_orders.display_id}</p>
                <p className="text-xs text-muted-foreground">{machine.work_orders.item_code}</p>
              </>
            )}
          </div>

          <div className="space-y-1">
            <Badge variant={machine.qc_status === 'ok' ? 'default' : 'destructive'} className="text-xs">
              {config.label}
            </Badge>
            <p className="text-xs text-muted-foreground">
              Last check: {getTimeSinceLastCheck()}
            </p>
            <p className="text-xs text-muted-foreground font-medium">
              {getTimeUntilDue()}
            </p>
          </div>

          <Button
            variant={machine.qc_status === 'ok' ? 'outline' : 'default'}
            size="sm"
            className="w-full"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
          >
            {machine.qc_status === 'ok' ? 'Record Check' : 'QC Check Required'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
