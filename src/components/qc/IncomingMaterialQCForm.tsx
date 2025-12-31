import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  CheckCircle2, XCircle, Loader2, AlertTriangle, 
  Upload, FileText, Package, Beaker 
} from "lucide-react";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { NCRFormDialog } from "@/components/ncr/NCRFormDialog";

interface MaterialLot {
  id: string;
  lot_id: string;
  heat_no: string;
  alloy: string;
  supplier: string;
  material_size_mm: string | null;
  net_weight: number;
  qc_status: string | null;
  mtc_file: string | null;
}

interface IncomingMaterialQCFormProps {
  workOrderId: string;
  workOrder: any;
  onComplete: () => void;
}

type QCResult = 'pass' | 'fail' | 'pending';

export function IncomingMaterialQCForm({ workOrderId, workOrder, onComplete }: IncomingMaterialQCFormProps) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [materialLots, setMaterialLots] = useState<MaterialLot[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [result, setResult] = useState<QCResult>('pass');
  const [isHold, setIsHold] = useState(false); // Use pending with hold flag
  const [remarks, setRemarks] = useState("");
  const [coaFile, setCoaFile] = useState<File | null>(null);
  const [coaUrl, setCoaUrl] = useState("");
  const [showNCRDialog, setShowNCRDialog] = useState(false);
  const [createdQCRecordId, setCreatedQCRecordId] = useState<string | null>(null);

  const selectedLot = materialLots.find(l => l.id === selectedLotId);

  useEffect(() => {
    loadMaterialLots();
  }, [workOrderId]);

  const loadMaterialLots = async () => {
    setLoading(true);
    try {
      // Get material issues for this work order
      const { data: issues } = await supabase
        .from("wo_material_issues")
        .select("lot_id")
        .eq("wo_id", workOrderId);

      if (issues && issues.length > 0) {
        const lotIds = issues.map(i => i.lot_id);
        const { data: lots, error } = await supabase
          .from("material_lots")
          .select("id, lot_id, heat_no, alloy, supplier, material_size_mm, net_weight, qc_status, mtc_file")
          .in("id", lotIds);

        if (error) throw error;
        setMaterialLots(lots || []);
        
        // Auto-select first pending lot
        const pendingLot = lots?.find(l => l.qc_status === 'pending' || !l.qc_status);
        if (pendingLot) {
          setSelectedLotId(pendingLot.id);
        }
      } else {
        // Fallback: get lots matching the BOM alloy
        const bom = workOrder.bom as any;
        const requiredAlloy = bom?.material_alloy || bom?.alloy;
        if (requiredAlloy) {
          const { data: lots } = await supabase
            .from("material_lots")
            .select("id, lot_id, heat_no, alloy, supplier, material_size_mm, net_weight, qc_status, mtc_file")
            .eq("alloy", requiredAlloy)
            .limit(10);

          setMaterialLots(lots || []);
        }
      }
    } catch (error) {
      console.error("Error loading material lots:", error);
      toast.error("Failed to load material lots");
    } finally {
      setLoading(false);
    }
  };

  const handleCoaUpload = async () => {
    if (!coaFile) return null;

    const fileExt = coaFile.name.split('.').pop();
    const fileName = `${workOrderId}/${selectedLotId}_coa_${Date.now()}.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('qc-documents')
      .upload(fileName, coaFile);

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('qc-documents')
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  };

  const handleResultChange = (value: string) => {
    if (value === 'hold') {
      setResult('pending');
      setIsHold(true);
    } else {
      setResult(value as QCResult);
      setIsHold(false);
    }
  };

  const getDisplayResult = () => {
    if (isHold) return 'hold';
    return result;
  };

  const handleSubmit = async () => {
    if (!selectedLotId || !selectedLot) {
      toast.error("Please select a material lot");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Upload COA if provided
      let supplierCoaUrl = coaUrl;
      if (coaFile) {
        supplierCoaUrl = await handleCoaUpload() || "";
      }

      // Generate QC ID
      const qcId = `IQC-${Date.now().toString(36).toUpperCase()}`;

      // Check for existing QC record to avoid duplicate key violation
      const { data: existingRecord } = await supabase
        .from('qc_records')
        .select('id')
        .eq('wo_id', workOrderId)
        .eq('qc_type', 'incoming')
        .is('batch_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let qcRecord: { id: string };

      const qcPayload = {
        qc_id: qcId,
        result: result,
        material_lot_id: selectedLotId,
        material_grade: selectedLot.alloy,
        heat_no: selectedLot.heat_no,
        supplier_coa_url: supplierCoaUrl,
        remarks: isHold ? `[HOLD] ${remarks}` : remarks,
        approved_by: user?.id,
        approved_at: new Date().toISOString(),
        qc_date_time: new Date().toISOString(),
      };

      if (existingRecord) {
        // Update existing record
        const { data: updatedRecord, error: updateError } = await supabase
          .from('qc_records')
          .update(qcPayload)
          .eq('id', existingRecord.id)
          .select()
          .single();

        if (updateError) throw updateError;
        qcRecord = updatedRecord;
      } else {
        // Create new QC record with material traceability
        const { data: newRecord, error: insertError } = await supabase
          .from('qc_records')
          .insert([{
            ...qcPayload,
            wo_id: workOrderId,
            qc_type: 'incoming' as const,
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        qcRecord = newRecord;
      }
      
      setCreatedQCRecordId(qcRecord.id);

      // Update material lot QC status (store 'hold' as text for display)
      const lotStatus = isHold ? 'hold' : result;
      const { error: lotError } = await supabase
        .from('material_lots')
        .update({ qc_status: lotStatus })
        .eq('id', selectedLotId);

      if (lotError) throw lotError;

      // Update work order material QC status
      const { error: woError } = await supabase
        .from('work_orders')
        .update({
          qc_material_passed: result === 'pass',
          qc_material_status: isHold ? 'hold' : result,
          qc_material_approved_by: user?.id,
          qc_material_approved_at: new Date().toISOString(),
        })
        .eq('id', workOrderId);

      if (woError) throw woError;

      const displayResult = getDisplayResult();
      toast.success(`Material QC ${displayResult.toUpperCase()} recorded`);

      // If failed or hold, prompt for NCR
      if (result === 'fail' || isHold) {
        setShowNCRDialog(true);
      } else {
        onComplete();
      }
    } catch (error: any) {
      console.error("Error submitting IQC:", error);
      toast.error(error.message || 'Failed to submit QC result');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'pass':
      case 'passed':
        return <Badge className="bg-emerald-500">Passed</Badge>;
      case 'fail':
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'hold':
        return <Badge className="bg-amber-500">Hold</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const displayResult = getDisplayResult();

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Incoming Material QC
          </CardTitle>
          <CardDescription>
            Inspect and record quality status for material lots with full traceability
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Material Lot Selection */}
          <div className="space-y-2">
            <Label>Select Material Lot</Label>
            {materialLots.length > 0 ? (
              <Select value={selectedLotId} onValueChange={setSelectedLotId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a material lot..." />
                </SelectTrigger>
                <SelectContent>
                  {materialLots.map((lot) => (
                    <SelectItem key={lot.id} value={lot.id}>
                      {lot.lot_id} | Heat: {lot.heat_no} ({lot.qc_status || 'pending'})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No material lots found for this work order.</p>
            )}
          </div>

          {/* Selected Lot Details - Read Only */}
          {selectedLot && (
            <Card className="bg-muted/30">
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <Label className="text-xs text-muted-foreground">Material Grade</Label>
                    <p className="font-medium flex items-center gap-1">
                      <Beaker className="h-3.5 w-3.5" />
                      {selectedLot.alloy}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Heat / Lot Number</Label>
                    <p className="font-medium">{selectedLot.heat_no}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Supplier</Label>
                    <p className="font-medium">{selectedLot.supplier}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Size (mm)</Label>
                    <p className="font-medium">{selectedLot.material_size_mm || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Net Weight</Label>
                    <p className="font-medium">{selectedLot.net_weight.toFixed(2)} kg</p>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Current QC Status</Label>
                    <p>{getStatusBadge(selectedLot.qc_status)}</p>
                  </div>
                  {selectedLot.mtc_file && (
                    <div className="col-span-2">
                      <Label className="text-xs text-muted-foreground">MTC Document</Label>
                      <a 
                        href={selectedLot.mtc_file} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline flex items-center gap-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View MTC
                      </a>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* QC Result */}
          <div className="space-y-3">
            <Label>Inspection Result</Label>
            <RadioGroup value={displayResult} onValueChange={handleResultChange}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="pass" id="pass" />
                <Label htmlFor="pass" className="flex items-center gap-2 cursor-pointer">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Pass - Material meets specifications
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="fail" id="fail" />
                <Label htmlFor="fail" className="flex items-center gap-2 cursor-pointer">
                  <XCircle className="w-4 h-4 text-destructive" />
                  Fail - Material does not meet specifications
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="hold" id="hold" />
                <Label htmlFor="hold" className="flex items-center gap-2 cursor-pointer">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Hold - Pending further investigation
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Supplier COA Upload */}
          <div className="space-y-2">
            <Label>Supplier COA (Certificate of Analysis)</Label>
            <div className="flex gap-2">
              <Input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setCoaFile(e.target.files?.[0] || null)}
                className="flex-1"
              />
              {coaFile && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Upload className="h-3 w-3" />
                  {coaFile.name}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Or enter URL directly:
            </p>
            <Input
              placeholder="https://..."
              value={coaUrl}
              onChange={(e) => setCoaUrl(e.target.value)}
              disabled={!!coaFile}
            />
          </div>

          {/* Remarks */}
          <div className="space-y-2">
            <Label>Inspection Remarks</Label>
            <Textarea
              placeholder="Enter inspection observations, measurements, or notes..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
            />
          </div>

          {/* Warning for Failed/Hold */}
          {(result === 'fail' || isHold) && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">NCR Required</p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  After submitting, you will be prompted to create a Non-Conformance Report for this material.
                </p>
              </div>
            </div>
          )}

          {/* Submit */}
          <Button 
            onClick={handleSubmit} 
            disabled={saving || !selectedLotId}
            className="w-full"
            variant={result === 'pass' && !isHold ? 'default' : result === 'fail' ? 'destructive' : 'outline'}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Submit IQC Result: {displayResult.toUpperCase()}
          </Button>
        </CardContent>
      </Card>

      {/* NCR Dialog for Failed/Hold */}
      <NCRFormDialog
        open={showNCRDialog}
        onOpenChange={setShowNCRDialog}
        onSuccess={() => {
          setShowNCRDialog(false);
          onComplete();
        }}
        prefillData={{
          workOrderId,
          qcRecordId: createdQCRecordId || undefined,
          issueDescription: `Material QC ${displayResult.toUpperCase()} - ${selectedLot?.alloy} (Heat: ${selectedLot?.heat_no})`,
          sourceReference: `IQC - Material Lot: ${selectedLot?.lot_id}`,
        }}
      />
    </>
  );
}
