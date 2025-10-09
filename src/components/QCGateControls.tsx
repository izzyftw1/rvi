import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QCGateStatusBadge } from "./QCGateStatusBadge";
import { CheckCircle2, XCircle, Ban, FlaskConical, CheckSquare } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

export function QCGateControls({ woId, materialQC, firstPieceQC, onUpdate }: QCGateControlsProps) {
  const [loading, setLoading] = useState(false);
  const [materialRemarks, setMaterialRemarks] = useState('');
  const [firstPieceRemarks, setFirstPieceRemarks] = useState('');

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
        // Update legacy boolean for backward compatibility
        updateData.qc_material_passed = newStatus === 'passed' || newStatus === 'waived';
      } else {
        updateData.qc_first_piece_status = newStatus;
        updateData.qc_first_piece_approved_by = user?.id;
        updateData.qc_first_piece_approved_at = timestamp;
        updateData.qc_first_piece_remarks = remarks || null;
        // Update legacy boolean for backward compatibility
        updateData.qc_first_piece_passed = newStatus === 'passed' || newStatus === 'waived';
      }

      const { error } = await supabase
        .from('work_orders')
        .update(updateData)
        .eq('id', woId);

      if (error) throw error;

      const statusLabel = newStatus.charAt(0).toUpperCase() + newStatus.slice(1);
      toast.success(`${gate === 'material' ? 'Material QC' : 'First Piece QC'} marked as ${statusLabel}`);
      
      // Clear remarks fields
      if (gate === 'material') setMaterialRemarks('');
      else setFirstPieceRemarks('');
      
      onUpdate();
    } catch (error: any) {
      toast.error(error.message || 'Failed to update QC status');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>QC Gates Status</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Material QC Gate */}
        <div className="p-4 border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">Raw Material QC</h3>
            </div>
            <QCGateStatusBadge status={materialQC.status} />
          </div>
          
          {materialQC.approvedAt && (
            <div className="text-sm text-muted-foreground space-y-1 bg-muted/50 p-2 rounded">
              <p>Updated: {new Date(materialQC.approvedAt).toLocaleString()}</p>
              {materialQC.remarks && <p className="italic">Remarks: {materialQC.remarks}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="material-remarks" className="text-xs">Remarks (optional)</Label>
            <Input
              id="material-remarks"
              placeholder="Enter QC remarks..."
              value={materialRemarks}
              onChange={(e) => setMaterialRemarks(e.target.value)}
              disabled={loading}
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={materialQC.status === 'passed' ? "default" : "outline"}
              onClick={() => handleQCUpdate('material', 'passed', materialRemarks)}
              disabled={loading || materialQC.status === 'passed'}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Pass
            </Button>
            <Button
              size="sm"
              variant={materialQC.status === 'failed' ? "destructive" : "outline"}
              onClick={() => handleQCUpdate('material', 'failed', materialRemarks)}
              disabled={loading}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Fail
            </Button>
            <Button
              size="sm"
              variant={materialQC.status === 'waived' ? "secondary" : "outline"}
              onClick={() => handleQCUpdate('material', 'waived', materialRemarks)}
              disabled={loading}
            >
              <Ban className="h-4 w-4 mr-1" />
              Waive
            </Button>
          </div>
        </div>

        {/* First Piece QC Gate */}
        <div className="p-4 border rounded-lg space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold">First Piece QC</h3>
            </div>
            <QCGateStatusBadge status={firstPieceQC.status} />
          </div>
          
          {firstPieceQC.approvedAt && (
            <div className="text-sm text-muted-foreground space-y-1 bg-muted/50 p-2 rounded">
              <p>Updated: {new Date(firstPieceQC.approvedAt).toLocaleString()}</p>
              {firstPieceQC.remarks && <p className="italic">Remarks: {firstPieceQC.remarks}</p>}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="first-piece-remarks" className="text-xs">Remarks (optional)</Label>
            <Input
              id="first-piece-remarks"
              placeholder="Enter QC remarks..."
              value={firstPieceRemarks}
              onChange={(e) => setFirstPieceRemarks(e.target.value)}
              disabled={loading || (materialQC.status !== 'passed' && materialQC.status !== 'waived')}
            />
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              variant={firstPieceQC.status === 'passed' ? "default" : "outline"}
              onClick={() => handleQCUpdate('first_piece', 'passed', firstPieceRemarks)}
              disabled={loading || firstPieceQC.status === 'passed' || (materialQC.status !== 'passed' && materialQC.status !== 'waived')}
              title={(materialQC.status !== 'passed' && materialQC.status !== 'waived') ? "Material QC must pass or be waived first" : ""}
            >
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Pass
            </Button>
            <Button
              size="sm"
              variant={firstPieceQC.status === 'failed' ? "destructive" : "outline"}
              onClick={() => handleQCUpdate('first_piece', 'failed', firstPieceRemarks)}
              disabled={loading || (materialQC.status !== 'passed' && materialQC.status !== 'waived')}
              title={(materialQC.status !== 'passed' && materialQC.status !== 'waived') ? "Material QC must pass or be waived first" : ""}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Fail
            </Button>
            <Button
              size="sm"
              variant={firstPieceQC.status === 'waived' ? "secondary" : "outline"}
              onClick={() => handleQCUpdate('first_piece', 'waived', firstPieceRemarks)}
              disabled={loading || (materialQC.status !== 'passed' && materialQC.status !== 'waived')}
              title={(materialQC.status !== 'passed' && materialQC.status !== 'waived') ? "Material QC must pass or be waived first" : ""}
            >
              <Ban className="h-4 w-4 mr-1" />
              Waive
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
