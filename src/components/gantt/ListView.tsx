import { format } from "date-fns";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Clock, Package } from "lucide-react";

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

interface ListViewProps {
  machines: Machine[];
  assignments: Assignment[];
}

export const ListView = ({ machines, assignments }: ListViewProps) => {
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-primary text-primary-foreground",
      running: "bg-success text-success-foreground",
      paused: "bg-warning text-warning-foreground",
      completed: "bg-muted text-muted-foreground",
      cancelled: "bg-danger text-danger-foreground",
    };
    return colors[status] || "bg-muted";
  };

  const getMachineName = (machineId: string) => {
    const machine = machines.find((m) => m.id === machineId);
    return machine ? `${machine.machine_id} - ${machine.name}` : machineId;
  };

  const sortedAssignments = [...assignments].sort(
    (a, b) => new Date(a.scheduled_start).getTime() - new Date(b.scheduled_start).getTime()
  );

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Work Order</TableHead>
            <TableHead>Item Code</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Machine</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Start Time</TableHead>
            <TableHead>End Time</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAssignments.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                No assignments found
              </TableCell>
            </TableRow>
          ) : (
            sortedAssignments.map((assignment) => (
              <TableRow key={assignment.id} className="hover:bg-muted/50">
                <TableCell className="font-medium">
                  {assignment.work_order?.display_id || assignment.work_order?.wo_id}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    {assignment.work_order?.item_code}
                  </div>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {assignment.work_order?.customer}
                </TableCell>
                <TableCell className="text-sm">{getMachineName(assignment.machine_id)}</TableCell>
                <TableCell>{assignment.quantity_allocated}</TableCell>
                <TableCell className="text-sm">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {format(new Date(assignment.scheduled_start), "MMM dd, HH:mm")}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {format(new Date(assignment.scheduled_end), "MMM dd, HH:mm")}
                </TableCell>
                <TableCell>
                  <Badge className={getStatusColor(assignment.status)}>
                    {assignment.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};