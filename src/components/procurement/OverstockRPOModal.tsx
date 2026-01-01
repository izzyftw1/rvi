import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle } from "lucide-react";

interface OverstockRPOModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Supplier {
  id: string;
  name: string;
}

export function OverstockRPOModal({ open, onClose, onSuccess }: OverstockRPOModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Spec options
  const [sizeOptions, setSizeOptions] = useState<string[]>([]);
  const [alloyOptions, setAlloyOptions] = useState<string[]>([]);
  
  // Form state
  const [materialSizeMM, setMaterialSizeMM] = useState("");
  const [alloy, setAlloy] = useState("");
  const [qtyToOrder, setQtyToOrder] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [overstockReason, setOverstockReason] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) return;
    loadSuppliers();
    loadSpecOptions();
    resetForm();
  }, [open]);

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");

    if (error) {
      console.error("Error loading suppliers:", error);
      return;
    }
    setSuppliers(data || []);
  };

  const loadSpecOptions = async () => {
    try {
      const [itemsRes, rpoRes] = await Promise.all([
        supabase.from("item_master").select("material_size_mm, alloy").limit(1000),
        supabase.from("raw_purchase_orders").select("material_size_mm, alloy").limit(1000),
      ]);

      const rows = [...(itemsRes.data || []), ...(rpoRes.data || [])] as Array<{
        material_size_mm: string | null;
        alloy: string | null;
      }>;

      const sizeSet = new Set<string>();
      const alloySet = new Set<string>();

      rows.forEach((r) => {
        const s = (r.material_size_mm || "").trim();
        const a = (r.alloy || "").trim();
        if (s) sizeSet.add(s);
        if (a) alloySet.add(a);
      });

      const sortAlphaNum = (a: string, b: string) =>
        a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

      setSizeOptions(Array.from(sizeSet).sort(sortAlphaNum));
      setAlloyOptions(Array.from(alloySet).sort(sortAlphaNum));
    } catch (e) {
      console.error("Error loading spec options", e);
    }
  };

  const resetForm = () => {
    setMaterialSizeMM("");
    setAlloy("");
    setQtyToOrder("");
    setSupplierId("");
    setRatePerKg("");
    setExpectedDelivery("");
    setOverstockReason("");
    setRemarks("");
  };

  const validateForm = () => {
    if (!supplierId) {
      toast({ variant: "destructive", description: "Please select a supplier" });
      return false;
    }
    if (!ratePerKg || parseFloat(ratePerKg) <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid rate per kg" });
      return false;
    }
    if (!qtyToOrder || parseFloat(qtyToOrder) <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid quantity" });
      return false;
    }
    if (!materialSizeMM?.trim()) {
      toast({ variant: "destructive", description: "Material size is required" });
      return false;
    }
    if (!alloy?.trim()) {
      toast({ variant: "destructive", description: "Alloy is required" });
      return false;
    }
    if (!overstockReason?.trim()) {
      toast({ variant: "destructive", description: "Overstock/planning reason is required" });
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Generate RPO number
      const { data: rpoNumber, error: rpoError } = await supabase.rpc("generate_rpo_number");
      if (rpoError) throw rpoError;

      const qty = parseFloat(qtyToOrder);
      const rate = parseFloat(ratePerKg);
      const amount = qty * rate;

      const { error } = await supabase
        .from("raw_purchase_orders")
        .insert({
          rpo_no: rpoNumber,
          status: 'pending_approval',
          supplier_id: supplierId,
          created_by: user.id,
          wo_id: null,
          so_id: null,
          material_requirement_id: null,
          item_code: null,
          material_size_mm: materialSizeMM,
          alloy,
          qty_ordered_kg: qty,
          rate_per_kg: rate,
          amount_ordered: amount,
          expected_delivery_date: expectedDelivery || null,
          remarks,
          procurement_type: 'overstock',
          overstock_reason: overstockReason
        });

      if (error) throw error;

      toast({
        title: "Overstock RPO Created",
        description: `RPO ${rpoNumber} has been submitted for approval`
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving RPO:", error);
      toast({
        variant: "destructive",
        title: "Failed to Create RPO",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = useMemo(() => {
    const qty = parseFloat(qtyToOrder || "0") || 0;
    const rate = parseFloat(ratePerKg || "0") || 0;
    return qty * rate;
  }, [qtyToOrder, ratePerKg]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Overstock / Planning RPO</DialogTitle>
          <DialogDescription>
            Create a raw material purchase order for forward planning or inventory stocking without linking to a sales order.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">Overstock Procurement</p>
              <p className="text-xs mt-1">This material will go directly to inventory and is not linked to any sales order or work order.</p>
            </div>
          </div>

          {/* Material Size */}
          <div>
            <Label>Material/Rod Size *</Label>
            <Select value={materialSizeMM} onValueChange={setMaterialSizeMM}>
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {sizeOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-2"
              value={materialSizeMM}
              onChange={(e) => setMaterialSizeMM(e.target.value)}
              placeholder="Or enter manually (e.g. 16 ROUND)"
            />
          </div>

          {/* Alloy */}
          <div>
            <Label>Alloy *</Label>
            <Select value={alloy} onValueChange={setAlloy}>
              <SelectTrigger>
                <SelectValue placeholder="Select alloy" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {alloyOptions.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              className="mt-2"
              value={alloy}
              onChange={(e) => setAlloy(e.target.value)}
              placeholder="Or enter manually (e.g. CuZn39Pb3)"
            />
          </div>

          {/* Qty to Order */}
          <div>
            <Label>Quantity to Order (kg) *</Label>
            <Input
              type="number"
              step="0.001"
              value={qtyToOrder}
              onChange={(e) => setQtyToOrder(e.target.value)}
              placeholder="Enter quantity in kg"
            />
          </div>

          {/* Supplier */}
          <div>
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Supplier" />
              </SelectTrigger>
              <SelectContent className="bg-background z-[100]">
                {suppliers.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">No suppliers found</div>
                ) : (
                  suppliers.map((sup) => (
                    <SelectItem key={sup.id} value={sup.id}>
                      {sup.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Rate */}
          <div>
            <Label>Rate per kg (₹) *</Label>
            <Input
              type="number"
              step="0.01"
              value={ratePerKg}
              onChange={(e) => setRatePerKg(e.target.value)}
              placeholder="Enter rate per kg"
            />
            {totalAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Total Amount: ₹{totalAmount.toFixed(2)}</p>
            )}
          </div>

          {/* Expected Delivery */}
          <div>
            <Label>Expected Delivery Date</Label>
            <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
          </div>

          {/* Overstock Reason - Required */}
          <div>
            <Label>Planning / Overstock Reason *</Label>
            <Textarea
              value={overstockReason}
              onChange={(e) => setOverstockReason(e.target.value)}
              placeholder="e.g., Buffer stock for Q2, Anticipated demand increase, Lead time hedge"
              rows={2}
            />
            <p className="text-xs text-muted-foreground mt-1">Required for overstock procurement</p>
          </div>

          {/* Remarks */}
          <div>
            <Label>Additional Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any other notes"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
