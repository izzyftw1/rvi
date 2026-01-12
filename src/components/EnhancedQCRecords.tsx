import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, AlertCircle, FlaskConical, Target, Clock, Lock } from "lucide-react";
import { format } from "date-fns";
import { ProductionContextDisplay } from "@/components/qc/ProductionContextDisplay";
import { QCStatusIndicator, QCStatus, getQCStatusConfig, resolveQCGateStatus } from "@/components/qc/QCStatusIndicator";
import { cn } from "@/lib/utils";

interface QCRecord {
  id: string;
  qc_id: string;
  qc_type: string;
  result: string;
  qc_date_time?: string;
  created_at: string;
  approved_by?: string;
  approved_at?: string;
  measurements?: any;
  remarks?: string;
}

interface EnhancedQCRecordsProps {
  qcRecords: QCRecord[];
  workOrder: any;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QC STATUS RESOLUTION RULES (System-Wide Authoritative Source)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * 1. Raw Material QC: Authoritative source = qc_material_status
 *    - If pending → Show PENDING (amber) - NO green tiles
 *    - If passed/waived → Show PASSED (green)
 *    - If failed/hold → Show FAILED/HOLD (red/orange)
 * 
 * 2. First Piece QC: Authoritative source = qc_first_piece_status
 *    - BLOCKED if Material QC not complete (gray + lock)
 *    - If pending & unblocked → Show PENDING (amber)
 *    - If passed/waived → Show PASSED (green)
 *    - If failed → Show FAILED (red)
 * 
 * 3. In-Process QC: Authoritative source = Latest hourly_qc_checks record
 *    - Count-based, no single status
 * 
 * 4. Dispatch QC: Authoritative source = qc_final_reports records
 *    - Count-based, check if any exist
 * ═══════════════════════════════════════════════════════════════════════════
 */

// Helper to normalize status strings
const normalizeStatus = (status: string | null | undefined): QCStatus => {
  if (!status) return 'pending';
  const s = status.toLowerCase();
  if (s === 'pass' || s === 'passed') return 'passed';
  if (s === 'fail' || s === 'failed') return 'failed';
  if (s === 'hold') return 'hold';
  if (s === 'waived') return 'waived';
  if (s === 'blocked') return 'blocked';
  if (s === 'not_started') return 'not_started';
  return 'pending';
};

// Check if a gate is complete (passed or waived)
const isGateComplete = (status: QCStatus): boolean => 
  status === 'passed' || status === 'pass' || status === 'waived';

export function EnhancedQCRecords({ qcRecords, workOrder }: EnhancedQCRecordsProps) {
  // === AUTHORITATIVE STATUS RESOLUTION ===
  // Use unified status - prefer qc_material_status, fallback to qc_raw_material_status
  const unifiedMaterialStatus = workOrder.qc_material_status || workOrder.qc_raw_material_status || 'pending';
  const materialStatus = normalizeStatus(unifiedMaterialStatus);
  const firstPieceBaseStatus = normalizeStatus(workOrder.qc_first_piece_status);
  
  // First Piece is BLOCKED if Material QC is not complete
  const materialComplete = isGateComplete(materialStatus);
  const firstPieceStatus = resolveQCGateStatus(firstPieceBaseStatus, !materialComplete);
  
  const getQCTypeLabel = (type: string) => {
    const labels: Record<string, { name: string; icon: any }> = {
      'incoming': { name: 'Raw Material QC', icon: FlaskConical },
      'first_piece': { name: 'First Piece QC', icon: Target },
      'in_process': { name: 'In-Process QC', icon: CheckCircle2 },
      'final': { name: 'Dispatch QC', icon: CheckCircle2 },
    };
    return labels[type] || { name: type, icon: FlaskConical };
  };

  const groupedQC = {
    incoming: qcRecords.filter(q => q.qc_type === 'incoming'),
    first_piece: qcRecords.filter(q => q.qc_type === 'first_piece'),
    in_process: qcRecords.filter(q => q.qc_type === 'in_process'),
    final: qcRecords.filter(q => q.qc_type === 'final'),
  };

  // Get latest QC record status for each type
  const getLatestRecordStatus = (records: QCRecord[]): QCStatus => {
    if (records.length === 0) return 'not_started';
    const latest = records.sort((a, b) => 
      new Date(b.qc_date_time || b.created_at).getTime() - 
      new Date(a.qc_date_time || a.created_at).getTime()
    )[0];
    return normalizeStatus(latest.result);
  };

  // In-Process QC status: based on latest check
  const inProcessStatus = getLatestRecordStatus(groupedQC.in_process);
  const inProcessCount = groupedQC.in_process.length;
  
  // Final QC status: based on latest report
  const finalStatus = getLatestRecordStatus(groupedQC.final);
  const finalCount = groupedQC.final.length;

  // Helper to get border color based on status
  const getBorderClass = (status: QCStatus) => {
    const config = getQCStatusConfig(status);
    return config.borderClass;
  };

  // Helper to get card background based on status
  const getCardBgClass = (status: QCStatus) => {
    const config = getQCStatusConfig(status);
    return config.bgClass;
  };

  return (
    <div className="space-y-4">
      {/* Production Context from Daily Production Log - Read Only */}
      <ProductionContextDisplay
        workOrderId={workOrder.id}
        title="Production Context (from Daily Log)"
        showRejectionDetails={true}
      />

      {/* QC Gates Overview - Using AUTHORITATIVE STATUS from qc_*_status fields */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Raw Material QC - Source: qc_material_status */}
        <Card className={cn("border-2", getBorderClass(materialStatus), getCardBgClass(materialStatus))}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Raw Material</p>
                <QCStatusIndicator status={materialStatus} size="sm" />
              </div>
              <FlaskConical className={cn("h-6 w-6", getQCStatusConfig(materialStatus).iconClass)} />
            </div>
          </CardContent>
        </Card>
        
        {/* First Piece QC - Source: qc_first_piece_status, BLOCKED if material not complete */}
        <Card className={cn("border-2", getBorderClass(firstPieceStatus), getCardBgClass(firstPieceStatus))}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">First Piece</p>
                <QCStatusIndicator status={firstPieceStatus} size="sm" />
              </div>
              {firstPieceStatus === 'blocked' ? (
                <Lock className="h-6 w-6 text-slate-400" />
              ) : (
                <Target className={cn("h-6 w-6", getQCStatusConfig(firstPieceStatus).iconClass)} />
              )}
            </div>
          </CardContent>
        </Card>

        {/* In-Process QC - Source: Latest hourly_qc_checks */}
        <Card className={cn(
          "border-2",
          inProcessCount > 0 ? getBorderClass(inProcessStatus) : "border-muted",
          inProcessCount > 0 ? getCardBgClass(inProcessStatus) : "bg-muted/30"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">In-Process</p>
                {inProcessCount > 0 ? (
                  <QCStatusIndicator status={inProcessStatus} label={`${inProcessCount} checks`} size="sm" />
                ) : (
                  <span className="text-xs text-muted-foreground">No checks yet</span>
                )}
              </div>
              <CheckCircle2 className={cn("h-6 w-6", inProcessCount > 0 ? getQCStatusConfig(inProcessStatus).iconClass : "text-muted-foreground")} />
            </div>
          </CardContent>
        </Card>

        {/* Dispatch QC - Source: qc_final_reports */}
        <Card className={cn(
          "border-2",
          finalCount > 0 ? getBorderClass(finalStatus) : "border-muted",
          finalCount > 0 ? getCardBgClass(finalStatus) : "bg-muted/30"
        )}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Dispatch QC</p>
                {finalCount > 0 ? (
                  <QCStatusIndicator status={finalStatus} label={`${finalCount} reports`} size="sm" />
                ) : (
                  <span className="text-xs text-muted-foreground">No reports yet</span>
                )}
              </div>
              <CheckCircle2 className={cn("h-6 w-6", finalCount > 0 ? getQCStatusConfig(finalStatus).iconClass : "text-muted-foreground")} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* QC Records by Type */}
      {Object.entries(groupedQC).map(([type, records]) => {
        if (records.length === 0) return null;
        const typeInfo = getQCTypeLabel(type);
        const Icon = typeInfo.icon;

        return (
          <Card key={type}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" />
                {typeInfo.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {records.map((qc) => {
                  const recordStatus = normalizeStatus(qc.result);
                  const statusConfig = getQCStatusConfig(recordStatus);
                  const StatusIcon = statusConfig.icon;
                  
                  return (
                    <div
                      key={qc.id}
                      className={cn("p-4 border rounded-lg hover:bg-accent/50 transition-colors", statusConfig.borderClass)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-3">
                            <StatusIcon className={cn("h-6 w-6", statusConfig.iconClass)} />
                            <span className="font-medium">{qc.qc_id}</span>
                            <QCStatusIndicator status={recordStatus} size="sm" />
                          </div>

                          <div className="text-sm text-muted-foreground">
                            <p>
                              Tested: {format(
                                new Date(qc.qc_date_time || qc.created_at), 
                                'dd MMM yyyy, hh:mm a'
                              )}
                            </p>
                            {qc.approved_at && (
                              <p>
                                Approved: {format(new Date(qc.approved_at), 'dd MMM yyyy, hh:mm a')}
                              </p>
                            )}
                          </div>

                          {qc.measurements && Object.keys(qc.measurements).length > 0 && (
                            <div className="mt-2 p-2 bg-secondary rounded text-sm">
                              <p className="font-medium mb-1">Measurements:</p>
                              <div className="grid grid-cols-2 gap-2">
                                {Object.entries(qc.measurements).map(([key, value]) => (
                                  <div key={key}>
                                    <span className="text-muted-foreground">{key}:</span>{' '}
                                    <span className="font-medium">{JSON.stringify(value)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {qc.remarks && (
                            <p className="text-sm italic text-muted-foreground">
                              💬 {qc.remarks}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {qcRecords.length === 0 && (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              No QC records found for this work order
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
