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

const productionLogSchema = z.object({
  wo_id: z.string().uuid("Please select a work order"),
  machine_id: z.string().uuid("Please select a machine"),
  quantity_completed: z.coerce.number().min(0, "Must be 0 or greater"),
  quantity_scrap: z.coerce.number().min(0, "Must be 0 or greater"),
  shift: z.string().optional(),
  remarks: z.string().optional(),
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
  first_piece_qc_status?: string;
}

interface ProductionLogFormProps {
  workOrder?: any;
}

export function ProductionLogForm({ workOrder: propWorkOrder }: ProductionLogFormProps = {}) {
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  
  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<ProductionLogFormData>({
    resolver: zodResolver(productionLogSchema),
  });

  // Auto-populate work order if provided
  useEffect(() => {
    if (propWorkOrder?.id) {
      setValue("wo_id", propWorkOrder.id);
    }
  }, [propWorkOrder, setValue]);

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
    // Check both QC gates before allowing production logging
    if (propWorkOrder && (!propWorkOrder.qc_material_passed || !propWorkOrder.qc_first_piece_passed)) {
      toast.error("Cannot start mass production until QC gates are cleared");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("production_logs").insert({
        wo_id: data.wo_id,
        machine_id: data.machine_id,
        quantity_completed: data.quantity_completed,
        quantity_scrap: data.quantity_scrap,
        shift: data.shift,
        remarks: data.remarks,
        operator_id: user?.id,
        log_timestamp: new Date().toISOString(),
      });

      if (error) throw error;

      toast.success("Production log submitted successfully");
      reset();
      setSelectedMachine("");
    } catch (error: any) {
      toast.error(error.message || "Failed to submit production log");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Production Log Entry</CardTitle>
        <CardDescription>
          {propWorkOrder 
            ? `Recording for WO: ${propWorkOrder.display_id || propWorkOrder.wo_id} - ${propWorkOrder.item_code}`
            : "Record production progress and scrap quantities"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Show WO info banner if work order is provided */}
          {propWorkOrder && (
            <div className="p-4 bg-muted rounded-lg border">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{propWorkOrder.customer}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Item Code</p>
                  <p className="font-medium">{propWorkOrder.item_code}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Target Quantity</p>
                  <p className="font-medium">{propWorkOrder.quantity} pcs</p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="remarks">Remarks</Label>
              <Textarea
                id="remarks"
                placeholder="Any additional notes..."
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
