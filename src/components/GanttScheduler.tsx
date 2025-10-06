import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ZoomIn, ZoomOut, Download, RefreshCw } from "lucide-react";
import { format, addHours, addDays, startOfDay, endOfDay, differenceInMinutes } from "date-fns";
import jsPDF from "jspdf";

type ZoomLevel = "hour" | "day" | "week";

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

interface GanttBarProps {
  assignment: Assignment;
  machineIndex: number;
  timelineStart: Date;
  pixelsPerMinute: number;
  onDrop: (assignmentId: string, newMachineId: string) => void;
}

const GanttBar = ({ assignment, machineIndex, timelineStart, pixelsPerMinute, onDrop }: GanttBarProps) => {
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
      scheduled: "bg-blue-500",
      running: "bg-green-500",
      completed: "bg-gray-400",
      paused: "bg-yellow-500",
      cancelled: "bg-red-500",
    };
    return colors[status] || "bg-gray-500";
  };

  return (
    <div
      ref={drag}
      className={`absolute h-8 rounded px-2 text-white text-xs flex items-center cursor-move ${getStatusColor(
        assignment.status
      )} ${isDragging ? "opacity-50" : "opacity-90"} hover:opacity-100 transition-opacity`}
      style={{
        left: `${leftOffset}px`,
        width: `${width}px`,
        top: "4px",
      }}
      title={`${assignment.work_order?.display_id || assignment.work_order?.wo_id} - ${assignment.work_order?.item_code}`}
    >
      <div className="truncate">
        {assignment.work_order?.display_id || assignment.work_order?.wo_id}
      </div>
    </div>
  );
};

interface MachineRowProps {
  machine: any;
  assignments: Assignment[];
  timelineStart: Date;
  pixelsPerMinute: number;
  onDrop: (assignmentId: string, newMachineId: string) => void;
}

const MachineRow = ({ machine, assignments, timelineStart, pixelsPerMinute, onDrop }: MachineRowProps) => {
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
    <div
      ref={drop}
      className={`relative h-12 border-b ${isOver ? "bg-blue-50" : ""}`}
    >
      {assignments.map((assignment) => (
        <GanttBar
          key={assignment.id}
          assignment={assignment}
          machineIndex={0}
          timelineStart={timelineStart}
          pixelsPerMinute={pixelsPerMinute}
          onDrop={onDrop}
        />
      ))}
    </div>
  );
};

