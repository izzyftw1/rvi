import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { 
  ClipboardCheck, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  FileText,
  ArrowLeft,
  Package,
  Activity,
  Shield,
  Loader2,
  Plus
} from "lucide-react";
import { format } from "date-fns";
import { ProductionContextDisplay } from "@/components/qc/ProductionContextDisplay";
import { MaterialTraceabilityBadge } from "@/components/qc/MaterialTraceabilityBadge";
import { FinalDispatchReportGenerator } from "@/components/qc/FinalDispatchReportGenerator";
import { QCQuantityInput } from "@/components/qc/QCQuantityInput";

interface WorkOrderData {
  id: string;
  display_id: string | null;
  wo_number: string | null;
  customer: string;
  item_code: string;
  quantity: number;
  current_stage: string | null;
  status: string;
  quality_released: boolean;
  quality_released_at: string | null;
  sampling_plan_reference: string | null;
  final_qc_result: string | null;
  traceability_frozen: boolean;
  production_locked: boolean;
  qc_material_status: string | null;
  qc_first_piece_status: string | null;
  qc_final_status: string | null;
  qc_final_remarks: string | null;
  material_size_mm: string | null;
}

interface ProductionSummary {
  totalProduced: number;
  totalRejected: number;
  totalRework: number;
  totalOK: number;
  rejectionBreakdown: Record<string, number>;
}

interface QCRecordSummary {
  id: string;
  qc_type: string;
  result: string;
  approved_at: string | null;
  remarks: string | null;
  material_grade?: string;
  heat_no?: string;
}

