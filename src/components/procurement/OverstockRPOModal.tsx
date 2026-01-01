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

interface MasterShape {
  id: string;
  name: string;
}

interface MasterSize {
  id: string;
  size_value: number;
  display_label: string;
}

interface MasterGrade {
  id: string;
  name: string;
  category: string | null;
}

export function OverstockRPOModal({ open, onClose, onSuccess }: OverstockRPOModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Master data
  const [masterShapes, setMasterShapes] = useState<MasterShape[]>([]);
  const [masterSizes, setMasterSizes] = useState<MasterSize[]>([]);
  const [masterGrades, setMasterGrades] = useState<MasterGrade[]>([]);
  
  // Form state
  const [shapeId, setShapeId] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [qtyToOrder, setQtyToOrder] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [ratePerKg, setRatePerKg] = useState("");
  const [expectedDelivery, setExpectedDelivery] = useState("");
  const [overstockReason, setOverstockReason] = useState("");
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (!open) return;
    loadData();
    resetForm();
  }, [open]);

  const loadData = async () => {
    try {
      const [suppliersRes, shapesRes, sizesRes, gradesRes] = await Promise.all([
        supabase.from("suppliers").select("id, name").order("name"),
        supabase.from("cross_section_shapes").select("id, name").order("name"),
        supabase.from("nominal_sizes").select("id, size_value, display_label").order("size_value"),
        supabase.from("material_grades").select("id, name, category").order("name")
      ]);

      if (suppliersRes.data) setSuppliers(suppliersRes.data);
      if (shapesRes.data) setMasterShapes(shapesRes.data);
      if (sizesRes.data) setMasterSizes(sizesRes.data);
      if (gradesRes.data) setMasterGrades(gradesRes.data);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const resetForm = () => {
    setShapeId("");
    setSizeId("");
    setGradeId("");
    setQtyToOrder("");
    setSupplierId("");
    setRatePerKg("");
    setExpectedDelivery("");
    setOverstockReason("");
    setRemarks("");
  };

  // Get selected values for display
  const selectedShape = masterShapes.find(s => s.id === shapeId);
  const selectedSize = masterSizes.find(s => s.id === sizeId);
  const selectedGrade = masterGrades.find(g => g.id === gradeId);

  // Build material_size_mm string (e.g., "16mm ROUND")
  const materialSizeMM = useMemo(() => {
    const parts: string[] = [];
    if (selectedSize) parts.push(`${selectedSize.size_value}mm`);
    if (selectedShape) parts.push(selectedShape.name.toUpperCase());
    return parts.join(' ') || '';
  }, [selectedSize, selectedShape]);

  // Alloy is the grade name
  const alloy = selectedGrade?.name || '';

  const validateForm = () => {
    if (!shapeId) {
      toast({ variant: "destructive", description: "Please select a cross section shape" });
      return false;
    }
    if (!sizeId) {
      toast({ variant: "destructive", description: "Please select a nominal size" });
      return false;
    }
    if (!gradeId) {
      toast({ variant: "destructive", description: "Please select a material grade" });
      return false;
    }
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

          {/* Cross Section Shape */}
          <div>
            <Label>Cross Section Shape *</Label>
            <Select value={shapeId} onValueChange={setShapeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select shape" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {masterShapes.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">No shapes found</div>
                ) : (
                  masterShapes.map((shape) => (
                    <SelectItem key={shape.id} value={shape.id}>
                      {shape.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Nominal Size */}
          <div>
            <Label>Nominal Size *</Label>
            <Select value={sizeId} onValueChange={setSizeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select size" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {masterSizes.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">No sizes found</div>
                ) : (
                  masterSizes.map((size) => (
                    <SelectItem key={size.id} value={size.id}>
                      {size.display_label || `${size.size_value}mm`}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Material Grade */}
          <div>
            <Label>Material Grade / Alloy *</Label>
            <Select value={gradeId} onValueChange={setGradeId}>
              <SelectTrigger>
                <SelectValue placeholder="Select grade" />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {masterGrades.length === 0 ? (
                  <div className="px-4 py-2 text-sm text-muted-foreground">No grades found</div>
                ) : (
                  masterGrades.map((grade) => (
                    <SelectItem key={grade.id} value={grade.id}>
                      {grade.name} {grade.category ? `(${grade.category})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Material Summary */}
          {materialSizeMM && alloy && (
            <div className="p-3 bg-muted rounded-lg">
              <Label className="text-xs text-muted-foreground">Material Specification</Label>
              <p className="font-medium">{materialSizeMM} - {alloy}</p>
            </div>
          )}

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
