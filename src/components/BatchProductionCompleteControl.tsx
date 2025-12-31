import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Lock, AlertTriangle, Clock, User, Package } from "lucide-react";
import { format } from "date-fns";

interface BatchProductionCompleteControlProps {
  batch: {
    id: string;
    batch_number: number;
    wo_id: string;
    produced_qty?: number;
    batch_quantity?: number;
    production_complete?: boolean;
    production_complete_qty?: number;
    production_completed_at?: string | null;
    production_completed_by?: string | null;
    production_complete_reason?: string | null;
    qc_final_status?: string;
  };
  completedByName?: string;
  onUpdate?: () => void;
}

export function BatchProductionCompleteControl({ 
  batch, 
  completedByName,
  onUpdate 
}: BatchProductionCompleteControlProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");

  const isComplete = batch.production_complete || false;
  const producedQty = batch.produced_qty || 0;
  const batchQty = batch.batch_quantity || producedQty;
  const qtyReached = producedQty >= batchQty && batchQty > 0;

  const handleMarkComplete = async (reason: 'manual' | 'qty_reached' | 'qc_gated') => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Mark this batch as production complete and close it (ended_at)
      const { error } = await supabase
        .from("production_batches")
        .update({
          production_complete: true,
          production_complete_qty: producedQty,
          production_completed_at: new Date().toISOString(),
          production_completed_by: user?.id,
          production_complete_reason: reason === 'manual' && notes ? notes : reason,
          ended_at: new Date().toISOString(), // Close the batch so new one can be created
        })
        .eq("id", batch.id);

      if (error) throw error;

      toast({
        title: `Batch #${batch.batch_number} Production Complete`,
        description: `${producedQty.toLocaleString()} pcs marked complete. This batch proceeds to QC → Packing. A new batch will be created automatically when more production is logged.`,
      });

      setShowDialog(false);
      setNotes("");
      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to mark complete",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async () => {
    setLoading(true);
    try {
      // Reopen the batch: clear completion status AND ended_at so it becomes active again
      const { error } = await supabase
        .from("production_batches")
        .update({
          production_complete: false,
          production_complete_qty: null,
          production_completed_at: null,
          production_completed_by: null,
          production_complete_reason: null,
          ended_at: null, // Reopen the batch
        })
        .eq("id", batch.id);

      if (error) throw error;

      toast({
        title: `Batch #${batch.batch_number} Reopened`,
        description: "Production logging is now enabled again for this batch.",
      });

      onUpdate?.();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to reopen",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  // If already complete, show status with reopen option
  if (isComplete) {
    return (
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <Package className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Batch #{batch.batch_number}</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Complete
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              <span>{(batch.production_complete_qty || producedQty).toLocaleString()} pcs</span>
              {batch.production_completed_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {format(new Date(batch.production_completed_at), "dd MMM, HH:mm")}
                </span>
              )}
              {completedByName && (
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {completedByName}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReopen}
          disabled={loading}
          className="text-xs"
        >
          Reopen
        </Button>
      </div>
    );
  }

  // Not complete - show controls
  return (
    <>
      <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted">
            <Package className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">Batch #{batch.batch_number}</span>
              <Badge variant="outline" className="text-xs">In Progress</Badge>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              <span className="font-medium">{producedQty.toLocaleString()}</span>
              {batchQty > 0 && <span> / {batchQty.toLocaleString()}</span>} pcs produced
              {qtyReached && (
                <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">
                  Target Reached
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <Button
          variant={qtyReached ? "default" : "outline"}
          size="sm"
          onClick={() => qtyReached ? handleMarkComplete('qty_reached') : setShowDialog(true)}
          disabled={loading || producedQty === 0}
          className="gap-1.5 text-xs"
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Complete
        </Button>
      </div>

      {/* Manual close dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Batch #{batch.batch_number} Complete</DialogTitle>
            <DialogDescription>
              This will allow this batch to proceed to Final QC → Packing → Dispatch.
              Other batches under the same Work Order remain unaffected.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {!qtyReached && batchQty > 0 && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-amber-800 dark:text-amber-200">
                      Only {producedQty.toLocaleString()} of {batchQty.toLocaleString()} pcs produced
                    </p>
                    <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                      Batch quantity not yet reached. Production for other batches can continue.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="notes">Reason (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Customer urgent request, split shipment, etc."
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => handleMarkComplete('manual')} 
              disabled={loading}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Complete Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
