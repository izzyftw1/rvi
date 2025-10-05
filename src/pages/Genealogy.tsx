import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Search } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";

export default function Genealogy() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [genealogy, setGenealogy] = useState<any>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Search across entities
      let entityData: any = null;
      let entityType = "";

      // Try work order
      const { data: woData } = await supabase
        .from("work_orders")
        .select("*, sales_orders(so_id, customer)")
        .eq("wo_id", searchTerm)
        .maybeSingle();
      
      if (woData) {
        entityData = woData;
        entityType = "work_order";

        // Get materials issued
        const woId = woData.id as string;
        const { data: materials } = await supabase
          .from("wo_material_issues")
          .select("*, material_lots(lot_id, heat_no, alloy, supplier, purchase_orders(po_id, sales_orders(so_id)))")
          .eq("wo_id", woId);

        // Get QC records - note: qc_records doesn't have wo_id column, skip for now
        const qc: any[] = [];

        // Get cartons
        const { data: cartons } = await supabase
          .from("cartons")
          .select("*, pallets:pallet_cartons(pallet_id, pallets(pallet_id, shipments:shipment_pallets(shipments(*))))")
          .eq("wo_id", woId);

        // Get scan events
        const { data: scans } = await supabase
          .from("scan_events")
          .select("*")
          .eq("entity_type", "work_order")
          .eq("entity_id", searchTerm)
          .order("scan_date_time", { ascending: true });

        setGenealogy({
          type: entityType,
          entity: woData,
          materials,
          qc_records: qc,
          cartons,
          scan_events: scans
        });
      }

      // Try carton
      if (!entityData) {
        const { data: cartonData } = await supabase
          .from("cartons")
          .select("*, work_orders(wo_id, customer, item_code), pallets:pallet_cartons(pallet_id, pallets(pallet_id))")
          .eq("carton_id", searchTerm)
          .maybeSingle();
        
        if (cartonData) {
          entityData = cartonData;
          entityType = "carton";

          // Get work order details
          const cartonWOId = cartonData.wo_id;
          const { data: materials } = await supabase
            .from("wo_material_issues")
            .select("*, material_lots(lot_id, heat_no, alloy)")
            .eq("wo_id", cartonWOId);

          setGenealogy({
            type: entityType,
            entity: cartonData,
            materials,
            heat_numbers: cartonData.heat_nos
          });
        }
      }

      // Try pallet
      if (!entityData) {
        const { data: palletData } = await supabase
          .from("pallets")
          .select("*, cartons:pallet_cartons(cartons(carton_id, work_orders(wo_id, customer))), shipments:shipment_pallets(shipments(*))")
          .eq("pallet_id", searchTerm)
          .maybeSingle();
        
        if (palletData) {
          entityData = palletData;
          entityType = "pallet";
          setGenealogy({ type: entityType, entity: palletData });
        }
      }

      if (!entityData) {
        toast({ variant: "destructive", description: "No data found for this ID" });
      }
    } catch (error) {
      toast({ variant: "destructive", description: "Search failed" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Genealogy & Traceability" subtitle="Track materials and products throughout the production chain" />
      
      <div className="p-6">

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Search by WO / Carton / Pallet / Heat Number</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSearch} className="flex gap-2">
            <Input
              placeholder="Enter WO ID, Carton ID, Pallet ID, or Heat Number"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading}>
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </form>
        </CardContent>
      </Card>

      {genealogy && (
        <div className="space-y-6">
          {genealogy.type === "work_order" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Work Order: {genealogy.entity.wo_id}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p><strong>Customer:</strong> {genealogy.entity.customer}</p>
                  <p><strong>Item:</strong> {genealogy.entity.item_code}</p>
                  <p><strong>Quantity:</strong> {genealogy.entity.quantity} pcs</p>
                  <p><strong>Status:</strong> {genealogy.entity.status}</p>
                  {genealogy.entity.sales_orders && (
                    <p><strong>Sales Order:</strong> {genealogy.entity.sales_orders.so_id}</p>
                  )}
                </CardContent>
              </Card>

              {genealogy.materials && genealogy.materials.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Material Lots Issued</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {genealogy.materials.map((mat: any) => (
                        <div key={mat.id} className="border-l-4 border-primary pl-4">
                          <p><strong>Lot:</strong> {mat.material_lots.lot_id}</p>
                          <p><strong>Heat No:</strong> {mat.material_lots.heat_no}</p>
                          <p><strong>Alloy:</strong> {mat.material_lots.alloy}</p>
                          <p><strong>Supplier:</strong> {mat.material_lots.supplier}</p>
                          <p><strong>Quantity:</strong> {mat.quantity_kg} kg / {mat.quantity_pcs} pcs</p>
                          {mat.material_lots.purchase_orders?.sales_orders && (
                            <p className="text-sm text-muted-foreground">
                              From PO: {mat.material_lots.purchase_orders.po_id} → SO: {mat.material_lots.purchase_orders.sales_orders.so_id}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {genealogy.qc_records && genealogy.qc_records.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>QC Records</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {genealogy.qc_records.map((qc: any) => (
                        <div key={qc.id} className="border-l-4 border-green-500 pl-4">
                          <p><strong>QC ID:</strong> {qc.qc_id}</p>
                          <p><strong>Type:</strong> {qc.qc_type}</p>
                          <p><strong>Result:</strong> {qc.result}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(qc.qc_date_time).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {genealogy.scan_events && genealogy.scan_events.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Production Timeline</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {genealogy.scan_events.map((scan: any) => (
                        <div key={scan.id} className="flex justify-between border-b pb-2">
                          <div>
                            <p className="font-medium">{scan.to_stage}</p>
                            {scan.remarks && <p className="text-sm text-muted-foreground">{scan.remarks}</p>}
                          </div>
                          <p className="text-sm">{new Date(scan.scan_date_time).toLocaleString()}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {genealogy.cartons && genealogy.cartons.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Cartons & Dispatch</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {genealogy.cartons.map((carton: any) => (
                        <div key={carton.id} className="border-l-4 border-blue-500 pl-4">
                          <p><strong>Carton:</strong> {carton.carton_id}</p>
                          <p><strong>Qty:</strong> {carton.quantity} pcs / {carton.net_weight} kg</p>
                          <p><strong>Heat Numbers:</strong> {carton.heat_nos.join(", ")}</p>
                          {carton.pallets && carton.pallets.length > 0 && (
                            <p className="text-sm">On Pallet: {carton.pallets[0].pallets.pallet_id}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {genealogy.type === "carton" && (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Carton: {genealogy.entity.carton_id}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p><strong>Work Order:</strong> {genealogy.entity.work_orders.wo_id}</p>
                  <p><strong>Customer:</strong> {genealogy.entity.work_orders.customer}</p>
                  <p><strong>Item:</strong> {genealogy.entity.work_orders.item_code}</p>
                  <p><strong>Quantity:</strong> {genealogy.entity.quantity} pcs</p>
                  <p><strong>Heat Numbers:</strong> {genealogy.heat_numbers.join(", ")}</p>
                </CardContent>
              </Card>

              {genealogy.materials && (
                <Card>
                  <CardHeader>
                    <CardTitle>Source Materials</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {genealogy.materials.map((mat: any) => (
                      <div key={mat.id} className="mb-2">
                        <p><strong>Lot:</strong> {mat.material_lots.lot_id}</p>
                        <p><strong>Heat:</strong> {mat.material_lots.heat_no}</p>
                        <p><strong>Alloy:</strong> {mat.material_lots.alloy}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {genealogy.type === "pallet" && (
            <Card>
              <CardHeader>
                <CardTitle>Pallet: {genealogy.entity.pallet_id}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p><strong>Cartons:</strong></p>
                  {genealogy.entity.cartons.map((pc: any) => (
                    <p key={pc.cartons.carton_id} className="ml-4">
                      {pc.cartons.carton_id} - WO: {pc.cartons.work_orders.wo_id}
                    </p>
                  ))}
                  {genealogy.entity.shipments && genealogy.entity.shipments.length > 0 && (
                    <>
                      <p className="mt-4"><strong>Shipment:</strong></p>
                      <p className="ml-4">{genealogy.entity.shipments[0].shipments.ship_id}</p>
                      <p className="ml-4">Customer: {genealogy.entity.shipments[0].shipments.customer}</p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
      </div>
    </div>
  );
}