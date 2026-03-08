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
import { createGateEntry } from "@/lib/gateRegisterUtils";

// Validation schema for external receipt
const receiptSchema = z.object({
  qtyReceived: z.number()
    .positive("Quantity must be greater than 0")
    .max(999999, "Quantity too large"),
  grnNo: z.string().max(100, "GRN number too long").optional(),
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
    
    const qty = parseFloat(qtyReceived);
    const maxQty = getMaxReceivable();
    
    try {
      // Validate with Zod schema
      receiptSchema.parse({
        qtyReceived: qty,
        grnNo: grnNo?.trim() || undefined,
        remarks: remarks?.trim() || undefined,
      });
      
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

      // P0 FIX: Use correct column names for wo_external_receipts
      // Schema: id, move_id, quantity_received, grn_no, received_at, received_by, remarks, created_at
      const { error: receiptError } = await supabase
        .from("wo_external_receipts" as any)
        .insert({
          move_id: move.id,
          quantity_received: qty,  // P0 FIX: was 'qty_received'
          grn_no: grnNo || null,
          received_by: user?.id,   // P0 FIX: was 'created_by' (doesn't exist)
          remarks: remarks || null,
          // P0 FIX: removed 'rate' (column doesn't exist) and 'created_by' (doesn't exist)
        });

      if (receiptError) throw receiptError;

      // Calculate weight
      const { data: woWeightData } = await supabase
        .from("work_orders")
        .select("gross_weight_per_pc")
        .eq("id", move.work_order_id)
        .single();
      
      const weightPerPc = woWeightData?.gross_weight_per_pc || 0;
      const totalWeight = (qty * weightPerPc) / 1000;

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
      }

      // P1 FIX: Update wo_external_moves - the sync_wo_on_external_move DB trigger
      // will automatically update work_orders.qty_external_wip, external_status, etc.
      // So we ONLY update the move record, removing redundant WO updates.
      const newQtyReturned = (move.quantity_returned || 0) + qty;
      const qtySent = move.quantity_sent ?? move.qty_sent ?? 0;
      const moveStatus = newQtyReturned >= qtySent ? 'received' : 'partial';
      
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
      // NOTE: sync_wo_on_external_move trigger now handles all work_orders updates automatically

      // P1 FIX: Update production_batch stage_type from 'external' back to trigger
      // the reset_batch_qc_on_external_return trigger which sets requires_qc_on_return=true
      // and post_external_qc_status='pending'
      if (move.batch_id) {
        const { error: batchUpdateError } = await supabase
          .from("production_batches")
          .update({
            stage_type: 'production' as any,
            current_location_type: 'factory',
            current_location_ref: null,
            batch_status: 'in_progress',
            ended_at: new Date().toISOString(),
            stage_entered_at: new Date().toISOString(),
          })
          .eq("id", move.batch_id);

        if (batchUpdateError) {
          console.error("Failed to update production batch for QC trigger:", batchUpdateError);
        }
      } else {
        // Fallback: find batch by wo_id + external partner + stage_type
        const { data: externalBatch } = await supabase
          .from("production_batches")
          .select("id")
          .eq("wo_id", move.work_order_id)
          .eq("stage_type", "external" as any)
          .eq("external_partner_id", move.partner_id)
          .limit(1)
          .maybeSingle();

        if (externalBatch) {
          await supabase
            .from("production_batches")
            .update({
              stage_type: 'production' as any,
              current_location_type: 'factory',
              current_location_ref: null,
              batch_status: 'in_progress',
              ended_at: new Date().toISOString(),
              stage_entered_at: new Date().toISOString(),
            })
            .eq("id", externalBatch.id);
        }
      }

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

      // Get item name from work order for gate entry enrichment
      const { data: woItemData } = await supabase
        .from("work_orders_restricted")
        .select("item_code, customer")
        .eq("id", move.work_order_id)
        .single();

      // P1 FIX: AUTO-CREATE GATE REGISTER ENTRY (IN) with external_movement_id linked
      const gateEntry = await createGateEntry({
        direction: 'IN',
        material_type: 'external_process',
        gross_weight_kg: totalWeight,
        net_weight_kg: totalWeight,
        estimated_pcs: qty,
        item_name: woItemData?.item_code || null,
        partner_id: move.partner_id || null,
        process_type: move.process || null,
        work_order_id: move.work_order_id,
        challan_no: move.challan_no || null,
        external_movement_id: move.id,  // P1 FIX: Link to specific external move
        qc_required: true,
        remarks: `Auto: Received ${qty} pcs from ${move.process} via ExternalReceipt`,
        created_by: user?.id || null,
      });

      toast({
        title: "Material Received",
        description: `${qty} pcs received from ${move.process}. QC inspection required before further processing.`,
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
