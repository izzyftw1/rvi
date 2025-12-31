import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { 
  ClipboardCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  Settings2
} from "lucide-react";
import { InstrumentSelector } from "@/components/qc/InstrumentSelector";

interface DimensionTolerance {
  id: string;
  name: string;
  min: number;
  max: number;
  unit: string;
}

interface SampleMeasurement {
  sampleNumber: number;
  value: number | null;
  isWithinTolerance: boolean | null;
}

interface DimensionMeasurements {
  dimensionId: string;
  dimensionName: string;
  samples: SampleMeasurement[];
  remarks: string;
  min: number;
  max: number;
  unit: string;
  stats: {
    avg: number;
    min: number;
    max: number;
    count: number;
  } | null;
  isPass: boolean | null;
}

interface FinalQCInspectionFormProps {
  workOrderId: string;
  workOrderNumber: string;
  itemCode: string;
  customer: string;
  totalOKQty: number;
  onComplete: () => void;
  onCancel: () => void;
}

const DEFAULT_SAMPLE_SIZE = 10;

export const FinalQCInspectionForm = ({
  workOrderId,
  workOrderNumber,
  itemCode,
  customer,
  totalOKQty,
  onComplete,
  onCancel
}: FinalQCInspectionFormProps) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tolerances, setTolerances] = useState<DimensionTolerance[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, DimensionMeasurements>>({});
  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE_SIZE);
  const [generalRemarks, setGeneralRemarks] = useState("");
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const [instrumentValid, setInstrumentValid] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadTolerances();
  }, [itemCode]);

  useEffect(() => {
    // Recalculate stats whenever measurements change
    recalculateAllStats();
  }, [measurements]);

  const loadTolerances = async () => {
    try {
      setLoading(true);
      
      // Load tolerances for operation 'A' (or latest)
      const { data, error } = await supabase
        .from('dimension_tolerances')
        .select('*')
        .eq('item_code', itemCode)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) throw error;

      if (data && data.length > 0 && data[0].dimensions) {
        const dims = data[0].dimensions as Record<string, { name: string; min: number; max: number; unit?: string }>;
        const tolerancesArray = Object.entries(dims).map(([id, dim]) => ({
          id,
          name: dim.name,
          min: dim.min,
          max: dim.max,
          unit: dim.unit || 'mm'
        }));
        
        setTolerances(tolerancesArray);
        initializeMeasurements(tolerancesArray, sampleSize);
      } else {
        setTolerances([]);
      }
    } catch (error) {
      console.error('Error loading tolerances:', error);
      toast.error('Failed to load dimension tolerances');
    } finally {
      setLoading(false);
    }
  };

  const initializeMeasurements = (tols: DimensionTolerance[], numSamples: number) => {
    const init: Record<string, DimensionMeasurements> = {};
    tols.forEach(tol => {
      init[tol.id] = {
        dimensionId: tol.id,
        dimensionName: tol.name,
        samples: Array.from({ length: numSamples }, (_, i) => ({
          sampleNumber: i + 1,
          value: null,
          isWithinTolerance: null
        })),
        remarks: '',
        min: tol.min,
        max: tol.max,
        unit: tol.unit,
        stats: null,
        isPass: null
      };
    });
    setMeasurements(init);
  };

  const handleSampleSizeChange = (newSize: number) => {
    if (newSize < 1 || newSize > 20) return;
    setSampleSize(newSize);
    initializeMeasurements(tolerances, newSize);
  };

  const updateMeasurement = (dimensionId: string, sampleIndex: number, value: string) => {
    setMeasurements(prev => {
      const dim = prev[dimensionId];
      if (!dim) return prev;
      
      const numValue = value === '' ? null : parseFloat(value);
      const isWithinTolerance = numValue !== null ? (numValue >= dim.min && numValue <= dim.max) : null;
      
      const newSamples = [...dim.samples];
      newSamples[sampleIndex] = {
        ...newSamples[sampleIndex],
        value: numValue,
        isWithinTolerance
      };
      
      return {
        ...prev,
        [dimensionId]: {
          ...dim,
          samples: newSamples
        }
      };
    });
  };

  const updateDimensionRemarks = (dimensionId: string, remarks: string) => {
    setMeasurements(prev => ({
      ...prev,
      [dimensionId]: {
        ...prev[dimensionId],
        remarks
      }
    }));
  };

  const recalculateAllStats = () => {
    setMeasurements(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(dimId => {
        const dim = updated[dimId];
        const validValues = dim.samples
          .filter(s => s.value !== null)
          .map(s => s.value as number);
        
        if (validValues.length > 0) {
          const avg = validValues.reduce((a, b) => a + b, 0) / validValues.length;
          const min = Math.min(...validValues);
          const max = Math.max(...validValues);
          const isPass = avg >= dim.min && avg <= dim.max;
          
          updated[dimId] = {
            ...dim,
            stats: { avg, min, max, count: validValues.length },
            isPass
          };
        } else {
          updated[dimId] = {
            ...dim,
            stats: null,
            isPass: null
          };
        }
      });
      return updated;
    });
  };

  const getOverallResult = (): 'pass' | 'fail' | 'pending' => {
    const dims = Object.values(measurements);
    if (dims.length === 0) return 'pending';
    
    const hasAllMeasurements = dims.every(d => d.stats !== null && d.stats.count > 0);
    if (!hasAllMeasurements) return 'pending';
    
    const allPass = dims.every(d => d.isPass === true);
    return allPass ? 'pass' : 'fail';
  };

  const handleSubmit = async () => {
    const result = getOverallResult();
    
    if (result === 'pending') {
      toast.error('Please enter measurements for all dimensions');
      return;
    }

    if (!selectedInstrumentId) {
      toast.error('Please select a measurement instrument');
      return;
    }

    if (!instrumentValid) {
      toast.error('Selected instrument has overdue calibration');
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Generate QC ID
      const qcId = `FQC-${Date.now().toString(36).toUpperCase()}`;

      // Check for existing QC record (to avoid duplicate key violation)
      const { data: existingRecord } = await supabase
        .from('qc_records')
        .select('id')
        .eq('wo_id', workOrderId)
        .eq('qc_type', 'final')
        .is('batch_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let qcRecord: { id: string };

      if (existingRecord) {
        // Update existing record
        const { data: updatedRecord, error: updateError } = await supabase
          .from('qc_records')
          .update({
            qc_id: qcId,
            result: result === 'pass' ? 'pass' : 'fail',
            inspected_quantity: sampleSize,
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
            remarks: generalRemarks,
            instrument_id: selectedInstrumentId,
            qc_date_time: new Date().toISOString()
          })
          .eq('id', existingRecord.id)
          .select()
          .single();

        if (updateError) throw updateError;
        qcRecord = updatedRecord;
      } else {
        // Create new QC record
        const { data: newRecord, error: insertError } = await supabase
          .from('qc_records')
          .insert([{
            wo_id: workOrderId,
            qc_id: qcId,
            qc_type: 'final' as const,
            result: result === 'pass' ? 'pass' : 'fail',
            inspected_quantity: sampleSize,
            approved_by: user?.id,
            approved_at: new Date().toISOString(),
            remarks: generalRemarks,
            instrument_id: selectedInstrumentId,
            qc_date_time: new Date().toISOString()
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        qcRecord = newRecord;
      }

      // Insert all measurements
      // NOTE: is_within_tolerance is a GENERATED ALWAYS column - do NOT include it
      const measurementsToInsert = Object.values(measurements).flatMap(dim =>
        dim.samples
          .filter(s => s.value !== null)
          .map(s => ({
            qc_record_id: qcRecord.id,
            dimension_name: dim.dimensionName,
            sample_number: s.sampleNumber,
            measured_value: s.value!,
            lower_limit: dim.min,
            upper_limit: dim.max,
            unit: dim.unit,
            instrument_id: selectedInstrumentId,
            remarks: dim.remarks || null
          }))
      );

      if (measurementsToInsert.length > 0) {
        const { error: measError } = await supabase
          .from('qc_measurements')
          .insert(measurementsToInsert);

        if (measError) throw measError;
      }

      // Update work order Final QC status
      const { error: woError } = await supabase
        .from('work_orders')
        .update({
          qc_final_status: result === 'pass' ? 'passed' : 'failed',
          qc_final_approved_at: new Date().toISOString(),
          qc_final_approved_by: user?.id,
          qc_final_remarks: generalRemarks,
          final_qc_result: result === 'pass' ? 'pass' : 'fail'
        })
        .eq('id', workOrderId);

      if (woError) throw woError;

      toast.success(
        result === 'pass' 
          ? `✅ Final QC Passed - ${sampleSize} samples inspected`
          : `⚠️ Final QC Failed - Deviations recorded`
      );
      
      onComplete();
    } catch (error: any) {
      console.error('Error submitting Final QC:', error);
      toast.error('Failed to submit Final QC: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const overallResult = getOverallResult();

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (tolerances.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No dimension tolerances defined for item code "{itemCode}". 
              Please configure tolerances in Tolerance Setup before performing Final QC.
            </AlertDescription>
          </Alert>
          <div className="mt-4 flex gap-2">
            <Button variant="outline" onClick={onCancel}>Cancel</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              Final QC Dimensional Inspection
            </CardTitle>
            <CardDescription>
              {workOrderNumber} • {customer} • {itemCode}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              variant={overallResult === 'pass' ? 'default' : overallResult === 'fail' ? 'destructive' : 'outline'}
              className={overallResult === 'pass' ? 'bg-green-600' : ''}
            >
              {overallResult === 'pass' && <CheckCircle2 className="h-3 w-3 mr-1" />}
              {overallResult === 'fail' && <XCircle className="h-3 w-3 mr-1" />}
              {overallResult === 'pending' ? 'Pending' : overallResult === 'pass' ? 'All Pass' : 'Failed'}
            </Badge>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowSettings(!showSettings)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-4 border">
            <h4 className="font-medium text-sm">Inspection Settings</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sampleSize">Sample Size (pcs)</Label>
                <Input
                  id="sampleSize"
                  type="number"
                  min={1}
                  max={20}
                  value={sampleSize}
                  onChange={(e) => handleSampleSizeChange(parseInt(e.target.value) || DEFAULT_SAMPLE_SIZE)}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default: 10 pcs (max 20)
                </p>
              </div>
              <div>
                <Label>Available OK Qty</Label>
                <div className="text-2xl font-bold text-green-600">
                  {totalOKQty.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Instrument Selection */}
        <InstrumentSelector
          value={selectedInstrumentId}
          onChange={(id, isValid) => {
            setSelectedInstrumentId(id);
            setInstrumentValid(isValid);
          }}
          required
        />

        {/* Dimension Measurements */}
        <div className="space-y-4">
          <h4 className="font-medium flex items-center gap-2">
            Dimensional Measurements
            <Badge variant="secondary">{sampleSize} samples per dimension</Badge>
          </h4>

          {tolerances.map(tol => {
            const dim = measurements[tol.id];
            if (!dim) return null;

            return (
              <div key={tol.id} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-semibold">{tol.name}</Label>
                    {dim.isPass !== null && (
                      dim.isPass 
                        ? <CheckCircle2 className="h-4 w-4 text-green-600" />
                        : <XCircle className="h-4 w-4 text-destructive" />
                    )}
                  </div>
                  <Badge variant="outline" className="font-mono">
                    {tol.min} - {tol.max} {tol.unit}
                  </Badge>
                </div>

                {/* Sample Inputs - Grid - Larger boxes for visibility */}
                <div className="grid grid-cols-5 md:grid-cols-10 gap-3">
                  {dim.samples.map((sample, idx) => (
                    <div key={idx} className="space-y-1">
                      <Label className="text-xs text-muted-foreground text-center block">#{idx + 1}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="-"
                        value={sample.value ?? ''}
                        onChange={(e) => updateMeasurement(tol.id, idx, e.target.value)}
                        className={`text-center font-mono text-base h-12 w-full min-w-[70px] px-1 ${
                          sample.isWithinTolerance === true 
                            ? 'border-green-500 bg-green-50 dark:bg-green-900/20 border-2' 
                            : sample.isWithinTolerance === false 
                              ? 'border-destructive bg-red-50 dark:bg-red-900/20 border-2' 
                              : 'border-input'
                        }`}
                      />
                    </div>
                  ))}
                </div>

                {/* Statistics */}
                {dim.stats && (
                  <div className="grid grid-cols-4 gap-4 p-3 bg-muted/50 rounded-lg text-sm">
                    <div>
                      <span className="text-muted-foreground">Avg:</span>
                      <span className={`ml-2 font-bold ${dim.isPass ? 'text-green-600' : 'text-destructive'}`}>
                        {dim.stats.avg.toFixed(3)} {tol.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Min:</span>
                      <span className="ml-2 font-semibold">{dim.stats.min.toFixed(3)} {tol.unit}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Max:</span>
                      <span className="ml-2 font-semibold">{dim.stats.max.toFixed(3)} {tol.unit}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Count:</span>
                      <span className="ml-2 font-semibold">{dim.stats.count}/{sampleSize}</span>
                    </div>
                  </div>
                )}

                {/* Dimension Remarks */}
                <Input
                  placeholder="Remarks for this dimension (optional)"
                  value={dim.remarks}
                  onChange={(e) => updateDimensionRemarks(tol.id, e.target.value)}
                  className="text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* General Remarks */}
        <div className="space-y-2">
          <Label>General Inspection Remarks</Label>
          <Textarea
            value={generalRemarks}
            onChange={(e) => setGeneralRemarks(e.target.value)}
            placeholder="Overall observations, notes, or recommendations..."
            rows={3}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onCancel} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || overallResult === 'pending' || !selectedInstrumentId || !instrumentValid}
            className="flex-1"
            variant={overallResult === 'fail' ? 'destructive' : 'default'}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {overallResult === 'fail' 
              ? 'Submit Final QC - FAIL' 
              : 'Submit Final QC - PASS'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
