/**
 * Setter Efficiency Page
 * 
 * READ-ONLY HISTORICAL ANALYTICS VIEW + DRILL-DOWN ENTRY
 * All metrics derived exclusively from useSetterEfficiencyMetrics hook.
 * Sources data from cnc_programmer_activity - NOT production logs.
 * 
 * Includes CNC Programmer Activity as a drill-down for data entry.
 * 
 * Metrics:
 * 1. Setup duration (setup_start_time → setup_end_time)
 * 2. First-off approval delay (setup_end_time → first_piece_approval_time)
 * 3. Repeat setup faults (same item/WO within 24h window)
 */

import { useState, useMemo, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO, differenceInMinutes } from "date-fns";
import { 
  Wrench, Clock, RefreshCw, Download, Info, Timer, Zap, 
  AlertTriangle, TrendingUp, Award, RepeatIcon, CheckCircle2,
  Plus, CheckCircle, ExternalLink
} from "lucide-react";
import { useSetterEfficiencyMetrics, type SetterMetrics, type SetupRecord } from "@/hooks/useSetterEfficiencyMetrics";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Period = "daily" | "weekly" | "monthly";
type ActiveTab = "overview" | "details" | "activity";

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

const SetterEfficiency = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [period, setPeriod] = useState<Period>("daily");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  
  // Check for incoming parameters from CNC Dashboard
  const initialTab = searchParams.get("tab") as ActiveTab || "overview";
  const prefillMachineId = searchParams.get("machine_id") || "";
  const prefillWoId = searchParams.get("wo_id") || "";
  const prefillItemCode = searchParams.get("item_code") || "";
  const prefillPartyCode = searchParams.get("party_code") || "";
  
  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  
  // Filters for activity tab
  const [machineFilter, setMachineFilter] = useState<string>("all");
  const [woFilter, setWoFilter] = useState<string>("all");

  // Activity entry state
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [programmers, setProgrammers] = useState<Person[]>([]);
  const [qcInspectors, setQcInspectors] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Show form automatically if we have prefill params
  const [showForm, setShowForm] = useState(!!prefillMachineId || !!prefillWoId);

  // Form state with prefill from query params
  const [formData, setFormData] = useState({
    activity_date: format(new Date(), "yyyy-MM-dd"),
    programmer_id: "",
    machine_id: prefillMachineId,
    wo_id: prefillWoId,
    party_code: prefillPartyCode,
    item_code: prefillItemCode,
    drawing_number: "",
    setup_start_time: "",
    setup_end_time: "",
    first_piece_approval_time: "",
    qc_approver_id: "",
    machine_counter_reading: "",
    setup_type: "new" as "new" | "repair",
  });
  
  // Clear query params after initial load to avoid confusion on refresh
  useEffect(() => {
    if (prefillMachineId || prefillWoId) {
      // Give time for form to initialize, then clear params
      const timer = setTimeout(() => {
        setSearchParams({}, { replace: true });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, []);

  // Get date range based on period
  const dateRange = useMemo(() => {
    const baseDate = parseISO(selectedDate);
    switch (period) {
      case "daily":
        return { start: selectedDate, end: selectedDate };
      case "weekly":
        return {
          start: format(startOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
          end: format(endOfWeek(baseDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        };
      case "monthly":
        return {
          start: format(startOfMonth(baseDate), "yyyy-MM-dd"),
          end: format(endOfMonth(baseDate), "yyyy-MM-dd"),
        };
    }
  }, [period, selectedDate]);

  // SINGLE SOURCE: useSetterEfficiencyMetrics (NOT production log metrics)
  const { 
    setterMetrics, 
    setupRecords, 
    summary, 
    loading, 
    error, 
    refresh 
  } = useSetterEfficiencyMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
    machineId: machineFilter !== "all" ? machineFilter : undefined,
    repeatWindowHours: 24,
  });

  // Load reference data for activity tab
  useEffect(() => {
    loadReferenceData();
  }, []);

  // Load activities when on activity tab
  useEffect(() => {
    if (activeTab === "activity") {
      loadActivities();
    }
  }, [activeTab, selectedDate, machineFilter, woFilter]);

  const loadReferenceData = async () => {
    try {
      const [programmersRes, qcRes, machinesRes, workOrdersRes] = await Promise.all([
        supabase.from("people").select("id, full_name, role").order("full_name"),
        supabase.from("people").select("id, full_name, role")
          .or("role.ilike.%qc%,role.ilike.%quality%,role.ilike.%inspector%")
          .order("full_name"),
        supabase.from("machines").select("id, machine_id, name").order("machine_id"),
        supabase.from("work_orders")
          .select("id, display_id, item_code, customer")
          .in("status", ["pending", "in_progress"])
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      setProgrammers(programmersRes.data || []);
      setQcInspectors(qcRes.data || []);
      setMachines(machinesRes.data || []);
      setWorkOrders(workOrdersRes.data || []);
    } catch (error: any) {
      console.error("Failed to load reference data:", error);
    }
  };

  const loadActivities = async () => {
    setActivityLoading(true);
    try {
      let query = supabase
        .from("cnc_programmer_activity")
        .select("*")
        .gte("activity_date", dateRange.start)
        .lte("activity_date", dateRange.end)
        .order("created_at", { ascending: false });

      if (machineFilter !== "all") {
        query = query.eq("machine_id", machineFilter);
      }
      if (woFilter !== "all") {
        query = query.eq("wo_id", woFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setActivities(data || []);
    } catch (error: any) {
      toast.error("Failed to load activities: " + error.message);
    } finally {
      setActivityLoading(false);
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
      // NOTE: setup_duration_minutes is a GENERATED column - do NOT insert it directly
      // It is auto-computed from setup_start_time and setup_end_time
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
        // setup_duration_minutes is auto-generated - omit from insert
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
      loadActivities();
      refresh(); // Refresh metrics as well
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

  // Activity summary stats
  const activitySummary = useMemo(() => {
    const totalSetups = activities.length;
    const newSetups = activities.filter(a => a.setup_type === "new").length;
    const repairSetups = activities.filter(a => a.setup_type === "repair").length;
    const withApproval = activities.filter(a => a.first_piece_approval_time).length;
    const totalDuration = activities.reduce((sum, a) => sum + (a.setup_duration_minutes || 0), 0);
    const avgDuration = totalSetups > 0 ? Math.round(totalDuration / totalSetups) : 0;
    
    return { totalSetups, newSetups, repairSetups, withApproval, avgDuration };
  }, [activities]);

  const formatDuration = (minutes: number | null) => {
    if (!minutes || minutes <= 0) return "—";
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const getSetupTimeColor = (avgTime: number) => {
    if (avgTime <= 15) return "text-green-600 dark:text-green-400";
    if (avgTime <= 30) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getDelayColor = (delay: number) => {
    if (delay <= 5) return "text-green-600 dark:text-green-400";
    if (delay <= 15) return "text-amber-600 dark:text-amber-400";
    return "text-red-600 dark:text-red-400";
  };

  const getEfficiencyBadge = (score: number) => {
    if (score <= 20) return { label: "Excellent", variant: "default" as const, className: "bg-green-600" };
    if (score <= 35) return { label: "Good", variant: "secondary" as const, className: "bg-blue-600 text-white" };
    if (score <= 50) return { label: "Average", variant: "outline" as const, className: "" };
    return { label: "Needs Improvement", variant: "destructive" as const, className: "" };
  };

  const getProgrammerName = (id: string | null) => programmers.find((p) => p.id === id)?.full_name || "-";
  const getMachineName = (id: string | null) => machines.find((m) => m.id === id)?.machine_id || "-";
  const getQcApproverName = (id: string | null) => qcInspectors.find((p) => p.id === id)?.full_name || "-";
  const getWorkOrderDisplay = (id: string | null) => workOrders.find((w) => w.id === id)?.display_id || null;

  const exportCSV = () => {
    if (setterMetrics.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "Setter Name",
      "Total Setups",
      "Avg Setup Time (min)",
      "Min Setup Time (min)",
      "Max Setup Time (min)",
      "Avg Approval Delay (min)",
      "Max Approval Delay (min)",
      "Repeat Setups",
      "Efficiency Score",
    ];
    const rows = setterMetrics.map((m) => [
      m.setterName,
      m.totalSetups,
      m.avgSetupDurationMinutes,
      m.minSetupDurationMinutes,
      m.maxSetupDurationMinutes,
      m.avgApprovalDelayMinutes,
      m.maxApprovalDelayMinutes,
      m.repeatSetupCount,
      m.efficiencyScore,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `setter-efficiency-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Setter Efficiency"
        description="Setup performance analytics and CNC programmer activity tracking"
      />

      {/* Data Source Notice */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          All metrics derived from <strong>CNC Programmer Activity</strong> records — NOT production logs.
          <br />
          <span className="text-xs text-muted-foreground">
            Setup Duration • First-off Approval Delay • Repeat Setup Detection
          </span>
        </AlertDescription>
      </Alert>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Setters</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary.setterCount}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Total Setups</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary.totalSetups}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Setup Time</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={cn("text-2xl font-bold", getSetupTimeColor(summary.avgSetupDuration))}>
                {formatDuration(summary.avgSetupDuration)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Avg Approval Delay</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className={cn("text-2xl font-bold", getDelayColor(summary.avgApprovalDelay))}>
                {formatDuration(summary.avgApprovalDelay)}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <RepeatIcon className="h-4 w-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">Repeat Setups</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-600">
                {summary.totalRepeatSetups}
                {summary.totalSetups > 0 && (
                  <span className="text-sm font-normal text-muted-foreground ml-1">
                    ({Math.round((summary.totalRepeatSetups / summary.totalSetups) * 100)}%)
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Award className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Best Performer</span>
            </div>
            {loading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-lg font-bold truncate" title={summary.bestPerformer || ""}>
                {summary.bestPerformer || "—"}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Period Toggle */}
            <div className="space-y-2">
              <Label className="text-xs">Period</Label>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList>
                  <TabsTrigger value="daily">Daily</TabsTrigger>
                  <TabsTrigger value="weekly">Weekly</TabsTrigger>
                  <TabsTrigger value="monthly">Monthly</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="text-xs">Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40"
              />
            </div>

            {/* Machine Filter */}
            <div className="space-y-2">
              <Label className="text-xs">Machine</Label>
              <Select value={machineFilter} onValueChange={setMachineFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="All Machines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Machines</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.machine_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Work Order Filter (only for Activity tab) */}
            {activeTab === "activity" && (
              <div className="space-y-2">
                <Label className="text-xs">Work Order</Label>
                <Select value={woFilter} onValueChange={setWoFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Work Orders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Work Orders</SelectItem>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.display_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {format(parseISO(dateRange.start), "MMM d")} –{" "}
                {format(parseISO(dateRange.end), "MMM d, yyyy")}
              </span>
              <Button variant="outline" size="sm" onClick={() => { refresh(); if (activeTab === "activity") loadActivities(); }} disabled={loading}>
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={setterMetrics.length === 0}>
                <Download className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Content Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ActiveTab)}>
        <TabsList>
          <TabsTrigger value="overview">Setter Overview</TabsTrigger>
          <TabsTrigger value="details">Setup Details</TabsTrigger>
          <TabsTrigger value="activity">
            <Plus className="h-4 w-4 mr-1" />
            Log Activity
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="h-5 w-5" />
                Setter Performance
              </CardTitle>
              <CardDescription>
                Ranked by efficiency score (lower is better)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : setterMetrics.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-sm font-medium mb-1">No setter activity recorded</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    No CNC programmer activity entries for this period.
                  </p>
                  <Button onClick={() => setActiveTab("activity")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Log Activity
                  </Button>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Setter</TableHead>
                      <TableHead className="text-center">Setups</TableHead>
                      <TableHead className="text-center">Avg Setup</TableHead>
                      <TableHead className="text-center">Min / Max</TableHead>
                      <TableHead className="text-center">Avg Delay</TableHead>
                      <TableHead className="text-center">Max Delay</TableHead>
                      <TableHead className="text-center">Repeats</TableHead>
                      <TableHead className="text-center">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setterMetrics.map((metrics, idx) => {
                      const badge = getEfficiencyBadge(metrics.efficiencyScore);
                      return (
                        <TableRow key={metrics.setterId}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {idx === 0 && <Award className="h-4 w-4 text-yellow-500" />}
                              <span className="font-medium">{metrics.setterName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary">{metrics.totalSetups}</Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getSetupTimeColor(metrics.avgSetupDurationMinutes))}>
                              {formatDuration(metrics.avgSetupDurationMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-sm text-muted-foreground">
                            {formatDuration(metrics.minSetupDurationMinutes)} / {formatDuration(metrics.maxSetupDurationMinutes)}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getDelayColor(metrics.avgApprovalDelayMinutes))}>
                              {formatDuration(metrics.avgApprovalDelayMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground">
                            {formatDuration(metrics.maxApprovalDelayMinutes)}
                          </TableCell>
                          <TableCell className="text-center">
                            {metrics.repeatSetupCount > 0 ? (
                              <Badge variant="outline" className="text-orange-600 border-orange-300">
                                {metrics.repeatSetupCount}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">0</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={badge.variant} className={badge.className}>
                              {metrics.efficiencyScore}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Details Tab */}
        <TabsContent value="details" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Timer className="h-5 w-5" />
                Setup Activity Log
              </CardTitle>
              <CardDescription>
                Individual setup records from CNC Programmer Activity
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : setupRecords.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No setup records for this period.
                </div>
              ) : (
                <div className="max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Setter</TableHead>
                        <TableHead>Machine</TableHead>
                        <TableHead>Item / WO</TableHead>
                        <TableHead className="text-center">Duration</TableHead>
                        <TableHead className="text-center">Approval Delay</TableHead>
                        <TableHead className="text-center">Flags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {setupRecords.map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap">
                            {format(parseISO(record.activityDate), "MMM d")}
                          </TableCell>
                          <TableCell>{record.setterName}</TableCell>
                          <TableCell className="text-sm">{record.machineName}</TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <span className="font-mono">{record.itemCode || "—"}</span>
                              {record.woDisplayId && (
                                <span className="text-muted-foreground ml-1">
                                  ({record.woDisplayId})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className={cn("font-medium", getSetupTimeColor(record.setupDurationMinutes))}>
                              {formatDuration(record.setupDurationMinutes)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {record.approvalDelayMinutes !== null ? (
                              <span className={cn("font-medium", getDelayColor(record.approvalDelayMinutes))}>
                                {formatDuration(record.approvalDelayMinutes)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {record.isRepeatSetup && (
                              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                                <RepeatIcon className="h-3 w-3 mr-1" />
                                Repeat
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Activity Entry Tab (CNC Programmer Activity drill-down) */}
        <TabsContent value="activity" className="mt-4 space-y-4">
          {/* Activity Summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Total Setups</div>
                {activityLoading ? <Skeleton className="h-8 w-12" /> : (
                  <div className="text-2xl font-bold">{activitySummary.totalSetups}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">New Setups</div>
                {activityLoading ? <Skeleton className="h-8 w-12" /> : (
                  <div className="text-2xl font-bold text-green-600">{activitySummary.newSetups}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  Repair Setups
                  {activitySummary.repairSetups > 0 && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                </div>
                {activityLoading ? <Skeleton className="h-8 w-12" /> : (
                  <div className={`text-2xl font-bold ${activitySummary.repairSetups > 0 ? 'text-amber-600' : ''}`}>
                    {activitySummary.repairSetups}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">FP Approved</div>
                {activityLoading ? <Skeleton className="h-8 w-12" /> : (
                  <div className="text-2xl font-bold">{activitySummary.withApproval}</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-xs text-muted-foreground mb-1">Avg Duration</div>
                {activityLoading ? <Skeleton className="h-8 w-16" /> : (
                  <div className="text-2xl font-bold">{formatDuration(activitySummary.avgDuration)}</div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* New Entry Button */}
          <div className="flex justify-end">
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
                Activity Log - {format(parseISO(dateRange.start), "MMM d")} to {format(parseISO(dateRange.end), "MMM d, yyyy")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : activities.length === 0 ? (
                <div className="text-center py-12">
                  <Wrench className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="text-sm font-medium mb-1">No activities logged</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    No programmer activity logged for this period
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
        </TabsContent>
      </Tabs>

      {/* Footer - Calculation Formulas */}
      <div className="bg-muted/30 border rounded-lg p-4">
        <h4 className="text-sm font-medium mb-2">Calculation Formulas</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-muted-foreground font-mono">
          <div>Setup Duration = setup_end_time − setup_start_time</div>
          <div>Approval Delay = first_piece_approval_time − setup_end_time</div>
          <div>Repeat Setup = same item+WO within 24h window</div>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">
          <strong>Efficiency Score</strong> = Avg Setup Time + (Avg Delay × 0.5) + (Repeat % × 10) — <em>Lower is better</em>
        </div>
      </div>
    </div>
  );
};

export default SetterEfficiency;
