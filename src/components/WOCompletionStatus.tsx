import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
  CheckCircle2, 
  Clock, 
  Factory, 
  FlaskConical, 
  Package, 
  Truck,
  AlertTriangle,
  Loader2,
  Award
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface WOCompletionStatusProps {
  woId: string;
  orderedQty: number;
  currentStatus: string;
  onStatusChange?: () => void;
}

interface CompletionStatus {
  allBatchesProductionComplete: boolean;
  allBatchesFinalQCComplete: boolean;
  hasPackedQty: boolean;
  totalProduced: number;
  totalFinalQCApproved: number;
  totalPacked: number;
  totalDispatched: number;
  orderedQty: number;
  canMarkWOComplete: boolean;
  activeBatchId: string | null;
  completionBlockers: string[];
}

export function WOCompletionStatus({ woId, orderedQty, currentStatus, onStatusChange }: WOCompletionStatusProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [status, setStatus] = useState<CompletionStatus | null>(null);
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    loadStatus();
    
    // Real-time subscription
    const channel = supabase
      .channel(`wo-completion-${woId}`)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'production_batches',
        filter: `wo_id=eq.${woId}`
      }, loadStatus)
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'cartons',
        filter: `wo_id=eq.${woId}`
      }, loadStatus)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [woId]);

  const loadStatus = async () => {
    try {
      const { data, error } = await supabase.rpc('check_wo_completion_status', {
        p_wo_id: woId
      });

      if (error) throw error;

      const result = data?.[0];
      if (result) {
        setStatus({
          allBatchesProductionComplete: result.all_batches_production_complete ?? false,
          allBatchesFinalQCComplete: result.all_batches_final_qc_complete ?? false,
          hasPackedQty: result.has_packed_qty ?? false,
          totalProduced: result.total_produced ?? 0,
          totalFinalQCApproved: result.total_final_qc_approved ?? 0,
          totalPacked: result.total_packed ?? 0,
          totalDispatched: result.total_dispatched ?? 0,
          orderedQty: result.ordered_qty ?? orderedQty,
          canMarkWOComplete: result.can_mark_wo_complete ?? false,
          activeBatchId: result.active_batch_id ?? null,
          completionBlockers: result.completion_blockers ?? [],
        });
      }
    } catch (err) {
      console.error("Error loading completion status:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkComplete = async () => {
    setCompleting(true);
    try {
      const { error } = await supabase.rpc('mark_wo_complete', {
        p_wo_id: woId
      });

      if (error) throw error;

      toast({
        title: "Work Order Completed",
        description: "The work order has been marked as complete and moved to the completed section.",
      });
      
      setShowDialog(false);
      onStatusChange?.();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Cannot Complete Work Order",
        description: err.message || "Failed to mark work order as complete",
      });
    } finally {
      setCompleting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (currentStatus === 'completed') {
    return (
      <Card className="border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30">
              <Award className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">Work Order Complete</p>
              <p className="text-sm text-muted-foreground">
                {status?.totalDispatched?.toLocaleString() || 0} pcs dispatched
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const criteria = [
    {
      label: "Production Complete",
      icon: Factory,
      passed: status.allBatchesProductionComplete && status.totalProduced >= status.orderedQty,
      detail: `${status.totalProduced.toLocaleString()} / ${status.orderedQty.toLocaleString()} pcs`,
    },
    {
      label: "Dispatch QC Complete",
      icon: FlaskConical,
      passed: status.allBatchesFinalQCComplete,
      detail: `${status.totalFinalQCApproved.toLocaleString()} pcs approved`,
    },
    {
      label: "Sent to Packing",
      icon: Package,
      passed: status.hasPackedQty,
      detail: status.hasPackedQty 
        ? `${status.totalPacked.toLocaleString()} pcs packed` 
        : "No packing yet",
    },
  ];

  const passedCount = criteria.filter(c => c.passed).length;
  const progressPct = (passedCount / criteria.length) * 100;

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Completion Status
            </CardTitle>
            {status.canMarkWOComplete ? (
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                Ready to Complete
              </Badge>
            ) : (
              <Badge variant="outline">
                {passedCount} / {criteria.length} criteria met
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress bar */}
          <div className="space-y-1">
            <Progress value={progressPct} className="h-2" />
          </div>

          {/* Criteria checklist */}
          <div className="space-y-2">
            {criteria.map((c, i) => (
              <div 
                key={i}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg",
                  c.passed ? "bg-emerald-50/50 dark:bg-emerald-950/20" : "bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2">
                  {c.passed ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Clock className="h-4 w-4 text-muted-foreground" />
                  )}
                  <c.icon className={cn(
                    "h-4 w-4",
                    c.passed ? "text-emerald-600" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "text-sm",
                    c.passed ? "font-medium" : "text-muted-foreground"
                  )}>
                    {c.label}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">{c.detail}</span>
              </div>
            ))}
          </div>

          {/* Dispatched info */}
          {status.totalDispatched > 0 && (
            <div className="flex items-center justify-between text-sm pt-2 border-t">
              <div className="flex items-center gap-2">
                <Truck className="h-4 w-4 text-blue-600" />
                <span className="text-muted-foreground">Already Dispatched:</span>
              </div>
              <span className="font-medium">{status.totalDispatched.toLocaleString()} pcs</span>
            </div>
          )}

          {/* Complete button */}
          <Button
            onClick={() => setShowDialog(true)}
            disabled={!status.canMarkWOComplete}
            className="w-full gap-2"
            variant={status.canMarkWOComplete ? "default" : "outline"}
          >
            {status.canMarkWOComplete ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Mark Work Order Complete
              </>
            ) : (
              <>
                <Clock className="h-4 w-4" />
                Complete All Steps First
              </>
            )}
          </Button>

          {/* Blockers */}
          {status.completionBlockers.length > 0 && !status.canMarkWOComplete && (
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                <div className="text-xs">
                  <p className="font-medium text-amber-800 dark:text-amber-200">Cannot complete yet:</p>
                  <ul className="mt-1 text-amber-700 dark:text-amber-300 list-disc list-inside">
                    {status.completionBlockers.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Work Order?</DialogTitle>
            <DialogDescription>
              This will mark the work order as complete. It will be moved to the Completed section
              and removed from active work orders.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Produced:</span>
              <span className="font-medium">{status?.totalProduced.toLocaleString()} pcs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dispatch QC Approved:</span>
              <span className="font-medium">{status?.totalFinalQCApproved.toLocaleString()} pcs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Packed:</span>
              <span className="font-medium">{status?.totalPacked.toLocaleString()} pcs</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Dispatched:</span>
              <span className="font-medium">{status?.totalDispatched.toLocaleString()} pcs</span>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkComplete} disabled={completing} className="gap-2">
              {completing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Complete Work Order
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
