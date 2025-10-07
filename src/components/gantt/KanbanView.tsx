import { useDrop } from "react-dnd";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Package, Clock, User } from "lucide-react";

interface Assignment {
  id: string;
  wo_id: string;
  machine_id: string;
  scheduled_start: string;
  scheduled_end: string;
  status: string;
  quantity_allocated: number;
  work_order: {
    wo_id: string;
    display_id: string;
    item_code: string;
    customer: string;
  };
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

interface KanbanViewProps {
  machines: Machine[];
  assignments: Assignment[];
  onDrop: (assignmentId: string, newMachineId: string) => void;
}

export const KanbanView = ({ machines, assignments, onDrop }: KanbanViewProps) => {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {machines.map((machine) => (
        <KanbanColumn
          key={machine.id}
          machine={machine}
          assignments={assignments.filter((a) => a.machine_id === machine.id)}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};

interface KanbanColumnProps {
  machine: Machine;
  assignments: Assignment[];
  onDrop: (assignmentId: string, newMachineId: string) => void;
}

const KanbanColumn = ({ machine, assignments, onDrop }: KanbanColumnProps) => {
  const [{ isOver }, drop] = useDrop(() => ({
    accept: "assignment",
    drop: (item: { id: string; machineId: string }) => {
      if (item.machineId !== machine.id) {
        onDrop(item.id, machine.id);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }));

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-primary text-primary-foreground",
      running: "bg-success text-success-foreground",
      paused: "bg-warning text-warning-foreground",
    };
    return colors[status] || "bg-muted";
  };

  return (
    <div
      ref={drop}
      className={`flex-shrink-0 w-80 bg-muted/30 rounded-lg border-2 transition-colors ${
        isOver ? "border-primary bg-primary/5" : "border-transparent"
      }`}
    >
      <div className="p-4 border-b bg-card">
        <h3 className="font-semibold">{machine.machine_id}</h3>
        <p className="text-sm text-muted-foreground">{machine.name}</p>
        <Badge variant="secondary" className="mt-2">
          {assignments.length} jobs
        </Badge>
      </div>
      
      <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
        {assignments.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            No jobs assigned
          </div>
        ) : (
          assignments.map((assignment) => (
            <Card key={assignment.id} className="cursor-move hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">
                    {assignment.work_order?.display_id || assignment.work_order?.wo_id}
                  </CardTitle>
                  <Badge className={getStatusColor(assignment.status)}>
                    {assignment.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Package className="h-3 w-3" />
                  <span>{assignment.work_order?.item_code}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <User className="h-3 w-3" />
                  <span className="truncate">{assignment.work_order?.customer}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Qty: {assignment.quantity_allocated}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};