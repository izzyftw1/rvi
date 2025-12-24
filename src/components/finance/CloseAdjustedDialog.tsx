import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface CloseAdjustedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: {
    id: string;
    invoice_no: string;
    total_amount: number;
    paid_amount: number;
    balance_amount: number;
    currency: string;
  };
  onSuccess: () => void;
}

type AdjustmentReason = 'rejection' | 'tds' | 'commercial' | 'other';
type ReferenceType = 'ncr' | 'internal_note' | 'credit_note' | 'tds_certificate';

const REASON_LABELS: Record<AdjustmentReason, string> = {
  rejection: 'Rejection / Quality Issue',
  tds: 'TDS Deduction',
  commercial: 'Commercial Settlement',
  other: 'Other'
};

const REFERENCE_TYPE_LABELS: Record<ReferenceType, string> = {
  ncr: 'NCR Reference',
  internal_note: 'Internal Note',
  credit_note: 'Credit Note',
  tds_certificate: 'TDS Certificate'
};

export function CloseAdjustedDialog({ open, onOpenChange, invoice, onSuccess }: CloseAdjustedDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [adjustmentAmount, setAdjustmentAmount] = useState(invoice.balance_amount.toString());
  const [adjustmentReason, setAdjustmentReason] = useState<AdjustmentReason>('rejection');
  const [referenceType, setReferenceType] = useState<ReferenceType>('internal_note');
  const [referenceNote, setReferenceNote] = useState('');

  const shortfall = invoice.balance_amount;
  const parsedAmount = parseFloat(adjustmentAmount) || 0;
  const isValidAmount = parsedAmount > 0 && parsedAmount <= shortfall;

  const handleClose = async () => {
    if (!isValidAmount) {
      toast({
        title: "Invalid amount",
        description: "Adjustment amount must be between 0 and the balance amount",
        variant: "destructive"
      });
      return;
    }

    if (!referenceNote.trim()) {
      toast({
        title: "Reference required",
        description: "Please provide a reference note for audit purposes",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create immutable closure adjustment record
      const { error: adjError } = await supabase
        .from("invoice_closure_adjustments")
        .insert({
          invoice_id: invoice.id,
          adjustment_amount: parsedAmount,
          adjustment_reason: adjustmentReason,
          reference_type: referenceType,
          reference_note: referenceNote.trim(),
          closed_by: user.id
        });

      if (adjError) throw adjError;

      // Update invoice status to closed_adjusted
      // Use type assertion since closed_adjusted was just added to enum
      const { error: invError } = await supabase
        .from("invoices")
        .update({
          status: 'closed_adjusted' as any,
          balance_amount: 0,
          closure_adjustment_total: parsedAmount,
          closed_adjusted_at: new Date().toISOString(),
          closed_adjusted_by: user.id
        })
        .eq("id", invoice.id);

      if (invError) throw invError;

      toast({
        title: "Invoice Closed",
        description: `Invoice ${invoice.invoice_no} has been closed with adjustment of ${invoice.currency} ${parsedAmount.toLocaleString()}`
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error closing invoice:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to close invoice",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Close Invoice with Adjustment
          </DialogTitle>
          <DialogDescription>
            Close invoice {invoice.invoice_no} even though full payment has not been received.
            This action is auditable and cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Invoice Summary */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg text-sm">
            <div>
              <span className="text-muted-foreground">Total Amount:</span>
              <p className="font-medium">{invoice.currency} {invoice.total_amount.toLocaleString()}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Received:</span>
              <p className="font-medium text-green-600">{invoice.currency} {invoice.paid_amount.toLocaleString()}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">Shortfall (Balance):</span>
              <p className="font-bold text-destructive">{invoice.currency} {shortfall.toLocaleString()}</p>
            </div>
          </div>

          {/* Adjustment Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Adjustment Amount</Label>
            <Input
              id="amount"
              type="number"
              value={adjustmentAmount}
              onChange={(e) => setAdjustmentAmount(e.target.value)}
              placeholder={shortfall.toString()}
              min={0}
              max={shortfall}
              step={0.01}
            />
            <p className="text-xs text-muted-foreground">
              Amount to write off (max: {invoice.currency} {shortfall.toLocaleString()})
            </p>
          </div>

          {/* Adjustment Reason */}
          <div className="space-y-2">
            <Label htmlFor="reason">Adjustment Reason</Label>
            <Select value={adjustmentReason} onValueChange={(v) => setAdjustmentReason(v as AdjustmentReason)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Type */}
          <div className="space-y-2">
            <Label htmlFor="refType">Reference Type</Label>
            <Select value={referenceType} onValueChange={(v) => setReferenceType(v as ReferenceType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(REFERENCE_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Reference Note */}
          <div className="space-y-2">
            <Label htmlFor="note">Reference / Notes *</Label>
            <Textarea
              id="note"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder={
                referenceType === 'ncr' ? 'Enter NCR number (e.g., NCR-2024-0123)' :
                referenceType === 'tds_certificate' ? 'Enter TDS certificate reference' :
                'Describe the reason for this adjustment'
              }
              rows={3}
            />
          </div>

          <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              <strong>Immutable Record:</strong> This adjustment will be permanently recorded for audit purposes and cannot be modified or deleted after submission.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleClose} 
            disabled={loading || !isValidAmount || !referenceNote.trim()}
            variant="destructive"
          >
            {loading ? "Processing..." : "Close Invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