const FinalQC = () => {
  const { woId } = useParams<{ woId: string }>();
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [workOrder, setWorkOrder] = useState<WorkOrderData | null>(null);
  const [productionSummary, setProductionSummary] = useState<ProductionSummary | null>(null);
  const [qcRecords, setQcRecords] = useState<QCRecordSummary[]>([]);
  const [hourlyQCCount, setHourlyQCCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showQCDialog, setShowQCDialog] = useState(false);
  const [samplingPlan, setSamplingPlan] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // QC Quantity state
  const [qcQuantity, setQcQuantity] = useState(0);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [qcResult, setQcResult] = useState<'pass' | 'fail'>('pass');

  const loadData = useCallback(async () => {
    if (!woId) return;
    
    setLoading(true);
    try {
      // Load work order
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select("*")
        .eq("id", woId)
        .single();

      if (woError) throw woError;
      setWorkOrder(woData as WorkOrderData);
      setSamplingPlan(woData.sampling_plan_reference || "");

      // Load production logs summary
      const { data: prodLogs, error: prodError } = await supabase
        .from("daily_production_logs")
        .select("*")
        .eq("wo_id", woId);

      if (prodError) throw prodError;

      // Calculate production summary
      let totalProduced = 0;
      let totalRejected = 0;
      let totalRework = 0;
      let totalOK = 0;
      const rejectionBreakdown: Record<string, number> = {};

      (prodLogs || []).forEach((log: any) => {
        totalProduced += log.actual_quantity || 0;
        totalRejected += log.total_rejection_quantity || 0;
        totalRework += log.rework_quantity || 0;
        totalOK += log.ok_quantity || 0;

        // Aggregate rejection reasons
        const rejectionFields = [
          { field: 'rejection_dimension', label: 'Dimension' },
          { field: 'rejection_scratch', label: 'Scratch' },
          { field: 'rejection_dent', label: 'Dent' },
          { field: 'rejection_tool_mark', label: 'Tool Mark' },
          { field: 'rejection_forging_mark', label: 'Forging Mark' },
          { field: 'rejection_lining', label: 'Lining' },
          { field: 'rejection_face_not_ok', label: 'Face Not OK' },
          { field: 'rejection_material_not_ok', label: 'Material Not OK' },
          { field: 'rejection_setting', label: 'Setting' },
          { field: 'rejection_previous_setup_fault', label: 'Previous Setup Fault' }
        ];

        rejectionFields.forEach(({ field, label }) => {
          const value = log[field] || 0;
          if (value > 0) {
            rejectionBreakdown[label] = (rejectionBreakdown[label] || 0) + value;
          }
        });
      });

      setProductionSummary({
        totalProduced,
        totalRejected,
        totalRework,
        totalOK,
        rejectionBreakdown
      });

      // Load QC records
      const { data: qcData, error: qcError } = await supabase
        .from("qc_records")
        .select("*")
        .eq("wo_id", woId);

      if (qcError) throw qcError;
      setQcRecords(qcData || []);

      // Load hourly QC count
      const { count } = await supabase
        .from("hourly_qc_checks")
        .select("*", { count: "exact", head: true })
        .eq("wo_id", woId);

      setHourlyQCCount(count || 0);

    } catch (error: any) {
      console.error("Error loading FQC data:", error);
      toast.error("Failed to load Final QC data");
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRelease = async () => {
    if (!woId || !workOrder) return;
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("work_orders")
        .update({
          quality_released: true,
          quality_released_at: new Date().toISOString(),
          quality_released_by: user?.id,
          sampling_plan_reference: samplingPlan,
          final_qc_result: 'passed',
          qc_final_status: 'passed',
          qc_final_remarks: remarks,
          current_stage: 'packing'
        })
        .eq("id", woId);

      if (error) throw error;

      toast.success("Work Order Quality Released! Production logs are now locked.");
      setShowReleaseDialog(false);
      loadData();
    } catch (error: any) {
      console.error("Error releasing WO:", error);
      toast.error("Failed to release work order: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!woId || !workOrder) return;
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("work_orders")
        .update({
          final_qc_result: 'blocked',
          qc_final_status: 'failed',
          qc_final_remarks: remarks,
          qc_final_approved_at: new Date().toISOString(),
          qc_final_approved_by: user?.id
        })
        .eq("id", woId);

      if (error) throw error;

      toast.warning("Work Order blocked at Final QC.");
      setShowBlockDialog(false);
      loadData();
    } catch (error: any) {
      console.error("Error blocking WO:", error);
      toast.error("Failed to block work order: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle quantity-based QC submission
  const handleQCSubmit = async () => {
    if (!woId || !selectedBatchId || qcQuantity <= 0) {
      toast.error('Please select a batch and enter a valid quantity');
      return;
    }
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate QC ID
      const qcId = `FQC-${Date.now().toString(36).toUpperCase()}`;
      
      // Create QC record with inspected_quantity
      const { error } = await supabase
        .from('qc_records')
        .insert([{
          wo_id: woId,
          batch_id: selectedBatchId,
          qc_id: qcId,
          qc_type: 'final' as const,
          result: qcResult,
          inspected_quantity: qcQuantity,
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          remarks: remarks,
          qc_date_time: new Date().toISOString()
        }]);

      if (error) throw error;

      // The sync_batch_qc_quantities trigger will automatically update
      // production_batches.qc_approved_qty or qc_rejected_qty

      toast.success(
        qcResult === 'pass'
          ? `${qcQuantity.toLocaleString()} pcs approved in Final QC`
          : `${qcQuantity.toLocaleString()} pcs rejected in Final QC`
      );
      
      setShowQCDialog(false);
      setQcQuantity(0);
      setSelectedBatchId(null);
      setRemarks('');
      loadData();
    } catch (error: any) {
      console.error('Error submitting QC:', error);
      toast.error('Failed to submit QC: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const getQCTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'incoming': 'Incoming Material QC (IQC)',
      'first_piece': 'First Piece QC',
      'in_process': 'In-Process QC',
      'final': 'Final QC'
    };
    return labels[type] || type;
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return <Badge variant="outline">Pending</Badge>;
    switch (result.toLowerCase()) {
      case 'passed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Passed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Failed</Badge>;
      case 'waived':
        return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Waived</Badge>;
      default:
        return <Badge variant="outline">{result}</Badge>;
    }
  };

  if (loading) {
    return (
      <PageContainer>
        <div className="space-y-4">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!workOrder) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">Work Order Not Found</h2>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/final-qc")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Final QC List
          </Button>
        </div>
      </PageContainer>
    );
  }

  const isReleased = workOrder.quality_released;
  const allQCPassed = qcRecords.every(r => ['pass', 'waived'].includes(r.result?.toLowerCase() || ''));
  const hasIQC = qcRecords.some(r => r.qc_type === 'incoming');
  const hasFirstPiece = qcRecords.some(r => r.qc_type === 'first_piece');
  const canRelease = allQCPassed && hasIQC && hasFirstPiece && hourlyQCCount > 0 && productionSummary && productionSummary.totalOK > 0;

  return (
    <PageContainer>
      <PageHeader
        title={`Final QC: ${workOrder.wo_number}`}
        description={`${workOrder.customer} - ${workOrder.item_code}`}
        icon={<ClipboardCheck className="h-6 w-6" />}
      >
        <Button variant="outline" onClick={() => navigate("/final-qc")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </PageHeader>

      {/* Release Status Banner */}
      {isReleased && (
        <Alert className="mb-6 border-green-500 bg-green-50 dark:bg-green-900/20">
          <Shield className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-300 flex items-center gap-2">
            <Lock className="h-4 w-4" />
            <span className="font-semibold">Quality Released</span> - 
            All production data is now frozen and read-only.
            {workOrder.quality_released_at && (
              <span className="text-sm ml-2">
                Released on {format(new Date(workOrder.quality_released_at), "dd MMM yyyy HH:mm")}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {workOrder.final_qc_result === 'blocked' && (
        <Alert className="mb-6 border-red-500 bg-red-50 dark:bg-red-900/20">
          <XCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800 dark:text-red-300">
            <span className="font-semibold">Work Order BLOCKED at Final QC</span>
            {workOrder.qc_final_remarks && <span className="block mt-1">Reason: {workOrder.qc_final_remarks}</span>}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Production Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Production Aggregates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Production Summary
              </CardTitle>
              <CardDescription>Aggregated production quantities from all logs</CardDescription>
            </CardHeader>
            <CardContent>
              {productionSummary ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg text-center">
                    <div className="text-3xl font-bold text-foreground">{productionSummary.totalProduced.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Produced</div>
                  </div>
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                    <div className="text-3xl font-bold text-green-600">{productionSummary.totalOK.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">OK Quantity</div>
                  </div>
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg text-center">
                    <div className="text-3xl font-bold text-red-600">{productionSummary.totalRejected.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Rejected</div>
                  </div>
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-center">
                    <div className="text-3xl font-bold text-amber-600">{productionSummary.totalRework.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Rework</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No production logs found for this work order.
                </div>
              )}

              {/* Rejection Breakdown */}
              {productionSummary && Object.keys(productionSummary.rejectionBreakdown).length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h4 className="text-sm font-medium mb-2">Rejection Breakdown</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(productionSummary.rejectionBreakdown).map(([reason, count]) => (
                      <Badge key={reason} variant="outline" className="gap-1">
                        {reason}: <span className="font-bold">{count}</span>
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* QC Records Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                QC Records Summary
              </CardTitle>
              <CardDescription>Linked IQC and IPQC records</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>QC Type</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {qcRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        No QC records found
                      </TableCell>
                    </TableRow>
                  ) : (
                    qcRecords.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell className="font-medium">
                          {getQCTypeLabel(record.qc_type)}
                          {record.qc_type === 'incoming' && record.material_grade && (
                            <div className="mt-1">
                              <MaterialTraceabilityBadge 
                                materialGrade={record.material_grade}
                                heatNo={record.heat_no}
                              />
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{getResultBadge(record.result)}</TableCell>
                        <TableCell>
                          {record.approved_at 
                            ? format(new Date(record.approved_at), "dd MMM yyyy HH:mm")
                            : "-"
                          }
                        </TableCell>
                        <TableCell className="max-w-xs truncate">{record.remarks || "-"}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Hourly QC Checks:</span>
                    <span className="ml-2 font-semibold">{hourlyQCCount}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IQC Status:</span>
                    <span className="ml-2">{hasIQC ? <CheckCircle2 className="h-4 w-4 inline text-green-600" /> : <XCircle className="h-4 w-4 inline text-red-600" />}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">First Piece:</span>
                    <span className="ml-2">{hasFirstPiece ? <CheckCircle2 className="h-4 w-4 inline text-green-600" /> : <XCircle className="h-4 w-4 inline text-red-600" />}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Production Context (Read-Only) */}
          <ProductionContextDisplay workOrderId={woId!} showRejectionDetails />
        </div>

        {/* Right Column - Final Inspection Actions */}
        <div className="space-y-6">
          {/* Quantity-Based QC Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Quantity-Based QC
              </CardTitle>
              <CardDescription>
                Inspect and approve/reject specific quantities from production batches
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!isReleased && workOrder.final_qc_result !== 'blocked' && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={() => setShowQCDialog(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Perform QC Inspection
                </Button>
              )}
              
              {isReleased && (
                <div className="text-center text-sm text-muted-foreground">
                  Quality released - no further QC inspections allowed
                </div>
              )}
            </CardContent>
          </Card>

          {/* Final Inspection Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5" />
                Final Release
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="sampling-plan">Sampling Plan Reference</Label>
                <Input
                  id="sampling-plan"
                  placeholder="e.g., AQL 2.5, Level II"
                  value={samplingPlan}
                  onChange={(e) => setSamplingPlan(e.target.value)}
                  disabled={isReleased}
                />
              </div>

              <div>
                <Label htmlFor="remarks">Inspection Remarks</Label>
                <Textarea
                  id="remarks"
                  placeholder="Enter inspection notes..."
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  disabled={isReleased}
                />
              </div>

              {!isReleased && workOrder.final_qc_result !== 'blocked' && (
                <div className="space-y-2 pt-4">
                  <Button
                    className="w-full"
                    onClick={() => setShowReleaseDialog(true)}
                    disabled={!canRelease}
                  >
                    <Unlock className="h-4 w-4 mr-2" />
                    Release for Dispatch
                  </Button>
                  
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowBlockDialog(true)}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Block Work Order
                  </Button>

                  {!canRelease && (
                    <p className="text-xs text-muted-foreground text-center">
                      All QC stages must pass, and production must have OK quantity to release.
                    </p>
                  )}
                </div>
              )}

              {isReleased && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg text-center">
                  <CheckCircle2 className="h-8 w-8 mx-auto text-green-600 mb-2" />
                  <p className="font-semibold text-green-800 dark:text-green-300">Quality Released</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Production data is frozen
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Report Generator */}
          {isReleased && (
            <FinalDispatchReportGenerator
              woId={woId!}
              woNumber={workOrder.wo_number}
              customer={workOrder.customer}
              itemCode={workOrder.item_code}
              quantity={workOrder.quantity}
            />
          )}
        </div>
      </div>

      {/* Release Confirmation Dialog */}
      <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-green-600" />
              Confirm Quality Release
            </DialogTitle>
            <DialogDescription>
              This action will:
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm">
              <Lock className="h-4 w-4 text-amber-600" />
              <span>Lock all production logs as read-only</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Shield className="h-4 w-4 text-blue-600" />
              <span>Freeze traceability data</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Mark work order as Quality Released</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Package className="h-4 w-4 text-purple-600" />
              <span>Move work order to Packing stage</span>
            </div>
          </div>

          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              This action cannot be undone. All linked data will become immutable.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowReleaseDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRelease} disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Releasing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Release
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Block Confirmation Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Block Work Order
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to block this work order at Final QC?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Label htmlFor="block-reason">Reason for blocking (required)</Label>
            <Textarea
              id="block-reason"
              placeholder="Describe the quality issue..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBlockDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleBlock} 
              disabled={submitting || !remarks.trim()}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Blocking...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Block Work Order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QC Quantity Dialog */}
      <Dialog open={showQCDialog} onOpenChange={setShowQCDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              Final QC Inspection
            </DialogTitle>
            <DialogDescription>
              Select a batch and enter the quantity to inspect
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-6">
            <QCQuantityInput
              woId={woId!}
              qcType="final"
              value={qcQuantity}
              onChange={(qty, batchId) => {
                setQcQuantity(qty);
                if (batchId) setSelectedBatchId(batchId);
              }}
              selectedBatchId={selectedBatchId}
              onBatchChange={setSelectedBatchId}
              disabled={submitting}
            />

            <div>
              <Label htmlFor="qc-remarks">Inspection Remarks</Label>
              <Textarea
                id="qc-remarks"
                placeholder="Enter inspection notes..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
              />
            </div>

            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant={qcResult === 'pass' ? 'default' : 'outline'}
                onClick={() => setQcResult('pass')}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Pass
              </Button>
              <Button
                className="flex-1"
                variant={qcResult === 'fail' ? 'destructive' : 'outline'}
                onClick={() => setQcResult('fail')}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Fail
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowQCDialog(false);
              setQcQuantity(0);
              setSelectedBatchId(null);
              setRemarks('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleQCSubmit} 
              disabled={submitting || qcQuantity <= 0 || !selectedBatchId}
              variant={qcResult === 'pass' ? 'default' : 'destructive'}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  {qcResult === 'pass' ? (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  ) : (
                    <XCircle className="h-4 w-4 mr-2" />
                  )}
                  {qcResult === 'pass' ? 'Approve' : 'Reject'} {qcQuantity > 0 ? `${qcQuantity} pcs` : 'Quantity'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default FinalQC;
