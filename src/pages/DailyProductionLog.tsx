import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Plus, Search, FileSpreadsheet, Trash2, Clock, AlertTriangle, Target, TrendingUp, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";

import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";

// Downtime reasons matching Excel sheet
const DOWNTIME_REASONS = [
  "Machine Repair",
  "No Power",
  "Job Setting",
  "Quality Problem",
  "Material Not Available",
  "Setting Change",
  "Cleaning",
  "Operator Training",
  "Rework",
  "Tool Change",
  "No Operator",
  "Tea Break",
  "Operator Shifted",
  "Lunch Break",
  "Machine Idle",
  "Other",
] as const;

type DowntimeReason = typeof DOWNTIME_REASONS[number];

// Rejection reason keys matching the database columns
const REJECTION_REASONS = [
  { key: "rejection_dent", label: "Dent" },
  { key: "rejection_scratch", label: "Scratch" },
  { key: "rejection_forging_mark", label: "Forging Mark" },
  { key: "rejection_lining", label: "Lining" },
  { key: "rejection_dimension", label: "Dimension" },
  { key: "rejection_tool_mark", label: "Tool Mark" },
  { key: "rejection_setting", label: "Setting" },
  { key: "rejection_previous_setup_fault", label: "Previous Setup Fault" },
  { key: "rejection_face_not_ok", label: "Face Not OK" },
  { key: "rejection_material_not_ok", label: "Material Not OK" },
] as const;

type RejectionKey = typeof REJECTION_REASONS[number]["key"];

interface RejectionBreakdown {
  rejection_dent: number;
  rejection_scratch: number;
  rejection_forging_mark: number;
  rejection_lining: number;
  rejection_dimension: number;
  rejection_tool_mark: number;
  rejection_setting: number;
  rejection_previous_setup_fault: number;
  rejection_face_not_ok: number;
  rejection_material_not_ok: number;
}

interface DowntimeEvent {
  reason: DowntimeReason;
  duration_minutes: number;
  remark?: string;
}

const formSchema = z.object({
  log_date: z.date(),
  plant: z.enum(["Main", "Pragati"]),
  shift: z.enum(["Day", "Night"]),
  machine_id: z.string().min(1, "Machine is required"),
  wo_id: z.string().optional(),
  setup_number: z.string().min(1, "Setup number is required"),
  operator_id: z.string().optional(),
  programmer_id: z.string().optional(),
  shift_start_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  shift_end_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format"),
  actual_quantity: z.number().min(0, "Must be 0 or greater"),
  rework_quantity: z.number().min(0, "Must be 0 or greater"),
});

type FormData = z.infer<typeof formSchema>;

interface Machine {
  id: string;
  name: string;
  machine_id: string;
}

interface WorkOrder {
  id: string;
  display_id: string;
  customer: string | null;
  item_code: string | null;
  revision: string | null;
  material_size_mm: string | null;
  quantity: number | null;
  cycle_time_seconds: number | null;
}

interface Person {
  id: string;
  full_name: string;
  role: string;
}

interface ProductionLog {
  id: string;
  log_date: string;
  plant: string;
  shift: string;
  setup_number: string;
  party_code: string | null;
  product_description: string | null;
  ordered_quantity: number | null;
  shift_start_time: string | null;
  shift_end_time: string | null;
  total_downtime_minutes: number | null;
  actual_runtime_minutes: number | null;
  target_quantity: number | null;
  total_rejection_quantity: number | null;
  ok_quantity: number | null;
  actual_quantity: number | null;
  rework_quantity: number | null;
  efficiency_percentage: number | null;
  machines: { name: string; machine_id: string } | null;
  work_orders: { display_id: string } | null;
  operator: { full_name: string } | null;
  programmer: { full_name: string } | null;
}

// Helper to parse time string to minutes since midnight
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper to calculate shift duration in minutes
function calculateShiftDuration(startTime: string, endTime: string): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  
  // Handle overnight shifts
  if (endMinutes < startMinutes) {
    return (24 * 60 - startMinutes) + endMinutes;
  }
  return endMinutes - startMinutes;
}

