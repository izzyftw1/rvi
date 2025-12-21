import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { QCGateStatusBadge } from "./QCGateStatusBadge";
import { CheckCircle2, XCircle, Ban, FlaskConical, CheckSquare, Lock, AlertTriangle, FileCheck } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

type QCGateStatus = 'passed' | 'pending' | 'failed' | 'waived';

interface QCGate {
  status: QCGateStatus;
  approvedAt: string | null;
  approvedBy: string | null;
  remarks: string | null;
}

interface QCGateControlsProps {
  woId: string;
  materialQC: QCGate;
  firstPieceQC: QCGate;
  onUpdate: () => void;
}

// Helper to check if gate is complete (passed or waived)
const isGateComplete = (status: QCGateStatus) => status === 'passed' || status === 'waived';
const isGateFailed = (status: QCGateStatus) => status === 'failed';

export function QCGateControls({ woId, materialQC, firstPieceQC, onUpdate }: QCGateControlsProps) {
  const [loading, setLoading] = useState(false);
  const [materialRemarks, setMaterialRemarks] = useState('');
  const [firstPieceRemarks, setFirstPieceRemarks] = useState('');
  const [expandedGate, setExpandedGate] = useState<'material' | 'first_piece' | null>(null);

  const handleQCUpdate = async (
    gate: 'material' | 'first_piece', 
    newStatus: QCGateStatus,
    remarks: string = ''
  ) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const updateData: any = {};
      const timestamp = new Date().toISOString();
      
      if (gate === 'material') {
        updateData.qc_material_status = newStatus;
        updateData.qc_material_approved_by = user?.id;
        updateData.qc_material_approved_at = timestamp;
        updateData.qc_material_remarks = remarks || null;
        updateData.qc_material_passed = newStatus === 'passed' || newStatus === 'waived';
      } else {
        updateData.qc_first_piece_status = newStatus;
        updateData.qc_first_piece_approved_by = user?.id;
        updateData.qc_first_piece_approved_at = timestamp;
        updateData.qc_first_piece_remarks = remarks || null;
        updateData.qc_first_piece_passed = newStatus === 'passed' || newStatus === 'waived';
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', woId);

      if (error) throw error;

      const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      toast.success(`${gate === 'material' ? 'Material QC' : 'First Piece QC'} marked as ${statusLabel}`);
      
      if (gate === 'material') setMaterialRemarks('');
      else setFirstPieceRemarks('');
      
      setExpandedGate(null);
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update QC status');
    } finally {
      setLoading(false);
    }
  };

  // Determine overall status for the header
  const allGatesPassed = isGateComplete(materialQC.status) && isGateComplete(firstPieceQC.status);
  const anyGateFailed = isGateFailed(materialQC.status) || isGateFailed(firstPieceQC.status);
  const materialBlocked = materialQC.status === 'pending';
  const firstPieceBlocked = !isGateComplete(materialQC.status);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              QC Gates
              {allGatesPassed && (
                <Badge className="bg-success text-success-foreground ml-2">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  All Cleared
                </Badge>
              )}
              {anyGateFailed && (
                <Badge variant="destructive" className="ml-2">
                  <XCircle className="w-3 h-3 mr-1" />
                  Action Required
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              QC gates must be cleared before production can proceed
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* SECTION 1: Current Status Overview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Material QC</span>
            </div>
            <QCGateStatusBadge status={materialQC.status} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">First Piece QC</span>
            </div>
            <QCGateStatusBadge status={firstPieceQC.status} />
          </div>
        </div>

        {/* SECTION 2: Blocking Reasons (if any) */}
        {(materialBlocked || (firstPieceBlocked && !isGateComplete(firstPieceQC.status))) && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                <Lock className="h-3.5 w-3.5" />
                Blocking Issues
              </h4>
              
              {materialBlocked && (
                <Alert variant="default" className="border-warning/50 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-sm">
                    <strong>Material QC Pending:</strong> Raw material must be inspected before any production can start.
                    <span className="block text-xs text-muted-foreground mt-1">
                      Unblocks: First Piece QC, Production Logging
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              
              {firstPieceBlocked && !isGateComplete(firstPieceQC.status) && isGateComplete(materialQC.status) && (
                <Alert variant="default" className="border-warning/50 bg-warning/5">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <AlertDescription className="text-sm">
                    <strong>First Piece QC Pending:</strong> First piece inspection required before bulk production.
                    <span className="block text-xs text-muted-foreground mt-1">
                      Unblocks: Bulk Production Logging
                    </span>
                  </AlertDescription>
                </Alert>
              )}

              {isGateFailed(materialQC.status) && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>Material QC Failed:</strong> Material has been rejected. Address the issue and re-inspect or waive with justification.
                  </AlertDescription>
                </Alert>
              )}

              {isGateFailed(firstPieceQC.status) && (
                <Alert variant="destructive">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    <strong>First Piece QC Failed:</strong> First piece was rejected. Correct the setup and re-inspect.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </>
        )}

        {/* SECTION 3: Required Actions */}
        {(!isGateComplete(materialQC.status) || !isGateComplete(firstPieceQC.status)) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground">Required Actions</h4>
              
              {/* Material QC Action */}
              {!isGateComplete(materialQC.status) && (
                <div className="p-4 border rounded-lg space-y-3 bg-card">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-5 w-5 text-primary" />
                      <span className="font-medium">Material QC Inspection</span>
                    </div>
                    {expandedGate !== 'material' && (
                      <Button 
                        size="sm" 
                        onClick={() => setExpandedGate('material')}
                      >
                        Record Result
                      </Button>
                    )}
                  </div>
                  
                  {expandedGate === 'material' && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="material-remarks" className="text-xs">Remarks (optional)</Label>
                        <Input
                          id="material-remarks"
                          placeholder="Enter inspection notes..."
                          value={materialRemarks}
                          onChange={(e) => setMaterialRemarks(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleQCUpdate('material', 'passed', materialRemarks)}
                          disabled={loading}
                          className="bg-success hover:bg-success/90"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Pass
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleQCUpdate('material', 'failed', materialRemarks)}
                          disabled={loading}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Fail
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleQCUpdate('material', 'waived', materialRemarks)}
                          disabled={loading}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Waive
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedGate(null)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* First Piece QC Action */}
              {!isGateComplete(firstPieceQC.status) && (
                <div className={`p-4 border rounded-lg space-y-3 ${firstPieceBlocked ? 'opacity-60' : 'bg-card'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-5 w-5 text-primary" />
                      <span className="font-medium">First Piece QC Inspection</span>
                      {firstPieceBlocked && (
                        <Badge variant="outline" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Blocked
                        </Badge>
                      )}
                    </div>
                    {!firstPieceBlocked && expandedGate !== 'first_piece' && (
                      <Button 
                        size="sm" 
                        onClick={() => setExpandedGate('first_piece')}
                      >
                        Record Result
                      </Button>
                    )}
                  </div>
                  
                  {firstPieceBlocked && (
                    <p className="text-xs text-muted-foreground">
                      Complete Material QC first to unlock this gate.
                    </p>
                  )}
                  
                  {!firstPieceBlocked && expandedGate === 'first_piece' && (
                    <div className="space-y-3 pt-2 border-t">
                      <div className="space-y-2">
                        <Label htmlFor="first-piece-remarks" className="text-xs">Remarks (optional)</Label>
                        <Input
                          id="first-piece-remarks"
                          placeholder="Enter inspection notes..."
                          value={firstPieceRemarks}
                          onChange={(e) => setFirstPieceRemarks(e.target.value)}
                          disabled={loading}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleQCUpdate('first_piece', 'passed', firstPieceRemarks)}
                          disabled={loading}
                          className="bg-success hover:bg-success/90"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Pass
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleQCUpdate('first_piece', 'failed', firstPieceRemarks)}
                          disabled={loading}
                        >
                          <XCircle className="h-4 w-4 mr-1" />
                          Fail
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleQCUpdate('first_piece', 'waived', firstPieceRemarks)}
                          disabled={loading}
                        >
                          <Ban className="h-4 w-4 mr-1" />
                          Waive
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setExpandedGate(null)}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}

        {/* SECTION 4: Completed Evidence */}
        {(isGateComplete(materialQC.status) || isGateComplete(firstPieceQC.status)) && (
          <>
            <Separator />
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-muted-foreground flex items-center gap-1">
                <FileCheck className="h-3.5 w-3.5" />
                Completed Inspections
              </h4>
              
              {isGateComplete(materialQC.status) && (
                <div className="p-3 border rounded-lg bg-success/5 border-success/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-success" />
                      <span className="font-medium text-sm">Material QC</span>
                    </div>
                    <QCGateStatusBadge status={materialQC.status} />
                  </div>
                  {materialQC.approvedAt && (
                    <p className="text-xs text-muted-foreground">
                      Completed: {new Date(materialQC.approvedAt).toLocaleString()}
                    </p>
                  )}
                  {materialQC.remarks && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      "{materialQC.remarks}"
                    </p>
                  )}
                </div>
              )}
              
              {isGateComplete(firstPieceQC.status) && (
                <div className="p-3 border rounded-lg bg-success/5 border-success/20">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <CheckSquare className="h-4 w-4 text-success" />
                      <span className="font-medium text-sm">First Piece QC</span>
                    </div>
                    <QCGateStatusBadge status={firstPieceQC.status} />
                  </div>
                  {firstPieceQC.approvedAt && (
                    <p className="text-xs text-muted-foreground">
                      Completed: {new Date(firstPieceQC.approvedAt).toLocaleString()}
                    </p>
                  )}
                  {firstPieceQC.remarks && (
                    <p className="text-xs text-muted-foreground mt-1 italic">
                      "{firstPieceQC.remarks}"
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
