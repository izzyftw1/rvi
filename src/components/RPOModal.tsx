import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WorkOrderSelect, WorkOrderOption } from "@/components/ui/work-order-select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface RPOModalProps {
  open: boolean;
  onClose: () => void;
  materialSize: string;
  suggestedAlloy?: string;
  deficitKg: number;
  linkedWorkOrders: WorkOrderOption[];
  linkedSalesOrders: Array<{ so_id: string; id: string }>;
  onSuccess: () => void;
}

interface Supplier {
  id: string;
  name: string;
}

type SpecOption = { value: string; label: string };

export function RPOModal({
  open,
  onClose,
  materialSize,
  suggestedAlloy,
  deficitKg,
  linkedWorkOrders,
  linkedSalesOrders,
  onSuccess
}: RPOModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [showAddSupplier, setShowAddSupplier] = useState(false);

  // Controlled-spec options
  const [sizeOptions, setSizeOptions] = useState<SpecOption[]>([]);
  const [alloyOptions, setAlloyOptions] = useState<SpecOption[]>([]);

  // Override controls
  const [overrideSpec, setOverrideSpec] = useState(false);
  const [sizeMode, setSizeMode] = useState<"select" | "manual">("select");
  const [alloyMode, setAlloyMode] = useState<"select" | "manual">("select");

  // Form state
  const [selectedWO, setSelectedWO] = useState<string>("");
  const [itemCode, setItemCode] = useState<string>("");
  const [qtyToOrder, setQtyToOrder] = useState<string>(deficitKg.toFixed(3));
  const [materialSizeMM, setMaterialSizeMM] = useState<string>(materialSize);
  const [alloy, setAlloy] = useState<string>(suggestedAlloy || "");
  const [supplierId, setSupplierId] = useState<string>("");
  const [ratePerKg, setRatePerKg] = useState<string>("");
  const [expectedDelivery, setExpectedDelivery] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  // New supplier form state
  const [newSupplierName, setNewSupplierName] = useState<string>("");
  const [newSupplierContact, setNewSupplierContact] = useState<string>("");
  const [newSupplierEmail, setNewSupplierEmail] = useState<string>("");
  const [newSupplierPhone, setNewSupplierPhone] = useState<string>("");
  const [addingSupplier, setAddingSupplier] = useState(false);

  useEffect(() => {
    if (!open) return;

    loadSuppliers();
    loadSpecOptions(materialSize, suggestedAlloy || "");

    // Pre-select first WO if available
    if (linkedWorkOrders.length > 0) {
      setSelectedWO(linkedWorkOrders[0].id);
      setItemCode(linkedWorkOrders[0].item_code);
    }

    // Reset to deficit
    setQtyToOrder(deficitKg.toFixed(3));

    // Lock to suggested spec by default, allow explicit override
    setOverrideSpec(false);
    setSizeMode("select");
    setAlloyMode("select");
    setMaterialSizeMM(materialSize);
    setAlloy(suggestedAlloy || "");
  }, [open, linkedWorkOrders, deficitKg, materialSize, suggestedAlloy]);

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

  const loadSpecOptions = async (currentSize: string, currentAlloy: string) => {
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

      const sortedSizes = Array.from(sizeSet).sort(sortAlphaNum);
      const sortedAlloys = Array.from(alloySet).sort(sortAlphaNum);

      const sizes = (currentSize ? [currentSize, ...sortedSizes.filter((s) => s !== currentSize)] : sortedSizes).map(
        (v) => ({ value: v, label: v })
      );

      const alloys = (currentAlloy ? [currentAlloy, ...sortedAlloys.filter((a) => a !== currentAlloy)] : sortedAlloys).map(
        (v) => ({ value: v, label: v })
      );

      setSizeOptions(sizes);
      setAlloyOptions(alloys);
    } catch (e) {
      console.error("Error loading spec options", e);
      // Keep UI usable even if options fail to load
      setSizeOptions(currentSize ? [{ value: currentSize, label: currentSize }] : []);
      setAlloyOptions(currentAlloy ? [{ value: currentAlloy, label: currentAlloy }] : []);
    }
  };

  const handleWOChange = (woId: string) => {
    if (woId === 'none') {
      setSelectedWO("");
      setItemCode("");
      return;
    }
    setSelectedWO(woId);
    const wo = linkedWorkOrders.find(w => w.id === woId);
    if (wo) {
      setItemCode(wo.item_code || "");
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
    if (!materialSizeMM?.trim()) {
      toast({ variant: "destructive", description: "Material size is required" });
      return false;
    }
    if (!alloy?.trim()) {
      toast({ variant: "destructive", description: "Alloy is required" });
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

  const handleAddSupplier = async () => {
    if (!newSupplierName.trim()) {
      toast({ variant: "destructive", description: "Supplier name is required" });
      return;
    }

    setAddingSupplier(true);
    try {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({
          name: newSupplierName.trim(),
          contact_name: newSupplierContact.trim() || null,
          email: newSupplierEmail.trim() || null,
          phone: newSupplierPhone.trim() || null
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Supplier Added",
        description: `${newSupplierName} has been added successfully`
      });

      await loadSuppliers();
      setSupplierId(data.id);

      setNewSupplierName("");
      setNewSupplierContact("");
      setNewSupplierEmail("");
      setNewSupplierPhone("");
      setShowAddSupplier(false);
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      toast({
        variant: "destructive",
        title: "Failed to Add Supplier",
        description: error.message
      });
    } finally {
      setAddingSupplier(false);
    }
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

  const totalAmount = useMemo(() => {
    const qty = parseFloat(qtyToOrder || "0") || 0;
    const rate = parseFloat(ratePerKg || "0") || 0;
    return qty * rate;
  }, [qtyToOrder, ratePerKg]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Raw Purchase Order</DialogTitle>
          <DialogDescription>
            Auto-filled from material requirement. Use override only if required.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Work Order */}
          <div>
            <Label>Work Order *</Label>
            <WorkOrderSelect
              value={selectedWO}
              onValueChange={handleWOChange}
              workOrders={linkedWorkOrders}
              placeholder="Select Work Order"
            />
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

          {/* Spec override toggle */}
          <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
            <div>
              <p className="text-sm font-medium">Material Spec</p>
              <p className="text-xs text-muted-foreground">Locked to requirement for consistency</p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">Override</Label>
              <Switch checked={overrideSpec} onCheckedChange={setOverrideSpec} />
            </div>
          </div>

          {/* Material Size */}
          <div>
            <Label>Material/Rod Size *</Label>
            <Select
              value={sizeMode === "manual" ? "__manual__" : materialSizeMM}
              onValueChange={(v) => {
                if (v === "__manual__") {
                  setSizeMode("manual");
                } else {
                  setSizeMode("select");
                  setMaterialSizeMM(v);
                }
              }}
              disabled={!overrideSpec}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="__manual__">Manual entry…</SelectItem>
                {sizeOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {sizeMode === "manual" && (
              <Input
                className="mt-2"
                value={materialSizeMM}
                onChange={(e) => setMaterialSizeMM(e.target.value)}
                placeholder="e.g. 16 ROUND"
                disabled={!overrideSpec}
              />
            )}
          </div>

          {/* Alloy */}
          <div>
            <Label>Alloy *</Label>
            <Select
              value={alloyMode === "manual" ? "__manual__" : alloy}
              onValueChange={(v) => {
                if (v === "__manual__") {
                  setAlloyMode("manual");
                } else {
                  setAlloyMode("select");
                  setAlloy(v);
                }
              }}
              disabled={!overrideSpec}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select alloy" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="__manual__">Manual entry…</SelectItem>
                {alloyOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {alloyMode === "manual" && (
              <Input
                className="mt-2"
                value={alloy}
                onChange={(e) => setAlloy(e.target.value)}
                placeholder="e.g. CuZn39Pb3"
                disabled={!overrideSpec}
              />
            )}
          </div>

          {/* Supplier */}
          <div>
            <Label>Supplier *</Label>
            <div className="flex gap-2">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="flex-1">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddSupplier(true)}
                className="shrink-0"
              >
                Add New
              </Button>
            </div>
          </div>

          {/* Add New Supplier */}
          {showAddSupplier && (
            <div className="border rounded-lg p-4 space-y-3 bg-muted/50">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Add New Supplier</h4>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddSupplier(false)}>
                  Cancel
                </Button>
              </div>
              <div>
                <Label className="text-xs">Supplier Name *</Label>
                <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} placeholder="Enter supplier name" />
              </div>
              <div>
                <Label className="text-xs">Contact Person</Label>
                <Input value={newSupplierContact} onChange={(e) => setNewSupplierContact(e.target.value)} placeholder="Contact person name" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={newSupplierEmail} onChange={(e) => setNewSupplierEmail(e.target.value)} placeholder="Email address" />
              </div>
              <div>
                <Label className="text-xs">Phone</Label>
                <Input value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} placeholder="Phone number" />
              </div>
              <Button type="button" onClick={handleAddSupplier} disabled={addingSupplier} className="w-full">
                {addingSupplier ? "Adding..." : "Add Supplier"}
              </Button>
            </div>
          )}

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
            {totalAmount > 0 && (
              <p className="text-xs text-muted-foreground mt-1">Total Amount: ₹{totalAmount.toFixed(2)}</p>
            )}
          </div>

          {/* Expected Delivery */}
          <div>
            <Label>Expected Delivery Date</Label>
            <Input type="date" value={expectedDelivery} onChange={(e) => setExpectedDelivery(e.target.value)} />
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