// Helper to format minutes as hours:minutes
function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

// Helper to calculate target quantity
function calculateTargetQuantity(runtimeMinutes: number, cycleTimeSeconds: number | null): number {
  if (!cycleTimeSeconds || cycleTimeSeconds <= 0) return 0;
  return Math.floor((runtimeMinutes * 60) / cycleTimeSeconds);
}

export default function DailyProductionLog() {
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  // Only admin roles can override calculated values
  const isAdmin = hasAnyRole(['admin', 'super_admin']);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [operators, setOperators] = useState<Person[]>([]);
  const [programmers, setProgrammers] = useState<Person[]>([]);
  const [selectedWO, setSelectedWO] = useState<WorkOrder | null>(null);
  const [filterDate, setFilterDate] = useState<Date>(new Date());
  const [searchTerm, setSearchTerm] = useState("");
  
  // Downtime events state
  const [downtimeEvents, setDowntimeEvents] = useState<DowntimeEvent[]>([]);
  const [newDowntimeReason, setNewDowntimeReason] = useState<DowntimeReason>("Machine Repair");
  const [newDowntimeDuration, setNewDowntimeDuration] = useState<string>("");
  const [newDowntimeRemark, setNewDowntimeRemark] = useState<string>("");

  // Target override state (Supervisor only)
  const [enableTargetOverride, setEnableTargetOverride] = useState(false);
  const [targetOverride, setTargetOverride] = useState<string>("");
  const [targetOverrideReason, setTargetOverrideReason] = useState<string>("");

  // Rejection breakdown state
  const [rejectionBreakdown, setRejectionBreakdown] = useState<RejectionBreakdown>({
    rejection_dent: 0,
    rejection_scratch: 0,
    rejection_forging_mark: 0,
    rejection_lining: 0,
    rejection_dimension: 0,
    rejection_tool_mark: 0,
    rejection_setting: 0,
    rejection_previous_setup_fault: 0,
    rejection_face_not_ok: 0,
    rejection_material_not_ok: 0,
  });

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      log_date: new Date(),
      plant: "Main",
      shift: "Day",
      machine_id: "",
      wo_id: "",
      setup_number: "",
      operator_id: "",
      programmer_id: "",
      shift_start_time: "08:30",
      shift_end_time: "20:00",
      actual_quantity: 0,
      rework_quantity: 0,
    },
  });

  const shiftStartTime = form.watch("shift_start_time");
  const shiftEndTime = form.watch("shift_end_time");
  const actualQuantity = form.watch("actual_quantity");

  // Calculate totals
  const totalDowntimeMinutes = useMemo(() => {
    return downtimeEvents.reduce((sum, event) => sum + event.duration_minutes, 0);
  }, [downtimeEvents]);

  const shiftDurationMinutes = useMemo(() => {
    if (!shiftStartTime || !shiftEndTime) return 0;
    return calculateShiftDuration(shiftStartTime, shiftEndTime);
  }, [shiftStartTime, shiftEndTime]);

  const actualRuntimeMinutes = useMemo(() => {
    return Math.max(0, shiftDurationMinutes - totalDowntimeMinutes);
  }, [shiftDurationMinutes, totalDowntimeMinutes]);

  // Calculate target quantity: (runtime minutes × 60) / cycle time seconds
  const calculatedTargetQuantity = useMemo(() => {
    return calculateTargetQuantity(actualRuntimeMinutes, selectedWO?.cycle_time_seconds || null);
  }, [actualRuntimeMinutes, selectedWO?.cycle_time_seconds]);

  // Effective target (override if set, otherwise calculated)
  const effectiveTarget = useMemo(() => {
    if (enableTargetOverride && targetOverride) {
      const override = parseInt(targetOverride, 10);
      if (!isNaN(override) && override > 0) return override;
    }
    return calculatedTargetQuantity;
  }, [enableTargetOverride, targetOverride, calculatedTargetQuantity]);

  // Calculate total rejection quantity
  const totalRejectionQuantity = useMemo(() => {
    return Object.values(rejectionBreakdown).reduce((sum, val) => sum + val, 0);
  }, [rejectionBreakdown]);

  // Calculate OK quantity: actual - total rejection
  const okQuantity = useMemo(() => {
    return Math.max(0, actualQuantity - totalRejectionQuantity);
  }, [actualQuantity, totalRejectionQuantity]);

  // Calculate efficiency: (actual / target) × 100
  const efficiencyPercentage = useMemo(() => {
    if (effectiveTarget <= 0) return 0;
    return Math.round((actualQuantity / effectiveTarget) * 100 * 100) / 100;
  }, [actualQuantity, effectiveTarget]);

  useEffect(() => {
    loadData();
  }, [filterDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const dateStr = format(filterDate, "yyyy-MM-dd");
      
      // Load logs for selected date
      const { data: logsData, error: logsError } = await supabase
        .from("daily_production_logs")
        .select(`
          id,
          log_date,
          plant,
          shift,
          setup_number,
          party_code,
          product_description,
          ordered_quantity,
          shift_start_time,
          shift_end_time,
          total_downtime_minutes,
          actual_runtime_minutes,
          target_quantity,
          actual_quantity,
          rework_quantity,
          efficiency_percentage,
          total_rejection_quantity,
          ok_quantity,
          machines:machine_id(name, machine_id),
          work_orders:wo_id(display_id),
          operator:operator_id(full_name),
          programmer:programmer_id(full_name)
        `)
        .eq("log_date", dateStr)
        .order("created_at", { ascending: false });

      if (logsError) throw logsError;
      setLogs((logsData as unknown as ProductionLog[]) || []);

      // Load machines
      const { data: machinesData } = await supabase
        .from("machines")
        .select("id, name, machine_id")
        .order("machine_id");
      setMachines(machinesData || []);

      // Load active work orders
      const { data: woData } = await supabase
        .from("work_orders")
        .select("id, display_id, customer, item_code, revision, material_size_mm, quantity, cycle_time_seconds")
        .in("status", ["pending", "in_progress", "qc", "packing"])
        .order("display_id", { ascending: false })
        .limit(100);
      setWorkOrders(woData || []);

      // Load operators
      const { data: operatorsData } = await supabase
        .from("people")
        .select("id, full_name, role")
        .eq("role", "operator")
        .eq("is_active", true)
        .order("full_name");
      setOperators(operatorsData || []);

      // Load programmers
      const { data: programmersData } = await supabase
        .from("people")
        .select("id, full_name, role")
        .eq("role", "programmer")
        .eq("is_active", true)
        .order("full_name");
      setProgrammers(programmersData || []);
    } catch (error: any) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWOChange = (woId: string) => {
    const wo = workOrders.find((w) => w.id === woId);
    setSelectedWO(wo || null);
    form.setValue("wo_id", woId);
    // Reset target override when WO changes
    setEnableTargetOverride(false);
    setTargetOverride("");
    setTargetOverrideReason("");
  };

  const addDowntimeEvent = () => {
    const duration = parseInt(newDowntimeDuration, 10);
    if (isNaN(duration) || duration <= 0) {
      toast({
        title: "Invalid Duration",
        description: "Please enter a valid duration in minutes",
        variant: "destructive",
      });
      return;
    }

    const newEvent: DowntimeEvent = {
      reason: newDowntimeReason,
      duration_minutes: duration,
      remark: newDowntimeRemark || undefined,
    };

    setDowntimeEvents([...downtimeEvents, newEvent]);
    setNewDowntimeDuration("");
    setNewDowntimeRemark("");
  };

  const removeDowntimeEvent = (index: number) => {
    setDowntimeEvents(downtimeEvents.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: FormData) => {
    // Validate target override if enabled
    if (enableTargetOverride && !targetOverrideReason.trim()) {
      toast({
        title: "Override Reason Required",
        description: "Please provide a reason for the target override",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      
      const insertData: any = {
        log_date: format(data.log_date, "yyyy-MM-dd"),
        plant: data.plant,
        shift: data.shift,
        machine_id: data.machine_id,
        setup_number: data.setup_number,
        shift_start_time: data.shift_start_time,
        shift_end_time: data.shift_end_time,
        downtime_events: downtimeEvents,
        total_downtime_minutes: totalDowntimeMinutes,
        actual_runtime_minutes: actualRuntimeMinutes,
        target_quantity: effectiveTarget,
        actual_quantity: data.actual_quantity,
        rework_quantity: data.rework_quantity,
        efficiency_percentage: efficiencyPercentage,
        // Rejection breakdown fields
        ...rejectionBreakdown,
        total_rejection_quantity: totalRejectionQuantity,
        ok_quantity: okQuantity,
        created_by: userData.user?.id,
      };

      // Add target override fields if applicable
      if (enableTargetOverride && targetOverride) {
        insertData.target_override = parseInt(targetOverride, 10);
        insertData.target_override_reason = targetOverrideReason;
        insertData.target_override_by = userData.user?.id;
      }

      // Add optional fields
      if (data.wo_id) {
        insertData.wo_id = data.wo_id;
      }
      if (data.operator_id) {
        insertData.operator_id = data.operator_id;
      }
      if (data.programmer_id) {
        insertData.programmer_id = data.programmer_id;
      }

      // Auto-populate from WO if selected
      if (selectedWO) {
        insertData.party_code = selectedWO.customer;
        insertData.product_description = selectedWO.item_code;
        insertData.drawing_number = selectedWO.revision;
        insertData.raw_material_grade = selectedWO.material_size_mm;
        insertData.ordered_quantity = selectedWO.quantity;
        insertData.cycle_time_seconds = selectedWO.cycle_time_seconds;
      }

      const { error } = await supabase
        .from("daily_production_logs")
        .insert(insertData);

      if (error) {
        if (error.code === "23505") {
          toast({
            title: "Duplicate Entry",
            description: "A log entry already exists for this machine, shift, and setup on this date.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        return;
      }

      toast({
        title: "Success",
        description: "Production log entry created",
      });

      resetForm();
      loadData();
    } catch (error: any) {
      console.error("Error creating log:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create log entry",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.machines?.name?.toLowerCase().includes(search) ||
      log.machines?.machine_id?.toLowerCase().includes(search) ||
      log.work_orders?.display_id?.toLowerCase().includes(search) ||
      log.party_code?.toLowerCase().includes(search) ||
      log.product_description?.toLowerCase().includes(search) ||
      log.setup_number?.toLowerCase().includes(search)
    );
  });

  const resetForm = () => {
    setDialogOpen(false);
    form.reset();
    setSelectedWO(null);
    setDowntimeEvents([]);
    setNewDowntimeDuration("");
    setNewDowntimeRemark("");
    setEnableTargetOverride(false);
    setTargetOverride("");
    setTargetOverrideReason("");
    setRejectionBreakdown({
      rejection_dent: 0,
      rejection_scratch: 0,
      rejection_forging_mark: 0,
      rejection_lining: 0,
      rejection_dimension: 0,
      rejection_tool_mark: 0,
      rejection_setting: 0,
      rejection_previous_setup_fault: 0,
      rejection_face_not_ok: 0,
      rejection_material_not_ok: 0,
    });
  };

  const getEfficiencyColor = (efficiency: number | null) => {
    if (!efficiency) return "bg-muted text-muted-foreground";
    if (efficiency >= 100) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    if (efficiency >= 80) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    if (efficiency >= 60) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
    return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  };

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Daily Production Log"
        description="Record daily machine setups, shifts, and production assignments"
      />

      {/* Filters and Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
              {/* Date Picker */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[200px] justify-start text-left font-normal",
                      !filterDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterDate ? format(filterDate, "PPP") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDate}
                    onSelect={(date) => date && setFilterDate(date)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>

              {/* Search */}
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search logs..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Add New Button */}
            <Dialog open={dialogOpen} onOpenChange={(open) => {
              if (!open) resetForm();
              else setDialogOpen(true);
            }}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  New Log Entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New Daily Production Log</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    {/* Basic Fields */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Date */}
                      <FormField
                        control={form.control}
                        name="log_date"
                        render={({ field }) => (
                          <FormItem className="flex flex-col">
                            <FormLabel>Date</FormLabel>
                            <Popover>
                              <PopoverTrigger asChild>
                                <FormControl>
                                  <Button
                                    variant="outline"
                                    className={cn(
                                      "w-full pl-3 text-left font-normal",
                                      !field.value && "text-muted-foreground"
                                    )}
                                  >
                                    {field.value ? format(field.value, "PPP") : "Pick a date"}
                                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                  </Button>
                                </FormControl>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar
                                  mode="single"
                                  selected={field.value}
                                  onSelect={field.onChange}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Plant */}
                      <FormField
                        control={form.control}
                        name="plant"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plant</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select plant" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Main">Main</SelectItem>
                                <SelectItem value="Pragati">Pragati</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Shift */}
                      <FormField
                        control={form.control}
                        name="shift"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Shift</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select shift" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Day">Day</SelectItem>
                                <SelectItem value="Night">Night</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Machine */}
                      <FormField
                        control={form.control}
                        name="machine_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Machine</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select machine" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {machines.map((machine) => (
                                  <SelectItem key={machine.id} value={machine.id}>
                                    {machine.machine_id} - {machine.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Setup Number */}
                      <FormField
                        control={form.control}
                        name="setup_number"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Setup Number</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., S1, S2" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Work Order */}
                      <FormField
                        control={form.control}
                        name="wo_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Work Order (Optional)</FormLabel>
                            <Select onValueChange={handleWOChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select work order" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {workOrders.map((wo) => (
                                  <SelectItem key={wo.id} value={wo.id}>
                                    {wo.display_id} - {wo.item_code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Operator */}
                      <FormField
                        control={form.control}
                        name="operator_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Operator</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select operator" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {operators.map((op) => (
                                  <SelectItem key={op.id} value={op.id}>
                                    {op.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Programmer */}
                      <FormField
                        control={form.control}
                        name="programmer_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Setter / Programmer</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select programmer" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="">None</SelectItem>
                                {programmers.map((prog) => (
                                  <SelectItem key={prog.id} value={prog.id}>
                                    {prog.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Time Tracking Section */}
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Clock className="h-4 w-4" />
                        Shift Time Tracking
                      </h3>
                      
                      {/* Formula explanation banner */}
                      <div className="p-3 bg-muted/50 rounded-lg border border-dashed">
                        <p className="text-xs font-mono text-muted-foreground">
                          <span className="font-semibold text-foreground">Gross Time</span> = End - Start | 
                          <span className="font-semibold text-foreground ml-2">Actual Runtime</span> = Gross - Downtime | 
                          <span className="font-semibold text-foreground ml-2">Target Qty</span> = (Runtime × 60) ÷ Cycle Time
                        </p>
                      </div>
                      
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {/* Shift Start Time */}
                        <FormField
                          control={form.control}
                          name="shift_start_time"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shift Start</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Shift End Time */}
                        <FormField
                          control={form.control}
                          name="shift_end_time"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Shift End</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Calculated Gross Time (Shift Duration) */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Gross Time</label>
                          <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center text-sm font-medium">
                            {formatMinutes(shiftDurationMinutes)}
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            = {shiftEndTime} - {shiftStartTime}
                          </p>
                        </div>

                        {/* Actual Runtime (Auto-calculated) */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-green-600">Actual Runtime</label>
                          <div className="h-10 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md flex items-center text-sm font-semibold text-green-700 dark:text-green-400">
                            {formatMinutes(actualRuntimeMinutes)}
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            = {formatMinutes(shiftDurationMinutes)} - {formatMinutes(totalDowntimeMinutes)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Downtime Events Section */}
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          Downtime Events
                        </h3>
                        {totalDowntimeMinutes > 0 && (
                          <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                            Total: {formatMinutes(totalDowntimeMinutes)}
                          </Badge>
                        )}
                      </div>

                      {/* Add Downtime Event */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 p-4 bg-muted/50 rounded-lg">
                        <div className="sm:col-span-1">
                          <label className="text-xs font-medium text-muted-foreground">Reason</label>
                          <Select value={newDowntimeReason} onValueChange={(v) => setNewDowntimeReason(v as DowntimeReason)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOWNTIME_REASONS.map((reason) => (
                                <SelectItem key={reason} value={reason}>
                                  {reason}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Duration (min)</label>
                          <Input
                            type="number"
                            placeholder="Minutes"
                            value={newDowntimeDuration}
                            onChange={(e) => setNewDowntimeDuration(e.target.value)}
                            className="mt-1"
                            min="1"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Remark (optional)</label>
                          <Input
                            placeholder="Optional note"
                            value={newDowntimeRemark}
                            onChange={(e) => setNewDowntimeRemark(e.target.value)}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex items-end">
                          <Button type="button" onClick={addDowntimeEvent} size="sm" className="w-full">
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>

                      {/* Downtime Events List */}
                      {downtimeEvents.length > 0 && (
                        <div className="space-y-2">
                          {downtimeEvents.map((event, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-3 bg-card border rounded-lg"
                            >
                              <div className="flex items-center gap-4">
                                <Badge variant="outline">{event.reason}</Badge>
                                <span className="text-sm font-medium">{event.duration_minutes} min</span>
                                {event.remark && (
                                  <span className="text-sm text-muted-foreground">— {event.remark}</span>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeDowntimeEvent(index)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      {downtimeEvents.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-4">
                          No downtime events added. Add events above if there was any downtime during the shift.
                        </p>
                      )}
                    </div>

                    {/* Production Quantity Section */}
                    <Separator />
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Production Quantity & Efficiency
                      </h3>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {/* Calculated Target */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Calculated Target</label>
                          <div className="h-10 px-3 py-2 bg-muted rounded-md flex items-center text-sm font-medium">
                            {calculatedTargetQuantity > 0 ? calculatedTargetQuantity.toLocaleString() : "-"}
                          </div>
                          <p className="text-[10px] font-mono text-muted-foreground">
                            {selectedWO?.cycle_time_seconds ? (
                              <>= ({actualRuntimeMinutes} × 60) ÷ {selectedWO.cycle_time_seconds}s</>
                            ) : (
                              <>Select WO with cycle time</>
                            )}
                          </p>
                        </div>

                        {/* Effective Target (with override) */}
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-primary">Effective Target</label>
                          <div className="h-10 px-3 py-2 bg-primary/10 border border-primary/20 rounded-md flex items-center text-sm font-semibold text-primary">
                            {effectiveTarget > 0 ? effectiveTarget.toLocaleString() : "-"}
                          </div>
                        </div>

                        {/* Actual Quantity */}
                        <FormField
                          control={form.control}
                          name="actual_quantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Actual Production</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Rework Quantity */}
                        <FormField
                          control={form.control}
                          name="rework_quantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Rework Quantity</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Efficiency Display */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div className="sm:col-span-2 space-y-2">
                          <label className="text-sm font-medium flex items-center gap-2">
                            <TrendingUp className="h-4 w-4" />
                            Efficiency (Read-only)
                          </label>
                          <div className={cn(
                            "h-12 px-4 py-2 rounded-md flex items-center text-lg font-bold",
                            getEfficiencyColor(efficiencyPercentage)
                          )}>
                            {effectiveTarget > 0 ? `${efficiencyPercentage}%` : "-"}
                          </div>
                        </div>

                        {/* Target Override (Admin Only) */}
                        {isAdmin ? (
                          <div className="sm:col-span-2 space-y-3 p-3 border border-dashed border-amber-500/50 bg-amber-50/30 dark:bg-amber-900/10 rounded-lg">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="target-override"
                                checked={enableTargetOverride}
                                onCheckedChange={(checked) => setEnableTargetOverride(checked as boolean)}
                              />
                              <label htmlFor="target-override" className="text-sm font-medium cursor-pointer">
                                Override Target (Admin Only)
                              </label>
                            </div>
                            
                            {enableTargetOverride && (
                              <div className="space-y-2">
                                <Input
                                  type="number"
                                  placeholder="Override target quantity"
                                  value={targetOverride}
                                  onChange={(e) => setTargetOverride(e.target.value)}
                                  min="1"
                                />
                                <Textarea
                                  placeholder="Reason for override (required)"
                                  value={targetOverrideReason}
                                  onChange={(e) => setTargetOverrideReason(e.target.value)}
                                  rows={2}
                                  className="resize-none"
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="sm:col-span-2 p-3 border border-dashed rounded-lg bg-muted/30">
                            <p className="text-xs text-muted-foreground text-center">
                              Target override requires Admin role
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Rejection Breakdown Section */}
                    <Separator />
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold flex items-center gap-2">
                          <XCircle className="h-4 w-4 text-red-500" />
                          Rejection Breakdown
                        </h3>
                        <div className="flex gap-3">
                          {totalRejectionQuantity > 0 && (
                            <Badge variant="destructive">
                              Total Rejected: {totalRejectionQuantity.toLocaleString()}
                            </Badge>
                          )}
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            OK Qty: {okQuantity.toLocaleString()}
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {REJECTION_REASONS.map((reason) => (
                          <div key={reason.key} className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground">
                              {reason.label}
                            </label>
                            <Input
                              type="number"
                              min="0"
                              value={rejectionBreakdown[reason.key] || 0}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10) || 0;
                                setRejectionBreakdown((prev) => ({
                                  ...prev,
                                  [reason.key]: Math.max(0, value),
                                }));
                              }}
                              className="h-9"
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Auto-populated WO Details */}
                    {selectedWO && (
                      <>
                        <Separator />
                        <Card className="bg-muted/50">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm">Work Order Details (Auto-populated)</CardTitle>
                          </CardHeader>
                          <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Party Code:</span>
                              <p className="font-medium">{selectedWO.customer || "-"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Product:</span>
                              <p className="font-medium">{selectedWO.item_code || "-"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Drawing No:</span>
                              <p className="font-medium">{selectedWO.revision || "-"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Material Grade:</span>
                              <p className="font-medium">{selectedWO.material_size_mm || "-"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Ordered Qty:</span>
                              <p className="font-medium">{selectedWO.quantity?.toLocaleString() || "-"}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Cycle Time:</span>
                              <p className="font-medium">{selectedWO.cycle_time_seconds ? `${selectedWO.cycle_time_seconds}s` : "-"}</p>
                            </div>
                          </CardContent>
                        </Card>
                      </>
                    )}

                    <div className="flex justify-end gap-2 pt-4">
                      <Button type="button" variant="outline" onClick={resetForm}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={submitting}>
                        {submitting ? "Creating..." : "Create Log Entry"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Production Logs for {format(filterDate, "PPP")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No production logs found for this date.</p>
              <p className="text-sm">Click "New Log Entry" to create one.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plant</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Machine</TableHead>
                    <TableHead>Work Order</TableHead>
                    <TableHead>Runtime</TableHead>
                    <TableHead className="text-right">Target</TableHead>
                    <TableHead className="text-right">Actual</TableHead>
                    <TableHead className="text-right">Rejected</TableHead>
                    <TableHead className="text-right">OK Qty</TableHead>
                    <TableHead className="text-right">Efficiency</TableHead>
                    <TableHead>Operator</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.plant}</TableCell>
                      <TableCell>{log.shift}</TableCell>
                      <TableCell>
                        <span className="font-mono text-xs">
                          {log.machines?.machine_id}
                        </span>
                        <br />
                        <span className="text-muted-foreground text-xs">
                          {log.machines?.name}
                        </span>
                      </TableCell>
                      <TableCell>
                        {log.work_orders?.display_id || "-"}
                      </TableCell>
                      <TableCell>
                        {log.actual_runtime_minutes ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            {formatMinutes(log.actual_runtime_minutes)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {log.target_quantity?.toLocaleString() || "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {log.actual_quantity?.toLocaleString() || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.total_rejection_quantity ? (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            {log.total_rejection_quantity.toLocaleString()}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.ok_quantity != null ? (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            {log.ok_quantity.toLocaleString()}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {log.efficiency_percentage != null ? (
                          <Badge className={getEfficiencyColor(log.efficiency_percentage)}>
                            {log.efficiency_percentage}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{log.operator?.full_name || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}