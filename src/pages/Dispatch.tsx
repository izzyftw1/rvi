import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Truck, Download, ClipboardCheck, FileText, MapPin } from "lucide-react";
import { QRCodeDisplay } from "@/components/QRCodeDisplay";
import { NavigationHeader } from "@/components/NavigationHeader";
import { ShipmentTimeline } from "@/components/ShipmentTimeline";
import { ShipmentDetailsDialog } from "@/components/ShipmentDetailsDialog";

export default function Dispatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [palletId, setPalletId] = useState("");
  const [palletData, setPalletData] = useState<any>(null);
  const [shipments, setShipments] = useState<any[]>([]);
  const [selectedShipment, setSelectedShipment] = useState<string | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

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
      const allWOs = data?.pallet_cartons?.map((pc: any) => pc?.cartons?.work_orders).filter(Boolean) || [];
      const allAllowed = allWOs.every((wo: any) => wo?.dispatch_allowed === true);
      
      if (!allAllowed) {
        // Check which WOs are missing QC approval
        const missingQC = allWOs
          .filter((wo: any) => !wo?.dispatch_allowed)
          .map((wo: any) => wo?.wo_id ?? "Unknown")
          .filter(Boolean);
        toast({ 
          variant: "destructive", 
          description: `⚠️ Pre-Dispatch QC Summary not approved for: ${missingQC.join(", ")}. Dispatch blocked.` 
        });
      }
    } else {
      toast({ variant: "destructive", description: "Pallet not found" });
    }
  };

  const handleCreateShipment = async () => {
    if (!palletData) return;

    // Verify dispatch allowed
    const allAllowed = palletData?.pallet_cartons?.every((pc: any) => 
      pc?.cartons?.work_orders?.dispatch_allowed === true
    ) ?? false;

    if (!allAllowed) {
      const missingQC = palletData?.pallet_cartons
        ?.map((pc: any) => pc?.cartons?.work_orders)
        .filter(Boolean)
        .filter((wo: any) => !wo?.dispatch_allowed)
        .map((wo: any) => wo?.wo_id ?? "Unknown")
        .filter(Boolean) || [];
      toast({ 
        variant: "destructive", 
        description: `Cannot dispatch: Pre-Dispatch QC Summary not approved for ${missingQC.join(", ")}` 
      });
      return;
    }

    setLoading(true);

    try {
      const customer = palletData?.pallet_cartons?.[0]?.cartons?.work_orders?.customer ?? "N/A";
      
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

  const generateDocuments = async (shipment: any) => {
    setLoading(true);
    
    try {
      // Fetch full shipment data with all related information
      const { data: fullShipment } = await supabase
        .from("shipments")
        .select(`
          *,
          shipment_pallets(
            pallets(
              pallet_id,
              pallet_cartons(
                cartons(
                  carton_id,
                  quantity,
                  net_weight,
                  gross_weight,
                  heat_nos,
                  work_orders(
                    wo_id,
                    customer,
                    item_code,
                    sales_orders(
                      so_id,
                      po_number,
                      po_date,
                      items
                    )
                  )
                )
              )
            )
          )
        `)
        .eq("id", shipment.id)
        .single();

      if (!fullShipment) {
        toast({ variant: "destructive", description: "Shipment data not found" });
        return;
      }

      // Extract data for document generation
      const pallets = fullShipment?.shipment_pallets || [];
      const allCartons = pallets.flatMap((sp: any) => 
        sp?.pallets?.pallet_cartons?.map((pc: any) => pc?.cartons).filter(Boolean) || []
      );
      
      const firstCarton = allCartons[0];
      const salesOrder = firstCarton?.work_orders?.sales_orders;
      
      // Generate invoice number and date
      const invoiceNo = fullShipment?.ship_id?.replace('SHIP-', 'EXPRV') ?? 'EXPRV-UNKNOWN';
      const currentDate = new Date().toLocaleDateString('en-GB').replace(/\//g, '-');
      
      // Prepare invoice data
      const invoiceData = {
        invoiceNo,
        date: currentDate,
        piNo: salesOrder?.so_id ?? 'N/A',
        piDate: salesOrder?.po_date ? new Date(salesOrder.po_date).toLocaleDateString('en-GB').replace(/\//g, '-') : currentDate,
        consignee: {
          name: fullShipment?.customer ?? "N/A",
          address: 'UNIT B-380, COURTNEY PARK, DRIVE E\nMISSISSAUGA, ON L5T 2S5\nCANADA'
        },
        notifyParty: {
          name: fullShipment.customer,
          address: 'UNIT 104 - 2945, 190TH STREET\nSURREY, BC V3Z 0W5\nCANADA'
        },
        portOfLoading: 'JNPT',
        portOfDischarge: 'TORONTO',
        finalDestination: 'TORONTO - CANADA',
        paymentTerms: '30% ADVANCE & BALANCE AGAINST COPY OF BL',
        marks: 'GRVL',
        kindOfPackages: `${allCartons.length} BOXES IN ${pallets.length} PALLET${pallets.length > 1 ? 'S' : ''}`,
        grossWeight: allCartons.reduce((sum: number, c: any) => sum + (Number(c?.gross_weight) || 0), 0),
        lineItems: allCartons.map((carton: any, idx: number) => ({
          srNo: idx + 1,
          description: `${carton?.work_orders?.item_code ?? 'ITEM'}`,
          hsCode: 'CETH-74153390',
          quantity: carton?.quantity ?? 0,
          rate: 4.0,
          total: (carton?.quantity ?? 0) * 4.0
        })),
        advance: 6000,
        currency: 'USD'
      };

      // Prepare packing list data
      const packingListData = {
        invoiceNo,
        date: currentDate,
        piNo: salesOrder?.so_id || 'N/A',
        piDate: salesOrder?.po_date ? new Date(salesOrder.po_date).toLocaleDateString('en-GB').replace(/\//g, '-') : currentDate,
        consignee: invoiceData.consignee,
        notifyParty: invoiceData.notifyParty,
        portOfLoading: 'JNPT',
        portOfDischarge: 'TORONTO',
        finalDestination: 'TORONTO - CANADA',
        paymentTerms: '30% ADVANCE & BALANCE AGAINST COPY OF BL',
        vessel: 'BY SEA',
        marks: 'GRVL',
        description: 'NUTS/SCREW/WASHERS MADE OF BRASS (CETH-74153390)',
        kindOfPackages: invoiceData.kindOfPackages,
        lineItems: pallets.map((pallet: any, idx: number) => {
          const palletCartons = pallet.pallets?.pallet_cartons || [];
          const totalPcs = palletCartons.reduce((sum: number, pc: any) => 
            sum + (pc.cartons?.quantity || 0), 0);
          const totalWeight = palletCartons.reduce((sum: number, pc: any) => 
            sum + (pc.cartons?.gross_weight || 0), 0);
          const firstCarton = palletCartons[0]?.cartons;
          
          return {
            palletNo: (idx + 1).toString(),
            boxNos: palletCartons.map((pc: any, i: number) => i + 1).join(', '),
            totalBoxes: palletCartons.length,
            pcsPerBox: firstCarton ? Math.round(firstCarton.quantity / palletCartons.length) : 0,
            totalPcs,
            itemName: firstCarton?.work_orders?.item_code || 'ITEM',
            grossWeight: totalWeight
          };
        })
      };

      // Generate PDFs
      const { generateCommercialInvoice, generatePackingList } = await import('@/lib/documentGenerator');
      
      const invoicePdf = generateCommercialInvoice(invoiceData);
      const packingListPdf = generatePackingList(packingListData);
      
      // Download both documents
      invoicePdf.save(`${invoiceNo}-Commercial-Invoice.pdf`);
      packingListPdf.save(`${invoiceNo}-Packing-List.pdf`);

      // Note: Document storage in shipments.documents will be available after migration
      // For now, documents are downloaded locally
      
      toast({ description: "✅ Commercial Invoice & Packing List generated successfully" });
    } catch (error: any) {
      console.error('Document generation error:', error);
      toast({ variant: "destructive", description: "Failed to generate documents: " + error.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Goods Dispatch" subtitle="Create shipments and dispatch pallets" />
      
      <div className="p-6">

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
                {palletData?.pallet_cartons && palletData.pallet_cartons.length > 0 ? (
                  palletData.pallet_cartons.map((pc: any) => (
                    <div key={pc?.cartons?.carton_id ?? Math.random()} className="text-sm border-l-4 border-primary pl-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p><strong>Carton:</strong> {pc?.cartons?.carton_id ?? "N/A"}</p>
                          <p><strong>WO:</strong> {pc?.cartons?.work_orders?.wo_id ?? "N/A"}</p>
                          <p><strong>Heat Nos:</strong> {pc?.cartons?.heat_nos?.join(", ") ?? "N/A"}</p>
                          <p className={pc?.cartons?.work_orders?.dispatch_allowed ? "text-green-600" : "text-red-600"}>
                            {pc?.cartons?.work_orders?.dispatch_allowed ? "✅ Dispatch Allowed" : "❌ QC Final Pending"}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/dispatch-qc-report/${pc?.cartons?.work_orders?.id ?? ''}`)}
                          disabled={!pc?.cartons?.work_orders?.id}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-1" />
                          QC Report
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">No cartons in this pallet</p>
                )}
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
          {shipments.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-2">
                <p className="text-lg font-medium">No Shipments Yet</p>
                <p className="text-sm text-muted-foreground">
                  Shipments will appear here when pallets are dispatched
                </p>
              </CardContent>
            </Card>
          ) : (
            shipments.map((shipment) => (
              <Card key={shipment?.id ?? Math.random()}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <p className="font-semibold">{shipment?.ship_id ?? "N/A"}</p>
                      <p className="text-sm text-muted-foreground">{shipment?.customer ?? "N/A"}</p>
                      <p className="text-xs">
                        {shipment?.ship_date ? new Date(shipment.ship_date).toLocaleDateString() : "—"}
                      </p>
                      <p className="text-xs">
                        Pallets: {shipment?.shipment_pallets?.map((sp: any) => sp?.pallets?.pallet_id ?? "N/A").join(", ") || "N/A"}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <QRCodeDisplay 
                        value={shipment?.ship_id ?? "N/A"}
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
                            const woId = shipment?.shipment_pallets?.[0]?.pallets?.pallet_cartons?.[0]?.cartons?.work_orders?.id;
                            if (woId) navigate(`/dispatch-qc-report/${woId}`);
                          }}
                          disabled={!shipment?.shipment_pallets?.[0]?.pallets?.pallet_cartons?.[0]?.cartons?.work_orders?.id}
                        >
                          <ClipboardCheck className="h-4 w-4 mr-2" />
                          QC Report
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}