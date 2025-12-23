import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Clock, Wrench, CheckCircle, BarChart3 } from "lucide-react";
import { format, differenceInMinutes, startOfMonth, endOfMonth } from "date-fns";

interface Person {
  id: string;
  full_name: string;
  role: string | null;
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  item_code: string;
  customer: string;
}

interface ActivityLog {
  id: string;
  activity_date: string;
  programmer_id: string | null;
  machine_id: string | null;
  wo_id: string | null;
  party_code: string | null;
  item_code: string | null;
  drawing_number: string | null;
  setup_start_time: string | null;
  setup_end_time: string | null;
  setup_duration_minutes: number | null;
  first_piece_approval_time: string | null;
  qc_approver_id: string | null;
  machine_counter_reading: number | null;
  setup_type: string;
  created_at: string;
  programmer?: Person;
  machine?: Machine;
  work_order?: WorkOrder;
  qc_approver?: Person;
}

const CNCProgrammerActivity = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [programmers, setProgrammers] = useState<Person[]>([]);
  const [qcInspectors, setQcInspectors] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [dateFilter, setDateFilter] = useState(format(new Date(), "yyyy-MM-dd"));

  // Form state
  const [formData, setFormData] = useState({
    activity_date: format(new Date(), "yyyy-MM-dd"),
    programmer_id: "",
    machine_id: "",
    wo_id: "",
    party_code: "",
    item_code: "",
    drawing_number: "",
    setup_start_time: "",
    setup_end_time: "",
    first_piece_approval_time: "",
    qc_approver_id: "",
    machine_counter_reading: "",
    setup_type: "new" as "new" | "repair",
  });

  useEffect(() => {
    loadData();
  }, [dateFilter]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [activitiesRes, programmersRes, qcRes, machinesRes, workOrdersRes] = await Promise.all([
        supabase
          .from("cnc_programmer_activity")
          .select("*")
          .eq("activity_date", dateFilter)
          .order("created_at", { ascending: false }),
        supabase
          .from("people")
          .select("id, full_name, role")
          .or("role.ilike.%programmer%,role.ilike.%cnc%")
          .order("full_name"),
        supabase
          .from("people")
          .select("id, full_name, role")
          .or("role.ilike.%qc%,role.ilike.%quality%,role.ilike.%inspector%")
          .order("full_name"),
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
        supabase
          .from("work_orders")
          .select("id, wo_number, item_code, customer")
          .in("status", ["pending", "in_progress"])
          .order("wo_number", { ascending: false })
          .limit(100),
      ]);

      if (activitiesRes.error) throw activitiesRes.error;
      if (programmersRes.error) throw programmersRes.error;
      if (qcRes.error) throw qcRes.error;
      if (machinesRes.error) throw machinesRes.error;
      if (workOrdersRes.error) throw workOrdersRes.error;

      setActivities(activitiesRes.data || []);
      setProgrammers(programmersRes.data || []);
      setQcInspectors(qcRes.data || []);
      setMachines(machinesRes.data || []);
      setWorkOrders(workOrdersRes.data || []);
    } catch (error: any) {
      toast.error("Failed to load data: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.programmer_id || !formData.machine_id) {
      toast.error("Please select a programmer and machine");
      return;
    }

    try {
      const insertData: any = {
        activity_date: formData.activity_date,
        programmer_id: formData.programmer_id || null,
        machine_id: formData.machine_id || null,
        wo_id: formData.wo_id || null,
        party_code: formData.party_code || null,
        item_code: formData.item_code || null,
        drawing_number: formData.drawing_number || null,
        setup_start_time: formData.setup_start_time ? new Date(formData.setup_start_time).toISOString() : null,
        setup_end_time: formData.setup_end_time ? new Date(formData.setup_end_time).toISOString() : null,
        first_piece_approval_time: formData.first_piece_approval_time ? new Date(formData.first_piece_approval_time).toISOString() : null,
        qc_approver_id: formData.qc_approver_id || null,
        machine_counter_reading: formData.machine_counter_reading ? parseFloat(formData.machine_counter_reading) : null,
        setup_type: formData.setup_type,
      };

      const { data: insertedActivity, error } = await supabase
        .from("cnc_programmer_activity")
        .insert(insertData)
        .select('id')
        .single();
      if (error) throw error;

      // Also insert into setter_activity_ledger for SetterEfficiency reporting
      if (insertedActivity?.id) {
        const setupStartMinutes = formData.setup_start_time ? new Date(formData.setup_start_time) : null;
        const setupEndMinutes = formData.setup_end_time ? new Date(formData.setup_end_time) : null;
        const durationMinutes = setupStartMinutes && setupEndMinutes 
          ? Math.round((setupEndMinutes.getTime() - setupStartMinutes.getTime()) / 60000)
          : null;

        const ledgerEntry = {
          work_order_id: formData.wo_id || null,
          machine_id: formData.machine_id,
          setter_id: formData.programmer_id,
          log_date: formData.activity_date,
          setup_number: `SETUP-${format(new Date(), 'HHmmss')}`,
          setup_start_time: formData.setup_start_time ? format(new Date(formData.setup_start_time), 'HH:mm:ss') : null,
          setup_end_time: formData.setup_end_time ? format(new Date(formData.setup_end_time), 'HH:mm:ss') : null,
          setup_duration_minutes: durationMinutes,
          is_repeat_setup: formData.setup_type === 'repair',
          delay_caused_minutes: 0,
        };

        await supabase.from("setter_activity_ledger").insert([ledgerEntry]);
      }

      toast.success("Activity logged successfully");
      setShowForm(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error("Failed to save activity: " + error.message);
    }
  };

  const resetForm = () => {
    setFormData({
      activity_date: format(new Date(), "yyyy-MM-dd"),
      programmer_id: "",
      machine_id: "",
      wo_id: "",
      party_code: "",
      item_code: "",
      drawing_number: "",
      setup_start_time: "",
      setup_end_time: "",
      first_piece_approval_time: "",
      qc_approver_id: "",
      machine_counter_reading: "",
      setup_type: "new",
    });
  };

  // Calculate setup duration for display in form
  const calculatedSetupDuration = useMemo(() => {
    if (formData.setup_start_time && formData.setup_end_time) {
      const start = new Date(formData.setup_start_time);
      const end = new Date(formData.setup_end_time);
      const minutes = differenceInMinutes(end, start);
      return minutes > 0 ? minutes : 0;
    }
    return null;
  }, [formData.setup_start_time, formData.setup_end_time]);

  // Calculate programmer efficiency metrics
  const efficiencyMetrics = useMemo(() => {
    const programmerStats: Record<string, { totalSetups: number; totalDuration: number; newSetups: number; repairSetups: number }> = {};
    
    activities.forEach((activity) => {
      if (!activity.programmer_id) return;
      
      if (!programmerStats[activity.programmer_id]) {
        programmerStats[activity.programmer_id] = { totalSetups: 0, totalDuration: 0, newSetups: 0, repairSetups: 0 };
      }
      
      programmerStats[activity.programmer_id].totalSetups++;
      if (activity.setup_duration_minutes) {
        programmerStats[activity.programmer_id].totalDuration += activity.setup_duration_minutes;
      }
      if (activity.setup_type === "new") {
        programmerStats[activity.programmer_id].newSetups++;
      } else {
        programmerStats[activity.programmer_id].repairSetups++;
      }
    });

    return Object.entries(programmerStats).map(([id, stats]) => ({
      programmer: programmers.find((p) => p.id === id),
      ...stats,
      avgDuration: stats.totalSetups > 0 ? Math.round(stats.totalDuration / stats.totalSetups) : 0,
    }));
  }, [activities, programmers]);

  const getProgrammerName = (id: string | null) => programmers.find((p) => p.id === id)?.full_name || "-";
  const getMachineName = (id: string | null) => machines.find((m) => m.id === id)?.name || "-";
  const getQcApproverName = (id: string | null) => qcInspectors.find((p) => p.id === id)?.full_name || "-";

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <PageContainer>
      <PageHeader
        title="CNC Programmer Activity"
        description="Track programmer setups, approvals, and efficiency metrics"
        icon={<Wrench className="h-6 w-6" />}
        actions={
          <Button onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-2" />
            New Entry
          </Button>
        }
      />

      {/* Efficiency Summary Cards */}
      {efficiencyMetrics.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {efficiencyMetrics.map((metric) => (
            <Card key={metric.programmer?.id || "unknown"}>
              <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {metric.programmer?.full_name || "Unknown"}
              </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Setups:</span>
                  <span className="font-medium">{metric.totalSetups}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Avg Duration:</span>
                  <span className="font-medium">{formatDuration(metric.avgDuration)}</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Badge variant="outline" className="text-xs">New: {metric.newSetups}</Badge>
                  <Badge variant="secondary" className="text-xs">Repair: {metric.repairSetups}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Entry Form */}
      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">New Activity Entry</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Row 1: Date, Programmer, Machine */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="activity_date">Date</Label>
                  <Input
                    id="activity_date"
                    type="date"
                    value={formData.activity_date}
                    onChange={(e) => setFormData({ ...formData, activity_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="programmer_id">CNC Programmer *</Label>
                  <Select
                    value={formData.programmer_id}
                    onValueChange={(value) => setFormData({ ...formData, programmer_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select programmer" />
                    </SelectTrigger>
                    <SelectContent>
                      {programmers.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="machine_id">Machine *</Label>
                  <Select
                    value={formData.machine_id}
                    onValueChange={(value) => setFormData({ ...formData, machine_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.machine_id} - {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Work Order, Party Code, Item Code, Drawing */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="wo_id">Work Order (Optional)</Label>
                  <Select
                    value={formData.wo_id}
                    onValueChange={(value) => setFormData({ ...formData, wo_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select WO" />
                    </SelectTrigger>
                    <SelectContent>
                      {workOrders.map((wo) => (
                        <SelectItem key={wo.id} value={wo.id}>
                          {wo.wo_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="party_code">Party Code</Label>
                  <Input
                    id="party_code"
                    value={formData.party_code}
                    onChange={(e) => setFormData({ ...formData, party_code: e.target.value })}
                    placeholder="Enter party code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item_code">Item Code</Label>
                  <Input
                    id="item_code"
                    value={formData.item_code}
                    onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                    placeholder="Enter item code"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="drawing_number">Drawing Number</Label>
                  <Input
                    id="drawing_number"
                    value={formData.drawing_number}
                    onChange={(e) => setFormData({ ...formData, drawing_number: e.target.value })}
                    placeholder="Enter drawing number"
                  />
                </div>
              </div>

              {/* Row 3: Setup Times */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="setup_start_time">Setup Start Time</Label>
                  <Input
                    id="setup_start_time"
                    type="datetime-local"
                    value={formData.setup_start_time}
                    onChange={(e) => setFormData({ ...formData, setup_start_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup_end_time">Setup End Time</Label>
                  <Input
                    id="setup_end_time"
                    type="datetime-local"
                    value={formData.setup_end_time}
                    onChange={(e) => setFormData({ ...formData, setup_end_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Setup Duration (Auto-calculated)</Label>
                  <div className="flex items-center h-10 px-3 border rounded-md bg-muted">
                    <Clock className="h-4 w-4 mr-2 text-muted-foreground" />
                    <span>{calculatedSetupDuration !== null ? formatDuration(calculatedSetupDuration) : "-"}</span>
                  </div>
                </div>
              </div>

              {/* Row 4: Approval Details */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_piece_approval_time">First Piece Approval Time</Label>
                  <Input
                    id="first_piece_approval_time"
                    type="datetime-local"
                    value={formData.first_piece_approval_time}
                    onChange={(e) => setFormData({ ...formData, first_piece_approval_time: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="qc_approver_id">QC Approver</Label>
                  <Select
                    value={formData.qc_approver_id}
                    onValueChange={(value) => setFormData({ ...formData, qc_approver_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select QC approver" />
                    </SelectTrigger>
                    <SelectContent>
                      {qcInspectors.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="machine_counter_reading">Machine Counter Reading</Label>
                  <Input
                    id="machine_counter_reading"
                    type="number"
                    value={formData.machine_counter_reading}
                    onChange={(e) => setFormData({ ...formData, machine_counter_reading: e.target.value })}
                    placeholder="Enter counter reading"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="setup_type">Setup Type</Label>
                  <Select
                    value={formData.setup_type}
                    onValueChange={(value: "new" | "repair") => setFormData({ ...formData, setup_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">New Setup</SelectItem>
                      <SelectItem value="repair">Repair Setup</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">Save Entry</Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Filter and Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Activity Log</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="dateFilter" className="text-sm">Date:</Label>
            <Input
              id="dateFilter"
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-40"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : activities.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No activities logged for {format(new Date(dateFilter), "MMMM d, yyyy")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programmer</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Party Code</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Drawing</TableHead>
                    <TableHead>Setup Type</TableHead>
                    <TableHead>Setup Duration</TableHead>
                    <TableHead>FP Approval</TableHead>
                    <TableHead>QC Approver</TableHead>
                    <TableHead>Counter</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell className="font-medium">{getProgrammerName(activity.programmer_id)}</TableCell>
                      <TableCell>{getMachineName(activity.machine_id)}</TableCell>
                      <TableCell>{activity.party_code || "-"}</TableCell>
                      <TableCell>{activity.item_code || "-"}</TableCell>
                      <TableCell>{activity.drawing_number || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={activity.setup_type === "new" ? "default" : "secondary"}>
                          {activity.setup_type === "new" ? "New" : "Repair"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDuration(activity.setup_duration_minutes)}</TableCell>
                      <TableCell>
                        {activity.first_piece_approval_time ? (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-green-500" />
                            {format(new Date(activity.first_piece_approval_time), "HH:mm")}
                          </div>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>{getQcApproverName(activity.qc_approver_id)}</TableCell>
                      <TableCell>{activity.machine_counter_reading || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
};

export default CNCProgrammerActivity;
