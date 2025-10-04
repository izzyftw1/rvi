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
    gross_weight: "",
    net_weight: "",
    bin_location: "",
    mtc_file: null as File | null,
  });

  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPO, setSelectedPO] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    
    const loadPurchaseOrders = async () => {
      const { data } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("status", "approved");
      if (data) setPurchaseOrders(data);
    };
    loadPurchaseOrders();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let mtcFileUrl = "";
      
      if (formData.mtc_file) {
        const fileExt = formData.mtc_file.name.split('.').pop();
        const fileName = `material_lots/${formData.lot_id}/mtc_${Date.now()}.${fileExt}`;
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

      await supabase.from("scan_events").insert({
        entity_type: "material_lot",
        entity_id: formData.lot_id,
        to_stage: "received",
        quantity: parseFloat(formData.net_weight),
        owner_id: user?.id,
        remarks: `Received from ${formData.supplier}`
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
      setFormData({
        lot_id: "", heat_no: "", alloy: "", supplier: "",
        gross_weight: "", net_weight: "", bin_location: "", mtc_file: null
      });
      setSelectedPO("");
    } catch (error) {
      toast({ variant: "destructive", description: "Failed to receive material" });
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = () => {
    toast({
      title: "Printing label",
      description: "QR code label for " + formData.lot_id,
    });
    // In production, this would trigger actual label printing
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Material Inwards</h1>
            <p className="text-sm text-muted-foreground">Receive new material lots</p>
          </div>
        </div>

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
      </div>
    </div>
  );
};

export default MaterialInwards;
