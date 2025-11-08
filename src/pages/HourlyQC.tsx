import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { NavigationHeader } from "@/components/NavigationHeader";
import { MachineQCCard } from "@/components/MachineQCCard";
import { ArrowLeft, AlertTriangle } from "lucide-react";

const OPERATIONS = ['A', 'B', 'C', 'D'] as const;

const HourlyQC = () => {
  const [activeMachines, setActiveMachines] = useState<any[]>([]);
  const [selectedMachine, setSelectedMachine] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [tolerances, setTolerances] = useState<Array<{
    id: string;
    name: string;
    min: number;
    max: number;
    unit: string;
  }>>([]);
  
  const [measurements, setMeasurements] = useState<Record<string, string>>({});
  const [operation, setOperation] = useState<typeof OPERATIONS[number]>('A');
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
    loadActiveMachines();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadActiveMachines, 30000);
    
    // Realtime updates
    const channel = supabase
      .channel('hourly-qc-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'machines' }, loadActiveMachines)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hourly_qc_checks' }, loadActiveMachines)
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedMachine && operation) {
      loadTolerances();
    }
  }, [selectedMachine, operation]);

  const loadActiveMachines = async () => {
    try {
      setLoading(true);
      
      // Mark overdue checks
      await supabase.rpc('mark_overdue_qc_checks');
      
      const { data, error } = await supabase
        .from('machines')
        .select(`
          *,
          work_orders:current_wo_id(display_id, item_code, revision)
        `)
        .not('current_wo_id', 'is', null)
        .order('qc_status', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      setActiveMachines(data || []);
    } catch (error: any) {
      console.error('Error loading machines:', error);
      toast.error('Failed to load active machines');
    } finally {
      setLoading(false);
    }
  };

  const loadTolerances = async () => {
    if (!selectedMachine?.work_orders) return;

    try {
      const woData = Array.isArray(selectedMachine.work_orders) 
        ? selectedMachine.work_orders[0] 
        : selectedMachine.work_orders;

      if (!woData) return;

      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', woData.item_code)
        .eq('operation', operation)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0) {
        const dimensionsObj = data[0].dimensions as Record<string, { name: string; min: number; max: number; unit?: string }>;
        const tolerancesArray = Object.entries(dimensionsObj).map(([id, dim]) => ({
          id,
          name: dim.name,
          min: dim.min,
          max: dim.max,
          unit: dim.unit || 'mm'
        }));
        
        setTolerances(tolerancesArray);
        
        const initialMeasurements: Record<string, string> = {};
        tolerancesArray.forEach(t => {
          initialMeasurements[t.id] = '';
        });
        setMeasurements(initialMeasurements);
      } else {
        toast.error('No tolerances defined for this item and operation');
        setTolerances([]);
        setMeasurements({});
      }
    } catch (error) {
      console.error('Error loading tolerances:', error);
      toast.error('Failed to load tolerances');
    }
  };

  const checkTolerance = (value: number, min: number, max: number): boolean => {
    return value >= min && value <= max;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedMachine) {
      toast.error('No machine selected');
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
        wo_id: selectedMachine.current_wo_id,
        machine_id: selectedMachine.id,
        operator_id: (await supabase.auth.getUser()).data.user?.id,
        operation: operation,
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

      toast.success(
        overallStatus === 'pass' 
          ? `✅ QC Check Passed - Next check in 1 hour` 
          : `⚠️ QC Check Failed - Deviation recorded`
      );
      
      resetForm();
      setSelectedMachine(null);
      loadActiveMachines();
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
    setOperation('A');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Hourly QC" subtitle="Machine-based quality checks" />
        <div className="max-w-7xl mx-auto p-4">
          <p className="text-center text-muted-foreground">Loading active machines...</p>
        </div>
      </div>
    );
  }

  if (selectedMachine) {
    const woData = Array.isArray(selectedMachine.work_orders) 
      ? selectedMachine.work_orders[0] 
      : selectedMachine.work_orders;

    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Hourly QC Entry" subtitle={`${selectedMachine.name} - ${woData?.display_id || ''}`} />
        
        <div className="max-w-4xl mx-auto p-4 space-y-6">
          <Button variant="outline" onClick={() => setSelectedMachine(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Machines
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>QC Entry Form</CardTitle>
                <Badge variant="outline">
                  {selectedMachine.name} • {woData?.item_code}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Operation</Label>
                  <Select value={operation} onValueChange={(v) => setOperation(v as typeof OPERATIONS[number])}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OPERATIONS.map(op => <SelectItem key={op} value={op}>Operation {op}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                {tolerances.length > 0 ? (
                  <>
                    <div className="space-y-4">
                      <Label className="text-base font-semibold">Dimensional Measurements</Label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {tolerances.map(tol => {
                          const measuredValue = parseFloat(measurements[tol.id] || '0');
                          const isOutOfTolerance = measurements[tol.id] && !checkTolerance(measuredValue, tol.min, tol.max);
                          return (
                            <div key={tol.id} className="space-y-2">
                              <Label>
                                {tol.name} 
                                <span className="text-xs text-muted-foreground ml-2">
                                  ({tol.min} - {tol.max} {tol.unit})
                                </span>
                              </Label>
                              <Input 
                                type="number" 
                                step="0.001" 
                                value={measurements[tol.id] || ''} 
                                onChange={(e) => setMeasurements({...measurements, [tol.id]: e.target.value})} 
                                className={
                                  isOutOfTolerance 
                                    ? 'border-destructive bg-destructive/10' 
                                    : measurements[tol.id] 
                                      ? 'border-success bg-success/10' 
                                      : ''
                                } 
                              />
                              {isOutOfTolerance && (
                                <div className="flex items-center gap-1 text-xs text-destructive">
                                  <AlertTriangle className="h-3 w-3" />
                                  Out of tolerance!
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Binary QC Checks</Label>
                        {!binaryChecksEnabled && (
                          <Button 
                            type="button" 
                            variant="outline" 
                            size="sm" 
                            onClick={() => setBinaryChecksEnabled(true)}
                          >
                            + Add Binary Checks
                          </Button>
                        )}
                      </div>
                      {binaryChecksEnabled && (
                        <div className="space-y-4 border rounded-lg p-4">
                          <div className="flex gap-4 flex-wrap">
                            {['thread', 'visual', 'plating', 'platingThickness'].map(check => (
                              <label key={check} className="flex items-center gap-2">
                                <input 
                                  type="checkbox" 
                                  checked={applicableChecks[check as keyof typeof applicableChecks]} 
                                  onChange={(e) => setApplicableChecks({...applicableChecks, [check]: e.target.checked})} 
                                />
                                <span className="text-sm capitalize">
                                  {check.replace(/([A-Z])/g, ' $1')}
                                </span>
                              </label>
                            ))}
                          </div>
                          {Object.entries(applicableChecks).filter(([_, v]) => v).map(([check]) => (
                            <div key={check}>
                              <Label className="capitalize">{check.replace(/([A-Z])/g, ' $1')}</Label>
                              <Select 
                                value={qcResults[check as keyof typeof qcResults]} 
                                onValueChange={(v) => setQcResults({...qcResults, [check]: v})}
                              >
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
                      <Textarea 
                        value={qcResults.remarks} 
                        onChange={(e) => setQcResults({...qcResults, remarks: e.target.value})} 
                        placeholder="Any observations..." 
                        rows={3} 
                      />
                    </div>

                    <Button type="submit" className="w-full" size="lg">
                      Submit QC Check
                    </Button>
                  </>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    No tolerances defined for this operation. Please set up tolerances first.
                  </div>
                )}
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Hourly QC Dashboard" subtitle="Monitor and record quality checks" />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {activeMachines.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium">No Active Machines</p>
              <p className="text-sm text-muted-foreground mt-2">
                No machines are currently running work orders
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-success">
                    {activeMachines.filter(m => m.qc_status === 'ok').length}
                  </div>
                  <div className="text-sm text-muted-foreground">On Track</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-warning">
                    {activeMachines.filter(m => m.qc_status === 'due').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Due Soon</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-destructive">
                    {activeMachines.filter(m => m.qc_status === 'overdue').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Overdue</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-2xl font-bold text-destructive">
                    {activeMachines.filter(m => m.qc_status === 'deviation').length}
                  </div>
                  <div className="text-sm text-muted-foreground">Deviations</div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {activeMachines.map(machine => (
                <MachineQCCard
                  key={machine.id}
                  machine={machine}
                  onClick={() => setSelectedMachine(machine)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HourlyQC;
