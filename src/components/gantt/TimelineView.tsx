import { useState } from "react";
import { useDrop } from "react-dnd";
import { format, addHours, addDays, differenceInMinutes, isWeekend } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { JobCard } from "./JobCard";
import { Button } from "@/components/ui/button";

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
  location?: string;
}

interface TimelineViewProps {
  machines: Machine[];
  assignments: Assignment[];
  timelineStart: Date;
  timelineEnd: Date;
  pixelsPerMinute: number;
  zoomLevel: "hour" | "day" | "week";
  onDrop: (assignmentId: string, newMachineId: string) => void;
  utilization: Record<string, number>;
}

export const TimelineView = ({
  machines,
  assignments,
  timelineStart,
  timelineEnd,
  pixelsPerMinute,
  zoomLevel,
  onDrop,
  utilization,
}: TimelineViewProps) => {
  const [collapsedMachines, setCollapsedMachines] = useState<Set<string>>(new Set());

  const toggleMachine = (machineId: string) => {
    setCollapsedMachines((prev) => {
      const next = new Set(prev);
      if (next.has(machineId)) {
        next.delete(machineId);
      } else {
        next.add(machineId);
      }
      return next;
    });
  };

  const timelineWidth = differenceInMinutes(timelineEnd, timelineStart) * pixelsPerMinute;

  const generateTimeLabels = () => {
    const labels: Date[] = [];
    let current = new Date(timelineStart);

    switch (zoomLevel) {
      case "hour":
        while (current <= timelineEnd) {
          labels.push(new Date(current));
          current = addHours(current, 1);
        }
        break;
      case "day":
        while (current <= timelineEnd) {
          labels.push(new Date(current));
          current = addDays(current, 1);
        }
        break;
      case "week":
        while (current <= timelineEnd) {
          labels.push(new Date(current));
          current = addDays(current, 7);
        }
        break;
    }

    return labels;
  };

  const getUtilizationColor = (util: number) => {
    if (util >= 90) return "hsl(var(--destructive) / 0.2)"; // Red = behind
    if (util >= 70) return "hsl(var(--warning) / 0.2)";     // Yellow = running behind  
    if (util >= 50) return "hsl(var(--success) / 0.2)";     // Green = on schedule
    return "hsl(var(--primary) / 0.15)";                    // Blue = ahead
  };

  // Current time indicator
  const currentTimeOffset = differenceInMinutes(new Date(), timelineStart) * pixelsPerMinute;

  const timeLabels = generateTimeLabels();

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <div className="inline-block min-w-full">
        {/* Timeline Header */}
        <div className="flex sticky top-0 z-20 bg-card shadow-sm">
          <div className="w-64 flex-shrink-0 border-r bg-muted p-3 font-semibold text-sm">
            Machine / Equipment
          </div>
          <div className="relative" style={{ width: `${timelineWidth}px` }}>
            <div className="flex border-b bg-muted">
              {timeLabels.map((label, idx) => {
                const isHoliday = isWeekend(label);
                return (
                  <div
                    key={idx}
                    className={`border-r px-2 py-3 text-xs font-medium text-center ${
                      isHoliday ? "bg-muted/60 text-muted-foreground/60" : ""
                    }`}
                    style={{
                      width:
                        zoomLevel === "hour"
                          ? "120px"
                          : zoomLevel === "day"
                          ? "720px"
                          : "1440px",
                    }}
                  >
                    <div>
                      {zoomLevel === "hour"
                        ? format(label, "HH:mm")
                        : format(label, "EEE")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {format(label, zoomLevel === "hour" ? "dd MMM" : "dd MMM")}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* Current time line */}
            {currentTimeOffset > 0 && currentTimeOffset < timelineWidth && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-destructive z-10 pointer-events-none"
                style={{ left: `${currentTimeOffset}px` }}
              >
                <div className="absolute -top-2 -left-2 w-4 h-4 bg-destructive rounded-full animate-pulse" />
              </div>
            )}
          </div>
        </div>

        {/* Machine Rows */}
        {machines.map((machine) => {
          const machineAssignments = assignments.filter((a) => a.machine_id === machine.id);
          const isCollapsed = collapsedMachines.has(machine.id);
          const machineUtil = utilization[machine.id] || 0;

          return (
            <MachineRow
              key={machine.id}
              machine={machine}
              assignments={machineAssignments}
              isCollapsed={isCollapsed}
              onToggle={() => toggleMachine(machine.id)}
              timelineStart={timelineStart}
              timelineWidth={timelineWidth}
              pixelsPerMinute={pixelsPerMinute}
              utilization={machineUtil}
              getUtilizationColor={getUtilizationColor}
              onDrop={onDrop}
            />
          );
        })}
      </div>
    </div>
  );
};

interface MachineRowProps {
  machine: Machine;
  assignments: any[];
  isCollapsed: boolean;
  onToggle: () => void;
  timelineStart: Date;
  timelineWidth: number;
  pixelsPerMinute: number;
  utilization: number;
  getUtilizationColor: (util: number) => string;
  onDrop: (assignmentId: string, newMachineId: string) => void;
}

const MachineRow = ({
  machine,
  assignments,
  isCollapsed,
  onToggle,
  timelineStart,
  timelineWidth,
  pixelsPerMinute,
  utilization,
  getUtilizationColor,
  onDrop,
}: MachineRowProps) => {
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

  return (
    <div className="flex border-b hover:bg-muted/30 transition-colors">
      <div className="w-64 flex-shrink-0 border-r p-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onToggle}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">{machine.machine_id}</div>
            <div className="text-xs text-muted-foreground truncate">{machine.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <div className="text-[10px] text-muted-foreground">
                {utilization >= 90 ? '🔴' : utilization >= 70 ? '🟡' : '🟢'} {utilization.toFixed(0)}%
              </div>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-300"
                  style={{ 
                    width: `${utilization}%`,
                    backgroundColor: utilization >= 90 ? 'hsl(var(--destructive))' : 
                                   utilization >= 70 ? 'hsl(var(--warning))' : 
                                   'hsl(var(--success))'
                  }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {!isCollapsed && (
        <div
          ref={drop}
          className={`relative transition-colors ${
            isOver ? "bg-primary/10" : getUtilizationColor(utilization)
          }`}
          style={{ width: `${timelineWidth}px`, minHeight: "72px" }}
        >
          {assignments.map((assignment) => (
            <JobCard
              key={assignment.id}
              assignment={assignment}
              timelineStart={timelineStart}
              pixelsPerMinute={pixelsPerMinute}
            />
          ))}
        </div>
      )}
      
      {isCollapsed && (
        <div
          className="bg-muted/50"
          style={{ width: `${timelineWidth}px`, height: "40px" }}
        />
      )}
    </div>
  );
};