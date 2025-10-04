import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const OPERATIONS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'] as const;

const HourlyQC = () => {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [selectedWO, setSelectedWO] = useState<string>("");
  const [selectedMachine, setSelectedMachine] = useState<string>("");
  const [operation, setOperation] = useState<string>("A");
  const [tolerances, setTolerances] = useState<any>(null);
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [remarks, setRemarks] = useState("");
  const [qcResults, setQcResults] = useState<any>(null);
  const [threadStatus, setThreadStatus] = useState<string>("");
  const [visualStatus, setVisualStatus] = useState<string>("");
  const [platingStatus, setPlatingStatus] = useState<string>("");
  const [platingThicknessStatus, setPlatingThicknessStatus] = useState<string>("");

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedWO && operation) {
      loadTolerances(selectedWO, operation);
    }
  }, [selectedWO, operation]);

  const loadData = async () => {
    try {
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select("*")
        .in("status", ["in_progress", "pending"])
        .order("created_at", { ascending: false });

      if (woError) throw woError;
      setWorkOrders(wos || []);

      const { data: machinesData, error: machinesError } = await supabase
        .from("machines")
        .select("*")
        .eq("status", "available");

      if (machinesError) throw machinesError;
      setMachines(machinesData || []);
    } catch (error: any) {
      toast.error("Failed to load data: " + error.message);
    }
  };

  const loadTolerances = async (woId: string, op: string) => {
    try {
      const wo = workOrders.find((w) => w.id === woId);
      if (!wo) return;

      const { data, error } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .eq("item_code", wo.item_code)
        .eq("operation", op as any)
        .maybeSingle();

      if (error) throw error;
      
      if (data && data.dimensions) {
        setTolerances(data);
        const initMeasurements: Record<string, string> = {};
        Object.keys(data.dimensions as any).forEach((dimNum) => {
          initMeasurements[dimNum] = "";
        });
        setMeasurements(initMeasurements);
      } else {
        setTolerances(null);
        setMeasurements({});
        toast.warning(`No tolerances defined for ${wo.item_code} Operation ${op}`);
      }
    } catch (error: any) {
      toast.error("Failed to load tolerances: " + error.message);
    }
  };

  const checkTolerance = (dimNum: string, value: number): boolean => {
    if (!tolerances || !tolerances.dimensions) return true;
    const dims = tolerances.dimensions as any;
    if (!dims[dimNum]) return true;
    const { min, max } = dims[dimNum];
    return value >= min && value <= max;
  };

  const handleSubmit = async () => {
    try {
      if (!selectedWO || !selectedMachine || !operation) {
        toast.error("Please select WO, Machine, and Operation");
        return;
      }

      if (!tolerances) {
        toast.error("No tolerances defined for this part and operation");
        return;
      }

      if (!threadStatus || !visualStatus || !platingStatus || !platingThicknessStatus) {
        toast.error("Please select OK/Not OK for all binary QC checks (Thread, Visual, Plating, Plating Thickness)");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      
      const outOfToleranceDimensions: string[] = [];
      const dimensionValues: Record<string, number> = {};

      Object.entries(measurements).forEach(([dimNum, valueStr]) => {
        if (valueStr && valueStr.trim() !== "") {
          const value = parseFloat(valueStr);
          dimensionValues[dimNum] = value;
          if (!checkTolerance(dimNum, value)) {
            outOfToleranceDimensions.push(dimNum);
          }
        }
      });

      const status = outOfToleranceDimensions.length === 0 ? "pass" : "fail";

      const { error } = await supabase.from("hourly_qc_checks").insert({
        wo_id: selectedWO,
        machine_id: selectedMachine,
        operator_id: user?.id,
        operation: operation as any,
        dimensions: dimensionValues as any,
        status: status,
        out_of_tolerance_dimensions: outOfToleranceDimensions,
        remarks: remarks || null,
        thread_status: threadStatus,
        visual_status: visualStatus,
        plating_status: platingStatus,
        plating_thickness_status: platingThicknessStatus,
      });

      if (error) throw error;

      setQcResults({
        status,
        outOfToleranceDimensions,
        measurements: dimensionValues,
      });

      toast.success(`QC Check ${status === "pass" ? "PASSED" : "FAILED"}`);
      
      const initMeasurements: Record<string, string> = {};
      Object.keys(tolerances.dimensions as any).forEach((dimNum) => {
        initMeasurements[dimNum] = "";
      });
      setMeasurements(initMeasurements);
      setRemarks("");
      setThreadStatus("");
      setVisualStatus("");
      setPlatingStatus("");
      setPlatingThicknessStatus("");
    } catch (error: any) {
      toast.error("Failed to submit QC check: " + error.message);
    }
  };

  const selectedWOData = workOrders.find((wo) => wo.id === selectedWO);

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Hourly Dimensional QC</h1>
          <p className="text-muted-foreground">Record hourly quality control measurements</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>QC Entry Form</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label htmlFor="wo">Work Order</Label>
                <Select value={selectedWO} onValueChange={setSelectedWO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select WO" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.wo_id} - {wo.item_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="operation">Operation</Label>
                <Select value={operation} onValueChange={setOperation}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATIONS.map((op) => (
                      <SelectItem key={op} value={op}>
                        Operation {op}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="machine">Machine</Label>
                <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Machine" />
                  </SelectTrigger>
                  <SelectContent>
                    {machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>
                        {machine.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedWO && tolerances && (
              <div className="space-y-4">
                <div className="p-3 bg-muted rounded">
                  <div className="text-sm font-medium">Part: {selectedWOData?.item_code}</div>
                  <div className="text-sm text-muted-foreground">
                    Operation {operation} • {Object.keys(tolerances.dimensions as any || {}).length} dimensions
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto p-4 border rounded">
                  {Object.entries((tolerances.dimensions as any) || {})
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([dimNum, dimData]: [string, any]) => {
                      const valueStr = measurements[dimNum] || "";
                      const value = valueStr ? parseFloat(valueStr) : 0;
                      const isInTolerance = valueStr ? checkTolerance(dimNum, value) : true;
                      
                      return (
                        <div key={dimNum} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`dim_${dimNum}`}>Dimension {dimNum}</Label>
                            <span className="text-xs text-muted-foreground">
                              {dimData.min.toFixed(3)} - {dimData.max.toFixed(3)}
                            </span>
                          </div>
                          <Input
                            id={`dim_${dimNum}`}
                            type="number"
                            step="0.001"
                            value={valueStr}
                            onChange={(e) =>
                              setMeasurements({
                                ...measurements,
                                [dimNum]: e.target.value,
                              })
                            }
                            className={
                              valueStr && !isInTolerance
                                ? "border-red-500 bg-red-50"
                                : valueStr && isInTolerance
                                ? "border-green-500 bg-green-50"
                                : ""
                            }
                            placeholder="Enter value"
                          />
                        </div>
                      );
                    })}
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="font-semibold mb-4">Binary QC Checks (Required)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="thread">Thread</Label>
                      <Select value={threadStatus} onValueChange={setThreadStatus}>
                        <SelectTrigger className={!threadStatus ? "border-yellow-500" : ""}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Not OK">Not OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="visual">Visual</Label>
                      <Select value={visualStatus} onValueChange={setVisualStatus}>
                        <SelectTrigger className={!visualStatus ? "border-yellow-500" : ""}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Not OK">Not OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="plating">Plating</Label>
                      <Select value={platingStatus} onValueChange={setPlatingStatus}>
                        <SelectTrigger className={!platingStatus ? "border-yellow-500" : ""}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Not OK">Not OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="platingThickness">Plating Thickness</Label>
                      <Select value={platingThicknessStatus} onValueChange={setPlatingThicknessStatus}>
                        <SelectTrigger className={!platingThicknessStatus ? "border-yellow-500" : ""}>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="OK">OK</SelectItem>
                          <SelectItem value="Not OK">Not OK</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="remarks">Remarks</Label>
                  <Textarea
                    id="remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    placeholder="Any observations or issues..."
                    rows={3}
                  />
                </div>

                <Button onClick={handleSubmit} className="w-full" size="lg">
                  Submit QC Check
                </Button>
              </div>
            )}

            {selectedWO && !tolerances && (
              <div className="text-center py-8 text-muted-foreground">
                No tolerances defined for this part and operation.
                <br />
                Please set up tolerances first.
              </div>
            )}
          </CardContent>
        </Card>

        {qcResults && (
          <Card className={qcResults.status === "pass" ? "border-green-500" : "border-red-500"}>
            <CardHeader>
              <CardTitle className={qcResults.status === "pass" ? "text-green-600" : "text-red-600"}>
                QC Result: {qcResults.status === "pass" ? "PASS" : "FAIL"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {qcResults.outOfToleranceDimensions.length > 0 && (
                <div className="space-y-2">
                  <div className="font-medium text-red-600">
                    Out of Tolerance Dimensions:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {qcResults.outOfToleranceDimensions.map((dim: string) => (
                      <span key={dim} className="px-2 py-1 bg-red-100 text-red-700 rounded text-sm">
                        Dimension {dim}: {qcResults.measurements[dim]?.toFixed(3)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default HourlyQC;
