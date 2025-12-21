import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from "@/components/ui/dialog";
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Ban, 
  Unlock, 
  Lock,
  AlertTriangle 
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

type QCStatus = 'passed' | 'pending' | 'failed' | 'waived';

interface ProductionReleaseSectionProps {
  workOrder: {
    id: string;
    wo_number?: string;
    display_id?: string;
    qc_material_status?: string;
    qc_first_piece_status?: string;
    production_release_status?: string;
    production_release_date?: string;
    production_released_by?: string;
    production_release_notes?: string;
  };
  releasedByName?: string;
  onReleased: () => void;
}

const getQCStatusConfig = (status: string | undefined) => {
  const normalizedStatus = (status || 'pending').toLowerCase();
  
  switch (normalizedStatus) {
    case 'passed':
    case 'pass':
      return {
        icon: CheckCircle2,
        variant: 'default' as const,
        label: 'Passed',
        className: 'bg-success text-success-foreground',
        color: 'text-success',
      };
    case 'failed':
    case 'fail':
      return {
        icon: XCircle,
        variant: 'destructive' as const,
        label: 'Failed',
        className: '',
        color: 'text-destructive',
      };
    case 'waived':
      return {
        icon: Ban,
        variant: 'secondary' as const,
        label: 'Waived',
        className: 'bg-muted',
        color: 'text-muted-foreground',
      };
    default:
      return {
        icon: Clock,
        variant: 'outline' as const,
        label: 'Pending',
        className: 'border-warning text-warning',
        color: 'text-warning',
      };
  }
};

export const ProductionReleaseSection = ({ 
  workOrder, 
  releasedByName,
  onReleased 
}: ProductionReleaseSectionProps) => {
  const { hasAnyRole } = useUserRole();
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [isReleasing, setIsReleasing] = useState(false);

  const canRelease = hasAnyRole(['admin', 'production']);
  const isReleased = workOrder.production_release_status === 'RELEASED';

  // Determine QC statuses
  const materialQCStatus = getQCStatusConfig(workOrder.qc_material_status);
  const firstPieceQCStatus = getQCStatusConfig(workOrder.qc_first_piece_status);

  // Check if release is allowed
  const materialQCPassed = ['passed', 'pass', 'waived'].includes(
    (workOrder.qc_material_status || '').toLowerCase()
  );
  const firstPieceQCPassed = ['passed', 'pass', 'waived'].includes(
    (workOrder.qc_first_piece_status || '').toLowerCase()
  );
  const canBeReleased = materialQCPassed && firstPieceQCPassed;

  const handleRelease = async () => {
    setIsReleasing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('work_orders')
        .update({
          production_release_status: 'RELEASED' as any,
          production_release_date: new Date().toISOString(),
          production_released_by: user.id,
          production_release_notes: releaseNotes || null,
        })
        .eq('id', workOrder.id);

      if (error) throw error;

      toast.success('Work Order released for production');
      setShowReleaseDialog(false);
      setReleaseNotes('');
      onReleased();
    } catch (error: any) {
      toast.error(error.message || 'Failed to release work order');
    } finally {
      setIsReleasing(false);
    }
  };

  return (
    <>
      <Card className={isReleased ? 'border-success' : 'border-warning'}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {isReleased ? (
              <Unlock className="h-5 w-5 text-success" />
            ) : (
              <Lock className="h-5 w-5 text-warning" />
            )}
            Production Release
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* QC Status Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">Raw Material QC</Label>
              <div className="flex items-center gap-2">
                <materialQCStatus.icon className={`h-4 w-4 ${materialQCStatus.color}`} />
                <Badge variant={materialQCStatus.variant} className={materialQCStatus.className}>
                  {materialQCStatus.label}
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground text-xs">First Setup QC</Label>
              <div className="flex items-center gap-2">
                <firstPieceQCStatus.icon className={`h-4 w-4 ${firstPieceQCStatus.color}`} />
                <Badge variant={firstPieceQCStatus.variant} className={firstPieceQCStatus.className}>
                  {firstPieceQCStatus.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Release Status */}
          {isReleased ? (
            <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-semibold text-success">Released for Production</span>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  <span className="font-medium">Released:</span>{' '}
                  {workOrder.production_release_date 
                    ? new Date(workOrder.production_release_date).toLocaleString() 
                    : 'N/A'}
                </p>
                <p>
                  <span className="font-medium">By:</span>{' '}
                  {releasedByName || 'Unknown'}
                </p>
                {workOrder.production_release_notes && (
                  <p>
                    <span className="font-medium">Notes:</span>{' '}
                    {workOrder.production_release_notes}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {!canBeReleased && (
                <div className="bg-warning/10 border border-warning/20 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-warning">Release Not Allowed</p>
                    <p className="text-muted-foreground">
                      {!materialQCPassed && 'Raw Material QC must pass or be waived. '}
                      {!firstPieceQCPassed && 'First Setup QC must pass or be waived.'}
                    </p>
                  </div>
                </div>
              )}

              {canRelease && (
                <Button
                  onClick={() => setShowReleaseDialog(true)}
                  disabled={!canBeReleased}
                  className="w-full"
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Release for Production
                </Button>
              )}

              {!canRelease && canBeReleased && (
                <div className="text-sm text-muted-foreground text-center p-2 bg-muted/50 rounded">
                  Only Admin and Production Manager can release work orders
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Release Confirmation Dialog */}
      <Dialog open={showReleaseDialog} onOpenChange={setShowReleaseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Release for Production</DialogTitle>
            <DialogDescription>
              This will authorize production activities for work order{' '}
              <strong>{workOrder.wo_number || workOrder.display_id || workOrder.id}</strong>.
              Once released, material can be issued, external processing can begin, and machining quantities can be recorded.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="release-notes">Release Notes (Optional)</Label>
              <Textarea
                id="release-notes"
                placeholder="Add any notes about this release..."
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                rows={3}
              />
            </div>

            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p className="font-medium">QC Status Summary:</p>
              <div className="flex items-center gap-2 text-muted-foreground">
                <materialQCStatus.icon className={`h-4 w-4 ${materialQCStatus.color}`} />
                Raw Material QC: {materialQCStatus.label}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <firstPieceQCStatus.icon className={`h-4 w-4 ${firstPieceQCStatus.color}`} />
                First Setup QC: {firstPieceQCStatus.label}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowReleaseDialog(false)}
              disabled={isReleasing}
            >
              Cancel
            </Button>
            <Button onClick={handleRelease} disabled={isReleasing}>
              {isReleasing ? 'Releasing...' : 'Confirm Release'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