export const GanttScheduler = () => {
  const { toast } = useToast();
  const [machines, setMachines] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("day");
  const [currentDate, setCurrentDate] = useState(new Date());

  useEffect(() => {
    loadData();

    const channel = supabase
      .channel("gantt-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wo_machine_assignments" },
        () => loadData()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [machinesRes, assignmentsRes] = await Promise.all([
        supabase.from("machines").select("*").order("machine_id", { ascending: true }),
        supabase
          .from("wo_machine_assignments")
          .select(`
            *,
            work_order:work_orders(wo_id, display_id, item_code, customer)
          `)
          .in("status", ["scheduled", "running", "paused"])
          .order("scheduled_start", { ascending: true }),
      ]);

      if (machinesRes.error) throw machinesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;

      setMachines(machinesRes.data || []);
      setAssignments(assignmentsRes.data || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = async (assignmentId: string, newMachineId: string) => {
    try {
      const assignment = assignments.find((a) => a.id === assignmentId);
      if (!assignment) return;

      // Calculate duration
      const start = new Date(assignment.scheduled_start);
      const end = new Date(assignment.scheduled_end);
      const durationMs = end.getTime() - start.getTime();

      // Keep the same start time but update machine
      const { error } = await supabase
        .from("wo_machine_assignments")
        .update({
          machine_id: newMachineId,
        })
        .eq("id", assignmentId);

      if (error) throw error;

      toast({
        title: "Reassigned",
        description: "Work order successfully moved to new machine",
      });

      loadData();
    } catch (error: any) {
      console.error("Error reassigning:", error);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  };

  const { timelineStart, timelineEnd, pixelsPerMinute } = useMemo(() => {
    const start = startOfDay(currentDate);
    let end: Date;
    let ppm: number;

    switch (zoomLevel) {
      case "hour":
        end = addHours(start, 24);
        ppm = 2; // 2 pixels per minute = 120 pixels per hour
        break;
      case "day":
        end = addDays(start, 7);
        ppm = 0.5; // 0.5 pixels per minute = 30 pixels per hour
        break;
      case "week":
        end = addDays(start, 28);
        ppm = 0.125; // 0.125 pixels per minute = 7.5 pixels per hour
        break;
    }

    return { timelineStart: start, timelineEnd: end, pixelsPerMinute: ppm };
  }, [currentDate, zoomLevel]);

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

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    
    doc.setFontSize(16);
    doc.text("CNC Machine Schedule", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 14, 28);
    doc.text(`View: ${zoomLevel.toUpperCase()}`, 14, 34);

    let yPos = 45;
    
    machines.forEach((machine, index) => {
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(9);
      doc.text(`${machine.machine_id} - ${machine.name}`, 14, yPos);
      
      const machineAssignments = assignments.filter((a) => a.machine_id === machine.id);
      
      machineAssignments.forEach((assignment) => {
        yPos += 6;
        const startTime = format(new Date(assignment.scheduled_start), "MMM dd HH:mm");
        const endTime = format(new Date(assignment.scheduled_end), "HH:mm");
        doc.setFontSize(8);
        doc.text(
          `  ${assignment.work_order?.display_id} | ${startTime} - ${endTime} | ${assignment.status}`,
          16,
          yPos
        );
      });

      yPos += 10;
    });

    doc.save(`cnc-schedule-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Success", description: "Schedule exported to PDF" });
  };

  const timeLabels = generateTimeLabels();

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-4">
        {/* Controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentDate(new Date())}
                >
                  Today
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentDate(addDays(currentDate, -1))}
                >
                  ←
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentDate(addDays(currentDate, 1))}
                >
                  →
                </Button>
                <span className="text-sm font-medium">
                  {format(currentDate, "MMM dd, yyyy")}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Select value={zoomLevel} onValueChange={(v: ZoomLevel) => setZoomLevel(v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Hourly</SelectItem>
                    <SelectItem value="day">Daily</SelectItem>
                    <SelectItem value="week">Weekly</SelectItem>
                  </SelectContent>
                </Select>

                <Button size="sm" variant="outline" onClick={loadData}>
                  <RefreshCw className="h-4 w-4" />
                </Button>

                <Button size="sm" variant="outline" onClick={exportToPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4 text-xs">
              <span className="font-medium">Status:</span>
              <Badge className="bg-blue-500">Scheduled</Badge>
              <Badge className="bg-green-500">Running</Badge>
              <Badge className="bg-yellow-500">Paused</Badge>
              <Badge className="bg-gray-400">Completed</Badge>
              <Badge className="bg-red-500">Cancelled</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Gantt Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Machine Schedule - Drag to Reassign</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading schedule...</div>
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Timeline Header */}
                  <div className="flex">
                    <div className="w-40 flex-shrink-0 border-r bg-muted p-2 font-semibold text-sm">
                      Machine
                    </div>
                    <div className="relative" style={{ width: `${timelineWidth}px` }}>
                      <div className="flex border-b">
                        {timeLabels.map((label, idx) => (
                          <div
                            key={idx}
                            className="border-r px-2 py-2 text-xs text-muted-foreground"
                            style={{
                              width:
                                zoomLevel === "hour"
                                  ? "120px"
                                  : zoomLevel === "day"
                                  ? "720px"
                                  : "1440px",
                            }}
                          >
                            {zoomLevel === "hour"
                              ? format(label, "HH:mm")
                              : format(label, "MMM dd")}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Machine Rows */}
                  {machines.map((machine) => {
                    const machineAssignments = assignments.filter(
                      (a) => a.machine_id === machine.id
                    );

                    return (
                      <div key={machine.id} className="flex">
                        <div className="w-40 flex-shrink-0 border-r p-2 text-sm font-medium">
                          {machine.machine_id}
                          <div className="text-xs text-muted-foreground truncate">
                            {machine.name}
                          </div>
                        </div>
                        <div className="relative" style={{ width: `${timelineWidth}px` }}>
                          <MachineRow
                            machine={machine}
                            assignments={machineAssignments}
                            timelineStart={timelineStart}
                            pixelsPerMinute={pixelsPerMinute}
                            onDrop={handleDrop}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DndProvider>
  );
};

