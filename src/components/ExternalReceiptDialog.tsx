import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { useUserRole } from "@/hooks/useUserRole";
import { z } from "zod";
import { createExecutionRecord } from "@/hooks/useExecutionRecord";

// Validation schema for external receipt
const receiptSchema = z.object({
  qtyReceived: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity too large"),
  grnNo: z.string().max(100, "GRN number too long").optional(),
  rate: z.number().positive("Rate must be positive").optional(),
  remarks: z.string().max(500, "Remarks must be less than 500 characters").optional(),
});

interface ExternalReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  move: any;
  onSuccess: () => void;
}

export const ExternalReceiptDialog = ({ open, onOpenChange, move, onSuccess }: ExternalReceiptDialogProps) => {
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  const [loading, setLoading] = useState(false);
  
  const canCreate = hasAnyRole(['production', 'logistics', 'admin']);
  const [qtyReceived, setQtyReceived] = useState<string>("");
  const [grnNo, setGrnNo] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  const getMaxReceivable = () => {
    if (!move) return 0;
    const qtySent = move.quantity_sent ?? move.qty_sent ?? 0;
    return qtySent - (move.total_received || 0);
  };

  const handleSubmit = async () => {
    if (!canCreate) {
      toast({
        title: "Permission denied",
        description: "You do not have permission to create external receipts",
        variant: "destructive",
      });
      return;
    }
    
    // Validate inputs
    const qty = parseFloat(qtyReceived);
    const maxQty = getMaxReceivable();
    
    try {
      // Validate with Zod schema
      receiptSchema.parse({
        qtyReceived: qty,
        grnNo: grnNo?.trim() || undefined,
        rate: rate ? parseFloat(rate) : undefined,
        remarks: remarks?.trim() || undefined,
      });
      
      // Additional validation for max quantity
      if (qty > maxQty) {
        toast({
          title: "Invalid quantity",
          description: `Quantity cannot exceed ${maxQty} (remaining to receive)`,
          variant: "destructive",
        });
        return;
      }
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      }
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Insert receipt record
      const { error: receiptError } = await supabase
        .from("wo_external_receipts" as any)
        .insert({
          move_id: move.id,
          qty_received: qty,
          grn_no: grnNo || null,
          rate: rate ? parseFloat(rate) : null,
          remarks: remarks || null,
          created_by: user?.id,
        });

      if (receiptError) throw receiptError;

      // Calculate weight
      const { data: woWeightData } = await supabase
        .from("work_orders")
        .select("gross_weight_per_pc")
        .eq("id", move.work_order_id)
        .single();
      
      const weightPerPc = woWeightData?.gross_weight_per_pc || 0;
      const totalWeight = (qty * weightPerPc) / 1000; // Convert grams to kg

      // Log material movement (IN)
      const { error: movementError } = await supabase
        .from("material_movements")
        .insert({
          work_order_id: move.work_order_id,
          process_type: move.process,
          movement_type: 'in',
          qty: qty,
          weight: totalWeight,
          partner_id: move.partner_id,
          remarks: remarks?.trim() || null,
          created_by: user?.id,
        });
      
      if (movementError) {
        console.error("Failed to log material movement:", movementError);
        // Don't fail the operation
      }

      // Update the wo_external_moves record with received quantity
      const newQtyReturned = (move.quantity_returned || 0) + qty;
      const moveStatus = newQtyReturned >= (move.quantity_sent || 0) ? 'received' : 'partial';
      
      const { error: moveUpdateError } = await supabase
        .from("wo_external_moves")
        .update({
          quantity_returned: newQtyReturned,
          returned_date: moveStatus === 'received' ? new Date().toISOString().split('T')[0] : null,
          status: moveStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", move.id);

      if (moveUpdateError) {
        console.error("Failed to update external move:", moveUpdateError);
      }

      // Update work order to reduce qty_external_wip and update progress
      const { data: woData, error: woFetchError } = await supabase
        .from("work_orders")
        .select("qty_external_wip, current_stage, external_process_type, quantity")
        .eq("id", move.work_order_id)
        .single();

      if (woFetchError) throw woFetchError;

      const currentWip = woData.qty_external_wip || 0;
      const newWip = Math.max(0, currentWip - qty);

      // Prepare update object
      const updateData: any = {
        qty_external_wip: newWip,
        updated_at: new Date().toISOString(),
      };

      // If WIP reaches zero, look up next process from process_flow
      if (newWip === 0) {
        const currentProcess = woData.external_process_type || move.process;
        
        // Fetch next process from process_flow
        const { data: flowData, error: flowError } = await supabase
          .from("process_flow")
          .select("next_process, is_external")
          .eq("process_type", currentProcess)
          .single();
        
        if (!flowError && flowData) {
          if (flowData.next_process) {
            // Move to next process in the chain
            const stageMap: Record<string, string> = {
              'Forging': 'forging',
              'Plating': 'plating',
              'Buffing': 'buffing',
              'Blasting': 'blasting',
              'Job Work': 'job_work',
              'Dispatch': 'dispatch',
            };
            updateData.current_stage = (stageMap[flowData.next_process] || flowData.next_process.toLowerCase().replace(' ', '_')) as any;
            updateData.external_process_type = flowData.is_external ? flowData.next_process : null;
            updateData.external_status = flowData.is_external ? 'pending' : null;
            updateData.material_location = flowData.is_external ? 'Pending Assignment' : 'Factory';
          } else {
            // No next process - mark as ready for dispatch
            updateData.current_stage = 'dispatch' as any;
            updateData.ready_for_dispatch = true;
            updateData.external_status = null;
            updateData.external_process_type = null;
            updateData.material_location = 'Factory';
          }
        } else {
          // Fallback: move to production if no process flow found
          updateData.current_stage = 'production' as any;
          updateData.external_status = null;
          updateData.external_process_type = null;
          updateData.material_location = 'Factory';
        }
      }

      const { error: woUpdateError } = await supabase
        .from("work_orders")
        .update(updateData)
        .eq("id", move.work_order_id);

      if (woUpdateError) {
        console.error("Failed to update work order:", woUpdateError);
        // Don't fail the operation if WO update fails
      }

      const nextStageName = updateData.current_stage ? 
        updateData.current_stage.replace('_', ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : 
        '';

      // Create execution record for external process IN
      await createExecutionRecord({
        workOrderId: move.work_order_id,
        operationType: 'EXTERNAL_PROCESS',
        processName: move.process,
        quantity: qty,
        unit: 'pcs',
        direction: 'IN',
        relatedPartnerId: move.partner_id,
        relatedChallanId: move.id,
      });

      toast({
        title: "Material Received",
        description: `Material returned from ${move.process} - ${qty} pcs ready for ${nextStageName || 'next step'}.`,
      });

      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating receipt:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setQtyReceived("");
    setGrnNo("");
    setRate("");
    setRemarks("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Receipt</DialogTitle>
          <DialogDescription>
            Challan: {move?.challan_no} | Remaining: {getMaxReceivable()} pcs
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Quantity Received * (Max: {getMaxReceivable()})</Label>
            <Input
              type="number"
              value={qtyReceived}
              onChange={(e) => setQtyReceived(e.target.value)}
              placeholder="Enter quantity"
              max={getMaxReceivable()}
            />
          </div>

          <div className="space-y-2">
            <Label>Partner GRN/Invoice No</Label>
            <Input
              value={grnNo}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 100) {
                  setGrnNo(value);
                }
              }}
              placeholder="Optional"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label>Rate (per pc)</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => {
                const value = e.target.value;
                if (value.length <= 500) {
                  setRemarks(value);
                }
              }}
              placeholder="Optional notes"
              rows={2}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              {remarks.length}/500 characters
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !canCreate}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
