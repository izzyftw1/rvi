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
  Settings2,
  Package
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

interface DispatchQCInspectionFormProps {
  workOrderId: string;
  workOrderNumber: string;
  itemCode: string;
  customer: string;
  totalOKQty: number;
  onComplete: () => void;
  onCancel: () => void;
}

const DEFAULT_SAMPLE_SIZE = 10;

export const DispatchQCInspectionForm = ({
  workOrderId,
  workOrderNumber,
  itemCode,
  customer,
  totalOKQty,
  onComplete,
  onCancel
}: DispatchQCInspectionFormProps) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [tolerances, setTolerances] = useState<DimensionTolerance[]>([]);
  const [measurements, setMeasurements] = useState<Record<string, DimensionMeasurements>>({});
  const [sampleSize, setSampleSize] = useState(DEFAULT_SAMPLE_SIZE);
  const [generalRemarks, setGeneralRemarks] = useState("");
  const [selectedInstrumentId, setSelectedInstrumentId] = useState<string | null>(null);
  const [instrumentValid, setInstrumentValid] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  
  // QUANTITY-BASED: Approved and rejected quantities (mandatory)
  const [approvedQuantity, setApprovedQuantity] = useState<number>(0);
  const [rejectedQuantity, setRejectedQuantity] = useState<number>(0);
  const [existingApprovedQty, setExistingApprovedQty] = useState<number>(0);

  useEffect(() => {
    loadTolerances();
    loadExistingDispatchQCQuantity();
  }, [itemCode, workOrderId]);

  useEffect(() => {
    // Recalculate stats whenever measurements change
    recalculateAllStats();
  }, [measurements]);

  // Load existing dispatch QC approved quantity to calculate remaining available
  // Only count approved qty - rejected pieces at Dispatch QC don't reduce the eligible pool
  // because production rejections are ALREADY excluded from totalOKQty
  const loadExistingDispatchQCQuantity = async () => {
    try {
      const { data, error } = await supabase
        .from('dispatch_qc_batches')
        .select('qc_approved_quantity, consumed_quantity')
        .eq('work_order_id', workOrderId);

      if (error) throw error;
      
      // Only count approved quantities (pieces that moved forward to packing)
      // Rejected pieces at Dispatch QC are scrapped - they don't reduce the eligible pool
      // because totalOKQty already excludes production rejections
      const totalApproved = (data || []).reduce((sum, b) => sum + (b.qc_approved_quantity || 0), 0);
      setExistingApprovedQty(totalApproved);
    } catch (error) {
      console.error('Error loading existing dispatch QC quantity:', error);
    }
  };

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

    // QUANTITY VALIDATION: Approved quantity is mandatory and must be > 0
    if (approvedQuantity <= 0) {
      toast.error('Approved quantity must be greater than 0');
      return;
    }

    // Validate total doesn't exceed available quantity
    const remainingQty = totalOKQty - existingApprovedQty;
    if (approvedQuantity + rejectedQuantity > remainingQty) {
      toast.error(`Total quantity (${approvedQuantity + rejectedQuantity}) exceeds remaining available (${remainingQty})`);
      return;
    }

    try {
      setSubmitting(true);
      const { data: { user } } = await supabase.auth.getUser();

      // Generate unique batch ID
      const qcBatchId = `DQC-${Date.now().toString(36).toUpperCase()}`;

      // CRITICAL: Create dispatch_qc_batches record (NOT updating work_orders.final_qc_result)
      const { data: dispatchQCBatch, error: dqcError } = await supabase
        .from('dispatch_qc_batches')
        .insert([{
          work_order_id: workOrderId,
          qc_batch_id: qcBatchId,
          qc_approved_quantity: approvedQuantity,
          rejected_quantity: rejectedQuantity,
          approved_by: user?.id,
          remarks: generalRemarks || null,
          status: 'approved'
        }])
        .select()
        .single();

      if (dqcError) throw dqcError;

      // Generate QC ID for qc_records
      const qcId = `DQC-${Date.now().toString(36).toUpperCase()}`;

      // Create QC record for dimensional inspection audit trail
      const { data: qcRecord, error: qcError } = await supabase
        .from('qc_records')
        .insert([{
          wo_id: workOrderId,
          qc_id: qcId,
          qc_type: 'final' as const,
          result: result === 'pass' ? 'pass' : 'fail',
          inspected_quantity: sampleSize,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          remarks: `Dispatch QC: ${approvedQuantity} approved, ${rejectedQuantity} rejected. ${generalRemarks}`,
          instrument_id: selectedInstrumentId,
          qc_date_time: new Date().toISOString()
        }])
        .select()
        .single();

      if (qcError) throw qcError;

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

      // NOTE: We intentionally do NOT update work_orders.final_qc_result anymore
      // The workflow is now quantity-based via dispatch_qc_batches

      toast.success(
        `✅ Dispatch QC Complete - ${approvedQuantity.toLocaleString()} pcs approved, ${rejectedQuantity} rejected`
      );
      
      onComplete();
    } catch (error: any) {
      console.error('Error submitting Dispatch QC:', error);
      toast.error('Failed to submit Dispatch QC: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate remaining available quantity
  const remainingQty = Math.max(0, totalOKQty - existingApprovedQty);
  const isQuantityValid = approvedQuantity > 0 && (approvedQuantity + rejectedQuantity) <= remainingQty;

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
              Dispatch QC Dimensional Inspection
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

        {/* QUANTITY-BASED: Approved/Rejected Quantity (MANDATORY) */}
        <div className="p-4 border-2 border-primary/30 rounded-lg bg-primary/5 space-y-4">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <h4 className="font-semibold text-primary">Dispatch QC Quantities (Required)</h4>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-background rounded-lg">
              <Label className="text-xs text-muted-foreground">Available for QC</Label>
              <div className="text-2xl font-bold text-foreground">{remainingQty.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                (Total OK: {totalOKQty.toLocaleString()} - Already QC'd: {existingApprovedQty.toLocaleString()})
              </p>
            </div>
            
            <div>
              <Label htmlFor="approved-qty" className="text-green-700 dark:text-green-400 font-medium">
                Approved Quantity *
              </Label>
              <Input
                id="approved-qty"
                type="number"
                min={1}
                max={remainingQty}
                value={approvedQuantity || ''}
                onChange={(e) => setApprovedQuantity(parseInt(e.target.value) || 0)}
                className="border-green-500 focus:ring-green-500"
                placeholder="Enter approved qty"
              />
              <p className="text-xs text-muted-foreground mt-1">Must be &gt; 0</p>
            </div>
            
            <div>
              <Label htmlFor="rejected-qty" className="text-red-700 dark:text-red-400 font-medium">
                Rejected Quantity
              </Label>
              <Input
                id="rejected-qty"
                type="number"
                min={0}
                max={remainingQty - approvedQuantity}
                value={rejectedQuantity || ''}
                onChange={(e) => setRejectedQuantity(parseInt(e.target.value) || 0)}
                className="border-red-500 focus:ring-red-500"
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground mt-1">Default: 0</p>
            </div>
          </div>
          
          {(approvedQuantity + rejectedQuantity) > remainingQty && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Total ({approvedQuantity + rejectedQuantity}) exceeds available quantity ({remainingQty})
              </AlertDescription>
            </Alert>
          )}
          
          {approvedQuantity > 0 && (approvedQuantity + rejectedQuantity) <= remainingQty && (
            <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
              This will approve <strong className="text-green-600">{approvedQuantity.toLocaleString()}</strong> pcs 
              for packing{rejectedQuantity > 0 && <> and record <strong className="text-red-600">{rejectedQuantity.toLocaleString()}</strong> rejected</>}.
            </div>
          )}
        </div>

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

                {/* Sample Inputs - Responsive flex wrap layout */}
                <div className="flex flex-wrap gap-2">
                  {dim.samples.map((sample, idx) => (
                    <div key={idx} className="flex flex-col items-center w-[52px]">
                      <Label className="text-xs text-muted-foreground text-center">#{idx + 1}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        placeholder="-"
                        value={sample.value ?? ''}
                        onChange={(e) => updateMeasurement(tol.id, idx, e.target.value)}
                        className={`text-center font-mono text-sm h-10 w-[52px] px-1 ${
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
            disabled={submitting || overallResult === 'pending' || !selectedInstrumentId || !instrumentValid || !isQuantityValid}
            className="flex-1"
            variant={overallResult === 'fail' ? 'destructive' : 'default'}
          >
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Submit Dispatch QC - {approvedQuantity.toLocaleString()} pcs Approved
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
