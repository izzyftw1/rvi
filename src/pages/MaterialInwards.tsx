import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Package, Upload, Search } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RPO {
  id: string;
  rpo_no: string;
  wo_id: string;
  material_size_mm: string;
  alloy: string;
  qty_ordered_kg: number;
  rate_per_kg: number;
  supplier_id: string;
  status: string;
  suppliers: { name: string };
  work_orders: { wo_id: string };
}

export default function MaterialInwards() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);

  // RPO Selection
  const [rpoSearchOpen, setRpoSearchOpen] = useState(false);
  const [approvedRPOs, setApprovedRPOs] = useState<RPO[]>([]);
  const [selectedRPO, setSelectedRPO] = useState<RPO | null>(null);
  const [rpoSearch, setRpoSearch] = useState("");

  // Form State
  const [formData, setFormData] = useState({
    qty_received_kg: "",
    heat_no: "",
    supplier_invoice_no: "",
    supplier_invoice_date: "",
    rate_on_invoice: "",
    lr_no: "",
    transporter: "",
    notes: "",
    invoice_file: null as File | null
  });

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();

    loadApprovedRPOs();

    // Check if RPO is pre-selected from URL
    const rpoId = searchParams.get("rpo_id");
    if (rpoId) {
      loadSpecificRPO(rpoId);
    }
  }, []);

  const loadApprovedRPOs = async () => {
    try {
      const { data, error } = await supabase
        .from("raw_purchase_orders")
        .select(`
          *,
          suppliers(name),
          work_orders(wo_id)
        `)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setApprovedRPOs(data || []);
    } catch (error: any) {
      console.error("Error loading RPOs:", error);
      toast({ variant: "destructive", description: error.message });
    }
  };

  const loadSpecificRPO = async (rpoId: string) => {
    try {
      const { data, error } = await supabase
        .from("raw_purchase_orders")
        .select(`
          *,
          suppliers(name),
          work_orders(wo_id)
        `)
        .eq("id", rpoId)
        .single();

      if (error) throw error;
      if (data) {
        handleRPOSelection(data);
      }
    } catch (error: any) {
      console.error("Error loading RPO:", error);
    }
  };

  const handleRPOSelection = (rpo: RPO) => {
    setSelectedRPO(rpo);
    setFormData({
      ...formData,
      rate_on_invoice: rpo.rate_per_kg.toString()
    });
    setRpoSearchOpen(false);
  };

  const filteredRPOs = approvedRPOs.filter(rpo => {
    const search = rpoSearch.toLowerCase();
    return (
      rpo.rpo_no.toLowerCase().includes(search) ||
      rpo.work_orders?.wo_id.toLowerCase().includes(search) ||
      rpo.suppliers?.name.toLowerCase().includes(search) ||
      rpo.material_size_mm.includes(search) ||
      rpo.alloy.toLowerCase().includes(search)
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!selectedRPO) {
        toast({ variant: "destructive", description: "Please select an RPO" });
        setLoading(false);
        return;
      }

      if (!formData.qty_received_kg || parseFloat(formData.qty_received_kg) <= 0) {
        toast({ variant: "destructive", description: "Quantity received must be greater than 0" });
        setLoading(false);
        return;
      }

      if (!formData.heat_no) {
        toast({ variant: "destructive", description: "Heat number is required" });
        setLoading(false);
        return;
      }

      const qtyReceived = parseFloat(formData.qty_received_kg);
      const rateOnInvoice = parseFloat(formData.rate_on_invoice || "0");

      // Upload invoice if provided
      let invoiceUrl = "";
      if (formData.invoice_file) {
        const fileExt = formData.invoice_file.name.split('.').pop();
        const fileName = `invoices/${selectedRPO.rpo_no}_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, formData.invoice_file);
        
        if (uploadError) throw uploadError;
        invoiceUrl = fileName;
      }

      // 1. Create raw_po_receipts entry
      const { data: receiptData, error: receiptError } = await supabase
        .from("raw_po_receipts")
        .insert({
          rpo_id: selectedRPO.id,
          received_date: new Date().toISOString().split('T')[0],
          qty_received_kg: qtyReceived,
          supplier_invoice_no: formData.supplier_invoice_no || null,
          supplier_invoice_date: formData.supplier_invoice_date || null,
          rate_on_invoice: rateOnInvoice,
          amount_on_invoice: formData.supplier_invoice_no ? qtyReceived * rateOnInvoice : null,
          lr_no: formData.lr_no || null,
          transporter: formData.transporter || null,
          notes: formData.notes || null
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      // 2. Create inventory_lots entry (auto-generates lot_id)
      const autoLotId = `LOT-${selectedRPO.rpo_no}-${Date.now()}`;
      const { error: invError } = await supabase
        .from("inventory_lots")
        .insert({
          lot_id: autoLotId,
          material_size_mm: selectedRPO.material_size_mm,
          alloy: selectedRPO.alloy,
          qty_kg: qtyReceived,
          supplier_id: selectedRPO.supplier_id,
          rpo_id: selectedRPO.id,
          heat_no: formData.heat_no,
          cost_rate: rateOnInvoice,
          received_date: new Date().toISOString().split('T')[0]
        });

      if (invError) throw invError;

      // 3. Get total received for this RPO
      const { data: receipts, error: receiptsError } = await supabase
        .from("raw_po_receipts")
        .select("qty_received_kg")
        .eq("rpo_id", selectedRPO.id);

      if (receiptsError) throw receiptsError;

      const totalReceived = (receipts || []).reduce((sum, r) => sum + r.qty_received_kg, 0);
      const qtyOrdered = selectedRPO.qty_ordered_kg;

      // 4. Auto-reconciliation logic
      const qtyDelta = totalReceived - qtyOrdered;
      const rateDelta = rateOnInvoice - selectedRPO.rate_per_kg;
      const remainingToOrder = Math.max(0, qtyOrdered - (totalReceived - qtyReceived));
      const amountDelta = (qtyReceived * rateOnInvoice) - (Math.min(qtyReceived, remainingToOrder) * selectedRPO.rate_per_kg);

      // Create reconciliation if any delta exists
      if (qtyDelta !== 0 || rateDelta !== 0 || Math.abs(amountDelta) > 0.01) {
        let reason = "other";
        if (totalReceived < qtyOrdered) {
          reason = "short_supply";
        } else if (totalReceived > qtyOrdered) {
          reason = "excess_supply";
        } else if (rateDelta !== 0) {
          reason = "rate_variance";
        }

        await supabase
          .from("raw_po_reconciliations")
          .insert({
            rpo_id: selectedRPO.id,
            qty_delta_kg: qtyDelta,
            rate_delta: rateDelta,
            amount_delta: amountDelta,
            reason: reason as any,
            resolution: "pending" as any,
            notes: `Auto-created on receipt. Qty received: ${qtyReceived} kg, Rate: ${rateOnInvoice}`
          } as any);
      }

      // 5. Update RPO status
      type RPOStatus = "draft" | "pending_approval" | "approved" | "part_received" | "closed" | "cancelled";
      let newStatus: RPOStatus = "approved";
      if (totalReceived === 0) {
        newStatus = "approved";
      } else if (totalReceived < qtyOrdered) {
        newStatus = "part_received";
      } else if (totalReceived >= qtyOrdered) {
        newStatus = "closed";
      }

      await supabase
        .from("raw_purchase_orders")
        .update({ status: newStatus })
        .eq("id", selectedRPO.id);

      toast({ title: "Success", description: `Material receipt recorded. RPO status: ${newStatus}` });

      // Reset form
      setSelectedRPO(null);
      setFormData({
        qty_received_kg: "",
        heat_no: "",
        supplier_invoice_no: "",
        supplier_invoice_date: "",
        rate_on_invoice: "",
        lr_no: "",
        transporter: "",
        notes: "",
        invoice_file: null
      });

      loadApprovedRPOs();
    } catch (error: any) {
      console.error("Error saving receipt:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Material Inwards - Goods In" subtitle="Receive raw materials and link to RPOs" />
      
      <div className="p-6">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle>Material Receipt</CardTitle>
              <CardDescription>Select an approved RPO and record material receipt details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* RPO Selection */}
              <div>
                <Label>Select Approved RPO *</Label>
                {selectedRPO ? (
                  <div className="mt-2 p-4 border rounded-lg bg-accent">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-lg">{selectedRPO.rpo_no}</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-sm">
                          <div><span className="text-muted-foreground">WO:</span> {selectedRPO.work_orders?.wo_id || "N/A"}</div>
                          <div><span className="text-muted-foreground">Supplier:</span> {selectedRPO.suppliers?.name}</div>
                          <div><span className="text-muted-foreground">Size:</span> {selectedRPO.material_size_mm} mm</div>
                          <div><span className="text-muted-foreground">Alloy:</span> {selectedRPO.alloy}</div>
                          <div><span className="text-muted-foreground">Qty Ordered:</span> {selectedRPO.qty_ordered_kg.toFixed(3)} kg</div>
                          <div><span className="text-muted-foreground">Rate:</span> ₹{selectedRPO.rate_per_kg.toFixed(2)}/kg</div>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedRPO(null)}>
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button type="button" variant="outline" className="w-full mt-2" onClick={() => setRpoSearchOpen(true)}>
                    <Search className="mr-2 h-4 w-4" />
                    Search & Select RPO
                  </Button>
                )}
              </div>

              {selectedRPO && (
                <>
                  {/* Receipt Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="qty_received_kg">Quantity Received (kg) *</Label>
                      <Input
                        id="qty_received_kg"
                        type="number"
                        step="0.001"
                        value={formData.qty_received_kg}
                        onChange={(e) => setFormData({...formData, qty_received_kg: e.target.value})}
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor="heat_no">Heat Number *</Label>
                      <Input
                        id="heat_no"
                        value={formData.heat_no}
                        onChange={(e) => setFormData({...formData, heat_no: e.target.value})}
                        required
                      />
                    </div>
                  </div>

                  {/* Invoice Details */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="supplier_invoice_no">Supplier Invoice No</Label>
                      <Input
                        id="supplier_invoice_no"
                        value={formData.supplier_invoice_no}
                        onChange={(e) => setFormData({...formData, supplier_invoice_no: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label htmlFor="supplier_invoice_date">Invoice Date</Label>
                      <Input
                        id="supplier_invoice_date"
                        type="date"
                        value={formData.supplier_invoice_date}
                        onChange={(e) => setFormData({...formData, supplier_invoice_date: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="rate_on_invoice">Rate on Invoice (per kg)</Label>
                      <Input
                        id="rate_on_invoice"
                        type="number"
                        step="0.01"
                        value={formData.rate_on_invoice}
                        onChange={(e) => setFormData({...formData, rate_on_invoice: e.target.value})}
                      />
                      {formData.rate_on_invoice && parseFloat(formData.rate_on_invoice) !== selectedRPO.rate_per_kg && (
                        <p className="text-xs text-amber-600 mt-1">
                          Rate variance: ₹{(parseFloat(formData.rate_on_invoice) - selectedRPO.rate_per_kg).toFixed(2)}/kg
                        </p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="lr_no">LR Number</Label>
                      <Input
                        id="lr_no"
                        value={formData.lr_no}
                        onChange={(e) => setFormData({...formData, lr_no: e.target.value})}
                      />
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="transporter">Transporter</Label>
                    <Input
                      id="transporter"
                      value={formData.transporter}
                      onChange={(e) => setFormData({...formData, transporter: e.target.value})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="invoice_file">Upload Invoice (PDF/Photo)</Label>
                    <Input
                      id="invoice_file"
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setFormData({...formData, invoice_file: e.target.files?.[0] || null})}
                    />
                  </div>

                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Input
                      id="notes"
                      value={formData.notes}
                      onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    />
                  </div>

                  <Button type="submit" disabled={loading} className="w-full">
                    <Package className="mr-2 h-4 w-4" />
                    {loading ? "Saving..." : "Record Receipt"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </form>
      </div>

      {/* RPO Search Dialog */}
      <Dialog open={rpoSearchOpen} onOpenChange={setRpoSearchOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Select Approved RPO</DialogTitle>
          </DialogHeader>

          <div className="mb-4">
            <Input
              placeholder="Search by RPO No, WO, Supplier, Size, Alloy..."
              value={rpoSearch}
              onChange={(e) => setRpoSearch(e.target.value)}
            />
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>RPO No</TableHead>
                <TableHead>WO</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Size/Alloy</TableHead>
                <TableHead>Qty (kg)</TableHead>
                <TableHead>Rate</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRPOs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    No approved RPOs found
                  </TableCell>
                </TableRow>
              ) : (
                filteredRPOs.map(rpo => (
                  <TableRow key={rpo.id}>
                    <TableCell className="font-medium">{rpo.rpo_no}</TableCell>
                    <TableCell>
                      {rpo.work_orders ? (
                        <Badge variant="secondary">{rpo.work_orders.wo_id}</Badge>
                      ) : "-"}
                    </TableCell>
                    <TableCell>{rpo.suppliers?.name}</TableCell>
                    <TableCell>
                      {rpo.material_size_mm} mm
                      <br />
                      <span className="text-xs text-muted-foreground">{rpo.alloy}</span>
                    </TableCell>
                    <TableCell>{rpo.qty_ordered_kg.toFixed(3)}</TableCell>
                    <TableCell>₹{rpo.rate_per_kg.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => handleRPOSelection(rpo)}>
                        Select
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
}
