import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import { Loader2, Lock, FileText, Wrench, Calculator, Info, Unlock, CalendarIcon, Clock, X } from "lucide-react";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";
import { formatCount, formatPercent } from "@/lib/displayUtils";
import { cn } from "@/lib/utils";
import { NCRThresholdPrompt, RejectionExceedance } from "@/components/ncr/NCRThresholdPrompt";
import { NCRFormDialog } from "@/components/ncr/NCRFormDialog";

// Downtime reasons
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
  "Lunch Break",
  "Operator Shifted to Other Work",
  "Other",
] as const;

type DowntimeReason = typeof DOWNTIME_REASONS[number];

// Rejection types
const REJECTION_TYPES = [
  { key: 'rejection_dent', label: 'Dent' },
  { key: 'rejection_scratch', label: 'Scratch Mark' },
  { key: 'rejection_forging_mark', label: 'Forging Mark' },
  { key: 'rejection_lining', label: 'Lining' },
  { key: 'rejection_dimension', label: 'Dimension' },
  { key: 'rejection_tool_mark', label: 'Tool Mark' },
  { key: 'rejection_setting', label: 'Setting' },
  { key: 'rejection_previous_setup_fault', label: 'Previous Setup Fault' },
  { key: 'rejection_face_not_ok', label: 'Face Not OK' },
  { key: 'rejection_material_not_ok', label: 'Material Not OK' },
  { key: 'rejection_previous_setup_wo_operation', label: 'Previous Setup Fault Without Operation' },
] as const;

type RejectionKey = typeof REJECTION_TYPES[number]['key'];

interface RejectionValues {
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
  rejection_previous_setup_wo_operation: number;
}

const defaultRejectionValues: RejectionValues = {
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
  rejection_previous_setup_wo_operation: 0,
};

interface DowntimeEntry {
  reason: DowntimeReason;
  minutes: number;
}

const productionLogSchema = z.object({
  log_date: z.date({ required_error: "Date is required" }),
  shift: z.enum(['day', 'night'], { required_error: "Shift is required" }),
  supervisor_id: z.string().uuid("Please select a supervisor").optional(),
  setter_id: z.string().uuid("Please select a setter").optional(),
  operator_company: z.enum(['RVI', 'CONTRACTOR'], { required_error: "Please select company" }),
  machine_start_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
  machine_end_time: z.string().regex(/^\d{2}:\d{2}$/, "Invalid time format (HH:MM)"),
  actual_production_qty: z.coerce.number().min(0, "Must be 0 or greater"),
  qc_supervisor_id: z.string().uuid("Please select QC supervisor").optional(),
  remarks: z.string().max(500, "Remarks must be less than 500 characters").optional(),
  route_step_id: z.string().uuid("Please select an operation").optional(),
  operation_code: z.string().optional(),
});

type ProductionLogFormData = z.infer<typeof productionLogSchema>;

// Operator with minutes share for multi-operator support
interface OperatorEntry {
  operator_id: string;
  operator_name: string;
  minutes_share: number; // percentage 0-100
}

