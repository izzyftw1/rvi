import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ExternalReceiptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  move: any;
  onSuccess: () => void;
}

export const ExternalReceiptDialog = ({ open, onOpenChange, move, onSuccess }: ExternalReceiptDialogProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [qtyReceived, setQtyReceived] = useState<string>("");
  const [grnNo, setGrnNo] = useState<string>("");
  const [rate, setRate] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  const getMaxReceivable = () => {
    if (!move) return 0;
    return move.qty_sent - (move.total_received || 0);
  };

  const handleSubmit = async () => {
    if (!qtyReceived) {
      toast({
        title: "Missing quantity",
        description: "Please enter quantity received",
        variant: "destructive",
      });
      return;
    }

    const qty = parseFloat(qtyReceived);
    const maxQty = getMaxReceivable();

    if (qty <= 0 || qty > maxQty) {
      toast({
        title: "Invalid quantity",
        description: `Quantity must be between 1 and ${maxQty}`,
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("wo_external_receipts")
        .insert({
          move_id: move.id,
          qty_received: qty,
          grn_no: grnNo || null,
          rate: rate ? parseFloat(rate) : null,
          remarks: remarks || null,
          created_by: user?.id,
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Received ${qty} items`,
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
              onChange={(e) => setGrnNo(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label>Rate (per pc)</Label>
            <Input
              type="number"
              step="0.01"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional notes"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Record Receipt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
