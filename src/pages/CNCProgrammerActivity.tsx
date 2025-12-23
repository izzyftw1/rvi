import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Clock, Wrench, CheckCircle, Info, AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { format, differenceInMinutes } from "date-fns";

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
  display_id: string;
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
}

const CNCProgrammerActivity = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [programmers, setProgrammers] = useState<Person[]>([]);
  const [qcInspectors, setQcInspectors] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
          .order("full_name"),
        supabase
          .from("people")
          .select("id, full_name, role")
          .or("role.ilike.%qc%,role.ilike.%quality%,role.ilike.%inspector%")
          .order("full_name"),
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
        supabase
          .from("work_orders")
          .select("id, display_id, item_code, customer")
          .in("status", ["pending", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (activitiesRes.error) throw activitiesRes.error;

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

  // Auto-populate item code from selected work order
  useEffect(() => {
    if (formData.wo_id) {
      const wo = workOrders.find(w => w.id === formData.wo_id);
      if (wo) {
        setFormData(prev => ({
          ...prev,
          item_code: wo.item_code || prev.item_code,
          party_code: wo.customer || prev.party_code,
        }));
      }
    }
  }, [formData.wo_id, workOrders]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.programmer_id || !formData.machine_id) {
      toast.error("Please select a programmer and machine");
      return;
    }

    setSaving(true);
    try {
      // Auto-calculate setup duration
      let setupDurationMinutes: number | null = null;
      if (formData.setup_start_time && formData.setup_end_time) {
        const start = new Date(formData.setup_start_time);
        const end = new Date(formData.setup_end_time);
        setupDurationMinutes = differenceInMinutes(end, start);
        if (setupDurationMinutes < 0) setupDurationMinutes = 0;
      }

      const insertData = {
        activity_date: formData.activity_date,
        programmer_id: formData.programmer_id || null,
        machine_id: formData.machine_id || null,
        wo_id: formData.wo_id || null,
        party_code: formData.party_code || null,
        item_code: formData.item_code || null,
        drawing_number: formData.drawing_number || null,
        setup_start_time: formData.setup_start_time || null,
        setup_end_time: formData.setup_end_time || null,
        setup_duration_minutes: setupDurationMinutes,
        first_piece_approval_time: formData.first_piece_approval_time || null,
        qc_approver_id: formData.qc_approver_id || null,
        machine_counter_reading: formData.machine_counter_reading ? parseFloat(formData.machine_counter_reading) : null,
        setup_type: formData.setup_type,
      };

      const { error } = await supabase.from("cnc_programmer_activity").insert(insertData);
      if (error) throw error;

      toast.success("Activity logged successfully");
      setShowForm(false);
      resetForm();
      loadData();
    } catch (error: any) {
      toast.error("Failed to save activity: " + error.message);
    } finally {
      setSaving(false);
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

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalSetups = activities.length;
    const newSetups = activities.filter(a => a.setup_type === "new").length;
    const repairSetups = activities.filter(a => a.setup_type === "repair").length;
    const withApproval = activities.filter(a => a.first_piece_approval_time).length;
    const totalDuration = activities.reduce((sum, a) => sum + (a.setup_duration_minutes || 0), 0);
    const avgDuration = totalSetups > 0 ? Math.round(totalDuration / totalSetups) : 0;
    
    return { totalSetups, newSetups, repairSetups, withApproval, avgDuration };
  }, [activities]);

  const getProgrammerName = (id: string | null) => programmers.find((p) => p.id === id)?.full_name || "-";
  const getMachineName = (id: string | null) => machines.find((m) => m.id === id)?.machine_id || "-";
  const getQcApproverName = (id: string | null) => qcInspectors.find((p) => p.id === id)?.full_name || "-";
  const getWorkOrderDisplay = (id: string | null) => workOrders.find((w) => w.id === id)?.display_id || null;

  const formatDuration = (minutes: number | null) => {
    if (!minutes) return "-";
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="CNC Programmer Activity"
        description="Track programmer setups, first-piece approvals, and setup efficiency"
      />

      {/* Info Banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          This data feeds into Setter Efficiency analytics and NCR root cause analysis (setup faults).
          <br />
          <span className="text-xs text-muted-foreground">
            Repair setups are flagged for quality investigation. First-piece approval time is tracked for process control.
          </span>
        </AlertDescription>
      </Alert>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Total Setups</div>
            {loading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold">{summaryStats.totalSetups}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">New Setups</div>
            {loading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold text-green-600">{summaryStats.newSetups}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              Repair Setups
              {summaryStats.repairSetups > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
            </div>
            {loading ? <Skeleton className="h-8 w-12" /> : (
              <div className={`text-2xl font-bold ${summaryStats.repairSetups > 0 ? 'text-amber-600' : ''}`}>
                {summaryStats.repairSetups}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">FP Approved</div>
            {loading ? <Skeleton className="h-8 w-12" /> : (
              <div className="text-2xl font-bold">{summaryStats.withApproval}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
            {loading ? <Skeleton className="h-8 w-16" /> : (
              <div className="text-2xl font-bold">{formatDuration(summaryStats.avgDuration)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="dateFilter" className="text-sm whitespace-nowrap">Date:</Label>
          <Input
            id="dateFilter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="icon" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Entry
        </Button>
      </div>

      {/* Entry Form */}
      {showForm && (
        <Card>
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
                  <Label htmlFor="programmer_id">CNC Programmer / Setter *</Label>
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
                  <Label htmlFor="wo_id">Work Order</Label>
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
                          {wo.display_id} - {wo.item_code}
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
                    placeholder="Auto-filled from WO"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="item_code">Item Code</Label>
                  <Input
                    id="item_code"
                    value={formData.item_code}
                    onChange={(e) => setFormData({ ...formData, item_code: e.target.value })}
                    placeholder="Auto-filled from WO"
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
                    <span className="font-medium">{calculatedSetupDuration !== null ? formatDuration(calculatedSetupDuration) : "-"}</span>
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
                      <SelectItem value="repair">Repair Setup (Fault)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {formData.setup_type === "repair" && (
                <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800 dark:text-amber-200">
                    Repair setups indicate a previous setup fault. This will be flagged for NCR root cause analysis.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Entry"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Activity Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Activity Log - {format(new Date(dateFilter), "MMMM d, yyyy")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : activities.length === 0 ? (
            <div className="text-center py-12">
              <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-sm font-medium mb-1">No activities logged</h3>
              <p className="text-sm text-muted-foreground mb-4">
                No programmer activity logged for {format(new Date(dateFilter), "MMMM d, yyyy")}
              </p>
              <Button onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Log First Entry
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Programmer</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Setup Type</TableHead>
                    <TableHead>Setup Duration</TableHead>
                    <TableHead>FP Approval</TableHead>
                    <TableHead>QC Approver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activities.map((activity) => {
                    const woDisplay = getWorkOrderDisplay(activity.wo_id);
                    return (
                      <TableRow key={activity.id}>
                        <TableCell className="font-medium">{getProgrammerName(activity.programmer_id)}</TableCell>
                        <TableCell>{getMachineName(activity.machine_id)}</TableCell>
                        <TableCell>
                          {activity.wo_id && woDisplay ? (
                            <Link 
                              to={`/work-orders/${activity.wo_id}`}
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {woDisplay}
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{activity.item_code || "-"}</TableCell>
                        <TableCell>
                          {activity.setup_type === "repair" ? (
                            <Badge variant="destructive" className="gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              Repair
                            </Badge>
                          ) : (
                            <Badge variant="secondary">New</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-mono">{formatDuration(activity.setup_duration_minutes)}</TableCell>
                        <TableCell>
                          {activity.first_piece_approval_time ? (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              {format(new Date(activity.first_piece_approval_time), "HH:mm")}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                        </TableCell>
                        <TableCell>{getQcApproverName(activity.qc_approver_id)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CNCProgrammerActivity;
