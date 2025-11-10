import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Package, Calendar, DollarSign } from "lucide-react";

interface RawMaterialPOModalProps {
  open: boolean;
  onClose: () => void;
  materialGrade: string;
  alloy: string;
  deficitKg: number;
  linkedWOIds: string[];
  linkedRequirementIds: string[];
  onSuccess: () => void;
}

interface Supplier {
  id: string;
  name: string;
}

export function RawMaterialPOModal({
  open,
  onClose,
  materialGrade,
  alloy,
  deficitKg,
  linkedWOIds,
  linkedRequirementIds,
  onSuccess
}: RawMaterialPOModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Form state
  const [supplierId, setSupplierId] = useState("");
  const [qtyKg, setQtyKg] = useState(deficitKg.toFixed(3));
  const [ratePerKg, setRatePerKg] = useState("");
  const [expectedDate, setExpectedDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (open) {
      loadSuppliers();
      setQtyKg(deficitKg.toFixed(3));
    }
  }, [open, deficitKg]);

  const loadSuppliers = async () => {
    const { data, error } = await supabase
      .from("suppliers")
      .select("id, name")
      .order("name");
    
    if (error) {
      console.error("Error loading suppliers:", error);
      toast({
        title: "Error",
        description: "Failed to load suppliers",
        variant: "destructive"
      });
      return;
    }
    
    setSuppliers(data || []);
  };

  const handleSubmit = async () => {
    if (!supplierId || !qtyKg || !ratePerKg) {
      toast({
        title: "Missing Information",
        description: "Please fill all required fields",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Generate PO number
      const { data: poNumber, error: poNumError } = await supabase
        .rpc('generate_raw_po_number');

      if (poNumError) throw poNumError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create PO
      const { error: poError } = await supabase
        .from('raw_material_po')
        .insert({
          po_id: poNumber,
          supplier_id: supplierId,
          material_grade: materialGrade,
          alloy: alloy,
          qty_kg: parseFloat(qtyKg),
          rate_per_kg: parseFloat(ratePerKg),
          linked_wo_ids: linkedWOIds,
          linked_requirement_ids: linkedRequirementIds,
          expected_date: expectedDate,
          created_by: user?.id,
          remarks: remarks
        });

      if (poError) throw poError;

      toast({
        title: "Purchase Order Created",
        description: `PO ${poNumber} created successfully for ${materialGrade} – ${qtyKg} kg`
      });

      onSuccess();
      onClose();
      resetForm();

    } catch (error: any) {
      toast({
        title: "Error Creating PO",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSupplierId("");
    setQtyKg("");
    setRatePerKg("");
    setRemarks("");
  };

  const totalValue = parseFloat(qtyKg || "0") * parseFloat(ratePerKg || "0");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Create Raw Material Purchase Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Material Details Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Package className="w-4 h-4" />
              Material Details
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
              <div>
                <Label className="text-xs text-muted-foreground">Material Grade</Label>
                <div className="font-semibold">{materialGrade}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Alloy</Label>
                <div className="font-semibold">{alloy}</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Required Quantity</Label>
                <div className="font-semibold text-destructive">{deficitKg.toFixed(3)} kg</div>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Linked Work Orders</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {linkedWOIds.slice(0, 3).map((woId, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {woId.substring(0, 8)}...
                    </Badge>
                  ))}
                  {linkedWOIds.length > 3 && (
                    <Badge variant="secondary" className="text-xs">
                      +{linkedWOIds.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Supplier & Rate Details */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <DollarSign className="w-4 h-4" />
              Supplier & Rate Details
            </div>
            
            <div className="space-y-4">
              <div>
                <Label htmlFor="supplier">Supplier *</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger id="supplier">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {suppliers.map(supplier => (
                      <SelectItem key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="qty">Order Quantity (kg) *</Label>
                  <Input
                    id="qty"
                    type="number"
                    step="0.001"
                    value={qtyKg}
                    onChange={(e) => setQtyKg(e.target.value)}
                    placeholder="0.000"
                  />
                </div>
                <div>
                  <Label htmlFor="rate">Rate per kg *</Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    value={ratePerKg}
                    onChange={(e) => setRatePerKg(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="expected-date" className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Expected Delivery Date *
                </Label>
                <Input
                  id="expected-date"
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Additional notes or special instructions..."
                  rows={3}
                />
              </div>

              {/* Total Value Display */}
              {totalValue > 0 && (
                <div className="p-4 bg-primary/10 rounded-lg border border-primary/20">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">Total Order Value</span>
                    <span className="text-2xl font-bold text-primary">
                      ₹{totalValue.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating PO..." : "Create Purchase Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