interface Person {
  id: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

interface Machine {
  id: string;
  machine_id: string;
  name: string;
}

interface ProductionLogFormProps {
  workOrder?: any;
  disabled?: boolean;
}

// Locked read-only field component
function LockedField({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        <Lock className="h-3 w-3" />
        {label}
      </Label>
      <div className="h-9 px-3 py-2 rounded-md bg-muted border border-input text-sm font-medium flex items-center">
        {value ?? "—"}
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Overridable field component
function OverridableField({ 
  label, 
  autoValue, 
  overrideValue, 
  onOverrideChange,
  isOverriding,
  onToggleOverride,
  type = "text",
  placeholder,
  hint
}: { 
  label: string; 
  autoValue: string | number | null;
  overrideValue: string;
  onOverrideChange: (value: string) => void;
  isOverriding: boolean;
  onToggleOverride: (checked: boolean) => void;
  type?: "text" | "number";
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground flex items-center gap-1">
          {isOverriding ? <Unlock className="h-3 w-3 text-amber-500" /> : <Lock className="h-3 w-3" />}
          {label}
        </Label>
        <div className="flex items-center gap-1">
          <Checkbox 
            id={`override-${label}`}
            checked={isOverriding}
            onCheckedChange={onToggleOverride}
            className="h-3 w-3"
          />
          <Label htmlFor={`override-${label}`} className="text-xs text-muted-foreground cursor-pointer">
            Override
          </Label>
        </div>
      </div>
      {isOverriding ? (
        <Input
          type={type}
          value={overrideValue}
          onChange={(e) => onOverrideChange(e.target.value)}
          placeholder={placeholder || `Override ${label.toLowerCase()}`}
          className="border-amber-500/50 bg-amber-500/5"
        />
      ) : (
        <div className="h-9 px-3 py-2 rounded-md bg-muted border border-input text-sm font-medium flex items-center">
          {autoValue ?? "—"}
        </div>
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// Calculated field component
function CalculatedField({ label, value, formula }: { label: string; value: string | number; formula: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        <Calculator className="h-3 w-3" />
        {label}
      </Label>
      <div className="h-9 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-sm font-bold flex items-center text-primary">
        {value}
      </div>
      <p className="text-xs text-muted-foreground italic">{formula}</p>
    </div>
  );
}

// Helper to parse time string to minutes
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// Helper to calculate duration in minutes
function calculateDuration(startTime: string, endTime: string): number {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (endMinutes < startMinutes) {
    return (24 * 60 - startMinutes) + endMinutes;
  }
  return endMinutes - startMinutes;
}

export function ProductionLogForm({ workOrder: propWorkOrder, disabled = false }: ProductionLogFormProps = {}) {
  const [loading, setLoading] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  
  // Route steps for operation selection
  const [routeSteps, setRouteSteps] = useState<Array<{ id: string; sequence_number: number; operation_type: string; process_name: string | null }>>([]);
  const [selectedRouteStepId, setSelectedRouteStepId] = useState<string>("");
  
  // Downtime entries state
  const [downtimeEntries, setDowntimeEntries] = useState<DowntimeEntry[]>([]);
  const [selectedDowntimeReason, setSelectedDowntimeReason] = useState<DowntimeReason | "">("");
  const [downtimeMinutesInput, setDowntimeMinutesInput] = useState("");
  
  // Rejection quantities state
  const [rejectionValues, setRejectionValues] = useState<RejectionValues>({ ...defaultRejectionValues });
  
  // Override states
  const [overrideCycleTime, setOverrideCycleTime] = useState(false);
  const [cycleTimeOverrideValue, setCycleTimeOverrideValue] = useState("");
  const [overrideMachine, setOverrideMachine] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [overrideSetup, setOverrideSetup] = useState(false);
  const [setupOverrideValue, setSetupOverrideValue] = useState("");
  
  // Auto-populated machine from assignment
  const [autoMachine, setAutoMachine] = useState<Machine | null>(null);
  
  // NCR prompt states
  const [showNCRPrompt, setShowNCRPrompt] = useState(false);
  const [showNCRDialog, setShowNCRDialog] = useState(false);
  const [ncrExceedances, setNcrExceedances] = useState<RejectionExceedance[]>([]);
  const [pendingLogId, setPendingLogId] = useState<string | null>(null);
  const [ncrPrefillData, setNcrPrefillData] = useState<any>(null);
  
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<ProductionLogFormData>({
    resolver: zodResolver(productionLogSchema),
    defaultValues: {
      log_date: new Date(),
      shift: 'day',
      operator_company: 'RVI',
      machine_start_time: "08:30",
      machine_end_time: "20:00",
      actual_production_qty: 0,
    }
  });

  const logDate = watch("log_date");
  const startTime = watch("machine_start_time") || "08:30";
  const endTime = watch("machine_end_time") || "20:00";
  const actualQty = watch("actual_production_qty") || 0;
  
  // Total downtime from entries
  const totalDowntimeMinutes = useMemo(() => {
    return downtimeEntries.reduce((sum, entry) => sum + entry.minutes, 0);
  }, [downtimeEntries]);

  // Add downtime entry
  const addDowntimeEntry = () => {
    if (!selectedDowntimeReason) {
      toast.error("Please select a downtime reason");
      return;
    }
    const minutes = parseInt(downtimeMinutesInput, 10);
    if (isNaN(minutes) || minutes <= 0) {
      toast.error("Please enter valid minutes (> 0)");
      return;
    }
    
    // Check if reason already exists
    const existingIndex = downtimeEntries.findIndex(e => e.reason === selectedDowntimeReason);
    if (existingIndex >= 0) {
      // Update existing entry
      setDowntimeEntries(prev => prev.map((e, i) => 
        i === existingIndex ? { ...e, minutes: e.minutes + minutes } : e
      ));
    } else {
      setDowntimeEntries(prev => [...prev, { reason: selectedDowntimeReason, minutes }]);
    }
    
    setSelectedDowntimeReason("");
    setDowntimeMinutesInput("");
  };

  // Remove downtime entry
  const removeDowntimeEntry = (index: number) => {
    setDowntimeEntries(prev => prev.filter((_, i) => i !== index));
  };

  // ==========================================
  // LAYER 1: AUTO-PULLED & LOCKED VALUES
  // ==========================================
  const workOrderNo = propWorkOrder?.display_id || "—";
  const partyCode = propWorkOrder?.customer || "—";
  const productDescription = propWorkOrder?.item_code || "—";
  const drawingNumber = propWorkOrder?.revision || "—";
  const rawMaterialGrade = propWorkOrder?.material_size_mm || "—";
  const orderedQuantity = propWorkOrder?.quantity || 0;
  const baseCycleTime = propWorkOrder?.cycle_time_seconds || 0;
  
  // Effective cycle time
  const effectiveCycleTime = useMemo(() => {
    if (overrideCycleTime && cycleTimeOverrideValue) {
      const parsed = parseFloat(cycleTimeOverrideValue);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
    return baseCycleTime;
  }, [overrideCycleTime, cycleTimeOverrideValue, baseCycleTime]);

  // Effective setup number
  const effectiveSetupNo = useMemo(() => {
    if (overrideSetup && setupOverrideValue) {
      return setupOverrideValue;
    }
    return propWorkOrder?.display_id ? `${propWorkOrder.display_id}-S1` : "";
  }, [overrideSetup, setupOverrideValue, propWorkOrder?.display_id]);

  // ==========================================
  // LAYER 3: SYSTEM-CALCULATED OUTPUTS
  // ==========================================
  
  // Gross runtime from times (before deducting downtime)
  const grossRuntimeMinutes = useMemo(() => {
    return calculateDuration(startTime, endTime);
  }, [startTime, endTime]);

  // Actual runtime = gross - downtime
  const actualRuntimeMinutes = useMemo(() => {
    return Math.max(0, grossRuntimeMinutes - totalDowntimeMinutes);
  }, [grossRuntimeMinutes, totalDowntimeMinutes]);

  // Target Qty per Hour
  const targetQtyPerHour = useMemo(() => {
    if (!effectiveCycleTime || effectiveCycleTime <= 0) return 0;
    return Math.floor(3600 / effectiveCycleTime);
  }, [effectiveCycleTime]);

  // Target quantity for actual runtime (after downtime deducted)
  const targetQuantity = useMemo(() => {
    if (!actualRuntimeMinutes || !effectiveCycleTime || effectiveCycleTime <= 0) return 0;
    return Math.floor((actualRuntimeMinutes * 60) / effectiveCycleTime);
  }, [actualRuntimeMinutes, effectiveCycleTime]);

  // Efficiency
  const efficiency = useMemo(() => {
    if (targetQuantity <= 0) return 0;
    return Math.round((actualQty / targetQuantity) * 100);
  }, [actualQty, targetQuantity]);

  // Uptime percentage
  const uptimePercent = useMemo(() => {
    if (grossRuntimeMinutes <= 0) return 100;
    return Math.round((actualRuntimeMinutes / grossRuntimeMinutes) * 100);
  }, [actualRuntimeMinutes, grossRuntimeMinutes]);

  // Total rejection quantity (sum of all rejection fields)
  const totalRejectionQty = useMemo(() => {
    return Object.values(rejectionValues).reduce((sum, val) => sum + (val || 0), 0);
  }, [rejectionValues]);

  // OK Pcs (actual production - total rejections)
  const okPcs = useMemo(() => {
    return Math.max(0, actualQty - totalRejectionQty);
  }, [actualQty, totalRejectionQty]);

  // Handle rejection value change
  const handleRejectionChange = (key: RejectionKey, value: string) => {
    const numValue = parseInt(value, 10) || 0;
    setRejectionValues(prev => ({
      ...prev,
      [key]: Math.max(0, numValue)
    }));
  };

  // NCR threshold check - returns exceedances above threshold
  const checkRejectionThresholds = useMemo(() => {
    const threshold = 3; // Default threshold - can be made configurable
    const pctThreshold = 0.02; // 2% of production
    const dynamicThreshold = actualQty > 0 ? Math.max(threshold, Math.ceil(actualQty * pctThreshold)) : threshold;
    
    const exceedances: RejectionExceedance[] = [];
    
    REJECTION_TYPES.forEach(({ key, label }) => {
      const count = rejectionValues[key as RejectionKey] || 0;
      if (count >= dynamicThreshold) {
        exceedances.push({
          key,
          label,
          count,
          threshold: dynamicThreshold,
        });
      }
    });
    
    return exceedances;
  }, [rejectionValues, actualQty]);

  // Filter people by role
  const supervisors = useMemo(() => 
    people.filter(p => p.role === 'supervisor' && p.is_active), [people]);
  const setters = useMemo(() => 
    people.filter(p => p.role === 'setter' && p.is_active), [people]);
  const operators = useMemo(() => 
    people.filter(p => p.role === 'operator' && p.is_active), [people]);
  const qcSupervisors = useMemo(() => 
    people.filter(p => (p.role === 'qc_supervisor' || p.role === 'quality') && p.is_active), [people]);

  useEffect(() => {
    loadPeople();
    loadMachines();
    loadRouteSteps();
  }, [propWorkOrder]);

  const loadPeople = async () => {
    try {
      const { data, error } = await supabase
        .from("people")
        .select("id, full_name, role, is_active")
        .eq("is_active", true)
        .order("full_name");
      
      if (error) throw error;
      setPeople(data || []);
    } catch (error) {
      console.error("Error loading people:", error);
    }
  };

  const loadMachines = async () => {
    try {
      if (propWorkOrder?.id) {
        const { data: assignments, error } = await supabase
          .from("wo_machine_assignments")
          .select("machine_id, machines(id, machine_id, name)")
          .eq("wo_id", propWorkOrder.id)
          .in("status", ["scheduled", "running"]);

        if (error) throw error;

        const assignedMachines = assignments
          ?.map(a => a.machines)
          .filter(Boolean) || [];
        
        setMachines(assignedMachines as Machine[]);
        
        if (assignedMachines.length > 0) {
          const first = assignedMachines[0] as Machine;
          setAutoMachine(first);
          setSelectedMachineId(first.id);
        }
      } else {
        const { data, error } = await supabase
          .from("machines")
          .select("id, machine_id, name")
          .order("machine_id");

        if (error) throw error;
        setMachines(data || []);
      }
    } catch (error) {
      console.error("Error loading machines:", error);
    }
  };

  const loadRouteSteps = async () => {
    if (!propWorkOrder?.id) return;
    
    try {
      const { data, error } = await supabase
        .from("operation_routes")
        .select("id, sequence_number, operation_type, process_name")
        .eq("work_order_id", propWorkOrder.id)
        .order("sequence_number");
      
      if (error) throw error;
      setRouteSteps(data || []);
      
      // Auto-select the first CNC operation or first route step
      if (data && data.length > 0) {
        const cncStep = data.find((r: any) => r.operation_type === 'CNC');
        setSelectedRouteStepId(cncStep?.id || data[0].id);
      }
    } catch (error) {
      console.error("Error loading route steps:", error);
    }
  };

  const handleOperatorToggle = (operatorId: string, checked: boolean) => {
    if (checked) {
      setSelectedOperators(prev => [...prev, operatorId]);
    } else {
      setSelectedOperators(prev => prev.filter(id => id !== operatorId));
    }
  };

  const onSubmit = async (data: ProductionLogFormData) => {
    if (propWorkOrder && propWorkOrder.production_release_status !== 'RELEASED') {
      toast.error("Cannot log production until work order is released.");
      return;
    }
    
    if (propWorkOrder && (!propWorkOrder.qc_material_passed || !propWorkOrder.qc_first_piece_passed)) {
      toast.error("Cannot log production until QC gates are cleared.");
      return;
    }

    // Validate at least one operator is selected
    if (selectedOperators.length === 0) {
      toast.error("At least one operator is required.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (propWorkOrder && !propWorkOrder.production_start) {
        await supabase
          .from("work_orders")
          .update({ 
            production_start: new Date().toISOString(),
            current_stage: 'mass_production'
          })
          .eq("id", propWorkOrder.id);
      }

      const effectiveMachineId = overrideMachine ? selectedMachineId : (autoMachine?.id || selectedMachineId);
      
      if (!effectiveMachineId) {
        toast.error("Please select a machine before submitting.");
        setLoading(false);
        return;
      }
      
      // Build operators JSONB array with equal split
      const minutesPerOperator = selectedOperators.length > 0 
        ? Math.round(100 / selectedOperators.length * 100) / 100 
        : 100;
      
      const operatorsData: OperatorEntry[] = selectedOperators.map(opId => {
        const op = operators.find(o => o.id === opId);
        return {
          operator_id: opId,
          operator_name: op?.full_name || 'Unknown',
          minutes_share: minutesPerOperator,
        };
      });
      
      // Derive operation code from selected route step
      const selectedStep = routeSteps.find(r => r.id === selectedRouteStepId);
      const operationCode = selectedStep 
        ? `${selectedStep.operation_type}${selectedStep.sequence_number}` 
        : 'A';
      
      const logDateStr = format(data.log_date, "yyyy-MM-dd");
      
      const insertData = {
        wo_id: propWorkOrder?.id || null,
        machine_id: effectiveMachineId,
        log_date: logDateStr,
        shift: String(data.shift),
        plant: 'MAIN',
        setup_number: effectiveSetupNo || 'SETUP-001',
        shift_start_time: data.machine_start_time,
        shift_end_time: data.machine_end_time,
        actual_runtime_minutes: actualRuntimeMinutes,
        total_downtime_minutes: totalDowntimeMinutes,
        downtime_events: JSON.parse(JSON.stringify(downtimeEntries)) as Json,
        target_quantity: targetQuantity,
        actual_quantity: data.actual_production_qty,
        ok_quantity: okPcs,
        efficiency_percentage: efficiency,
        operator_id: selectedOperators.length > 0 ? selectedOperators[0] : null,
        operators: JSON.parse(JSON.stringify(operatorsData)) as Json, // Store all operators
        party_code: partyCode !== "—" ? partyCode : null,
        product_description: productDescription !== "—" ? productDescription : null,
        drawing_number: drawingNumber !== "—" ? drawingNumber : null,
        raw_material_grade: rawMaterialGrade !== "—" ? rawMaterialGrade : null,
        ordered_quantity: orderedQuantity || null,
        cycle_time_seconds: effectiveCycleTime || null,
        remarks: data.remarks?.trim() || null,
        created_by: user?.id || null,
        rejection_dent: rejectionValues.rejection_dent || 0,
        rejection_scratch: rejectionValues.rejection_scratch || 0,
        rejection_forging_mark: rejectionValues.rejection_forging_mark || 0,
        rejection_lining: rejectionValues.rejection_lining || 0,
        rejection_dimension: rejectionValues.rejection_dimension || 0,
        rejection_tool_mark: rejectionValues.rejection_tool_mark || 0,
        rejection_setting: rejectionValues.rejection_setting || 0,
        rejection_previous_setup_fault: rejectionValues.rejection_previous_setup_fault || 0,
        rejection_face_not_ok: rejectionValues.rejection_face_not_ok || 0,
        rejection_material_not_ok: rejectionValues.rejection_material_not_ok || 0,
        total_rejection_quantity: totalRejectionQty,
        route_step_id: selectedRouteStepId || null,
        operation_code: operationCode,
      };
      
      const { data: insertedLog, error: logError } = await supabase
        .from("daily_production_logs")
        .insert([insertData])
        .select('id')
        .single();

      if (logError) throw logError;

      // Insert operator ledger entries for each operator
      if (insertedLog?.id && selectedOperators.length > 0) {
        const ledgerEntries = selectedOperators.map(opId => {
          const sharePercent = minutesPerOperator;
          const runtimeShare = Math.round(actualRuntimeMinutes * (sharePercent / 100));
          const targetShare = Math.round(targetQuantity * (sharePercent / 100));
          const actualShare = Math.round(data.actual_production_qty * (sharePercent / 100));
          const okShare = Math.round(okPcs * (sharePercent / 100));
          const rejectionShare = Math.round(totalRejectionQty * (sharePercent / 100));
          const efficiencyShare = targetShare > 0 ? Math.round((actualShare / targetShare) * 100) : 0;
          
          return {
            production_log_id: insertedLog.id,
            operator_id: opId,
            work_order_id: propWorkOrder?.id || null,
            machine_id: effectiveMachineId,
            log_date: logDateStr,
            runtime_minutes: runtimeShare,
            target_qty: targetShare,
            actual_qty: actualShare,
            ok_qty: okShare,
            rejection_qty: rejectionShare,
            efficiency_pct: efficiencyShare,
            minutes_share: sharePercent,
          };
        });
        
        const { error: ledgerError } = await supabase
          .from("operator_production_ledger")
          .insert(ledgerEntries);
        
        if (ledgerError) {
          console.error("Error inserting operator ledger:", ledgerError);
          // Don't fail the whole operation, just log it
        }
      }

      if (data.actual_production_qty > 0 && propWorkOrder?.id) {
        await createExecutionRecord({
          workOrderId: propWorkOrder.id,
          operationType: 'CNC',
          quantity: data.actual_production_qty,
          unit: 'pcs',
          direction: 'COMPLETE',
        });
      }

      // Check for rejection thresholds and prompt for NCR
      if (checkRejectionThresholds.length > 0 && insertedLog?.id) {
        setPendingLogId(insertedLog.id);
        setNcrExceedances(checkRejectionThresholds);
        setNcrPrefillData({
          workOrderId: propWorkOrder?.id,
          machineId: effectiveMachineId,
          productionLogId: insertedLog.id,
          raisedFrom: 'production',
        });
        setShowNCRPrompt(true);
      }

      toast.success("Production log submitted successfully");
      resetFormState();
    } catch (error: any) {
      toast.error(error.message || "Failed to submit production log");
    } finally {
      setLoading(false);
    }
  };

  const resetFormState = () => {
    reset();
    setSelectedOperators([]);
    setDowntimeEntries([]);
    setSelectedDowntimeReason("");
    setDowntimeMinutesInput("");
    setRejectionValues({ ...defaultRejectionValues });
    setOverrideCycleTime(false);
    setCycleTimeOverrideValue("");
    setOverrideMachine(false);
    setOverrideSetup(false);
    setSetupOverrideValue("");
    // Re-select first CNC step after reset
    const cncStep = routeSteps.find(r => r.operation_type === 'CNC');
    setSelectedRouteStepId(cncStep?.id || routeSteps[0]?.id || "");
  };

  const handleRaiseNCR = (selectedRejections: RejectionExceedance[]) => {
    const totalAffected = selectedRejections.reduce((sum, r) => sum + r.count, 0);
    const rejectionLabels = selectedRejections.map(r => r.label).join(', ');
    
    setNcrPrefillData((prev: any) => ({
      ...prev,
      issueDescription: `High rejection detected: ${rejectionLabels}. Total affected: ${totalAffected} pcs.`,
      rejectionType: selectedRejections.map(r => r.key).join(','),
      quantityAffected: totalAffected,
    }));
    setShowNCRDialog(true);
  };

  const handleNCRSuccess = () => {
    setShowNCRDialog(false);
    setPendingLogId(null);
    setNcrExceedances([]);
    setNcrPrefillData(null);
    toast.success("NCR created and linked to production log");
  };

  if (disabled) {
    // Determine specific reason for blocking
    const materialStatus = propWorkOrder?.qc_material_status || propWorkOrder?.qc_raw_material_status || 'pending';
    const firstPieceStatus = propWorkOrder?.qc_first_piece_status || 'pending';
    const isReleased = propWorkOrder?.production_release_status === 'RELEASED';
    
    const materialPending = materialStatus === 'pending' || materialStatus === 'failed';
    const firstPiecePending = firstPieceStatus === 'pending' || firstPieceStatus === 'failed';
    
    let blockReason = 'Production logging is blocked.';
    const reasons: string[] = [];
    
    if (!isReleased) {
      reasons.push('Work order must be released for production');
    }
    if (materialPending) {
      reasons.push(`Material QC is ${materialStatus}`);
    }
    if (firstPiecePending) {
      reasons.push(`First Piece QC is ${firstPieceStatus}`);
    }
    
    return (
      <Card className="border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-amber-600 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                {blockReason}
              </p>
              {reasons.length > 0 && (
                <ul className="text-xs text-amber-700 dark:text-amber-300 list-disc list-inside space-y-0.5">
                  {reasons.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Log Production
          <Badge variant="outline" className="text-xs font-normal">Auto-Populated</Badge>
        </CardTitle>
        <CardDescription>
          Fields are auto-populated from Work Order. Enter only the required manual inputs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* LAYER 1: AUTO-PULLED & LOCKED VALUES */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Auto-Pulled from Work Order
              <Badge variant="secondary" className="text-xs">Locked</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/30 border border-dashed">
              <LockedField label="Work Order No" value={workOrderNo} />
              <LockedField label="Party Code" value={partyCode} />
              <LockedField label="Product Description" value={productDescription} />
              <LockedField label="Drawing Number" value={drawingNumber} />
              <LockedField label="Raw Material Grade" value={rawMaterialGrade} />
              <LockedField label="Ordered Quantity" value={formatCount(orderedQuantity)} />
              
              <OverridableField
                label="Cycle Time (sec)"
                autoValue={baseCycleTime ? `${baseCycleTime}s` : null}
                overrideValue={cycleTimeOverrideValue}
                onOverrideChange={setCycleTimeOverrideValue}
                isOverriding={overrideCycleTime}
                onToggleOverride={setOverrideCycleTime}
                type="number"
                placeholder="e.g., 45"
                hint="From routing"
              />
              
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calculator className="h-3 w-3" />
                  Target Qty/Hour
                </Label>
                <div className="h-9 px-3 py-2 rounded-md bg-primary/5 border border-primary/20 text-sm font-bold flex items-center text-primary">
                  {formatCount(targetQtyPerHour)}
                </div>
                <p className="text-xs text-muted-foreground italic">3600 / cycle_time</p>
              </div>

              {/* Overridable Machine */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    {overrideMachine ? <Unlock className="h-3 w-3 text-amber-500" /> : <Lock className="h-3 w-3" />}
                    Machine No
                  </Label>
                  <div className="flex items-center gap-1">
                    <Checkbox 
                      checked={overrideMachine}
                      onCheckedChange={(c) => setOverrideMachine(!!c)}
                      className="h-3 w-3"
                    />
                    <Label className="text-xs text-muted-foreground cursor-pointer">Override</Label>
                  </div>
                </div>
                {overrideMachine ? (
                  <Select value={selectedMachineId} onValueChange={setSelectedMachineId}>
                    <SelectTrigger className="border-amber-500/50 bg-amber-500/5">
                      <SelectValue placeholder="Select machine" />
                    </SelectTrigger>
                    <SelectContent>
                      {machines.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.machine_id} - {m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="h-9 px-3 py-2 rounded-md bg-muted border border-input text-sm font-medium flex items-center">
                    {autoMachine ? `${autoMachine.machine_id} - ${autoMachine.name}` : "No assignment"}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">From WO assignment</p>
              </div>

              <OverridableField
                label="Setup No"
                autoValue={propWorkOrder?.display_id ? `${propWorkOrder.display_id}-S1` : null}
                overrideValue={setupOverrideValue}
                onOverrideChange={setSetupOverrideValue}
                isOverriding={overrideSetup}
                onToggleOverride={setOverrideSetup}
                type="text"
                placeholder="e.g., SETUP-001"
                hint="Auto-generated"
              />
              {/* Operation Selection */}
              {routeSteps.length > 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Wrench className="h-3 w-3" />
                    Operation Step
                  </Label>
                  <Select value={selectedRouteStepId} onValueChange={setSelectedRouteStepId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select operation" />
                    </SelectTrigger>
                    <SelectContent>
                      {routeSteps.map((step) => (
                        <SelectItem key={step.id} value={step.id}>
                          {step.sequence_number}. {step.operation_type}{step.process_name ? ` (${step.process_name})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Links log to route step for progress tracking</p>
                </div>
              )}
            </div>
          </div>

          <Separator />

          {/* LAYER 2: MANUAL INPUTS */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wrench className="h-4 w-4" />
              Manual Inputs
              <Badge variant="default" className="text-xs">Required</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Date */}
              <div className="space-y-2">
                <Label>Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !logDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {logDate ? format(logDate, "PPP") : "Pick a date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={logDate}
                      onSelect={(date) => date && setValue("log_date", date)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
                {errors.log_date && <p className="text-sm text-destructive">{errors.log_date.message}</p>}
              </div>

              {/* Shift */}
              <div className="space-y-2">
                <Label>Shift *</Label>
                <Select defaultValue="day" onValueChange={(v) => setValue("shift", v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day Shift</SelectItem>
                    <SelectItem value="night">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* From Which Company */}
              <div className="space-y-2">
                <Label>From Which Company *</Label>
                <Select defaultValue="RVI" onValueChange={(v) => setValue("operator_company", v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RVI">RVI</SelectItem>
                    <SelectItem value="CONTRACTOR">Contractor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Supervisor */}
              <div className="space-y-2">
                <Label>Supervisor</Label>
                <Select onValueChange={(v) => setValue("supervisor_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    {supervisors.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Setter */}
              <div className="space-y-2">
                <Label>Setter</Label>
                <Select onValueChange={(v) => setValue("setter_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select setter" />
                  </SelectTrigger>
                  <SelectContent>
                    {setters.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* QC Supervisor */}
              <div className="space-y-2">
                <Label>QC Supervisor Name</Label>
                <Select onValueChange={(v) => setValue("qc_supervisor_id", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select QC supervisor" />
                  </SelectTrigger>
                  <SelectContent>
                    {qcSupervisors.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Machine Start Time */}
              <div className="space-y-2">
                <Label>Machine Start Time *</Label>
                <Input type="time" {...register("machine_start_time")} />
                {errors.machine_start_time && <p className="text-sm text-destructive">{errors.machine_start_time.message}</p>}
              </div>

              {/* Machine End Time */}
              <div className="space-y-2">
                <Label>Machine End Time *</Label>
                <Input type="time" {...register("machine_end_time")} />
                {errors.machine_end_time && <p className="text-sm text-destructive">{errors.machine_end_time.message}</p>}
              </div>

              {/* Actual Production Qty */}
              <div className="space-y-2">
                <Label>Actual Production Qty *</Label>
                <Input type="number" min="0" {...register("actual_production_qty")} />
                {errors.actual_production_qty && <p className="text-sm text-destructive">{errors.actual_production_qty.message}</p>}
              </div>

              {/* Operator(s) Selection - REQUIRED */}
              <div className="space-y-2 md:col-span-3">
                <div className="flex items-center gap-2">
                  <Label>Operator(s) *</Label>
                  {selectedOperators.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {selectedOperators.length} selected
                    </Badge>
                  )}
                </div>
                <div className={cn(
                  "flex flex-wrap gap-2 p-3 rounded-md border bg-background min-h-[60px]",
                  selectedOperators.length === 0 && "border-destructive/50"
                )}>
                  {operators.length === 0 ? (
                    <div className="text-sm text-muted-foreground">
                      <span>No operators available. </span>
                      <span className="text-primary">Please add operators in Admin → People.</span>
                    </div>
                  ) : (
                    operators.map((op) => (
                      <label 
                        key={op.id}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-full border cursor-pointer transition-colors text-sm",
                          selectedOperators.includes(op.id) 
                            ? "bg-primary text-primary-foreground border-primary" 
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        <Checkbox 
                          checked={selectedOperators.includes(op.id)}
                          onCheckedChange={(c) => handleOperatorToggle(op.id, !!c)}
                          className="h-3 w-3"
                        />
                        {op.full_name}
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  At least one operator is required. Runtime will be split evenly among selected operators.
                </p>
              </div>

              {/* Structured Downtime Section */}
              <div className="space-y-3 md:col-span-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Label>Downtime Breakdown</Label>
                  {totalDowntimeMinutes > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Total: {totalDowntimeMinutes} min
                    </Badge>
                  )}
                </div>
                
                {/* Add downtime entry */}
                <div className="flex flex-wrap gap-2 items-end p-3 rounded-md border bg-muted/30">
                  <div className="flex-1 min-w-[200px] space-y-1">
                    <Label className="text-xs">Reason</Label>
                    <Select 
                      value={selectedDowntimeReason} 
                      onValueChange={(v) => setSelectedDowntimeReason(v as DowntimeReason)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {DOWNTIME_REASONS.map((reason) => (
                          <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Minutes</Label>
                    <Input
                      type="number"
                      min="1"
                      placeholder="0"
                      value={downtimeMinutesInput}
                      onChange={(e) => setDowntimeMinutesInput(e.target.value)}
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={addDowntimeEntry}>
                    Add
                  </Button>
                </div>

                {/* Display added entries */}
                {downtimeEntries.length > 0 && (
                  <div className="space-y-2">
                    {downtimeEntries.map((entry, index) => (
                      <div 
                        key={index}
                        className="flex items-center justify-between px-3 py-2 rounded-md bg-background border"
                      >
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">{entry.minutes} min</Badge>
                          <span className="text-sm">{entry.reason}</span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDowntimeEntry(index)}
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {downtimeEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground">No downtime recorded. Add entries above if applicable.</p>
                )}
              </div>

              {/* Rejection Quantities Section */}
              <div className="space-y-3 md:col-span-3">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">Rejections</Badge>
                  <Label>Rejection Breakdown</Label>
                  {totalRejectionQty > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      Total: {formatCount(totalRejectionQty)} pcs
                    </Badge>
                  )}
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                  {REJECTION_TYPES.map(({ key, label }) => (
                    <div key={key} className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{label}</Label>
                      <Input
                        type="number"
                        min="0"
                        value={rejectionValues[key] || ''}
                        onChange={(e) => handleRejectionChange(key, e.target.value)}
                        placeholder="0"
                        className="h-9"
                      />
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Enter rejection quantities for each type. Total Rejection and OK Pcs are calculated automatically.
                </p>
              </div>

              {/* Remarks */}
              <div className="space-y-2 md:col-span-3">
                <Label>Remarks</Label>
                <Textarea
                  placeholder="Any additional notes..."
                  rows={2}
                  {...register("remarks")}
                />
                {errors.remarks && <p className="text-sm text-destructive">{errors.remarks.message}</p>}
              </div>
            </div>
          </div>

          <Separator />

          {/* LAYER 3: SYSTEM-CALCULATED */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calculator className="h-4 w-4" />
              System Calculated
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">Auto</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <CalculatedField label="Gross Time" value={`${grossRuntimeMinutes} min`} formula="end - start time" />
              <CalculatedField label="Actual Runtime" value={`${actualRuntimeMinutes} min`} formula="gross - downtime" />
              <CalculatedField label="Total Downtime" value={`${totalDowntimeMinutes} min`} formula="sum of entries" />
              <CalculatedField label="Uptime" value={`${uptimePercent}%`} formula="(actual / gross) × 100" />
              <CalculatedField label="Target Qty" value={formatCount(targetQuantity)} formula="(runtime × 60) / cycle" />
              <CalculatedField label="Efficiency" value={`${formatPercent(efficiency)}%`} formula="(actual / target) × 100" />
              <CalculatedField label="Variance" value={formatCount(actualQty - targetQuantity)} formula="actual − target" />
              <CalculatedField label="Total Rejection" value={formatCount(totalRejectionQty)} formula="sum of all rejections" />
              <CalculatedField label="OK Pcs" value={formatCount(okPcs)} formula="actual − rejections" />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              These values are calculated automatically and cannot be edited.
            </p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Production Log
          </Button>
        </form>
      </CardContent>

      {/* NCR Threshold Prompt */}
      <NCRThresholdPrompt
        open={showNCRPrompt}
        onOpenChange={setShowNCRPrompt}
        exceedances={ncrExceedances}
        onRaiseNCR={handleRaiseNCR}
        onSkip={() => {
          setShowNCRPrompt(false);
          setPendingLogId(null);
          setNcrExceedances([]);
        }}
      />

      {/* NCR Form Dialog */}
      <NCRFormDialog
        open={showNCRDialog}
        onOpenChange={setShowNCRDialog}
        onSuccess={handleNCRSuccess}
        prefillData={ncrPrefillData}
      />
    </Card>
  );
}
