import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Unlock, 
  Lock,
  AlertTriangle 
} from "lucide-react";
import { toast } from "sonner";
import { useUserRole } from "@/hooks/useUserRole";

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

      // Release unlocks production logging and sets stage to 'production'
      const { error } = await supabase
        .from('work_orders')
        .update({
          production_release_status: 'RELEASED' as any,
          production_release_date: new Date().toISOString(),
          production_released_by: user.id,
          production_release_notes: releaseNotes || null,
          current_stage: 'production' as any, // Auto-advance stage to production
          production_allowed: true, // Explicitly unlock logging
        })
        .eq('id', workOrder.id);

      if (error) throw error;

      toast.success('Production logging unlocked — stage set to Production');
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
            Production Logging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Release Status */}
          {isReleased ? (
            <div className="bg-success/10 border border-success/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <span className="font-semibold text-success">Logging Unlocked</span>
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
                  title="Unlocks production logging and sets stage to Production"
                >
                  <Unlock className="h-4 w-4 mr-2" />
                  Unlock Production Logging
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
            <DialogTitle>Unlock Production Logging</DialogTitle>
            <DialogDescription>
              This will unlock production logging for work order{' '}
              <strong>{workOrder.wo_number || workOrder.display_id || workOrder.id}</strong> and set its stage to <strong>Production</strong>.
              Once unlocked, operators can log quantities, reject counts, and downtime. Stage will auto-advance based on routing completion and QC gates.
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
