import { useState, useEffect } from "react";
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
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";

const productionLogSchema = z.object({
  wo_id: z.string().uuid("Please select a work order"),
  machine_id: z.string().uuid("Please select a machine"),
  run_state: z.enum(['running', 'stopped', 'material_wait', 'maintenance', 'setup'], {
    required_error: "Please select run state"
  }),
  downtime_minutes: z.coerce.number().min(0).optional(),
  setup_no: z.string().optional(),
  operation_code: z.string().optional(),
  operator_type: z.enum(['RVI', 'CONTRACTOR'], { required_error: "Please select operator type" }),
  planned_minutes: z.coerce.number().min(0).optional(),
  quantity_completed: z.coerce.number().min(0, "Must be 0 or greater"),
  quantity_scrap: z.coerce.number().min(0, "Must be 0 or greater"),
  shift: z.string().optional(),
  remarks: z.string().optional(),
  actions_taken: z.string().optional(),
}).refine((data) => {
  // If run_state is not 'running', quantities can be 0
  if (data.run_state !== 'running') return true;
  // If running, at least some production should be logged
  return data.quantity_completed > 0 || data.quantity_scrap > 0;
}, {
  message: "When running, at least one quantity field must be greater than 0",
  path: ["quantity_completed"]
}).refine((data) => {
  // If run_state is not 'running', downtime_minutes must be provided
  if (data.run_state !== 'running' && !data.downtime_minutes) {
    return false;
  }
  return true;
}, {
  message: "Downtime minutes required when not running",
  path: ["downtime_minutes"]
});

type ProductionLogFormData = z.infer<typeof productionLogSchema>;

interface Machine {
  id: string;
  machine_id: string;
  name: string;
  current_wo_id: string | null;
}

interface WorkOrder {
  id: string;
  wo_id: string;
  display_id: string;
  customer: string;
  item_code: string;
  quantity: number;
  cycle_time_seconds?: number;
  revision?: string;
  first_piece_qc_status?: string;
}

interface ProductionLogFormProps {
  workOrder?: any;
  disabled?: boolean;
}

export function ProductionLogForm({ workOrder: propWorkOrder, disabled = false }: ProductionLogFormProps = {}) {
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [runState, setRunState] = useState<string>("running");
  const [plannedMinutes, setPlannedMinutes] = useState<number>(0);
  const [targetQty, setTargetQty] = useState<number>(0);
  
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
    }
  });

  // Auto-populate work order if provided
  useEffect(() => {
    if (propWorkOrder?.id) {
      setValue("wo_id", propWorkOrder.id);
    }
  }, [propWorkOrder, setValue]);

  // Calculate target_qty when planned_minutes or cycle_time changes
  useEffect(() => {
    if (plannedMinutes && propWorkOrder?.cycle_time_seconds) {
      const target = Math.floor((plannedMinutes * 60) / propWorkOrder.cycle_time_seconds);
      setTargetQty(target);
    } else {
      setTargetQty(0);
    }
  }, [plannedMinutes, propWorkOrder?.cycle_time_seconds]);

  useEffect(() => {
    loadMachines();
  }, [propWorkOrder]);

  const loadMachines = async () => {
    try {
      // If work order is provided, load only machines assigned to this WO
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
        // Load all machines if no work order specified
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
    // Check production release status first
    if (propWorkOrder && propWorkOrder.production_release_status !== 'RELEASED') {
      toast.error("Cannot log production until work order is released for production. Please release the work order first.");
      return;
    }
    
    // Check both QC gates before allowing production logging
    if (propWorkOrder && (!propWorkOrder.qc_material_passed || !propWorkOrder.qc_first_piece_passed)) {
      toast.error("Cannot log production until QC gates are cleared. Material Chemical Test and First-Piece QC must both pass.");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Update production_start timestamp if this is the first production log
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
        wo_id: data.wo_id,
        machine_id: data.machine_id,
        run_state: data.run_state,
        downtime_minutes: data.downtime_minutes || 0,
        setup_no: data.setup_no,
        operation_code: data.operation_code,
        operator_type: data.operator_type,
        planned_minutes: plannedMinutes || null,
        target_qty: targetQty || null,
        quantity_completed: data.quantity_completed,
        quantity_scrap: data.quantity_scrap,
        shift: data.shift,
        remarks: data.remarks,
        actions_taken: data.actions_taken,
        operator_id: user?.id,
        log_timestamp: new Date().toISOString(),
      });

      if (logError) throw logError;

      // Create maintenance log if run_state is maintenance
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

      // Create execution record for CNC completion
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
      setPlannedMinutes(0);
      setTargetQty(0);
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
            Production logging is blocked. The work order must be released and QC gates must pass or be waived before logging production.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Log Production</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
              {machines.length === 0 && propWorkOrder && (
                <p className="text-sm text-muted-foreground">
                  No machines currently assigned to this work order
                </p>
              )}
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

            {/* Downtime Minutes - Only show when not running */}
            {runState !== 'running' && (
              <div className="space-y-2">
                <Label htmlFor="downtime_minutes">Downtime Minutes *</Label>
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
            )}

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
              <Label htmlFor="operation_code">Operation Code</Label>
              <Select onValueChange={(value) => setValue("operation_code", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select operation" />
                </SelectTrigger>
                <SelectContent>
                  {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].map(op => (
                    <SelectItem key={op} value={op}>{op}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              {errors.operator_type && (
                <p className="text-sm text-destructive">{errors.operator_type.message}</p>
              )}
            </div>

            {/* Planned Minutes */}
            <div className="space-y-2">
              <Label htmlFor="planned_minutes">Planned Minutes</Label>
              <Input
                id="planned_minutes"
                type="number"
                min="0"
                value={plannedMinutes}
                onChange={(e) => setPlannedMinutes(Number(e.target.value))}
                placeholder="Auto-filled from schedule"
              />
              <p className="text-xs text-muted-foreground">
                Auto-calculated from Factory Calendar if scheduled
              </p>
            </div>

            {/* Target Quantity - Read Only */}
            <div className="space-y-2">
              <Label htmlFor="target_qty">Target Qty (Read-only)</Label>
              <Input
                id="target_qty"
                type="number"
                value={targetQty}
                readOnly
                className="bg-muted"
              />
              <p className="text-xs text-muted-foreground">
                Auto: (planned_min × 60) / cycle_time_sec
              </p>
            </div>

            {/* Quantity Completed */}
            <div className="space-y-2">
              <Label htmlFor="quantity_completed">Quantity Completed *</Label>
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
              <Label htmlFor="quantity_scrap">Quantity Scrap *</Label>
              <Input
                id="quantity_scrap"
                type="number"
                min="0"
                {...register("quantity_scrap")}
              />
              {errors.quantity_scrap && (
                <p className="text-sm text-destructive">{errors.quantity_scrap.message}</p>
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

            {/* Actions Taken - Full width */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="actions_taken">Actions Taken</Label>
              <Textarea
                id="actions_taken"
                placeholder="Describe actions taken during this period..."
                rows={2}
                {...register("actions_taken")}
              />
            </div>

            {/* Remarks - Full width */}
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Any additional notes..."
                rows={2}
                {...register("remarks")}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit Production Log
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
