import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Download, RefreshCw, LayoutGrid, Calendar, List } from "lucide-react";
import { format, addDays, startOfDay, endOfDay, isToday, differenceInMinutes } from "date-fns";
import jsPDF from "jspdf";

import { FilterPanel } from "./gantt/FilterPanel";
import { TimelineView } from "./gantt/TimelineView";
import { KanbanView } from "./gantt/KanbanView";
import { ListView } from "./gantt/ListView";
import { SummaryPanel } from "./gantt/SummaryPanel";

type ZoomLevel = "hour" | "day" | "week";
type ViewMode = "timeline" | "kanban" | "list";

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

export const GanttScheduler = () => {
  const { toast } = useToast();
  const [machines, setMachines] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [zoomLevel, setZoomLevel] = useState<ZoomLevel>("day");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("timeline");
  
  // Filters
  const [selectedMachineGroup, setSelectedMachineGroup] = useState("all");
  const [selectedJobStatus, setSelectedJobStatus] = useState("all");
  const [selectedShift, setSelectedShift] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

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

      const [machinesRes, assignmentsRes, workOrdersRes] = await Promise.all([
        supabase.from("machines").select("*").order("machine_id", { ascending: true }),
        supabase
          .from("wo_machine_assignments")
          .select(`
            *,
            work_order:work_orders(
              wo_id, 
              display_id, 
              item_code, 
              customer, 
              quantity,
              cycle_time_seconds
            )
          `)
          .in("status", ["scheduled", "running", "paused"])
          .order("scheduled_start", { ascending: true }),
        supabase
          .from("work_orders")
          .select("*")
          .in("status", ["pending", "in_progress"])
      ]);

      if (machinesRes.error) throw machinesRes.error;
      if (assignmentsRes.error) throw assignmentsRes.error;
      if (workOrdersRes.error) throw workOrdersRes.error;

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
      const { error } = await supabase
        .from("wo_machine_assignments")
        .update({ machine_id: newMachineId })
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

  // Timeline calculations
  const { timelineStart, timelineEnd, pixelsPerMinute } = useMemo(() => {
    const start = startOfDay(currentDate);
    let end: Date;
    let ppm: number;

    switch (zoomLevel) {
      case "hour":
        end = addDays(start, 1);
        ppm = 3;
        break;
      case "day":
        end = addDays(start, 7);
        ppm = 0.7;
        break;
      case "week":
        end = addDays(start, 28);
        ppm = 0.175;
        break;
    }

    return { timelineStart: start, timelineEnd: end, pixelsPerMinute: ppm };
  }, [currentDate, zoomLevel]);

  // Filtered data
  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (selectedJobStatus !== "all" && assignment.status !== selectedJobStatus) return false;
      
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const matchesWO = assignment.work_order?.display_id?.toLowerCase().includes(search) ||
                         assignment.work_order?.wo_id?.toLowerCase().includes(search);
        const matchesItem = assignment.work_order?.item_code?.toLowerCase().includes(search);
        const matchesCustomer = assignment.work_order?.customer?.toLowerCase().includes(search);
        
        if (!matchesWO && !matchesItem && !matchesCustomer) return false;
      }

      return true;
    });
  }, [assignments, selectedJobStatus, searchTerm]);

  const filteredMachines = useMemo(() => {
    if (selectedMachineGroup === "all") return machines;
    return machines.filter((m) => m.location === selectedMachineGroup);
  }, [machines, selectedMachineGroup]);

  // Machine groups for filter
  const machineGroups = useMemo(() => {
    const groups = new Set(machines.map((m) => m.location).filter(Boolean));
    return Array.from(groups);
  }, [machines]);

  // Calculate utilization
  const utilization = useMemo(() => {
    const util: Record<string, number> = {};
    
    filteredMachines.forEach((machine) => {
      const machineAssignments = filteredAssignments.filter(
        (a) => a.machine_id === machine.id && a.status !== "completed"
      );
      
      const totalMinutes = machineAssignments.reduce((acc, assignment) => {
        const start = new Date(assignment.scheduled_start);
        const end = new Date(assignment.scheduled_end);
        return acc + differenceInMinutes(end, start);
      }, 0);
      
      const availableMinutes = differenceInMinutes(timelineEnd, timelineStart);
      util[machine.id] = Math.min((totalMinutes / availableMinutes) * 100, 100);
    });
    
    return util;
  }, [filteredMachines, filteredAssignments, timelineStart, timelineEnd]);

  // Summary calculations
  const summaryData = useMemo(() => {
    const todayAssignments = filteredAssignments.filter((a) =>
      isToday(new Date(a.scheduled_start))
    );

    const partsInProgress = filteredAssignments
      .filter((a) => a.status === "running")
      .reduce((sum, a) => sum + a.quantity_allocated, 0);

    const bottlenecks = filteredMachines
      .filter((m) => utilization[m.id] >= 90)
      .map((m) => m.machine_id);

    const runningJobs = filteredAssignments
      .filter((a) => a.status === "running")
      .sort((a, b) => 
        new Date(a.scheduled_end).getTime() - new Date(b.scheduled_end).getTime()
      );

    const nextCompletion = runningJobs.length > 0 
      ? new Date(runningJobs[0].scheduled_end) 
      : null;

    return {
      totalJobsToday: todayAssignments.length,
      totalPartsInProgress: partsInProgress,
      bottleneckMachines: bottlenecks,
      nextCompletion,
    };
  }, [filteredAssignments, filteredMachines, utilization]);

  const exportToPDF = () => {
    const doc = new jsPDF({ orientation: "landscape" });
    
    doc.setFontSize(16);
    doc.text("CNC Production Schedule", 14, 20);
    
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 14, 28);
    doc.text(`View: ${zoomLevel.toUpperCase()} | Mode: ${viewMode.toUpperCase()}`, 14, 34);

    let yPos = 45;
    
    filteredMachines.forEach((machine) => {
      if (yPos > 180) {
        doc.addPage();
        yPos = 20;
      }

      doc.setFontSize(9);
      doc.text(`${machine.machine_id} - ${machine.name} (${utilization[machine.id]?.toFixed(0)}% utilized)`, 14, yPos);
      
      const machineAssignments = filteredAssignments.filter((a) => a.machine_id === machine.id);
      
      machineAssignments.forEach((assignment) => {
        yPos += 6;
        const startTime = format(new Date(assignment.scheduled_start), "MMM dd HH:mm");
        const endTime = format(new Date(assignment.scheduled_end), "HH:mm");
        doc.setFontSize(8);
        doc.text(
          `  ${assignment.work_order?.display_id} | ${assignment.work_order?.item_code} | ${startTime}-${endTime} | ${assignment.status}`,
          16,
          yPos
        );
      });

      yPos += 10;
    });

    doc.save(`production-schedule-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast({ title: "Success", description: "Schedule exported to PDF" });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="space-y-4">
        {/* Summary Panel */}
        <SummaryPanel {...summaryData} />

        {/* Filters */}
        <FilterPanel
          machineGroups={machineGroups}
          selectedMachineGroup={selectedMachineGroup}
          onMachineGroupChange={setSelectedMachineGroup}
          selectedJobStatus={selectedJobStatus}
          onJobStatusChange={setSelectedJobStatus}
          selectedShift={selectedShift}
          onShiftChange={setSelectedShift}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />

        {/* Controls */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
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
                    <SelectItem value="hour">Day View</SelectItem>
                    <SelectItem value="day">Week View</SelectItem>
                    <SelectItem value="week">Month View</SelectItem>
                  </SelectContent>
                </Select>

                <Button size="sm" variant="outline" onClick={loadData}>
                  <RefreshCw className="h-4 w-4" />
                </Button>

                <Button size="sm" variant="outline" onClick={exportToPDF}>
                  <Download className="h-4 w-4 mr-2" />
                  Export
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={viewMode} onValueChange={(v: any) => setViewMode(v)}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="timeline">
              <Calendar className="h-4 w-4 mr-2" />
              Timeline
            </TabsTrigger>
            <TabsTrigger value="kanban">
              <LayoutGrid className="h-4 w-4 mr-2" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="list">
              <List className="h-4 w-4 mr-2" />
              List
            </TabsTrigger>
          </TabsList>

          <TabsContent value="timeline" className="mt-4">
            {loading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">Loading schedule...</div>
                </CardContent>
              </Card>
            ) : (
              <TimelineView
                machines={filteredMachines}
                assignments={filteredAssignments}
                timelineStart={timelineStart}
                timelineEnd={timelineEnd}
                pixelsPerMinute={pixelsPerMinute}
                zoomLevel={zoomLevel}
                onDrop={handleDrop}
                utilization={utilization}
              />
            )}
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            {loading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">Loading...</div>
                </CardContent>
              </Card>
            ) : (
              <KanbanView
                machines={filteredMachines}
                assignments={filteredAssignments}
                onDrop={handleDrop}
              />
            )}
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            {loading ? (
              <Card>
                <CardContent className="py-12">
                  <div className="text-center text-muted-foreground">Loading...</div>
                </CardContent>
              </Card>
            ) : (
              <ListView machines={filteredMachines} assignments={filteredAssignments} />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DndProvider>
  );
};