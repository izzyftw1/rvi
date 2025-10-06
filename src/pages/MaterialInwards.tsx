import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Package, Upload, Printer } from "lucide-react";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { materialLotSchema } from "@/lib/validationSchemas";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NavigationHeader } from "@/components/NavigationHeader";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import { Eye } from "lucide-react";

const MaterialInwards = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    lot_id: "",
    heat_no: "",
    alloy: "",
    supplier: "",
    material_size_mm: "",
    gross_weight: "",
    net_weight: "",
    bin_location: "",
    mtc_file: null as File | null,
  });

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPO, setSelectedPO] = useState("");

  const [lots, setLots] = useState<any[]>([]);
  const [lotsLoading, setLotsLoading] = useState(false);
  const [lotsError, setLotsError] = useState<string>("");

  const [editOpen, setEditOpen] = useState(false);
  const [selectedLot, setSelectedLot] = useState<any>(null);
  const [editForm, setEditForm] = useState({
    material_size_mm: "",
    gross_weight: "",
    net_weight: "",
    bin_location: "",
    supplier: "",
  });
  const [viewOpen, setViewOpen] = useState(false);
  const [viewLot, setViewLot] = useState<any>(null);

  const loadLots = async () => {
    setLotsLoading(true);
    try {
      const { data, error } = await supabase
        .from("material_lots")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      setLots(data ?? []);
      setLotsError("");
    } catch (e: any) {
      setLots([]);
      setLotsError(e?.message || String(e));
    } finally {
      setLotsLoading(false);
    }
  };

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        setUser(user);
      } catch (error) {
        console.error('Error fetching user:', error);
      }
    };
    getUser();
    
    const loadPurchaseOrders = async () => {
      try {
        const { data, error } = await supabase
          .from("purchase_orders")
          .select("*")
          .eq("status", "approved");
        if (error) throw error;
        setPurchaseOrders(data ?? []);
      } catch (error) {
        console.error('Error loading purchase orders:', error);
        setPurchaseOrders([]);
      }
    };
    loadPurchaseOrders();
    loadLots();

    const channel = supabase
      .channel("material-lots-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "material_lots" },
        () => loadLots()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input data
      const validationResult = materialLotSchema.safeParse(formData);
      if (!validationResult.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validationResult.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      let mtcFileUrl = "";
      
      if (formData.mtc_file) {
        // Sanitize file name to prevent path traversal attacks
        const fileExt = formData.mtc_file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf';
        const sanitizedLotId = formData.lot_id.replace(/[^A-Z0-9-]/gi, '');
        const fileName = `material_lots/${sanitizedLotId}/mtc_${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from("documents")
          .upload(fileName, formData.mtc_file);
        
        if (uploadError) throw uploadError;
        mtcFileUrl = fileName;
      }

      const { data: lotData, error: lotError } = await supabase
        .from("material_lots")
        .insert({
          lot_id: formData.lot_id,
          heat_no: formData.heat_no,
          alloy: formData.alloy,
          supplier: formData.supplier,
          material_size_mm: formData.material_size_mm || null,
          gross_weight: parseFloat(formData.gross_weight),
          net_weight: parseFloat(formData.net_weight),
          bin_location: formData.bin_location,
          mtc_file: mtcFileUrl,
          received_by: user?.id,
          po_id: selectedPO || null,
          qc_status: "pending"
        })
        .select()
        .single();

      if (lotError) throw lotError;

      // Create scan event for material receipt with QC status
      await supabase.from("scan_events").insert({
        entity_type: "material_lot",
        entity_id: formData.lot_id,
        to_stage: "received_pending_qc",
        quantity: parseFloat(formData.net_weight),
        owner_id: user?.id,
        remarks: `Received from ${formData.supplier}. QC Status: Pending`
      });

      // Mark PO as received
      if (selectedPO) {
        await supabase
          .from("purchase_orders")
          .update({ status: "received" })
          .eq("id", selectedPO);
      }

      // Notify QC team
      const qcUsers = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "quality");
      
      if (qcUsers.data) {
        await supabase.rpc("notify_users", {
          _user_ids: qcUsers.data.map(u => u.user_id),
          _type: "material_received",
          _title: "New Material for Incoming QC",
          _message: `Lot ${formData.lot_id} requires incoming inspection`,
          _entity_type: "material_lot",
          _entity_id: lotData.id
        });
      }

      toast({ description: "Material received successfully. QC team notified." });
      
      // Show QR code
      const qrDialog = document.getElementById(`qr-trigger-${lotData.lot_id}`);
      if (qrDialog) (qrDialog as HTMLButtonElement).click();
      
      setFormData({
        lot_id: "", heat_no: "", alloy: "", supplier: "",
        material_size_mm: "", gross_weight: "", net_weight: "", bin_location: "", mtc_file: null
      });
      setSelectedPO("");
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to receive material" });
    } finally {
      setLoading(false);
    }
  };

  const [lastCreatedLot, setLastCreatedLot] = useState<any>(null);

  useEffect(() => {
    if (lastCreatedLot) {
      toast({ description: "Material received successfully. QC team notified." });
    }
  }, [lastCreatedLot]);

  const handlePrintLabel = () => {
    toast({
      title: "Printing label",
      description: "QR code label for " + formData.lot_id,
    });
    // In production, this would trigger actual label printing
  };

  const openView = (lot: any) => {
    setViewLot(lot);
    setViewOpen(true);
  };

  const openEdit = (lot: any) => {
    setSelectedLot(lot);
    setEditForm({
      material_size_mm: lot.material_size_mm != null ? String(lot.material_size_mm) : "",
      gross_weight: lot.gross_weight != null ? String(lot.gross_weight) : "",
      net_weight: lot.net_weight != null ? String(lot.net_weight) : "",
      bin_location: lot.bin_location ?? "",
      supplier: lot.supplier ?? "",
    });
    setEditOpen(true);
  };

  const handleEditFromView = () => {
    setViewOpen(false);
    if (viewLot) {
      openEdit(viewLot);
    }
  };

  const saveEdit = async () => {
    if (!selectedLot) return;
    try {
      const { error } = await supabase
        .from("material_lots")
        .update({
          material_size_mm: editForm.material_size_mm || null,
          gross_weight: editForm.gross_weight ? parseFloat(editForm.gross_weight) : null,
          net_weight: editForm.net_weight ? parseFloat(editForm.net_weight) : null,
          bin_location: editForm.bin_location || null,
          supplier: editForm.supplier || null,
        })
        .eq("id", selectedLot.id);
      if (error) throw error;
      toast({ description: "Lot updated" });
      setEditOpen(false);
      setSelectedLot(null);
      loadLots();
    } catch (e: any) {
      toast({ variant: "destructive", description: e?.message || "Update failed" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Goods In - Material Inwards" subtitle="Receive new material lots" />
      
      <div className="max-w-3xl mx-auto p-4 space-y-6">

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              New Material Receipt
            </CardTitle>
            <CardDescription>
              Create a new material lot and assign bin location
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lot_id">Lot ID *</Label>
                  <Input
                    id="lot_id"
                    value={formData.lot_id}
                    onChange={(e) => setFormData({ ...formData, lot_id: e.target.value })}
                    placeholder="LOT-2025-001"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="heat_no">Heat Number *</Label>
                  <Input
                    id="heat_no"
                    value={formData.heat_no}
                    onChange={(e) => setFormData({ ...formData, heat_no: e.target.value })}
                    placeholder="HT-123456"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="alloy">Alloy *</Label>
                  <Input
                    id="alloy"
                    value={formData.alloy}
                    onChange={(e) => setFormData({ ...formData, alloy: e.target.value })}
                    placeholder="SS304"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supplier">Supplier *</Label>
                  <Input
                    id="supplier"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="ABC Metals Ltd"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="material_size_mm">Material Size/Type</Label>
                <Input
                  id="material_size_mm"
                  value={formData.material_size_mm}
                  onChange={(e) => setFormData({ ...formData, material_size_mm: e.target.value })}
                  placeholder="e.g., Round 12mm, Hex 25mm, Forged"
                />
                <p className="text-xs text-muted-foreground">Enter material type and size (Hex, Round, Rectangle, Hollow, Forged)</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="gross_weight">Gross Weight (kg) *</Label>
                  <Input
                    id="gross_weight"
                    type="number"
                    step="0.001"
                    value={formData.gross_weight}
                    onChange={(e) => setFormData({ ...formData, gross_weight: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="net_weight">Net Weight (kg) *</Label>
                  <Input
                    id="net_weight"
                    type="number"
                    step="0.001"
                    value={formData.net_weight}
                    onChange={(e) => setFormData({ ...formData, net_weight: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bin_location">Bin Location</Label>
                  <Input
                    id="bin_location"
                    value={formData.bin_location}
                    onChange={(e) => setFormData({ ...formData, bin_location: e.target.value })}
                    placeholder="A-12-03"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mtc_file">MTC File (EN 10204)</Label>
                <Input
                  id="mtc_file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFormData({ ...formData, mtc_file: e.target.files?.[0] || null })}
                />
                <p className="text-xs text-muted-foreground">Upload Material Test Certificate</p>
              </div>

              <div className="flex gap-3 pt-4">
                <Button type="submit" disabled={loading} className="flex-1">
                  <Package className="h-4 w-4 mr-2" />
                  Receive Material
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePrintLabel}
                  disabled={!formData.lot_id}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print Label
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Material Receipts</CardTitle>
            <CardDescription>Last 50 lots received</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lot ID</TableHead>
                  <TableHead>Size (mm)</TableHead>
                  <TableHead>Gross (kg)</TableHead>
                  <TableHead>Net (kg)</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>QC</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lotsLoading ? (
                  <TableRow><TableCell colSpan={9} className="text-center">Loading...</TableCell></TableRow>
                ) : lotsError ? (
                  <TableRow><TableCell colSpan={9} className="text-destructive">{lotsError}</TableCell></TableRow>
                ) : lots.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center">No Data Available</TableCell></TableRow>
                ) : (
                  lots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{lot.lot_id}</TableCell>
                      <TableCell>{lot.material_size_mm ?? 'N/A'}</TableCell>
                      <TableCell>{Number(lot.gross_weight ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{Number(lot.net_weight ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{lot.supplier || 'unknown'}</TableCell>
                      <TableCell>{lot.status}</TableCell>
                      <TableCell>{lot.qc_status || 'pending'}</TableCell>
                      <TableCell>{new Date(lot.received_date_time).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openView(lot)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(lot)}>Edit</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <HistoricalDataDialog
          open={viewOpen}
          onOpenChange={setViewOpen}
          data={viewLot}
          type="material_lot"
          onEdit={handleEditFromView}
        />

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Lot {selectedLot?.lot_id}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Size (mm)</Label>
                <Input value={editForm.material_size_mm} onChange={(e)=>setEditForm({...editForm, material_size_mm: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Gross (kg)</Label>
                <Input value={editForm.gross_weight} onChange={(e)=>setEditForm({...editForm, gross_weight: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Net (kg)</Label>
                <Input value={editForm.net_weight} onChange={(e)=>setEditForm({...editForm, net_weight: e.target.value})} />
              </div>
              <div className="space-y-2">
                <Label>Bin Location</Label>
                <Input value={editForm.bin_location} onChange={(e)=>setEditForm({...editForm, bin_location: e.target.value})} />
              </div>
              <div className="space-y-2 col-span-2">
                <Label>Supplier</Label>
                <Input value={editForm.supplier} onChange={(e)=>setEditForm({...editForm, supplier: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
              <Button onClick={saveEdit}>Save</Button>
            </div>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
};

export default MaterialInwards;
