import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Truck, FileText, Download, ClipboardCheck } from "lucide-react";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";

export default function Dispatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [palletId, setPalletId] = useState("");
  const [palletData, setPalletData] = useState<any>(null);
  const [shipments, setShipments] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadShipments();
  }, []);

  const loadShipments = async () => {
    const { data } = await supabase
      .from("shipments")
      .select(`
        *,
        shipment_pallets(
          pallets(
            pallet_id,
            pallet_cartons(
              cartons(
                work_orders(id, wo_id)
              )
            )
          )
        )
      `)
      .order("created_at", { ascending: false });
    
    if (data) setShipments(data);
  };

  const handleFindPallet = async () => {
    const { data } = await supabase
      .from("pallets")
      .select(`
        *,
        pallet_cartons(
          cartons(
            carton_id,
            heat_nos,
            work_orders(wo_id, customer, item_code, dispatch_allowed)
          )
        )
      `)
      .eq("pallet_id", palletId)
      .maybeSingle();
    
    if (data) {
      setPalletData(data);
      
      // Check if all WOs are dispatch allowed
      const allAllowed = data.pallet_cartons?.every((pc: any) => 
        pc.cartons.work_orders.dispatch_allowed
      );
      
      if (!allAllowed) {
        toast({ 
          variant: "destructive", 
          description: "⚠️ QC Final not passed for all work orders. Dispatch blocked." 
        });
      }
    } else {
      toast({ variant: "destructive", description: "Pallet not found" });
    }
  };

  const handleCreateShipment = async () => {
    if (!palletData) return;

    // Verify dispatch allowed
    const allAllowed = palletData.pallet_cartons?.every((pc: any) => 
      pc.cartons.work_orders.dispatch_allowed
    );

    if (!allAllowed) {
      toast({ 
        variant: "destructive", 
        description: "Cannot dispatch: Final QC not passed" 
      });
      return;
    }

    setLoading(true);

    try {
      const customer = palletData.pallet_cartons[0]?.cartons.work_orders.customer || "Customer";
      
      const { data: shipment, error } = await supabase
        .from("shipments")
        .insert({
          ship_id: `SHIP-${Date.now()}`,
          customer,
          incoterm: "EXW",
          ship_date: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("shipment_pallets").insert({
        shipment_id: shipment.id,
        pallet_id: palletData.id
      });

      await supabase.from("scan_events").insert({
        entity_type: "pallet",
        entity_id: palletData.pallet_id,
        to_stage: "dispatched",
        owner_id: user?.id,
        remarks: `Shipment: ${shipment.ship_id}`
      });

      toast({ description: `✅ Shipment created: ${shipment.ship_id}` });
      setPalletId("");
      setPalletData(null);
      loadShipments();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const generateDocuments = (shipment: any) => {
    // Auto-generate COO, Packing List, Invoice
    const docs = {
      coo: `Certificate of Origin for ${shipment.ship_id}`,
      packingList: `Packing List: ${shipment.ship_id}`,
      invoice: `Invoice: ${shipment.ship_id}, Customer: ${shipment.customer}`
    };
    
    const blob = new Blob([JSON.stringify(docs, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shipment.ship_id}-documents.json`;
    a.click();
    
    toast({ description: "Documents downloaded" });
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <h1 className="text-3xl font-bold mb-6">Goods Dispatch</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Shipment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Scan or enter Pallet ID"
                value={palletId}
                onChange={(e) => setPalletId(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleFindPallet()}
              />
              <Button onClick={handleFindPallet}>Find</Button>
            </div>

            {palletData && (
              <div className="space-y-4 border-t pt-4">
                <h3 className="font-semibold">Pallet: {palletData.pallet_id}</h3>
                <div className="space-y-2">
                  {palletData.pallet_cartons?.map((pc: any) => (
                    <div key={pc.cartons.carton_id} className="text-sm border-l-4 border-primary pl-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p><strong>Carton:</strong> {pc.cartons.carton_id}</p>
                          <p><strong>WO:</strong> {pc.cartons.work_orders.wo_id}</p>
                          <p><strong>Heat Nos:</strong> {pc.cartons.heat_nos.join(", ")}</p>
                          <p className={pc.cartons.work_orders.dispatch_allowed ? "text-green-600" : "text-red-600"}>
                            {pc.cartons.work_orders.dispatch_allowed ? "✅ Dispatch Allowed" : "❌ QC Final Pending"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/dispatch-qc-report/${pc.cartons.work_orders.id}`)}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          QC Report
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <QRCodeDisplay 
                  value={palletData.pallet_id}
                  title="Pallet QR Code"
                  entityInfo={`${palletData.pallet_cartons?.length || 0} cartons`}
                  size={150}
                />

                <Button 
                  onClick={handleCreateShipment} 
                  disabled={loading}
                  className="w-full"
                >
                  <Truck className="mr-2 h-4 w-4" />
                  Create Shipment & Generate Docs
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Recent Shipments</h2>
          {shipments.map((shipment) => (
            <Card key={shipment.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <p className="font-semibold">{shipment.ship_id}</p>
                    <p className="text-sm text-muted-foreground">{shipment.customer}</p>
                    <p className="text-xs">
                      {new Date(shipment.ship_date).toLocaleDateString()}
                    </p>
                    <p className="text-xs">
                      Pallets: {shipment.shipment_pallets?.map((sp: any) => sp.pallets.pallet_id).join(", ")}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <QRCodeDisplay 
                      value={shipment.ship_id}
                      title="Shipment"
                      size={100}
                    />
                    <div className="flex flex-col gap-1">
                      <Button size="sm" variant="outline" onClick={() => generateDocuments(shipment)}>
                        <Download className="h-4 w-4 mr-2" />
                        Docs
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => {
                          const woId = shipment.shipment_pallets?.[0]?.pallets?.pallet_cartons?.[0]?.cartons?.work_orders?.id;
                          if (woId) navigate(`/dispatch-qc-report/${woId}`);
                        }}
                      >
                        <ClipboardCheck className="h-4 w-4 mr-2" />
                        QC Report
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}