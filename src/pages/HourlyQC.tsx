import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Textarea } from "@/components/ui/textarea";

const HourlyQC = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [selectedWO, setSelectedWO] = useState("");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [tolerances, setTolerances] = useState<any>(null);
  const [measurements, setMeasurements] = useState({
    dimension_a: "",
    dimension_b: "",
    dimension_c: "",
    dimension_d: "",
    dimension_e: "",
    dimension_f: "",
    dimension_g: "",
  });
  const [remarks, setRemarks] = useState("");
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedWO) {
      loadTolerances();
    }
  }, [selectedWO]);

  const loadData = async () => {
    try {
      const [woRes, machineRes] = await Promise.all([
        supabase
          .from("work_orders")
          .select("*")
          .in("status", ["in_progress", "pending"])
          .order("created_at", { ascending: false }),
        supabase
          .from("machines")
          .select("*")
          .order("machine_id"),
      ]);

      if (woRes.error) throw woRes.error;
      if (machineRes.error) throw machineRes.error;

      setWorkOrders(woRes.data || []);
      setMachines(machineRes.data || []);
    } catch (error: any) {
      toast.error("Failed to load data: " + error.message);
    }
  };

  const loadTolerances = async () => {
    try {
      const wo = workOrders.find((w) => w.id === selectedWO);
      if (!wo) return;

      const { data, error } = await supabase
        .from("dimension_tolerances")
        .select("*")
        .eq("item_code", wo.item_code)
        .maybeSingle();

      if (error) throw error;
      setTolerances(data);

      if (!data) {
        toast.warning("No tolerances defined for this item code");
      }
    } catch (error: any) {
      toast.error("Failed to load tolerances: " + error.message);
    }
  };

  const checkTolerance = (dimension: string, value: number) => {
    if (!tolerances) return "unknown";

    const dimLower = dimension.toLowerCase();
    const min = tolerances[`dimension_${dimLower}_min`];
    const max = tolerances[`dimension_${dimLower}_max`];

    if (min !== null && value < min) return "fail";
    if (max !== null && value > max) return "fail";
    return "pass";
  };

  const handleSubmit = async () => {
    if (!selectedWO || !selectedMachine) {
      toast.error("Please select Work Order and Machine");
      return;
    }

    setLoading(true);
    try {
      const dimensionResults: any = {};
      const outOfTolerance: string[] = [];
      let overallStatus = "pass";

      ["a", "b", "c", "d", "e", "f", "g"].forEach((dim) => {
        const value = measurements[`dimension_${dim}` as keyof typeof measurements];
        if (value) {
          const numValue = parseFloat(value);
          const result = checkTolerance(dim, numValue);
          dimensionResults[dim] = { value: numValue, result };

          if (result === "fail") {
            overallStatus = "fail";
            outOfTolerance.push(dim.toUpperCase());
          }
        }
      });

      const { data: { user } } = await supabase.auth.getUser();

      const wo = workOrders.find((w) => w.id === selectedWO);

      const { error } = await supabase.from("hourly_qc_checks").insert({
        wo_id: selectedWO,
        item_code: wo?.item_code,
        machine_id: selectedMachine,
        operator_id: user?.id,
        dimension_a: measurements.dimension_a ? parseFloat(measurements.dimension_a) : null,
        dimension_b: measurements.dimension_b ? parseFloat(measurements.dimension_b) : null,
        dimension_c: measurements.dimension_c ? parseFloat(measurements.dimension_c) : null,
        dimension_d: measurements.dimension_d ? parseFloat(measurements.dimension_d) : null,
        dimension_e: measurements.dimension_e ? parseFloat(measurements.dimension_e) : null,
        dimension_f: measurements.dimension_f ? parseFloat(measurements.dimension_f) : null,
        dimension_g: measurements.dimension_g ? parseFloat(measurements.dimension_g) : null,
        status: overallStatus,
        out_of_tolerance_dimensions: outOfTolerance,
        remarks: remarks || null,
      });

      if (error) throw error;

      setResults({ dimensionResults, overallStatus, outOfTolerance });

      if (overallStatus === "fail") {
        toast.error(`QC Check FAILED - Out of tolerance: ${outOfTolerance.join(", ")}`);
      } else {
        toast.success("QC Check PASSED - All dimensions within tolerance");
      }

      // Reset form
      setMeasurements({
        dimension_a: "",
        dimension_b: "",
        dimension_c: "",
        dimension_d: "",
        dimension_e: "",
        dimension_f: "",
        dimension_g: "",
      });
      setRemarks("");
      
    } catch (error: any) {
      toast.error("Failed to save QC check: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const dimensions = ["A", "B", "C", "D", "E", "F", "G"];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Hourly Dimensional QC Check</h1>
            <p className="text-sm text-muted-foreground">Enter measured values for dimensions A-G</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Select Work Order & Machine</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Work Order</Label>
                <Select value={selectedWO} onValueChange={setSelectedWO}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select WO" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.wo_id} - {wo.item_code} ({wo.customer})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Machine</Label>
                <Select value={selectedMachine} onValueChange={setSelectedMachine}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Machine" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {machines.map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>
                        {machine.machine_id} - {machine.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {selectedWO && (
          <Card>
            <CardHeader>
              <CardTitle>Dimension Measurements</CardTitle>
              {!tolerances && (
                <div className="flex items-center gap-2 text-sm text-yellow-600">
                  <AlertTriangle className="h-4 w-4" />
                  No tolerances defined - measurements will be recorded without validation
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {dimensions.map((dim) => {
                  const dimLower = dim.toLowerCase();
                  const measurementKey = `dimension_${dimLower}` as keyof typeof measurements;
                  
                  return (
                    <div key={dim}>
                      <Label>Dimension {dim}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={measurements[measurementKey]}
                        onChange={(e) =>
                          setMeasurements({
                            ...measurements,
                            [measurementKey]: e.target.value,
                          })
                        }
                        placeholder="Enter value"
                      />
                    </div>
                  );
                })}
              </div>

              <div>
                <Label>Remarks (Optional)</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Any additional notes..."
                  rows={3}
                />
              </div>

              <Button onClick={handleSubmit} disabled={loading}>
                <Save className="h-4 w-4 mr-2" />
                {loading ? "Submitting..." : "Submit QC Check"}
              </Button>
            </CardContent>
          </Card>
        )}

        {results && (
          <Card className={results.overallStatus === "pass" ? "border-green-500" : "border-red-500"}>
            <CardHeader>
              <CardTitle className={results.overallStatus === "pass" ? "text-green-600" : "text-red-600"}>
                {results.overallStatus === "pass" ? "✓ QC Check PASSED" : "✗ QC Check FAILED"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {results.overallStatus === "fail" && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded">
                  <div className="font-medium text-red-700">Out of Tolerance:</div>
                  <div className="text-red-600">{results.outOfTolerance.join(", ")}</div>
                </div>
              )}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {Object.entries(results.dimensionResults).map(([dim, data]: [string, any]) => (
                  <div
                    key={dim}
                    className={`p-2 rounded text-center ${
                      data.result === "pass" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                    }`}
                  >
                    <div className="font-medium">{dim.toUpperCase()}</div>
                    <div className="text-sm">{data.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default HourlyQC;
