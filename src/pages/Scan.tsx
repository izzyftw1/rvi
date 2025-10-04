import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { QrCode, Package, Factory, CheckCircle2, Box, Truck } from "lucide-react";

const Scan = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [scanInput, setScanInput] = useState("");
  const [scannedEntity, setScannedEntity] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleScan = async () => {
    if (!scanInput.trim()) return;

    setLoading(true);
    try {
      // Try to find the entity (WO, Lot, Carton, Pallet)
      let entity = null;
      let entityType = "";

      // Check work orders
      const { data: wo } = await supabase
        .from("work_orders")
        .select("*")
        .eq("wo_id", scanInput)
        .single();

      if (wo) {
        entity = wo;
        entityType = "work_order";
      }

      // Check material lots
      if (!entity) {
        const { data: lot } = await supabase
          .from("material_lots")
          .select("*")
          .eq("lot_id", scanInput)
          .single();

        if (lot) {
          entity = lot;
          entityType = "material_lot";
        }
      }

      // Check cartons
      if (!entity) {
        const { data: carton } = await supabase
          .from("cartons")
          .select("*, work_orders(*)")
          .eq("carton_id", scanInput)
          .single();

        if (carton) {
          entity = carton;
          entityType = "carton";
        }
      }

      // Check pallets
      if (!entity) {
        const { data: pallet } = await supabase
          .from("pallets")
          .select("*")
          .eq("pallet_id", scanInput)
          .single();

        if (pallet) {
          entity = pallet;
          entityType = "pallet";
        }
      }

      if (entity) {
        setScannedEntity({ ...entity, type: entityType });
        toast({
          title: "Scan successful",
          description: `Found ${entityType.replace("_", " ")}`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Not found",
          description: "No matching entity found. Check the ID and try again.",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Scan failed",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const recordScanEvent = async (stage: string) => {
    if (!scannedEntity) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      await supabase.from("scan_events").insert({
        entity_type: scannedEntity.type,
        entity_id: scanInput,
        to_stage: stage,
        owner_id: user?.id,
        scan_date_time: new Date().toISOString(),
      });

      toast({
        title: "Action recorded",
        description: `Moved to ${stage}`,
      });

      setScanInput("");
      setScannedEntity(null);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to record",
        description: error.message,
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Scan Console</h1>
            <p className="text-sm text-muted-foreground">Scan or enter entity ID</p>
          </div>
        </div>

        {/* Scanner Input */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Scan Entity
            </CardTitle>
            <CardDescription>
              Enter WO ID, Lot ID, Carton ID, or Pallet ID
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Enter or scan ID..."
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleScan()}
                className="text-lg h-14"
              />
              <Button onClick={handleScan} disabled={loading} className="h-14 px-8">
                Scan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Scanned Entity Info */}
        {scannedEntity && (
          <Card className="border-primary">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Scanned Entity</CardTitle>
                <Badge>{scannedEntity.type.replace("_", " ").toUpperCase()}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {scannedEntity.type === "work_order" && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{scannedEntity.customer}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Item Code:</span>
                    <span className="font-medium">{scannedEntity.item_code}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantity:</span>
                    <span className="font-medium">{scannedEntity.quantity} pcs</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <Badge variant="secondary">{scannedEntity.status}</Badge>
                  </div>
                </div>
              )}

              {scannedEntity.type === "material_lot" && (
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Heat No:</span>
                    <span className="font-medium">{scannedEntity.heat_no}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Alloy:</span>
                    <span className="font-medium">{scannedEntity.alloy}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Net Weight:</span>
                    <span className="font-medium">{scannedEntity.net_weight} kg</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier:</span>
                    <span className="font-medium">{scannedEntity.supplier}</span>
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="pt-4 border-t">
                <p className="text-sm font-medium mb-3">Quick Actions:</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => recordScanEvent("Received")}
                  >
                    <Package className="h-5 w-5" />
                    <span className="text-xs">Receive</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => recordScanEvent("Production")}
                  >
                    <Factory className="h-5 w-5" />
                    <span className="text-xs">Start Production</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => recordScanEvent("QC")}
                  >
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-xs">Move to QC</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2"
                    onClick={() => recordScanEvent("Packing")}
                  >
                    <Box className="h-5 w-5" />
                    <span className="text-xs">Pack</span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto py-4 flex-col gap-2 col-span-2"
                    onClick={() => recordScanEvent("Dispatch")}
                  >
                    <Truck className="h-5 w-5" />
                    <span className="text-xs">Dispatch</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Scan;
