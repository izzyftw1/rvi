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
}

export function ProductionLogForm() {
  const [loading, setLoading] = useState(false);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
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

  useEffect(() => {
    loadMachines();
    loadWorkOrders();
  }, []);

  useEffect(() => {
    if (selectedMachine) {
      const machine = machines.find(m => m.id === selectedMachine);
      if (machine?.current_wo_id) {
        setValue("wo_id", machine.current_wo_id);
      }
    }
  }, [selectedMachine, machines, setValue]);

  const loadMachines = async () => {
    const { data, error } = await supabase
      .from("machines")
      .select("id, machine_id, name, current_wo_id")
      .order("machine_id");

    if (error) {
      toast.error("Failed to load machines");
      return;
    }
    setMachines(data || []);
  };

  const loadWorkOrders = async () => {
    const { data, error } = await supabase
      .from("work_orders")
      .select("id, wo_id, display_id, customer, item_code, quantity")
      .in("status", ["in_progress", "pending"])
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("Failed to load work orders");
      return;
    }
    setWorkOrders(data || []);
  };

  const onSubmit = async (data: ProductionLogFormData) => {
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
        <CardDescription>Record production progress and scrap quantities</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
                  <SelectValue placeholder="Select machine" />
                </SelectTrigger>
                <SelectContent>
                  {machines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.machine_id} - {machine.name}
                      {machine.current_wo_id && " (Currently Running)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.machine_id && (
                <p className="text-sm text-destructive">{errors.machine_id.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="wo_id">Work Order *</Label>
              <Select onValueChange={(value) => setValue("wo_id", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select work order" />
                </SelectTrigger>
                <SelectContent>
                  {workOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      {wo.display_id} - {wo.customer} - {wo.item_code} ({wo.quantity} pcs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.wo_id && (
                <p className="text-sm text-destructive">{errors.wo_id.message}</p>
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
