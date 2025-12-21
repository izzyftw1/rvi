import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { ClipboardCheck, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { InstrumentSelector } from "@/components/qc/InstrumentSelector";

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

interface QCInspectionFormProps {
  workOrderId: string;
  itemCode: string;
  revision: string;
  qcRecordId: string;
  qcType: string;
  onComplete: () => void;
}

export const QCInspectionForm = ({ 
  workOrderId, 
  itemCode, 
  revision, 
  qcRecordId,
  qcType,
  onComplete 
}: QCInspectionFormProps) => {
  const [tolerances, setTolerances] = useState<DimensionTolerance[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, MeasurementData>>({});
  const [generalRemarks, setGeneralRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTolerances, setLoadingTolerances] = useState(true);
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const [instrumentValid, setInstrumentValid] = useState(false);

  useEffect(() => {
    loadTolerances();
    loadExistingMeasurements();
  }, [itemCode, revision, qcRecordId]);

  const loadTolerances = async () => {
    try {
      setLoadingTolerances(true);
      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('dimensions')
        .eq('item_code', itemCode)
        .eq('revision', revision)
        .single();

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
            samples: [null, null, null, null, null],
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
              samples: [null, null, null, null, null],
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
    return Object.values(measurements).every(m => {
      const stats = getStats(m.samples);
      if (!stats) return false;
      return checkTolerance(stats.avg, m.lower_limit, m.upper_limit);
    });
  };

  const handleSubmit = async () => {
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
            instrument_id: selectedInstrumentId
          };
        }).filter(Boolean)
      );

      const { error: insertError } = await supabase
        .from('qc_measurements')
        .insert(measurementsToInsert);

      if (insertError) throw insertError;

      // Determine pass/fail
      const allPass = isAllPass();
      const result = allPass ? 'pass' : 'fail';

      // Update QC record
      const { error: updateError } = await supabase
        .from('qc_records')
        .update({
          result,
          approved_at: new Date().toISOString(),
          approved_by: (await supabase.auth.getUser()).data.user?.id,
          remarks: generalRemarks,
          instrument_id: selectedInstrumentId
        })
        .eq('id', qcRecordId);

      if (updateError) throw updateError;

      toast.success(
        allPass 
          ? 'QC inspection passed - Production approved' 
          : 'QC inspection failed - Production locked'
      );
      
      onComplete();
    } catch (error) {
      console.error('Error saving QC inspection:', error);
      toast.error('Failed to save QC inspection');
    } finally {
      setLoading(false);
    }
  };

  if (loadingTolerances) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading tolerances...</div>
        </CardContent>
      </Card>
    );
  }

  if (tolerances.length === 0) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          No dimension tolerances defined for {itemCode} Rev {revision}. 
          Please set up tolerances first.
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
              {qcType.replace('_', ' ').toUpperCase()} Inspection
            </CardTitle>
            <CardDescription>
              Item: {itemCode} Rev {revision} - Enter measurements for up to 5 sample pieces
            </CardDescription>
          </div>
          {allPass !== undefined && (
            <Badge variant={allPass ? "default" : "destructive"} className="h-fit">
              {allPass ? (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  All Pass
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
        {/* Instrument Selection */}
        <InstrumentSelector
          value={selectedInstrumentId}
          onChange={(id, isValid) => {
            setSelectedInstrumentId(id);
            setInstrumentValid(isValid);
          }}
          required
        />

        {tolerances.map((tol) => {
          const m = measurements[tol.dimension_name];
          if (!m) return null;
          
          const stats = getStats(m.samples);
          const isPass = stats ? checkTolerance(stats.avg, tol.lower_limit, tol.upper_limit) : null;

          return (
            <div key={tol.dimension_name} className="space-y-3 p-4 border rounded-lg">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{tol.dimension_name}</Label>
                <div className="text-sm text-muted-foreground">
                  Tolerance: {tol.lower_limit} - {tol.upper_limit} {tol.unit}
                </div>
              </div>
              
              <div className="grid grid-cols-5 gap-2">
                {[0, 1, 2, 3, 4].map(idx => (
                  <div key={idx}>
                    <Label className="text-xs">Sample {idx + 1}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={m.samples[idx] ?? ''}
                      onChange={(e) => updateSample(tol.dimension_name, idx, e.target.value)}
                      className={
                        m.samples[idx] !== null 
                          ? checkTolerance(m.samples[idx]!, tol.lower_limit, tol.upper_limit)
                            ? 'border-success'
                            : 'border-destructive'
                          : ''
                      }
                    />
                  </div>
                ))}
              </div>

              {stats && (
                <div className="grid grid-cols-4 gap-4 text-sm p-2 bg-muted/50 rounded">
                  <div>
                    <span className="text-muted-foreground">Avg:</span>
                    <span className={`ml-2 font-semibold ${isPass ? 'text-success' : 'text-destructive'}`}>
                      {stats.avg.toFixed(2)} {tol.unit}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Min:</span>
                    <span className="ml-2 font-semibold">{stats.min.toFixed(2)} {tol.unit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Max:</span>
                    <span className="ml-2 font-semibold">{stats.max.toFixed(2)} {tol.unit}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Count:</span>
                    <span className="ml-2 font-semibold">{stats.count}</span>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-xs">Remarks</Label>
                <Input
                  value={m.remarks}
                  onChange={(e) => updateRemarks(tol.dimension_name, e.target.value)}
                  placeholder="Optional remarks for this dimension"
                />
              </div>
            </div>
          );
        })}

        <div className="space-y-2">
          <Label>General Remarks</Label>
          <Textarea
            value={generalRemarks}
            onChange={(e) => setGeneralRemarks(e.target.value)}
            placeholder="Overall inspection remarks..."
            rows={3}
          />
        </div>

        <div className="flex gap-3">
          <Button
            onClick={handleSubmit}
            disabled={loading || !selectedInstrumentId || !instrumentValid}
            className="flex-1"
            variant={allPass === false ? "destructive" : "default"}
          >
            {loading ? 'Saving...' : allPass === false ? 'Submit - Mark as Failed' : 'Submit QC Inspection'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
