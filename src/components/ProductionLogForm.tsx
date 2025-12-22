import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
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
import { toast } from "sonner";
import { Loader2, Lock, FileText, Wrench, Calculator, Info } from "lucide-react";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";
import { formatCount, formatPercent } from "@/lib/displayUtils";

const productionLogSchema = z.object({
  machine_id: z.string().uuid("Please select a machine"),
  run_state: z.enum(['running', 'stopped', 'material_wait', 'maintenance', 'setup'], {
    required_error: "Please select run state"
  }),
  downtime_minutes: z.coerce.number().min(0).optional(),
  setup_no: z.string().optional(),
  operation_code: z.string().optional(),
  operator_type: z.enum(['RVI', 'CONTRACTOR'], { required_error: "Please select operator type" }),
  actual_runtime_minutes: z.coerce.number().min(0, "Must be 0 or greater"),
  quantity_completed: z.coerce.number().min(0, "Must be 0 or greater"),
  quantity_scrap: z.coerce.number().min(0, "Must be 0 or greater"),
  shift: z.string().optional(),
  remarks: z.string().optional(),
  actions_taken: z.string().optional(),
});

type ProductionLogFormData = z.infer<typeof productionLogSchema>;

interface Machine {
  id: string;
  machine_id: string;
  name: string;
  current_wo_id: string | null;
}

interface ProductionLogFormProps {
  workOrder?: any;
  disabled?: boolean;
}

