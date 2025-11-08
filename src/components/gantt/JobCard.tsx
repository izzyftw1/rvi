import { useState } from "react";
import { useDrag } from "react-dnd";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { differenceInMinutes, format, addMinutes } from "date-fns";
import { Package, Clock, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  onUpdate: () => void;
  allAssignments: Assignment[];
}

export const JobCard = ({ assignment, timelineStart, pixelsPerMinute, onUpdate, allAssignments }: JobCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDraggingResize, setIsDraggingResize] = useState<'start' | 'end' | null>(null);
  const [tempStart, setTempStart] = useState<Date | null>(null);
  const [tempEnd, setTempEnd] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [{ isDragging }, drag] = useDrag(() => ({
    type: "assignment",
    item: { 
      id: assignment.id, 
      machineId: assignment.machine_id,
      originalStart: assignment.scheduled_start,
      originalEnd: assignment.scheduled_end
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    end: async (item, monitor) => {
      if (monitor.didDrop()) {
        onUpdate();
      }
    },
  }));

  const start = tempStart || new Date(assignment.scheduled_start);
  const end = tempEnd || new Date(assignment.scheduled_end);
  const leftOffset = differenceInMinutes(start, timelineStart) * pixelsPerMinute;
  const width = differenceInMinutes(end, start) * pixelsPerMinute;

  const checkConflict = (newStart: Date, newEnd: Date): boolean => {
    return allAssignments.some(a => {
      if (a.id === assignment.id || a.machine_id !== assignment.machine_id) return false;
      const aStart = new Date(a.scheduled_start);
      const aEnd = new Date(a.scheduled_end);
      return (
        (newStart >= aStart && newStart < aEnd) ||
        (newEnd > aStart && newEnd <= aEnd) ||
        (newStart <= aStart && newEnd >= aEnd)
      );
    });
  };

  const saveChanges = async (newStart: Date, newEnd: Date) => {
    if (checkConflict(newStart, newEnd)) {
      toast.error("Schedule conflict detected", {
        description: "This time slot overlaps with another job on the same machine"
      });
      setTempStart(null);
      setTempEnd(null);
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('wo_machine_assignments')
        .update({
          scheduled_start: newStart.toISOString(),
          scheduled_end: newEnd.toISOString()
        })
        .eq('id', assignment.id);

      if (error) throw error;

      toast.success("Job rescheduled", {
        description: `${format(newStart, 'dd MMM yyyy, h:mm a')} – ${format(newEnd, 'h:mm a')}`
      });

      setTempStart(null);
      setTempEnd(null);
      onUpdate();
    } catch (error) {
      console.error('Failed to update schedule:', error);
      toast.error("Failed to reschedule job");
      setTempStart(null);
      setTempEnd(null);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResizeStart = (e: React.MouseEvent, edge: 'start' | 'end') => {
    e.stopPropagation();
    setIsDraggingResize(edge);
    
    const initialX = e.clientX;
    const originalStart = new Date(assignment.scheduled_start);
    const originalEnd = new Date(assignment.scheduled_end);

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - initialX;
      const deltaMinutes = deltaX / pixelsPerMinute;
      
      if (edge === 'start') {
        let newStart = new Date(originalStart.getTime() + deltaMinutes * 60000);
        // Snap to 15-minute intervals
        const roundedMinutes = Math.round(newStart.getMinutes() / 15) * 15;
        newStart.setMinutes(roundedMinutes, 0, 0);
        
        // Ensure minimum duration of 15 minutes
        if (newStart < originalEnd && differenceInMinutes(originalEnd, newStart) >= 15) {
          setTempStart(newStart);
        }
      } else {
        let newEnd = new Date(originalEnd.getTime() + deltaMinutes * 60000);
        const roundedMinutes = Math.round(newEnd.getMinutes() / 15) * 15;
        newEnd.setMinutes(roundedMinutes, 0, 0);
        
        // Ensure minimum duration of 15 minutes
        if (newEnd > originalStart && differenceInMinutes(newEnd, originalStart) >= 15) {
          setTempEnd(newEnd);
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingResize(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Save changes if any
      if (tempStart || tempEnd) {
        const finalStart = tempStart || originalStart;
        const finalEnd = tempEnd || originalEnd;
        saveChanges(finalStart, finalEnd);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

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

  const hasConflict = tempStart && tempEnd && checkConflict(tempStart, tempEnd);

  return (
    <div
      ref={drag}
      className={`absolute cursor-move transition-all duration-200 group ${
        isDragging || isDraggingResize ? "opacity-60 z-50" : "z-10"
      } ${hasConflict ? "ring-2 ring-destructive" : ""} ${isSaving ? "pointer-events-none opacity-50" : ""}`}
      style={{
        left: `${leftOffset}px`,
        width: `${width}px`,
        top: "6px",
      }}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Live tooltip during drag/resize */}
      {(isDraggingResize || tempStart || tempEnd) && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-popover text-popover-foreground px-3 py-2 rounded-md shadow-lg text-xs whitespace-nowrap z-50 animate-in fade-in slide-in-from-bottom-2">
          <div className="font-semibold">{format(start, 'h:mm a')} – {format(end, 'h:mm a')}</div>
          <div className="text-[10px] text-muted-foreground">{format(start, 'dd MMM yyyy')}</div>
          {hasConflict && (
            <div className="text-[10px] text-destructive font-semibold mt-1">⚠️ Conflict detected</div>
          )}
        </div>
      )}
      {/* Resize handle - Start */}
      <div
        className="absolute left-0 top-0 bottom-0 w-3 cursor-ew-resize bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-primary/40 rounded-l"
        onMouseDown={(e) => handleResizeStart(e, 'start')}
        title="Drag to adjust start time"
      >
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-full" />
      </div>
      
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

      {/* Resize handle - End */}
      <div
        className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity z-30 hover:bg-primary/40 rounded-r"
        onMouseDown={(e) => handleResizeStart(e, 'end')}
        title="Drag to adjust end time"
      >
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-full" />
      </div>
    </div>
  );
};