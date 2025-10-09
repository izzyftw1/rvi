import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface RPOModalProps {
  open: boolean;
  onClose: () => void;
  materialSize: string;
  deficitKg: number;
  linkedWorkOrders: Array<{ wo_id: string; id: string; item_code: string }>;
  linkedSalesOrders: Array<{ so_id: string; id: string }>;
  onSuccess: () => void;
}

interface Supplier {
  id: string;
  name: string;
}

export function RPOModal({
  open,
  onClose,
  materialSize,
  deficitKg,
  linkedWorkOrders,
  linkedSalesOrders,
  onSuccess
}: RPOModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Form state
  const [selectedWO, setSelectedWO] = useState<string>("");
  const [itemCode, setItemCode] = useState<string>("");
  const [qtyToOrder, setQtyToOrder] = useState<string>(deficitKg.toFixed(3));
  const [materialSizeMM, setMaterialSizeMM] = useState<string>(materialSize);
  const [alloy, setAlloy] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [ratePerKg, setRatePerKg] = useState<string>("");
  const [expectedDelivery, setExpectedDelivery] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  useEffect(() => {
    if (open) {
      loadSuppliers();
      // Pre-select first WO if available
      if (linkedWorkOrders.length > 0) {
        setSelectedWO(linkedWorkOrders[0].id);
        setItemCode(linkedWorkOrders[0].item_code);
      }
      // Reset qty to deficit
      setQtyToOrder(deficitKg.toFixed(3));
      setMaterialSizeMM(materialSize);
    }
  }, [open, linkedWorkOrders, deficitKg, materialSize]);

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

  const handleWOChange = (woId: string) => {
    setSelectedWO(woId);
    const wo = linkedWorkOrders.find(w => w.id === woId);
    if (wo) {
      setItemCode(wo.item_code);
    }
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
    return true;
  };

  const handleSaveDraft = async () => {
    if (!validateForm()) return;
    await saveRPO("draft");
  };

  const handleSubmitForApproval = async () => {
    if (!validateForm()) return;
    await saveRPO("pending_approval");
  };

  const saveRPO = async (status: "draft" | "pending_approval") => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Check for existing draft RPO for same WO/Size/Alloy
      const { data: existingRPO } = await supabase
        .from("raw_purchase_orders")
        .select("rpo_no, status")
        .eq("wo_id", selectedWO)
        .eq("material_size_mm", materialSizeMM)
        .eq("alloy", alloy)
        .in("status", ["draft", "pending_approval"])
        .maybeSingle();

      if (existingRPO) {
        const proceed = window.confirm(
          `An RPO (${existingRPO.rpo_no}) already exists for this WO/Size/Alloy with status "${existingRPO.status}". Do you want to create another one?`
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
      }

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
          status,
          supplier_id: supplierId,
          created_by: user.id,
          wo_id: selectedWO || null,
          so_id: linkedSalesOrders[0]?.id || null,
          item_code: itemCode,
          material_size_mm: materialSizeMM,
          alloy,
          qty_ordered_kg: qty,
          rate_per_kg: rate,
          amount_ordered: amount,
          expected_delivery_date: expectedDelivery || null,
          remarks
        });

      if (error) throw error;

      toast({
        title: status === "draft" ? "Draft RPO Created" : "RPO Submitted for Approval",
        description: `RPO ${rpoNumber} has been ${status === "draft" ? "saved as draft" : "submitted for approval"}`
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      console.error("Error saving RPO:", error);
      toast({
        variant: "destructive",
        title: "Failed to Save RPO",
        description: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Raw Purchase Order</DialogTitle>
          <DialogDescription>
            Pre-filled with requirement details. Review and submit for approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Work Order */}
          <div>
            <Label>Work Order *</Label>
            <Select value={selectedWO} onValueChange={handleWOChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select Work Order" />
              </SelectTrigger>
              <SelectContent>
                {linkedWorkOrders.map(wo => (
                  <SelectItem key={wo.id} value={wo.id}>
                    {wo.wo_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Sales Order (Read-only) */}
          <div>
            <Label>Sales Order (Linked)</Label>
            <div className="flex gap-2 flex-wrap mt-1">
              {linkedSalesOrders.map(so => (
                <Badge key={so.id} variant="outline">{so.so_id}</Badge>
              ))}
            </div>
          </div>

          {/* Item Code (Read-only) */}
          <div>
            <Label>Item Code</Label>
            <Input value={itemCode} readOnly className="bg-muted" />
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
            <p className="text-xs text-muted-foreground mt-1">
              Deficit: {deficitKg.toFixed(3)} kg
            </p>
          </div>

          {/* Material Size */}
          <div>
            <Label>Material/Rod Size (mm) *</Label>
            <Input
              value={materialSizeMM}
              onChange={(e) => setMaterialSizeMM(e.target.value)}
              placeholder="e.g. 12.7"
            />
          </div>

          {/* Alloy */}
          <div>
            <Label>Alloy *</Label>
            <Input
              value={alloy}
              onChange={(e) => setAlloy(e.target.value)}
              placeholder="e.g. CuZn39Pb3"
            />
          </div>

          {/* Supplier */}
          <div>
            <Label>Supplier *</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Select Supplier" />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map(sup => (
                  <SelectItem key={sup.id} value={sup.id}>
                    {sup.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rate per kg */}
          <div>
            <Label>Rate per kg *</Label>
            <Input
              type="number"
              step="0.01"
              value={ratePerKg}
              onChange={(e) => setRatePerKg(e.target.value)}
              placeholder="Enter rate per kg"
            />
            {qtyToOrder && ratePerKg && (
              <p className="text-xs text-muted-foreground mt-1">
                Total Amount: ₹{(parseFloat(qtyToOrder) * parseFloat(ratePerKg)).toFixed(2)}
              </p>
            )}
          </div>

          {/* Expected Delivery */}
          <div>
            <Label>Expected Delivery Date</Label>
            <Input
              type="date"
              value={expectedDelivery}
              onChange={(e) => setExpectedDelivery(e.target.value)}
            />
          </div>

          {/* Remarks */}
          <div>
            <Label>Remarks</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Add any notes or special instructions"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={handleSaveDraft} disabled={loading}>
            Save Draft
          </Button>
          <Button onClick={handleSubmitForApproval} disabled={loading}>
            Submit for Approval
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
