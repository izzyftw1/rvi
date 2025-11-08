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
    return move.qty_sent - (move.total_received || 0);
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

      // Update work order to reduce qty_external_wip
      const { data: woData, error: woFetchError } = await supabase
        .from("work_orders")
        .select("qty_external_wip, current_stage")
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

      // If WIP reaches zero and work order is in external stage, move to next stage (production)
      if (newWip === 0 && woData.current_stage && 
          ['job_work', 'plating', 'buffing', 'blasting', 'forging'].includes(woData.current_stage)) {
        updateData.current_stage = 'production';
        updateData.external_status = null;
        updateData.external_process_type = null;
      }

      const { error: woUpdateError } = await supabase
        .from("work_orders")
        .update(updateData)
        .eq("id", move.work_order_id);

      if (woUpdateError) {
        console.error("Failed to update work order:", woUpdateError);
        // Don't fail the operation if WO update fails
      }

      toast({
        title: "Success",
        description: `Received ${qty} items${newWip === 0 ? '. Work order moved to production stage.' : '.'}`,
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
