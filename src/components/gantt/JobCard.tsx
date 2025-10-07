import { useState } from "react";
import { useDrag } from "react-dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { differenceInMinutes } from "date-fns";
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

interface JobCardProps {
  assignment: Assignment;
  timelineStart: Date;
  pixelsPerMinute: number;
}

export const JobCard = ({ assignment, timelineStart, pixelsPerMinute }: JobCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "assignment",
    item: { id: assignment.id, machineId: assignment.machine_id },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }));

  const start = new Date(assignment.scheduled_start);
  const end = new Date(assignment.scheduled_end);
  const leftOffset = differenceInMinutes(start, timelineStart) * pixelsPerMinute;
  const width = differenceInMinutes(end, start) * pixelsPerMinute;

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-primary/90 hover:bg-primary",
      running: "bg-success/90 hover:bg-success",
      completed: "bg-muted hover:bg-muted/80",
      paused: "bg-warning/90 hover:bg-warning",
      cancelled: "bg-danger/90 hover:bg-danger",
    };
    return colors[status] || "bg-muted";
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: "bg-primary text-primary-foreground",
      running: "bg-success text-success-foreground",
      completed: "bg-muted text-muted-foreground",
      paused: "bg-warning text-warning-foreground",
      cancelled: "bg-danger text-danger-foreground",
    };
    return colors[status] || "bg-muted";
  };

  return (
    <div
      ref={drag}
      className={`absolute cursor-move transition-all duration-200 ${
        isDragging ? "opacity-50 z-50" : "z-10"
      }`}
      style={{
        left: `${leftOffset}px`,
        width: `${width}px`,
        top: "6px",
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      <Card
        className={`${getStatusColor(
          assignment.status
        )} text-white border-0 shadow-lg transition-all duration-200 ${
          isExpanded ? "scale-105 shadow-xl z-20" : ""
        }`}
      >
        <div className="p-2 space-y-1">
          {/* Compact View */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-xs truncate">
                {assignment.work_order?.display_id || assignment.work_order?.wo_id}
              </div>
              <div className="text-[10px] opacity-90 truncate">
                {assignment.work_order?.item_code}
              </div>
            </div>
            <Badge
              variant="secondary"
              className={`${getStatusBadgeColor(assignment.status)} text-[9px] px-1.5 py-0`}
            >
              {assignment.status}
            </Badge>
          </div>

          {/* Expanded View */}
          {isExpanded && (
            <div className="pt-2 border-t border-white/20 space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center gap-1.5 text-[10px]">
                <Package className="h-3 w-3" />
                <span className="font-medium">Qty:</span>
                <span>{assignment.quantity_allocated}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <User className="h-3 w-3" />
                <span className="font-medium">Customer:</span>
                <span className="truncate">{assignment.work_order?.customer}</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <Clock className="h-3 w-3" />
                <span className="font-medium">Duration:</span>
                <span>{Math.round(differenceInMinutes(end, start) / 60)}h</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};