import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { AlertCircle } from "lucide-react";

interface MachineAssignmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workOrder: any;
  onAssigned?: () => void;
}

export const MachineAssignmentDialog = ({
  open,
  onOpenChange,
  workOrder,
  onAssigned,
}: MachineAssignmentDialogProps) => {
  const { toast } = useToast();
  const [machines, setMachines] = useState<any[]>([]);
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [overrideCycleTime, setOverrideCycleTime] = useState<string>("");
  const [userRoles, setUserRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      
      // Load user roles to check for production manager
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        
        setUserRoles(roles?.map(r => r.role) || []);
      }
    });
    loadMachines();
    
    // Set default start time to now
    const now = new Date();
    const isoString = now.toISOString().slice(0, 16);
    setStartTime(isoString);
  }, []);

  const loadMachines = async () => {
    try {
      const { data, error } = await supabase
        .from("machines")
        .select("*")
        .order("machine_id", { ascending: true });

      if (error) throw error;
      setMachines(data || []);
    } catch (error: any) {
      console.error("Error loading machines:", error);
    }
  };

  const toggleMachine = (machineId: string) => {
    setSelectedMachines((prev) =>
      prev.includes(machineId)
        ? prev.filter((id) => id !== machineId)
        : [...prev, machineId]
    );
  };

  const getEffectiveCycleTime = () => {
    if (overrideCycleTime && parseFloat(overrideCycleTime) > 0) {
      return parseFloat(overrideCycleTime);
    }
    return workOrder?.cycle_time_seconds ? parseFloat(workOrder.cycle_time_seconds) : null;
  };

  const calculateEndTime = () => {
    const effectiveCycleTime = getEffectiveCycleTime();
    
    if (!effectiveCycleTime || !workOrder?.quantity || selectedMachines.length === 0) {
      return null;
    }

    const quantity = parseInt(workOrder.quantity);
    const numMachines = selectedMachines.length;

    // Calculate required time per machine in seconds
    const requiredSeconds = (effectiveCycleTime * quantity) / numMachines;

    const start = new Date(startTime);
    const end = new Date(start.getTime() + requiredSeconds * 1000);

    return end;
  };

  const handleAssign = async () => {
    // Check Material QC gate
    if (!workOrder.qc_material_passed) {
      toast({
        title: "Material QC Required",
        description: "Material QC must pass before assigning machines to this work order.",
        variant: "destructive",
      });
      return;
    }

    // Validate cycle time exists
    const effectiveCycleTime = getEffectiveCycleTime();
    if (!effectiveCycleTime) {
      toast({
        title: "Cycle time not defined",
        description: "Cycle time is not defined in the Sales Order. Please update the Sales Order first.",
        variant: "destructive",
      });
      return;
    }

    if (selectedMachines.length === 0) {
      toast({
        title: "No machines selected",
        description: "Please select at least one machine",
        variant: "destructive",
      });
      return;
    }

    if (!startTime) {
      toast({
        title: "Start time required",
        description: "Please select a start time",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);

      const endTime = calculateEndTime();
      if (!endTime) {
        throw new Error("Unable to calculate end time");
      }

      const quantityPerMachine = Math.ceil(workOrder.quantity / selectedMachines.length);
      const isOverridden = !!overrideCycleTime && parseFloat(overrideCycleTime) > 0;

      // Create assignments for each selected machine
      const assignments = selectedMachines.map((machineId) => ({
        wo_id: workOrder.id,
        machine_id: machineId,
        assigned_by: user?.id,
        scheduled_start: new Date(startTime).toISOString(),
        scheduled_end: endTime.toISOString(),
        quantity_allocated: quantityPerMachine,
        status: "scheduled",
        ...(isOverridden && {
          override_cycle_time_seconds: parseFloat(overrideCycleTime),
          override_applied_by: user?.id,
          override_applied_at: new Date().toISOString(),
          original_cycle_time_seconds: workOrder.cycle_time_seconds,
        }),
      }));

      const { error } = await supabase
        .from("wo_machine_assignments")
        .insert(assignments);

      if (error) throw error;

      // Log override if applied
      if (isOverridden) {
        await supabase.from("wo_actions_log").insert({
          wo_id: workOrder.id,
          action_type: "cycle_time_override",
          department: "Production",
          performed_by: user?.id,
          action_details: {
            original_cycle_time: workOrder.cycle_time_seconds,
            override_cycle_time: parseFloat(overrideCycleTime),
            machine_count: selectedMachines.length,
          },
        });
      }

      toast({
        title: "Success",
        description: `Work order assigned to ${selectedMachines.length} machine(s)${isOverridden ? ' with overridden cycle time' : ''}`,
      });

      onAssigned?.();
      onOpenChange(false);
      setSelectedMachines([]);
      setOverrideCycleTime("");
    } catch (error: any) {
      console.error("Error assigning machines:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const endTime = calculateEndTime();
  const quantityPerMachine = selectedMachines.length > 0 
    ? Math.ceil(workOrder?.quantity / selectedMachines.length)
    : 0;
  
  const effectiveCycleTime = getEffectiveCycleTime();
  const canOverride = userRoles.includes('production') || userRoles.includes('admin');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign Machines to Work Order</DialogTitle>
          <DialogDescription>Assign work order to available CNC machines</DialogDescription>
        </DialogHeader>

        {workOrder && (
          <div className="space-y-4">
            {/* WO Details */}
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Work Order Details</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">WO ID:</span>{" "}
                  {workOrder.display_id || workOrder.wo_id}
                </div>
                <div>
                  <span className="text-muted-foreground">Item:</span> {workOrder.item_code}
                </div>
                <div>
                  <span className="text-muted-foreground">Quantity:</span> {workOrder.quantity} pcs
                </div>
                <div>
                  <span className="text-muted-foreground">Cycle Time:</span>{" "}
                  {workOrder.cycle_time_seconds ? (
                    <>
                      {workOrder.cycle_time_seconds}s/pc
                      <Badge variant="outline" className="ml-2">Default</Badge>
                    </>
                  ) : (
                    <span className="text-destructive">Not defined - assignment blocked</span>
                  )}
                </div>
              </div>

              {effectiveCycleTime && (
                <div className="mt-3 p-3 bg-background rounded border">
                  <p className="text-sm font-medium mb-1">Calculation:</p>
                  <p className="text-xs text-muted-foreground">
                    Using cycle time: {effectiveCycleTime}s/pc {overrideCycleTime && <Badge variant="destructive" className="ml-1">Overridden</Badge>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Total time needed: {((effectiveCycleTime * workOrder.quantity) / 3600).toFixed(2)}h
                    {selectedMachines.length > 0 && (
                      <> → {((effectiveCycleTime * workOrder.quantity) / (3600 * selectedMachines.length)).toFixed(2)}h per machine ({selectedMachines.length} machines)</>
                    )}
                  </p>
                </div>
              )}
            </div>

            {/* Override Cycle Time (Production Manager Only) */}
            {canOverride && (
              <div className="space-y-2 p-4 border-2 border-yellow-200 dark:border-yellow-800 rounded-lg bg-yellow-50 dark:bg-yellow-950">
                <Label htmlFor="overrideCycleTime" className="flex items-center gap-2">
                  Override Cycle Time (seconds/pc)
                  <Badge variant="outline" className="bg-yellow-100 dark:bg-yellow-900">Production Manager Only</Badge>
                </Label>
                <Input
                  id="overrideCycleTime"
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder={workOrder?.cycle_time_seconds ? `Default: ${workOrder.cycle_time_seconds}s` : "Enter cycle time"}
                  value={overrideCycleTime}
                  onChange={(e) => setOverrideCycleTime(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default cycle time. Override will be logged in genealogy.
                </p>
              </div>
            )}

            {/* Start Time */}
            <div className="space-y-2">
              <Label htmlFor="startTime">Scheduled Start Time</Label>
              <Input
                id="startTime"
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>

            {/* Summary */}
            {selectedMachines.length > 0 && endTime && (
              <div className="bg-blue-50 dark:bg-blue-950 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="text-sm space-y-1">
                    <p className="font-medium">Assignment Summary:</p>
                    <p>
                      • {selectedMachines.length} machine(s) selected
                    </p>
                    <p>
                      • {quantityPerMachine} pcs per machine
                    </p>
                    <p>
                      • Est. completion: {endTime.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Machine Selection */}
            <div className="space-y-2">
              <Label>Select Machines (Click to select/deselect)</Label>
              <div className="grid grid-cols-5 gap-2 max-h-60 overflow-y-auto p-2 border rounded-lg">
                {machines.map((machine) => {
                  const isSelected = selectedMachines.includes(machine.id);
                  const isAvailable = machine.status === "idle";

                  return (
                    <div
                      key={machine.id}
                      className={`p-3 rounded border cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary"
                          : isAvailable
                          ? "hover:bg-muted border-border"
                          : "opacity-50 cursor-not-allowed border-border"
                      }`}
                      onClick={() => isAvailable && toggleMachine(machine.id)}
                    >
                      <div className="text-center">
                        <p className="font-bold text-sm">{machine.machine_id}</p>
                        <p className="text-xs truncate">{machine.name}</p>
                        <Badge
                          variant={isAvailable ? "secondary" : "destructive"}
                          className="mt-1 text-xs"
                        >
                          {machine.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleAssign}
                disabled={loading || selectedMachines.length === 0 || !effectiveCycleTime}
              >
                {!effectiveCycleTime ? "Cycle Time Required" : `Assign to ${selectedMachines.length} Machine(s)`}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
