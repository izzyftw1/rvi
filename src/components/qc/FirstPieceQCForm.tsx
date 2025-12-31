import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, Zap } from "lucide-react";
import { InstrumentSelector } from "./InstrumentSelector";
import { ProductionContextDisplay } from "./ProductionContextDisplay";

interface DimensionTolerance {
  dimension_name: string;
  lower_limit: number;
  upper_limit: number;
  unit: string;
}

interface MeasurementData {
  dimension_name: string;
  samples: (number | null)[];
  remarks: string;
  lower_limit: number;
  upper_limit: number;
  unit: string;
}

interface FirstPieceQCFormProps {
  workOrderId: string;
  itemCode: string;
  qcRecordId: string;
  onComplete: () => void;
}

export const FirstPieceQCForm = ({ 
  workOrderId, 
  itemCode, 
  qcRecordId,
  onComplete 
}: FirstPieceQCFormProps) => {
  const [tolerances, setTolerances] = useState<DimensionTolerance[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, MeasurementData>>({});
  const [generalRemarks, setGeneralRemarks] = useState("");
  const [operation, setOperation] = useState<'A' | 'B' | 'C' | 'D'>('A');
  const [loading, setLoading] = useState(false);
  const [loadingTolerances, setLoadingTolerances] = useState(true);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const [instrumentValid, setInstrumentValid] = useState(false);

  useEffect(() => {
    loadTolerances();
    loadExistingMeasurements();
  }, [itemCode, qcRecordId]);

  const loadTolerances = async () => {
    try {
      setLoadingTolerances(true);
      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('dimensions')
        .eq('item_code', itemCode)
        .maybeSingle();

      if (error) throw error;

      if (data?.dimensions) {
        const dims = Object.entries(data.dimensions).map(([name, values]: [string, any]) => ({
          dimension_name: name,
          lower_limit: values.min,
          upper_limit: values.max,
          unit: values.unit || 'mm'
        }));
        setTolerances(dims);
        
        // Initialize measurements
        const initMeasurements: Record<string, MeasurementData> = {};
        dims.forEach(dim => {
          initMeasurements[dim.dimension_name] = {
            dimension_name: dim.dimension_name,
            samples: [null, null, null],
            remarks: '',
            lower_limit: dim.lower_limit,
            upper_limit: dim.upper_limit,
            unit: dim.unit
          };
        });
        setMeasurements(initMeasurements);
      }
    } catch (error) {
      console.error('Error loading tolerances:', error);
      toast.error('Failed to load dimension tolerances');
    } finally {
      setLoadingTolerances(false);
    }
  };

  const loadExistingMeasurements = async () => {
    try {
      const { data, error } = await supabase
        .from('qc_measurements')
        .select('*')
        .eq('qc_record_id', qcRecordId);

      if (error) throw error;

      if (data && data.length > 0) {
        const grouped: Record<string, MeasurementData> = {};
        data.forEach(m => {
          if (!grouped[m.dimension_name]) {
            grouped[m.dimension_name] = {
              dimension_name: m.dimension_name,
              samples: [null, null, null],
              remarks: m.remarks || '',
              lower_limit: m.lower_limit,
              upper_limit: m.upper_limit,
              unit: m.unit
            };
          }
          grouped[m.dimension_name].samples[m.sample_number - 1] = m.measured_value;
        });
        setMeasurements(prev => ({ ...prev, ...grouped }));
      }
    } catch (error) {
      console.error('Error loading measurements:', error);
    }
  };

  const updateSample = (dimName: string, sampleIdx: number, value: string) => {
    setMeasurements(prev => ({
      ...prev,
      [dimName]: {
        ...prev[dimName],
        samples: prev[dimName].samples.map((s, i) => 
          i === sampleIdx ? (value ? parseFloat(value) : null) : s
        )
      }
    }));
  };

  const updateRemarks = (dimName: string, value: string) => {
    setMeasurements(prev => ({
      ...prev,
      [dimName]: {
        ...prev[dimName],
        remarks: value
      }
    }));
  };

  const getStats = (samples: (number | null)[]) => {
    const valid = samples.filter(s => s !== null) as number[];
    if (valid.length === 0) return null;
    
    const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
    const min = Math.min(...valid);
    const max = Math.max(...valid);
    
    return { avg, min, max, count: valid.length };
  };

  const checkTolerance = (value: number, lower: number, upper: number) => {
    return value >= lower && value <= upper;
  };

  const isAllPass = () => {
    if (Object.keys(measurements).length === 0) return null;
    return Object.values(measurements).every(m => {
      const stats = getStats(m.samples);
      if (!stats) return false;
      return checkTolerance(stats.avg, m.lower_limit, m.upper_limit);
    });
  };

  const handleAutoPass = async () => {
    if (isAllPass() !== true) {
      toast.error('Cannot auto-pass: measurements are out of tolerance');
      return;
    }
    await handleSubmit('passed');
  };

  const handleAutoFail = async () => {
    if (isAllPass() !== false) {
      toast.error('Cannot auto-fail: all measurements are within tolerance');
      return;
    }
    await handleSubmit('failed');
  };

  const handleSubmit = async (action: 'passed' | 'failed' | 'manual_pass' | 'manual_fail') => {
    try {
      setLoading(true);

      // Check instrument is selected and valid
      if (!selectedInstrumentId) {
        toast.error('Please select a measurement instrument');
        return;
      }

      if (!instrumentValid) {
        toast.error('Cannot save QC record: Selected instrument has overdue calibration');
        return;
      }

      // Validate that all dimensions have at least one measurement
      const hasMeasurements = Object.values(measurements).every(m => 
        m.samples.some(s => s !== null)
      );

      if (!hasMeasurements) {
        toast.error('Please enter measurements for all dimensions');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Delete existing measurements for this QC record
      await supabase
        .from('qc_measurements')
        .delete()
        .eq('qc_record_id', qcRecordId);

      // Insert all measurements
      const measurementsToInsert = Object.values(measurements).flatMap(m => 
        m.samples.map((value, idx) => {
          if (value === null) return null;
          return {
            qc_record_id: qcRecordId,
            dimension_name: m.dimension_name,
            sample_number: idx + 1,
            measured_value: value,
            lower_limit: m.lower_limit,
            upper_limit: m.upper_limit,
            unit: m.unit,
            remarks: m.remarks,
            created_by: user?.id
          };
        }).filter(Boolean)
      );

      const { error: insertError } = await supabase
        .from('qc_measurements')
        .insert(measurementsToInsert);

      if (insertError) throw insertError;

      // Determine pass/fail based on action
      let result: 'pass' | 'fail';
      if (action === 'passed' || action === 'manual_pass') {
        result = 'pass';
      } else {
        result = 'fail';
      }

      // Update QC record
      const { error: updateError } = await supabase
        .from('qc_records')
        .update({
          result,
          approved_at: new Date().toISOString(),
          approved_by: user?.id,
          remarks: `Operation ${operation}: ${generalRemarks}`
        })
        .eq('id', qcRecordId);

      if (updateError) throw updateError;

      toast.success(
        result === 'pass'
          ? 'First Piece QC PASSED - Production unlocked' 
          : 'First Piece QC FAILED - Production locked'
      );
      
      onComplete();
    } catch (error: any) {
      console.error('Error saving QC inspection:', error);
      toast.error('Failed to save QC inspection: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (loadingTolerances) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading dimension tolerances...</div>
        </CardContent>
      </Card>
    );
  }

  if (tolerances.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No dimension tolerances defined for {itemCode}. Please set up tolerances first.
        </AlertDescription>
      </Alert>
    );
  }

  const allPass = isAllPass();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              First Piece QC Inspection
            </CardTitle>
            <CardDescription>
              Item: {itemCode} - Measure first piece before starting production
            </CardDescription>
          </div>
          {allPass !== null && (
            <Badge variant={allPass ? "default" : "destructive"} className="h-fit">
              {allPass ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Within Tolerance
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-1" />
                  Out of Tolerance
                </>
              )}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Production Context from Daily Production Log - Read Only */}
        <ProductionContextDisplay
          workOrderId={workOrderId}
          compact={false}
          title="Production Context (from Daily Log)"
          showRejectionDetails={false}
        />

        {/* Instrument Selection */}
        <InstrumentSelector
          value={selectedInstrumentId}
          onChange={(id, isValid) => {
            setSelectedInstrumentId(id);
            setInstrumentValid(isValid);
          }}
          required
        />

        {/* Operation Selector */}
        <div className="flex items-center gap-4">
          <Label className="font-semibold">Operation:</Label>
          <Select value={operation} onValueChange={(v: any) => setOperation(v)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Operation A</SelectItem>
              <SelectItem value="B">Operation B</SelectItem>
              <SelectItem value="C">Operation C</SelectItem>
              <SelectItem value="D">Operation D</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Dimension Measurements */}
        {tolerances.map((tol) => {
          const m = measurements[tol.dimension_name];
          if (!m) return null;
          
          const stats = getStats(m.samples);
          const isPass = stats ? checkTolerance(stats.avg, tol.lower_limit, tol.upper_limit) : null;

          return (
            <div key={tol.dimension_name} className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{tol.dimension_name}</Label>
                <div className="text-sm text-muted-foreground">
                  Spec: {tol.lower_limit} - {tol.upper_limit} {tol.unit}
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map(idx => (
                  <div key={idx}>
                    <Label className="text-xs text-center block mb-1">Sample {idx + 1}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={m.samples[idx] ?? ''}
                      onChange={(e) => updateSample(tol.dimension_name, idx, e.target.value)}
                      className={`text-center font-mono text-base h-12 min-w-[80px] ${
                        m.samples[idx] !== null 
                          ? checkTolerance(m.samples[idx]!, tol.lower_limit, tol.upper_limit)
                            ? 'border-success bg-success/10 border-2'
                            : 'border-destructive bg-destructive/10 border-2'
                          : 'border-input'
                      }`}
                    />
                  </div>
                ))}
              </div>

              {stats && (
                <div className="grid grid-cols-3 gap-4 text-sm p-3 bg-background rounded-lg border">
                  <div>
                    <span className="text-muted-foreground">Average:</span>
                    <span className={`ml-2 font-bold ${isPass ? 'text-success' : 'text-destructive'}`}>
                      {stats.avg.toFixed(3)} {tol.unit}
                      {isPass ? ' ✓' : ' ✗'}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Range:</span>
                    <span className="ml-2 font-semibold">{stats.min.toFixed(3)} - {stats.max.toFixed(3)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Deviation:</span>
                    <span className="ml-2 font-semibold">
                      {((stats.max - stats.min) / stats.avg * 100).toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Remarks</Label>
                <Input
                  value={m.remarks}
                  onChange={(e) => updateRemarks(tol.dimension_name, e.target.value)}
                  placeholder="Optional remarks"
                />
              </div>
            </div>
          );
        })}

        <div className="space-y-2">
          <Label>General Inspection Remarks</Label>
          <Textarea
            value={generalRemarks}
            onChange={(e) => setGeneralRemarks(e.target.value)}
            placeholder="Overall QC comments..."
            rows={3}
          />
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button
            onClick={handleAutoPass}
            disabled={loading || allPass !== true || !selectedInstrumentId || !instrumentValid}
            variant="default"
            className="bg-success hover:bg-success/90"
          >
            <Zap className="h-4 w-4 mr-2" />
            Auto-Pass
          </Button>
          <Button
            onClick={handleAutoFail}
            disabled={loading || allPass !== false || !selectedInstrumentId || !instrumentValid}
            variant="destructive"
          >
            <Zap className="h-4 w-4 mr-2" />
            Auto-Fail
          </Button>
          <Button
            onClick={() => handleSubmit('manual_pass')}
            disabled={loading || !selectedInstrumentId || !instrumentValid}
            variant="outline"
            className="border-success text-success hover:bg-success/10"
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Manual Pass
          </Button>
          <Button
            onClick={() => handleSubmit('manual_fail')}
            disabled={loading || !selectedInstrumentId || !instrumentValid}
            variant="outline"
            className="border-destructive text-destructive hover:bg-destructive/10"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Manual Fail
          </Button>
        </div>

        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            <strong>Auto-Pass/Fail:</strong> Only works when measurements are clearly within/outside tolerance.
            <br />
            <strong>Manual Pass/Fail:</strong> Use for edge cases requiring supervisor judgment.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};