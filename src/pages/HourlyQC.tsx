import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { NavigationHeader } from "@/components/NavigationHeader";

const OPERATIONS = ['A', 'B', 'C', 'D'] as const;

const HourlyQC = () => {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [selections, setSelections] = useState({
    woId: "",
    operation: "A" as typeof OPERATIONS[number],
    machineId: ""
  });
  
  const [tolerances, setTolerances] = useState<Array<{
    id: string;
    name: string;
    min: number;
    max: number;
  }>>([]);
  
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [binaryChecksEnabled, setBinaryChecksEnabled] = useState(false);
  const [applicableChecks, setApplicableChecks] = useState({
    thread: false,
    visual: false,
    plating: false,
    platingThickness: false
  });
  
  const [qcResults, setQcResults] = useState({
    thread: 'ok',
    visual: 'ok',
    plating: 'ok',
    platingThickness: 'ok',
    remarks: ''
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selections.woId && selections.operation) {
      loadTolerances();
    }
  }, [selections.woId, selections.operation]);

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
        .order("name", { ascending: true });

      if (machinesError) throw machinesError;
      setMachines(machinesData || []);
    } catch (error: any) {
      toast.error("Failed to load data: " + error.message);
    }
  };

  const loadTolerances = async () => {
    if (!selections.woId || !selections.operation) return;

    try {
      const { data: woData } = await supabase
        .from('work_orders')
        .select('item_code, revision')
        .eq('id', selections.woId)
        .single();

      if (!woData) return;

      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', woData.item_code)
        .eq('operation', selections.operation)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const dimensionsObj = data[0].dimensions as Record<string, { name: string; min: number; max: number }>;
        const tolerancesArray = Object.entries(dimensionsObj).map(([id, dim]) => ({
          id,
          name: dim.name,
          min: dim.min,
          max: dim.max
        }));
        
        setTolerances(tolerancesArray);
        
        const initialMeasurements: Record<string, string> = {};
        tolerancesArray.forEach(t => {
          initialMeasurements[t.id] = '';
        });
        setMeasurements(initialMeasurements);
      } else {
        setTolerances([]);
        setMeasurements({});
      }
    } catch (error) {
      console.error('Error loading tolerances:', error);
    }
  };

  const checkTolerance = (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selections.woId || !selections.operation || !selections.machineId) {
      toast.error('Please select Work Order, Operation, and Machine');
      return;
    }

    try {
      const outOfTolerance: string[] = [];
      const dimensionsData: Record<string, number> = {};

      tolerances.forEach(tol => {
        const measuredValue = parseFloat(measurements[tol.id] || '0');
        dimensionsData[tol.id] = measuredValue;

        if (!checkTolerance(measuredValue, tol.min, tol.max)) {
          outOfTolerance.push(tol.name);
        }
      });

      let hasBinaryFailure = false;
      if (binaryChecksEnabled) {
        if (applicableChecks.thread && qcResults.thread !== 'ok' && qcResults.thread !== 'na') hasBinaryFailure = true;
        if (applicableChecks.visual && qcResults.visual !== 'ok' && qcResults.visual !== 'na') hasBinaryFailure = true;
        if (applicableChecks.plating && qcResults.plating !== 'ok' && qcResults.plating !== 'na') hasBinaryFailure = true;
        if (applicableChecks.platingThickness && qcResults.platingThickness !== 'ok' && qcResults.platingThickness !== 'na') hasBinaryFailure = true;
      }

      const overallStatus = (outOfTolerance.length === 0 && !hasBinaryFailure) ? 'pass' : 'fail';

      const { error } = await supabase.from('hourly_qc_checks').insert({
        wo_id: selections.woId,
        machine_id: selections.machineId,
        operator_id: (await supabase.auth.getUser()).data.user?.id,
        operation: selections.operation,
        dimensions: dimensionsData,
        status: overallStatus,
        out_of_tolerance_dimensions: outOfTolerance.length > 0 ? outOfTolerance : null,
        thread_applicable: applicableChecks.thread,
        thread_status: applicableChecks.thread ? qcResults.thread : null,
        visual_applicable: applicableChecks.visual,
        visual_status: applicableChecks.visual ? qcResults.visual : null,
        plating_applicable: applicableChecks.plating,
        plating_status: applicableChecks.plating ? qcResults.plating : null,
        plating_thickness_applicable: applicableChecks.platingThickness,
        plating_thickness_status: applicableChecks.platingThickness ? qcResults.platingThickness : null,
        remarks: qcResults.remarks || null
      });

      if (error) throw error;

      toast.success(`QC Check submitted: ${overallStatus.toUpperCase()}`);
      resetForm();
    } catch (error: any) {
      console.error('Error submitting QC check:', error);
      toast.error(error.message || 'Failed to submit QC check');
    }
  };

  const resetForm = () => {
    setMeasurements({});
    setQcResults({ thread: 'ok', visual: 'ok', plating: 'ok', platingThickness: 'ok', remarks: '' });
    setBinaryChecksEnabled(false);
    setApplicableChecks({ thread: false, visual: false, plating: false, platingThickness: false });
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Hourly Dimensional QC" subtitle="Record hourly quality control measurements" />
      
      <div className="max-w-4xl mx-auto p-4 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>QC Entry Form</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Work Order</Label>
                  <Select value={selections.woId} onValueChange={(v) => setSelections({...selections, woId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select WO" /></SelectTrigger>
                    <SelectContent>
                      {workOrders.map(wo => (
                        <SelectItem key={wo.id} value={wo.id}>{wo.display_id} - {wo.item_code}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operation</Label>
                  <Select value={selections.operation} onValueChange={(v) => setSelections({...selections, operation: v as typeof OPERATIONS[number]})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATIONS.map(op => <SelectItem key={op} value={op}>Operation {op}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Machine</Label>
                  <Select value={selections.machineId} onValueChange={(v) => setSelections({...selections, machineId: v})}>
                    <SelectTrigger><SelectValue placeholder="Select Machine" /></SelectTrigger>
                    <SelectContent>
                      {machines.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {tolerances.length > 0 && (
                <>
                  <div className="space-y-4">
                    <Label className="text-base font-semibold">Dimensional Measurements</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {tolerances.map(tol => {
                        const measuredValue = parseFloat(measurements[tol.id] || '0');
                        const isOutOfTolerance = measurements[tol.id] && !checkTolerance(measuredValue, tol.min, tol.max);
                        return (
                          <div key={tol.id} className="space-y-2">
                            <Label>{tol.name} <span className="text-xs text-muted-foreground">(Min: {tol.min}, Max: {tol.max})</span></Label>
                            <Input type="number" step="0.001" value={measurements[tol.id] || ''} onChange={(e) => setMeasurements({...measurements, [tol.id]: e.target.value})} className={isOutOfTolerance ? 'border-destructive bg-destructive/10' : measurements[tol.id] ? 'border-green-500 bg-green-50' : ''} />
                            {isOutOfTolerance && <p className="text-xs text-destructive">Out of tolerance!</p>}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label className="text-base font-semibold">Binary QC Checks</Label>
                      {!binaryChecksEnabled && <Button type="button" variant="outline" size="sm" onClick={() => setBinaryChecksEnabled(true)}>+ Add Binary QC Checks</Button>}
                    </div>
                    {binaryChecksEnabled && (
                      <div className="space-y-4 border rounded-lg p-4">
                        <div className="flex gap-4 flex-wrap">
                          {['thread', 'visual', 'plating', 'platingThickness'].map(check => (
                            <label key={check} className="flex items-center gap-2">
                              <input type="checkbox" checked={applicableChecks[check as keyof typeof applicableChecks]} onChange={(e) => setApplicableChecks({...applicableChecks, [check]: e.target.checked})} />
                              <span className="text-sm capitalize">{check.replace(/([A-Z])/g, ' $1')}</span>
                            </label>
                          ))}
                        </div>
                        {Object.entries(applicableChecks).filter(([_, v]) => v).map(([check]) => (
                          <div key={check}>
                            <Label className="capitalize">{check.replace(/([A-Z])/g, ' $1')}</Label>
                            <Select value={qcResults[check as keyof typeof qcResults]} onValueChange={(v) => setQcResults({...qcResults, [check]: v})}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ok">OK</SelectItem>
                                <SelectItem value="not_ok">Not OK</SelectItem>
                                <SelectItem value="na">N/A</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <Label>Remarks</Label>
                    <Textarea value={qcResults.remarks} onChange={(e) => setQcResults({...qcResults, remarks: e.target.value})} placeholder="Any observations..." rows={3} />
                  </div>

                  <Button type="submit" className="w-full">Submit QC Check</Button>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default HourlyQC;
