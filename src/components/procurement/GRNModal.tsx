import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { PackageCheck, AlertCircle } from "lucide-react";

interface GRNModalProps {
  open: boolean;
  onClose: () => void;
  preselectedPOId?: string;
  onSuccess: () => void;
}

interface PurchaseOrder {
  id: string;
  po_id: string;
  material_grade: string;
  alloy: string;
  qty_kg: number;
  supplier_id: string;
  suppliers?: { name: string };
}

export function GRNModal({
  open,
  onClose,
  preselectedPOId,
  onSuccess
}: GRNModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);
  
  // Form state
  const [poId, setPOId] = useState(preselectedPOId || "");
  const [receivedQty, setReceivedQty] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [supplierBatchRef, setSupplierBatchRef] = useState("");
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split('T')[0]);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    if (open) {
      loadPurchaseOrders();
      if (preselectedPOId) {
        setPOId(preselectedPOId);
      }
    }
  }, [open, preselectedPOId]);

  useEffect(() => {
    if (poId) {
      const po = purchaseOrders.find(p => p.id === poId);
      setSelectedPO(po || null);
      // Auto-generate lot number suggestion
      if (po) {
        const datePart = receivedDate.replace(/-/g, '');
        setLotNumber(`LOT-${po.material_grade.substring(0, 5)}-${datePart}`);
      }
    }
  }, [poId, purchaseOrders, receivedDate]);

  const loadPurchaseOrders = async () => {
    const { data, error } = await supabase
      .from("raw_material_po")
      .select(`
        id,
        po_id,
        material_grade,
        alloy,
        qty_kg,
        supplier_id,
        suppliers(name)
      `)
      .in('status', ['pending', 'partially_received'])
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error loading POs:", error);
      return;
    }
    
    setPurchaseOrders(data || []);
  };

  const handleSubmit = async () => {
    if (!poId || !receivedQty || !lotNumber) {
      toast({
        title: "Missing Information",
        description: "Please fill all required fields",
        variant: "destructive"
      });
      return;
    }

    if (!selectedPO) {
      toast({
        title: "Error",
        description: "Selected PO not found",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Generate GRN number
      const { data: grnNumber, error: grnNumError } = await supabase
        .rpc('generate_grn_number');

      if (grnNumError) throw grnNumError;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create GRN
      const { error: grnError } = await supabase
        .from('grn_receipts')
        .insert({
          grn_no: grnNumber,
          po_id: poId,
          received_qty_kg: parseFloat(receivedQty),
          lot_number: lotNumber,
          supplier_batch_ref: supplierBatchRef,
          material_grade: selectedPO.material_grade,
          alloy: selectedPO.alloy,
          received_date: receivedDate,
          received_by: user?.id,
          remarks: remarks
        });

      if (grnError) throw grnError;

      toast({
        title: "GRN Created Successfully",
        description: `${grnNumber} - Received ${receivedQty} kg of ${selectedPO.material_grade}`
      });

      onSuccess();
      onClose();
      resetForm();

    } catch (error: any) {
      toast({
        title: "Error Creating GRN",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setPOId("");
    setReceivedQty("");
    setLotNumber("");
    setSupplierBatchRef("");
    setRemarks("");
    setSelectedPO(null);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="w-5 h-5" />
            Create Goods Receipt Note (GRN)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div>
            <Label htmlFor="po">Purchase Order *</Label>
            <Select value={poId} onValueChange={setPOId}>
              <SelectTrigger id="po">
                <SelectValue placeholder="Select PO" />
              </SelectTrigger>
              <SelectContent>
                {purchaseOrders.map(po => (
                  <SelectItem key={po.id} value={po.id}>
                    {po.po_id} - {po.material_grade} ({po.qty_kg} kg) - {po.suppliers?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedPO && (
            <div className="p-4 bg-muted/30 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Material Grade:</span>
                <span className="font-semibold">{selectedPO.material_grade}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Alloy:</span>
                <span className="font-semibold">{selectedPO.alloy}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Ordered Quantity:</span>
                <span className="font-semibold">{selectedPO.qty_kg} kg</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="received-qty">Received Quantity (kg) *</Label>
              <Input
                id="received-qty"
                type="number"
                step="0.001"
                value={receivedQty}
                onChange={(e) => setReceivedQty(e.target.value)}
                placeholder="0.000"
              />
              {selectedPO && parseFloat(receivedQty) > selectedPO.qty_kg && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Exceeds ordered quantity
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="received-date">Received Date *</Label>
              <Input
                id="received-date"
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="lot-number">Lot Number *</Label>
            <Input
              id="lot-number"
              value={lotNumber}
              onChange={(e) => setLotNumber(e.target.value)}
              placeholder="LOT-XXXXX-YYYYMMDD"
            />
          </div>

          <div>
            <Label htmlFor="batch-ref">Supplier Batch Reference</Label>
            <Input
              id="batch-ref"
              value={supplierBatchRef}
              onChange={(e) => setSupplierBatchRef(e.target.value)}
              placeholder="Supplier's batch/heat number"
            />
          </div>

          <div>
            <Label htmlFor="remarks">Remarks</Label>
            <Textarea
              id="remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Inspection notes, damage report, etc."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Creating GRN..." : "Create GRN"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
