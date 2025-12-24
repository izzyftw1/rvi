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
  Plus,
  ShieldAlert,
  Ban
} from "lucide-react";
import { format } from "date-fns";
import { ProductionContextDisplay } from "@/components/qc/ProductionContextDisplay";
import { MaterialTraceabilityBadge } from "@/components/qc/MaterialTraceabilityBadge";
import { FinalDispatchReportGenerator } from "@/components/qc/FinalDispatchReportGenerator";
import { FinalQCInspectionForm } from "@/components/qc/FinalQCInspectionForm";
import { FinalQCReportGenerator } from "@/components/qc/FinalQCReportGenerator";
import { QCQuantityInput } from "@/components/qc/QCQuantityInput";
import { useUserRole } from "@/hooks/useUserRole";

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
  const { hasRole, isSuperAdmin, loading: roleLoading } = useUserRole();
  
  // Permission checks
  const isQCRole = hasRole('quality');
  const isAdmin = isSuperAdmin();
  const canPerformFinalQC = isQCRole || isAdmin;
  const canWaive = isAdmin; // Only admin can waive
  
  const [loading, setLoading] = useState(true);
  const [workOrder, setWorkOrder] = useState<WorkOrderData | null>(null);
  const [productionSummary, setProductionSummary] = useState<ProductionSummary | null>(null);
  const [qcRecords, setQcRecords] = useState<QCRecordSummary[]>([]);
  const [hourlyQCCount, setHourlyQCCount] = useState(0);
  const [hourlyQCAverages, setHourlyQCAverages] = useState<Array<{
    dimension: string;
    operation: string;
    avg: number;
    min: number;
    max: number;
    count: number;
  }>>([]);
  const [hasGeneratedReport, setHasGeneratedReport] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [showWaiverDialog, setShowWaiverDialog] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  const [samplingPlan, setSamplingPlan] = useState("");
  const [remarks, setRemarks] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  
  // QC Quantity state removed - now using FinalQCInspectionForm

  // Audit logging helper
  const logAuditAction = async (action: string, oldData: any, newData: any) => {
    if (!woId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from('audit_logs').insert({
        table_name: 'work_orders',
        record_id: woId,
        action,
        old_data: oldData,
        new_data: newData,
        changed_by: user?.id
      });
    } catch (error) {
      console.error('Failed to log audit action:', error);
    }
  };

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
      const { data: hourlyData, count } = await supabase
        .from("hourly_qc_checks")
        .select("*", { count: "exact" })
        .eq("wo_id", woId);

      setHourlyQCCount(count || 0);

      // Calculate hourly QC dimension averages
      const dimStatsByOp: Record<string, Record<string, { values: number[]; min: number; max: number }>> = {};
      
      (hourlyData || []).forEach((check: any) => {
        const op = check.operation;
        if (!dimStatsByOp[op]) dimStatsByOp[op] = {};
        
        if (check.dimensions) {
          Object.entries(check.dimensions).forEach(([dim, value]: [string, any]) => {
            if (typeof value === 'number') {
              if (!dimStatsByOp[op][dim]) {
                dimStatsByOp[op][dim] = { values: [], min: value, max: value };
              }
              dimStatsByOp[op][dim].values.push(value);
              dimStatsByOp[op][dim].min = Math.min(dimStatsByOp[op][dim].min, value);
              dimStatsByOp[op][dim].max = Math.max(dimStatsByOp[op][dim].max, value);
            }
          });
        }
      });

      // Convert to averages array
      const averagesArray: Array<{ dimension: string; operation: string; avg: number; min: number; max: number; count: number }> = [];
      Object.entries(dimStatsByOp).forEach(([op, dims]) => {
        Object.entries(dims).forEach(([dim, stats]) => {
          const avg = stats.values.reduce((a, b) => a + b, 0) / stats.values.length;
          averagesArray.push({
            dimension: dim,
            operation: op,
            min: stats.min,
            max: stats.max,
            avg,
            count: stats.values.length,
          });
        });
      });
      setHourlyQCAverages(averagesArray);

      // Check if a Final QC report exists
      const { count: reportCount } = await supabase
        .from("qc_final_reports")
        .select("*", { count: "exact", head: true })
        .eq("work_order_id", woId);
      
      setHasGeneratedReport((reportCount || 0) > 0);

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
    
    // Permission check
    if (!canPerformFinalQC) {
      toast.error("Permission denied. Only QC role can perform Final QC.");
      return;
    }
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const oldData = {
        quality_released: workOrder.quality_released,
        quality_released_at: workOrder.quality_released_at,
        final_qc_result: workOrder.final_qc_result,
        qc_final_status: workOrder.qc_final_status,
        current_stage: workOrder.current_stage
      };
      
      const newData = {
        quality_released: true,
        quality_released_at: new Date().toISOString(),
        quality_released_by: user?.id,
        sampling_plan_reference: samplingPlan,
        final_qc_result: 'passed',
        qc_final_status: 'passed',
        qc_final_remarks: remarks,
        current_stage: 'packing' as const
      };
      
      const { error } = await supabase
        .from("work_orders")
        .update(newData)
        .eq("id", woId);

      if (error) throw error;

      // Log audit trail
      await logAuditAction('FINAL_QC_RELEASE', oldData, newData);

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
    
    // Permission check
    if (!canPerformFinalQC) {
      toast.error("Permission denied. Only QC role can block at Final QC.");
      return;
    }
    
    if (!remarks.trim()) {
      toast.error("Block reason is required.");
      return;
    }
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const oldData = {
        final_qc_result: workOrder.final_qc_result,
        qc_final_status: workOrder.qc_final_status,
        qc_final_remarks: workOrder.qc_final_remarks
      };
      
      const newData = {
        final_qc_result: 'blocked',
        qc_final_status: 'failed',
        qc_final_remarks: remarks,
        qc_final_approved_at: new Date().toISOString(),
        qc_final_approved_by: user?.id
      };
      
      const { error } = await supabase
        .from("work_orders")
        .update(newData)
        .eq("id", woId);

      if (error) throw error;

      // Log audit trail
      await logAuditAction('FINAL_QC_BLOCK', oldData, newData);

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

  const handleWaiver = async () => {
    if (!woId || !workOrder) return;
    
    // Only admin can waive
    if (!canWaive) {
      toast.error("Permission denied. Only Admin can waive Final QC.");
      return;
    }
    
    // Mandatory reason check
    if (!waiverReason.trim() || waiverReason.trim().length < 20) {
      toast.error("A detailed waiver reason (at least 20 characters) is required.");
      return;
    }
    
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const oldData = {
        quality_released: workOrder.quality_released,
        quality_released_at: workOrder.quality_released_at,
        final_qc_result: workOrder.final_qc_result,
        qc_final_status: workOrder.qc_final_status,
        current_stage: workOrder.current_stage
      };
      
      const newData = {
        quality_released: true,
        quality_released_at: new Date().toISOString(),
        quality_released_by: user?.id,
        sampling_plan_reference: samplingPlan || 'WAIVED',
        final_qc_result: 'waived',
        qc_final_status: 'waived',
        qc_final_remarks: `ADMIN WAIVER: ${waiverReason}`,
        current_stage: 'packing' as const
      };
      
      const { error } = await supabase
        .from("work_orders")
        .update(newData)
        .eq("id", woId);

      if (error) throw error;

      // Log audit trail with detailed waiver info
      await logAuditAction('FINAL_QC_ADMIN_WAIVER', oldData, {
        ...newData,
        waiver_reason: waiverReason,
        waived_by: user?.id,
        waived_at: new Date().toISOString()
      });

      toast.warning("Final QC waived by Admin. Audit log created.");
      setShowWaiverDialog(false);
      setWaiverReason("");
      loadData();
    } catch (error: any) {
      console.error("Error waiving FQC:", error);
      toast.error("Failed to waive Final QC: " + error.message);
    } finally {
      setSubmitting(false);
    }
  };
  // Old handleQCSubmit removed - replaced by FinalQCInspectionForm

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
  const hasFinalQCRecord = qcRecords.some(r => r.qc_type === 'final');
  // Require: QC passed, IQC done, First Piece done, Hourly QC done, OK qty > 0, AND report generated
  const canRelease = allQCPassed && hasIQC && hasFirstPiece && hourlyQCCount > 0 && productionSummary && productionSummary.totalOK > 0 && hasFinalQCRecord && hasGeneratedReport;

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

      {/* Permission Banner */}
      {!canPerformFinalQC && !roleLoading && (
        <Alert className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <Ban className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Read-Only Access</span> - 
            Only Quality (QC) role can perform Final QC inspections. You have view-only access.
          </AlertDescription>
        </Alert>
      )}

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

      {/* Waived Status Banner */}
      {workOrder.final_qc_result === 'waived' && (
        <Alert className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-900/20">
          <ShieldAlert className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-300">
            <span className="font-semibold">Final QC WAIVED by Admin</span>
            {workOrder.qc_final_remarks && <span className="block mt-1">{workOrder.qc_final_remarks}</span>}
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

          {/* Hourly QC Dimension Averages */}
          {hourlyQCAverages.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Hourly QC Dimension Averages
                </CardTitle>
                <CardDescription>
                  Aggregated from {hourlyQCCount} in-process checks
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Dimension</TableHead>
                      <TableHead>Operation</TableHead>
                      <TableHead className="text-right">Min</TableHead>
                      <TableHead className="text-right">Max</TableHead>
                      <TableHead className="text-right">Average</TableHead>
                      <TableHead className="text-right">Samples</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {hourlyQCAverages.map((avg, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{avg.dimension}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{avg.operation}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">{avg.min.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-mono">{avg.max.toFixed(3)}</TableCell>
                        <TableCell className="text-right font-mono font-bold">{avg.avg.toFixed(3)}</TableCell>
                        <TableCell className="text-right">{avg.count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Production Context (Read-Only) */}
          <ProductionContextDisplay workOrderId={woId!} showRejectionDetails />
        </div>

        {/* Right Column - Final Inspection Actions */}
        <div className="space-y-6">
          {/* Dimensional Inspection Form */}
          {showInspectionForm ? (
            <FinalQCInspectionForm
              workOrderId={woId!}
              workOrderNumber={workOrder.wo_number || workOrder.display_id || ''}
              itemCode={workOrder.item_code}
              customer={workOrder.customer}
              totalOKQty={productionSummary?.totalOK || 0}
              onComplete={() => {
                setShowInspectionForm(false);
                loadData();
              }}
              onCancel={() => setShowInspectionForm(false)}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5" />
                  Dimensional Inspection
                </CardTitle>
                <CardDescription>
                  Perform 10-piece dimensional sampling inspection with tolerance checks
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!canPerformFinalQC && (
                  <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-900/20">
                    <Ban className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-700 dark:text-amber-300 text-sm">
                      QC role required to perform inspections
                    </AlertDescription>
                  </Alert>
                )}
                
                {!isReleased && workOrder.final_qc_result !== 'blocked' && canPerformFinalQC && (
                  <Button
                    className="w-full"
                    onClick={() => setShowInspectionForm(true)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Start Dimensional Inspection
                  </Button>
                )}
                
                {isReleased && (
                  <div className="text-center text-sm text-muted-foreground">
                    Quality released - no further QC inspections allowed
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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

              {!isReleased && workOrder.final_qc_result !== 'blocked' && canPerformFinalQC && (
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

                  {/* Admin Waiver Option */}
                  {canWaive && (
                    <Button
                      variant="outline"
                      className="w-full border-amber-500 text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      onClick={() => setShowWaiverDialog(true)}
                    >
                      <ShieldAlert className="h-4 w-4 mr-2" />
                      Admin Waiver (Override)
                    </Button>
                  )}

                  {!canRelease && (
                    <div className="text-xs text-muted-foreground text-center space-y-1">
                      <p className="font-medium">Requirements to release:</p>
                      <ul className="list-disc list-inside text-left">
                        {!hasIQC && <li>Incoming Material QC must pass</li>}
                        {!hasFirstPiece && <li>First Piece QC must pass</li>}
                        {hourlyQCCount === 0 && <li>At least 1 Hourly QC check required</li>}
                        {!hasFinalQCRecord && <li>Final QC inspection must be completed</li>}
                        {!hasGeneratedReport && <li className="font-semibold text-amber-600">Final QC Report must be generated (PDF)</li>}
                        {productionSummary && productionSummary.totalOK === 0 && <li>Production must have OK quantity</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Read-only notice for non-QC roles */}
              {!isReleased && workOrder.final_qc_result !== 'blocked' && !canPerformFinalQC && (
                <div className="pt-4">
                  <Alert className="border-muted">
                    <Ban className="h-4 w-4" />
                    <AlertDescription className="text-sm">
                      QC role required to release or block work orders.
                    </AlertDescription>
                  </Alert>
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

          {/* Final QC Report Generator - Always visible - MANDATORY before release */}
          <FinalQCReportGenerator
            woId={woId!}
            woNumber={workOrder.wo_number || workOrder.display_id || ''}
            customer={workOrder.customer}
            itemCode={workOrder.item_code}
            samplingPlanReference={samplingPlan}
            inspectorRemarks={remarks}
            onReportGenerated={() => setHasGeneratedReport(true)}
          />

          {/* Dispatch Report Generator - Only after release */}
          {isReleased && (
            <FinalDispatchReportGenerator
              woId={woId!}
              woNumber={workOrder.wo_number || ''}
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

      {/* Admin Waiver Dialog */}
      <Dialog open={showWaiverDialog} onOpenChange={setShowWaiverDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <ShieldAlert className="h-5 w-5" />
              Admin Waiver - Final QC Override
            </DialogTitle>
            <DialogDescription>
              This action bypasses normal QC requirements and will be logged in the audit trail.
            </DialogDescription>
          </DialogHeader>
          
          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-900/20">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 dark:text-amber-300">
              <strong>Warning:</strong> Waiving Final QC is an exceptional action. 
              A detailed reason is mandatory and will be permanently recorded.
            </AlertDescription>
          </Alert>
          
          <div className="py-4 space-y-4">
            <div>
              <Label htmlFor="waiver-reason" className="text-base font-semibold">
                Waiver Reason (Required - min 20 characters)
              </Label>
              <Textarea
                id="waiver-reason"
                placeholder="Provide a detailed justification for waiving Final QC. This will be recorded in the audit log..."
                value={waiverReason}
                onChange={(e) => setWaiverReason(e.target.value)}
                rows={5}
                className="mt-2"
              />
              <div className="flex justify-between mt-1">
                <span className="text-xs text-muted-foreground">
                  This action is irreversible and will be audited.
                </span>
                <span className={`text-xs ${waiverReason.length >= 20 ? 'text-green-600' : 'text-amber-600'}`}>
                  {waiverReason.length}/20 characters
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowWaiverDialog(false);
              setWaiverReason("");
            }}>
              Cancel
            </Button>
            <Button 
              variant="default"
              className="bg-amber-600 hover:bg-amber-700"
              onClick={handleWaiver} 
              disabled={submitting || waiverReason.trim().length < 20}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldAlert className="h-4 w-4 mr-2" />
                  Confirm Admin Waiver
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Old QC Quantity Dialog removed - replaced by FinalQCInspectionForm */}
    </PageContainer>
  );
};

export default FinalQC;