// Read-only field component with lock icon
function ReadOnlyField({ label, value, hint }: { label: string; value: string | number | null; hint?: string }) {
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

export function ProductionLogForm({ workOrder: propWorkOrder, disabled = false }: ProductionLogFormProps = {}) {
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [runState, setRunState] = useState<string>("running");
  
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
      operator_type: 'RVI',
      run_state: 'running',
      actual_runtime_minutes: 0,
      quantity_completed: 0,
      quantity_scrap: 0,
      downtime_minutes: 0,
    }
  });

  const actualRuntime = watch("actual_runtime_minutes") || 0;
  const quantityCompleted = watch("quantity_completed") || 0;
  const quantityScrap = watch("quantity_scrap") || 0;
  const downtimeMinutes = watch("downtime_minutes") || 0;

  // ==========================================
  // LAYER 1: AUTO-PULLED READ-ONLY VALUES
  // ==========================================
  const cycleTimeSeconds = propWorkOrder?.cycle_time_seconds || 0;
  const orderQuantity = propWorkOrder?.quantity || 0;
  const itemCode = propWorkOrder?.item_code || "—";
  const customer = propWorkOrder?.customer || "—";
  const revision = propWorkOrder?.revision || "—";
  const materialSize = propWorkOrder?.material_size_mm || "—";
  const displayId = propWorkOrder?.display_id || "—";

  // ==========================================
  // LAYER 3: SYSTEM-CALCULATED OUTPUTS
  // ==========================================
  
  // Target quantity = (runtime_minutes × 60) / cycle_time_seconds
  const targetQuantity = useMemo(() => {
    if (!actualRuntime || !cycleTimeSeconds || cycleTimeSeconds <= 0) return 0;
    return Math.floor((actualRuntime * 60) / cycleTimeSeconds);
  }, [actualRuntime, cycleTimeSeconds]);

  // OK quantity = completed - scrap
  const okQuantity = useMemo(() => {
    return Math.max(0, quantityCompleted - quantityScrap);
  }, [quantityCompleted, quantityScrap]);

  // Efficiency = (actual / target) × 100
  const efficiency = useMemo(() => {
    if (targetQuantity <= 0) return 0;
    return Math.round((quantityCompleted / targetQuantity) * 100);
  }, [quantityCompleted, targetQuantity]);

  // Scrap rate = (scrap / completed) × 100
  const scrapRate = useMemo(() => {
    if (quantityCompleted <= 0) return 0;
    return Math.round((quantityScrap / quantityCompleted) * 100 * 10) / 10;
  }, [quantityScrap, quantityCompleted]);

  // Total time = runtime + downtime
  const totalTime = useMemo(() => {
    return actualRuntime + downtimeMinutes;
  }, [actualRuntime, downtimeMinutes]);

  // Uptime percentage
  const uptimePercent = useMemo(() => {
    if (totalTime <= 0) return 100;
    return Math.round((actualRuntime / totalTime) * 100);
  }, [actualRuntime, totalTime]);

  useEffect(() => {
    loadMachines();
  }, [propWorkOrder]);

  const loadMachines = async () => {
    try {
      if (propWorkOrder?.id) {
        const { data: assignments, error: assignError } = await supabase
          .from("wo_machine_assignments")
          .select("machine_id, machines(id, machine_id, name, current_wo_id)")
          .eq("wo_id", propWorkOrder.id)
          .eq("status", "running");

        if (assignError) throw assignError;

        const assignedMachines = assignments
          ?.map(a => a.machines)
          .filter(Boolean) || [];
        
        setMachines(assignedMachines as Machine[]);
      } else {
        const { data, error } = await supabase
          .from("machines")
          .select("id, machine_id, name, current_wo_id")
          .order("machine_id");

        if (error) throw error;
        setMachines(data || []);
      }
    } catch (error: any) {
      console.error("Error loading machines:", error);
      toast.error("Failed to load machines");
    }
  };

  const onSubmit = async (data: ProductionLogFormData) => {
    if (propWorkOrder && propWorkOrder.production_release_status !== 'RELEASED') {
      toast.error("Cannot log production until work order is released for production.");
      return;
    }
    
    if (propWorkOrder && (!propWorkOrder.qc_material_passed || !propWorkOrder.qc_first_piece_passed)) {
      toast.error("Cannot log production until QC gates are cleared.");
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
      
      const { error: logError } = await supabase.from("production_logs").insert({
        wo_id: propWorkOrder?.id,
        machine_id: data.machine_id,
        run_state: data.run_state,
        downtime_minutes: data.downtime_minutes || 0,
        setup_no: data.setup_no,
        operation_code: data.operation_code,
        operator_type: data.operator_type,
        planned_minutes: actualRuntime + downtimeMinutes,
        target_qty: targetQuantity,
        quantity_completed: data.quantity_completed,
        quantity_scrap: data.quantity_scrap,
        shift: data.shift,
        remarks: data.remarks,
        actions_taken: data.actions_taken,
        operator_id: user?.id,
        log_timestamp: new Date().toISOString(),
      });

      if (logError) throw logError;

      if (data.run_state === 'maintenance' && data.downtime_minutes && data.downtime_minutes > 0) {
        const startTime = new Date();
        const endTime = new Date(startTime.getTime() + data.downtime_minutes * 60000);
        
        await supabase.from("maintenance_logs").insert({
          machine_id: data.machine_id,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          downtime_reason: data.actions_taken || `Maintenance: ${data.remarks || 'Unspecified'}`,
          logged_by: user?.id,
        });
      }

      if (data.quantity_completed > 0 && propWorkOrder?.id) {
        await createExecutionRecord({
          workOrderId: propWorkOrder.id,
          operationType: 'CNC',
          processName: data.operation_code || undefined,
          quantity: data.quantity_completed,
          unit: 'pcs',
          direction: 'COMPLETE',
        });
      }

      toast.success("Production log submitted successfully");
      reset();
      setSelectedMachine("");
      setRunState("running");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit production log");
    } finally {
      setLoading(false);
    }
  };

  if (disabled) {
    return (
      <Card className="border-muted">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            Production logging is blocked. The work order must be released and QC gates must pass before logging production.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          Log Production
          <Badge variant="outline" className="text-xs font-normal">Three-Layer Form</Badge>
        </CardTitle>
        <CardDescription>
          Read-only fields are auto-populated. Enter manual inputs and system will calculate outputs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* ==========================================
              LAYER 1: AUTO-PULLED READ-ONLY VALUES
              (From Sales Order, Work Order, Routing)
              ========================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Auto-Pulled from Work Order
              <Badge variant="secondary" className="text-xs">Read-Only</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-muted/30 border border-dashed">
              <ReadOnlyField label="Work Order" value={displayId} />
              <ReadOnlyField label="Customer" value={customer} />
              <ReadOnlyField label="Item Code" value={itemCode} />
              <ReadOnlyField label="Revision" value={revision} />
              <ReadOnlyField label="Material Size" value={materialSize} />
              <ReadOnlyField 
                label="Cycle Time" 
                value={cycleTimeSeconds ? `${cycleTimeSeconds}s` : "—"} 
                hint="From routing"
              />
              <ReadOnlyField label="Order Qty" value={formatCount(orderQuantity)} />
              <ReadOnlyField 
                label="Status" 
                value={propWorkOrder?.status || "—"} 
              />
            </div>
          </div>

          <Separator />

          {/* ==========================================
              LAYER 2: MANUAL OPERATOR/SUPERVISOR INPUTS
              ========================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wrench className="h-4 w-4" />
              Manual Inputs
              <Badge variant="default" className="text-xs">Editable</Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Machine Selection */}
              <div className="space-y-2">
                <Label htmlFor="machine_id">Machine *</Label>
                <Select
                  value={selectedMachine}
                  onValueChange={(value) => {
                    setSelectedMachine(value);
                    setValue("machine_id", value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={machines.length === 0 ? "No machines assigned" : "Select machine"} />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>
                        {machine.machine_id} - {machine.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.machine_id && (
                  <p className="text-sm text-destructive">{errors.machine_id.message}</p>
                )}
              </div>

              {/* Run State */}
              <div className="space-y-2">
                <Label htmlFor="run_state">Run State *</Label>
                <Select 
                  value={runState}
                  onValueChange={(value) => {
                    setRunState(value);
                    setValue("run_state", value as any);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select run state" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="running">Running</SelectItem>
                    <SelectItem value="stopped">Stopped</SelectItem>
                    <SelectItem value="material_wait">Material Wait</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="setup">Setup</SelectItem>
                  </SelectContent>
                </Select>
                {errors.run_state && (
                  <p className="text-sm text-destructive">{errors.run_state.message}</p>
                )}
              </div>

              {/* Shift */}
              <div className="space-y-2">
                <Label htmlFor="shift">Shift</Label>
                <Select onValueChange={(value) => setValue("shift", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select shift" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day">Day Shift</SelectItem>
                    <SelectItem value="night">Night Shift</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Actual Runtime Minutes */}
              <div className="space-y-2">
                <Label htmlFor="actual_runtime_minutes">Actual Runtime (min) *</Label>
                <Input
                  id="actual_runtime_minutes"
                  type="number"
                  min="0"
                  {...register("actual_runtime_minutes")}
                />
                <p className="text-xs text-muted-foreground">Time machine was actively running</p>
              </div>

              {/* Downtime Minutes */}
              <div className="space-y-2">
                <Label htmlFor="downtime_minutes">Downtime (min)</Label>
                <Input
                  id="downtime_minutes"
                  type="number"
                  min="0"
                  {...register("downtime_minutes")}
                />
                {errors.downtime_minutes && (
                  <p className="text-sm text-destructive">{errors.downtime_minutes.message}</p>
                )}
              </div>

              {/* Operator Type */}
              <div className="space-y-2">
                <Label htmlFor="operator_type">Operator Type *</Label>
                <Select 
                  defaultValue="RVI"
                  onValueChange={(value) => setValue("operator_type", value as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RVI">RVI</SelectItem>
                    <SelectItem value="CONTRACTOR">CONTRACTOR</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Quantity Completed */}
              <div className="space-y-2">
                <Label htmlFor="quantity_completed">Qty Completed *</Label>
                <Input
                  id="quantity_completed"
                  type="number"
                  min="0"
                  {...register("quantity_completed")}
                />
                {errors.quantity_completed && (
                  <p className="text-sm text-destructive">{errors.quantity_completed.message}</p>
                )}
              </div>

              {/* Quantity Scrap */}
              <div className="space-y-2">
                <Label htmlFor="quantity_scrap">Qty Scrap</Label>
                <Input
                  id="quantity_scrap"
                  type="number"
                  min="0"
                  {...register("quantity_scrap")}
                />
              </div>

              {/* Setup Number */}
              <div className="space-y-2">
                <Label htmlFor="setup_no">Setup No.</Label>
                <Input
                  id="setup_no"
                  type="text"
                  placeholder="e.g., SETUP-001"
                  {...register("setup_no")}
                />
              </div>

              {/* Operation Code */}
              <div className="space-y-2">
                <Label htmlFor="operation_code">Operation</Label>
                <Select onValueChange={(value) => setValue("operation_code", value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select operation" />
                  </SelectTrigger>
                  <SelectContent>
                    {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(op => (
                      <SelectItem key={op} value={op}>Op {op}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Actions Taken */}
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="actions_taken">Actions Taken</Label>
                <Textarea
                  id="actions_taken"
                  placeholder="Describe actions taken during this period..."
                  rows={2}
                  {...register("actions_taken")}
                />
              </div>

              {/* Remarks */}
              <div className="space-y-2 md:col-span-3">
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  placeholder="Any additional notes..."
                  rows={2}
                  {...register("remarks")}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* ==========================================
              LAYER 3: SYSTEM-CALCULATED OUTPUTS
              ========================================== */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Calculator className="h-4 w-4" />
              System Calculated
              <Badge variant="outline" className="text-xs border-primary/50 text-primary">Auto</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 rounded-lg bg-primary/5 border border-primary/20">
              <CalculatedField 
                label="Target Qty" 
                value={formatCount(targetQuantity)} 
                formula="(runtime × 60) / cycle_time"
              />
              <CalculatedField 
                label="OK Qty" 
                value={formatCount(okQuantity)} 
                formula="completed − scrap"
              />
              <CalculatedField 
                label="Efficiency" 
                value={`${formatPercent(efficiency)}%`} 
                formula="(actual / target) × 100"
              />
              <CalculatedField 
                label="Scrap Rate" 
                value={`${scrapRate}%`} 
                formula="(scrap / completed) × 100"
              />
              <CalculatedField 
                label="Total Time" 
                value={`${totalTime} min`} 
                formula="runtime + downtime"
              />
              <CalculatedField 
                label="Uptime" 
                value={`${uptimePercent}%`} 
                formula="(runtime / total) × 100"
              />
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              Calculated fields update automatically based on your inputs. They cannot be edited directly.
            </p>
          </div>

          <Button type="submit" disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Production Log
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
