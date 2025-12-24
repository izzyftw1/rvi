import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { CheckCircle2, Lock, AlertTriangle, Clock, User } from "lucide-react";
import { ProductionCompleteBadge } from "./ProductionCompleteBadge";
import { format } from "date-fns";

interface ProductionCompleteControlProps {
  workOrder: {
    id: string;
    quantity: number;
    qty_completed?: number;
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

export function ProductionCompleteControl({ 
  workOrder, 
  completedByName,
  onUpdate 
}: ProductionCompleteControlProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [notes, setNotes] = useState("");

  const isComplete = workOrder.production_complete || false;
  const plannedQty = workOrder.quantity || 0;
  const producedQty = workOrder.qty_completed || 0;
  const qtyReached = producedQty >= plannedQty;

  const handleMarkComplete = async (reason: 'manual' | 'qty_reached' | 'qc_gated') => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from("work_orders")
        .update({
          production_complete: true,
          production_complete_qty: producedQty,
          production_completed_at: new Date().toISOString(),
          production_completed_by: user?.id,
          production_complete_reason: reason,
        })
        .eq("id", workOrder.id);

      if (error) throw error;

      toast({
        title: "Production Marked Complete",
        description: `Production completed with ${producedQty.toLocaleString()} pcs. Packing can now proceed.`,
      });

      setShowDialog(false);
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
      const { error } = await supabase
        .from("work_orders")
        .update({
          production_complete: false,
          production_complete_qty: null,
          production_completed_at: null,
          production_completed_by: null,
          production_complete_reason: null,
        })
        .eq("id", workOrder.id);

      if (error) throw error;

      toast({
        title: "Production Reopened",
        description: "Production logging is now enabled again.",
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
      <Card className="border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <ProductionCompleteBadge
                isComplete={true}
                completeQty={workOrder.production_complete_qty}
                reason={workOrder.production_complete_reason}
              />
              
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                {workOrder.production_completed_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(workOrder.production_completed_at), "dd MMM yyyy, HH:mm")}
                  </span>
                )}
                {completedByName && (
                  <span className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    {completedByName}
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2 mt-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">
                  Further production logging is locked. Packing & dispatch can proceed.
                </span>
              </div>
            </div>
            
            <Button
              variant="outline"
              size="sm"
              onClick={handleReopen}
              disabled={loading}
            >
              Reopen Production
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not complete - show controls
  return (
    <>
      <Card>
        <CardContent className="py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <ProductionCompleteBadge isComplete={false} />
              
              <div className="text-sm">
                <span className="font-medium">{producedQty.toLocaleString()}</span>
                <span className="text-muted-foreground"> / {plannedQty.toLocaleString()} pcs produced</span>
                {qtyReached && (
                  <Badge variant="outline" className="ml-2 bg-amber-500/10 text-amber-600 border-amber-500/20">
                    Target Reached
                  </Badge>
                )}
              </div>
            </div>
            
            <Button
              variant={qtyReached ? "default" : "outline"}
              size="sm"
              onClick={() => qtyReached ? handleMarkComplete('qty_reached') : setShowDialog(true)}
              disabled={loading}
              className="gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              Mark Production Complete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual close dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Production Complete</DialogTitle>
            <DialogDescription>
              This will lock further production logging. Packing, dispatch, and invoicing can still proceed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Only {producedQty.toLocaleString()} of {plannedQty.toLocaleString()} pcs produced
                  </p>
                  <p className="text-amber-700 dark:text-amber-300 text-xs mt-1">
                    Planned quantity not yet reached. Are you sure you want to close production early?
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Reason for early closure (optional)</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Customer requested reduced quantity, material shortage, etc."
                rows={3}
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
              Confirm & Close Production
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
