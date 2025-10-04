import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Camera, ArrowLeft, Package, FileText, Box, Truck } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";

export default function ScanConsole() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [scanInput, setScanInput] = useState("");
  const [scannedEntity, setScannedEntity] = useState<any>(null);
  const [entityType, setEntityType] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [actionData, setActionData] = useState<any>({});

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setUser(user);
      if (user) {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        if (roles) setUserRoles(roles.map(r => r.role));
      }
    });
  }, []);

  const handleScan = async () => {
    if (!scanInput.trim()) return;
    
    setLoading(true);
    setScannedEntity(null);
    setEntityType("");
    setSelectedAction("");
    setActionData({});

    try {
      // Try material lot
      const { data: lotData } = await supabase
        .from("material_lots")
        .select("*")
        .eq("lot_id", scanInput)
        .maybeSingle();
      
      if (lotData) {
        setScannedEntity(lotData);
        setEntityType("material_lot");
        setLoading(false);
        return;
      }

      // Try work order
      const { data: woData } = await supabase
        .from("work_orders")
        .select("*")
        .eq("wo_id", scanInput)
        .maybeSingle();
      
      if (woData) {
        setScannedEntity(woData);
        setEntityType("work_order");
        setLoading(false);
        return;
      }

      // Try carton
      const { data: cartonData } = await supabase
        .from("cartons")
        .select("*, work_orders(wo_id, customer, item_code)")
        .eq("carton_id", scanInput)
        .maybeSingle();
      
      if (cartonData) {
        setScannedEntity(cartonData);
        setEntityType("carton");
        setLoading(false);
        return;
      }

      // Try pallet
      const { data: palletData } = await supabase
        .from("pallets")
        .select("*, cartons:pallet_cartons(cartons(carton_id, work_orders(wo_id)))")
        .eq("pallet_id", scanInput)
        .maybeSingle();
      
      if (palletData) {
        setScannedEntity(palletData);
        setEntityType("pallet");
        setLoading(false);
        return;
      }

      toast({ variant: "destructive", description: "No entity found with this ID" });
    } catch (error) {
      toast({ variant: "destructive", description: "Scan failed" });
    } finally {
      setLoading(false);
    }
  };

  const getAvailableActions = () => {
    const actions: string[] = [];
    
    if (entityType === "material_lot" && userRoles.includes("stores")) {
      actions.push("issue_to_wo");
    }
    
    if (entityType === "material_lot" && userRoles.includes("quality")) {
      if (scannedEntity?.qc_status === "pending") {
        actions.push("incoming_qc");
      }
    }
    
    if (entityType === "work_order" && userRoles.includes("production")) {
      if (scannedEntity?.production_allowed) {
        actions.push("start_step", "complete_step");
      }
    }
    
    if (entityType === "work_order" && userRoles.includes("quality")) {
      actions.push("batch_qc");
    }
    
    if (entityType === "work_order" && userRoles.includes("packing")) {
      actions.push("build_carton");
    }
    
    if (entityType === "carton" && userRoles.includes("packing")) {
      actions.push("build_pallet", "laser_mark");
    }
    
    if (entityType === "pallet" && userRoles.includes("accounts")) {
      if (scannedEntity?.dispatch_allowed !== false) {
        actions.push("ready_to_ship");
      }
    }

    return actions;
  };

  const handleExecuteAction = async () => {
    setLoading(true);

    try {
      switch (selectedAction) {
        case "issue_to_wo":
          const { data: woForIssue } = await supabase
            .from("work_orders")
            .select("id")
            .eq("wo_id", actionData.wo_id)
            .single();

          if (!woForIssue) {
            toast({ variant: "destructive", description: "Work order not found" });
            return;
          }

          await supabase.from("wo_material_issues").insert({
            wo_id: woForIssue.id,
            lot_id: scannedEntity.id,
            quantity_kg: parseFloat(actionData.quantity_kg || "0"),
            quantity_pcs: parseInt(actionData.quantity_pcs || "0"),
            uom: actionData.uom || "kg",
            issued_by: user?.id
          });

          await supabase.from("scan_events").insert({
            entity_type: "material_lot",
            entity_id: scannedEntity.lot_id,
            to_stage: "issued_to_wo",
            owner_id: user?.id,
            remarks: `Issued to WO: ${actionData.wo_id}`
          });

          // Update material status
          await supabase
            .from("material_lots")
            .update({ status: "issued" })
            .eq("id", scannedEntity.id);

          toast({ description: "Material issued to work order" });
          break;

        case "incoming_qc":
          await supabase
            .from("material_lots")
            .update({ qc_status: actionData.result })
            .eq("id", scannedEntity.id);

          await supabase.from("scan_events").insert({
            entity_type: "material_lot",
            entity_id: scannedEntity.lot_id,
            to_stage: `qc_incoming_${actionData.result}`,
            owner_id: user?.id,
            remarks: actionData.remarks || `QC Result: ${actionData.result}`
          });

          // If pass, notify production and allow WOs to start
          if (actionData.result === "pass") {
            const { data: relatedWOs } = await supabase
              .from("wo_material_issues")
              .select("wo_id")
              .eq("lot_id", scannedEntity.id);

            if (relatedWOs && relatedWOs.length > 0) {
              const woIds = relatedWOs.map(w => w.wo_id);
              await supabase
                .from("work_orders")
                .update({ production_allowed: true })
                .in("id", woIds);
            }
          }

          toast({ description: `Incoming QC marked as ${actionData.result}` });
          break;

        case "start_step":
          await supabase.from("scan_events").insert({
            entity_type: "work_order",
            entity_id: scannedEntity.wo_id,
            to_stage: `production_${actionData.step_name}`,
            from_stage: "pending",
            owner_id: user?.id,
            station: actionData.machine,
            remarks: `Started ${actionData.step_name}`
          });

          toast({ description: "Production step started" });
          break;

        case "complete_step":
          await supabase.from("scan_events").insert({
            entity_type: "work_order",
            entity_id: scannedEntity.wo_id,
            to_stage: "step_completed",
            quantity: parseFloat(actionData.qty_good || "0"),
            owner_id: user?.id,
            remarks: `Completed. Good: ${actionData.qty_good}, Reject: ${actionData.qty_reject || 0}`
          });

          toast({ description: "Production step completed" });
          break;

        case "batch_qc":
          await supabase.from("scan_events").insert({
            entity_type: "work_order",
            entity_id: scannedEntity.wo_id,
            to_stage: `qc_batch_${actionData.result}`,
            owner_id: user?.id,
            remarks: `Batch QC: ${actionData.result}, Report: ${actionData.report_no || "N/A"}`
          });

          // If final QC pass, allow dispatch
          if (actionData.qc_type === "final" && actionData.result === "pass") {
            await supabase
              .from("work_orders")
              .update({ dispatch_allowed: true })
              .eq("id", scannedEntity.id);
          }

          toast({ description: `Batch QC recorded: ${actionData.result}` });
          break;

        case "build_carton":
          const { data: newCarton } = await supabase
            .from("cartons")
            .insert({
              carton_id: actionData.carton_id,
              wo_id: scannedEntity.id,
              quantity: parseInt(actionData.quantity),
              net_weight: parseFloat(actionData.net_weight),
              gross_weight: parseFloat(actionData.gross_weight),
              heat_nos: actionData.heat_nos ? actionData.heat_nos.split(",").map((h: string) => h.trim()) : [],
              built_by: user?.id
            })
            .select()
            .single();

          await supabase.from("scan_events").insert({
            entity_type: "carton",
            entity_id: actionData.carton_id,
            to_stage: "carton_built",
            owner_id: user?.id,
            quantity: parseInt(actionData.quantity),
            remarks: `Built from WO: ${scannedEntity.wo_id}`
          });

          toast({ description: "Carton created successfully" });
          break;

        case "build_pallet":
          const { data: newPallet } = await supabase
            .from("pallets")
            .insert({
              pallet_id: actionData.pallet_id,
              built_by: user?.id
            })
            .select()
            .single();

          // Link carton to pallet
          await supabase.from("pallet_cartons").insert({
            pallet_id: newPallet.id,
            carton_id: scannedEntity.id
          });

          await supabase.from("scan_events").insert({
            entity_type: "pallet",
            entity_id: actionData.pallet_id,
            to_stage: "pallet_built",
            owner_id: user?.id,
            remarks: `Carton ${scannedEntity.carton_id} added to pallet`
          });

          toast({ description: "Carton added to pallet" });
          break;

        case "laser_mark":
          await supabase.from("laser_marking").insert({
            carton_id: scannedEntity.id,
            marking_details: { marked: true, details: actionData.marking_details },
            marked_by: user?.id,
            station: actionData.station
          });

          await supabase.from("scan_events").insert({
            entity_type: "carton",
            entity_id: scannedEntity.carton_id,
            to_stage: "laser_marked",
            owner_id: user?.id,
            station: actionData.station,
            remarks: "Laser marking completed"
          });

          toast({ description: "Laser marking recorded" });
          break;

        case "ready_to_ship":
          // Auto-generate shipment docs
          const { data: shipment } = await supabase
            .from("shipments")
            .insert({
              ship_id: `SHIP-${Date.now()}`,
              customer: actionData.customer,
              incoterm: actionData.incoterm || "EXW"
            })
            .select()
            .single();

          await supabase.from("shipment_pallets").insert({
            shipment_id: shipment.id,
            pallet_id: scannedEntity.id
          });

          await supabase.from("scan_events").insert({
            entity_type: "pallet",
            entity_id: scannedEntity.pallet_id,
            to_stage: "dispatched",
            owner_id: user?.id,
            remarks: `Shipment: ${shipment.ship_id}, Customer: ${actionData.customer}`
          });

          toast({ description: `Shipment created: ${shipment.ship_id}` });
          break;
      }

      // Reset
      setScanInput("");
      setScannedEntity(null);
      setEntityType("");
      setSelectedAction("");
      setActionData({});
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message || "Action failed" });
    } finally {
      setLoading(false);
    }
  };

  const actions = getAvailableActions();

  return (
    <div className="min-h-screen bg-background p-4 pb-20">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back
      </Button>

      <h1 className="text-2xl font-bold mb-6">Scan Console</h1>

      {/* Scan Input */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Scan Entity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Enter or scan Lot ID, WO ID, Carton ID, Pallet ID..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleScan()}
            className="text-lg h-14"
            autoFocus
          />
          <Button onClick={handleScan} disabled={loading} className="w-full h-12">
            <Camera className="mr-2 h-5 w-5" />
            Scan
          </Button>
        </CardContent>
      </Card>

      {/* Scanned Entity Info */}
      {scannedEntity && (
        <Card className="mb-6 border-primary">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {entityType === "material_lot" && <Package className="h-5 w-5" />}
              {entityType === "work_order" && <FileText className="h-5 w-5" />}
              {entityType === "carton" && <Box className="h-5 w-5" />}
              {entityType === "pallet" && <Truck className="h-5 w-5" />}
              {entityType === "material_lot" && `Material Lot: ${scannedEntity.lot_id}`}
              {entityType === "work_order" && `Work Order: ${scannedEntity.wo_id}`}
              {entityType === "carton" && `Carton: ${scannedEntity.carton_id}`}
              {entityType === "pallet" && `Pallet: ${scannedEntity.pallet_id}`}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {entityType === "material_lot" && (
              <>
                <p><strong>Heat No:</strong> {scannedEntity.heat_no}</p>
                <p><strong>Alloy:</strong> {scannedEntity.alloy}</p>
                <p><strong>Supplier:</strong> {scannedEntity.supplier}</p>
                <p><strong>Weight:</strong> {scannedEntity.net_weight} kg</p>
                <p><strong>QC Status:</strong> <span className={`px-2 py-1 rounded text-sm ${
                  scannedEntity.qc_status === 'pass' ? 'bg-green-100 text-green-800' :
                  scannedEntity.qc_status === 'fail' ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>{scannedEntity.qc_status}</span></p>
                <p><strong>Status:</strong> {scannedEntity.status}</p>
              </>
            )}
            {entityType === "work_order" && (
              <>
                <p><strong>Customer:</strong> {scannedEntity.customer}</p>
                <p><strong>Item:</strong> {scannedEntity.item_code}</p>
                <p><strong>Quantity:</strong> {scannedEntity.quantity} pcs</p>
                <p><strong>Status:</strong> {scannedEntity.status}</p>
                <p><strong>Production Allowed:</strong> {scannedEntity.production_allowed ? "✅ Yes" : "❌ No (awaiting incoming QC)"}</p>
              </>
            )}
            {entityType === "carton" && (
              <>
                <p><strong>Work Order:</strong> {scannedEntity.work_orders.wo_id}</p>
                <p><strong>Quantity:</strong> {scannedEntity.quantity} pcs</p>
                <p><strong>Weight:</strong> {scannedEntity.net_weight} kg</p>
                <p><strong>Heat Numbers:</strong> {scannedEntity.heat_nos.join(", ")}</p>
              </>
            )}
            {entityType === "pallet" && (
              <>
                <p><strong>Cartons:</strong> {scannedEntity.cartons?.length || 0}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      {scannedEntity && actions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Available Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Select value={selectedAction} onValueChange={setSelectedAction}>
              <SelectTrigger>
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                {actions.includes("issue_to_wo") && <SelectItem value="issue_to_wo">Issue to Work Order</SelectItem>}
                {actions.includes("incoming_qc") && <SelectItem value="incoming_qc">Incoming QC</SelectItem>}
                {actions.includes("start_step") && <SelectItem value="start_step">Start Production Step</SelectItem>}
                {actions.includes("complete_step") && <SelectItem value="complete_step">Complete Production Step</SelectItem>}
                {actions.includes("batch_qc") && <SelectItem value="batch_qc">Batch QC</SelectItem>}
                {actions.includes("build_carton") && <SelectItem value="build_carton">Build Carton</SelectItem>}
                {actions.includes("build_pallet") && <SelectItem value="build_pallet">Build Pallet</SelectItem>}
                {actions.includes("laser_mark") && <SelectItem value="laser_mark">Laser Mark</SelectItem>}
                {actions.includes("ready_to_ship") && <SelectItem value="ready_to_ship">Ready to Ship</SelectItem>}
              </SelectContent>
            </Select>

            {selectedAction === "issue_to_wo" && (
              <>
                <Input placeholder="WO ID" onChange={(e) => setActionData({...actionData, wo_id: e.target.value})} />
                <Input type="number" placeholder="Quantity (kg)" onChange={(e) => setActionData({...actionData, quantity_kg: e.target.value})} />
                <Input type="number" placeholder="Quantity (pcs)" onChange={(e) => setActionData({...actionData, quantity_pcs: e.target.value})} />
                <Select onValueChange={(v) => setActionData({...actionData, uom: v})}>
                  <SelectTrigger><SelectValue placeholder="Unit" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="kg">kg</SelectItem>
                    <SelectItem value="pcs">pcs</SelectItem>
                  </SelectContent>
                </Select>
              </>
            )}

            {selectedAction === "incoming_qc" && (
              <>
                <Select onValueChange={(v) => setActionData({...actionData, result: v})}>
                  <SelectTrigger><SelectValue placeholder="Result" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="hold">Hold</SelectItem>
                  </SelectContent>
                </Select>
                <Textarea placeholder="Remarks" onChange={(e) => setActionData({...actionData, remarks: e.target.value})} />
              </>
            )}

            {selectedAction === "start_step" && (
              <>
                <Input placeholder="Step Name (e.g., Cutting)" onChange={(e) => setActionData({...actionData, step_name: e.target.value})} />
                <Input placeholder="Machine/Station" onChange={(e) => setActionData({...actionData, machine: e.target.value})} />
              </>
            )}

            {selectedAction === "complete_step" && (
              <>
                <Input type="number" placeholder="Qty Good" onChange={(e) => setActionData({...actionData, qty_good: e.target.value})} />
                <Input type="number" placeholder="Qty Reject" onChange={(e) => setActionData({...actionData, qty_reject: e.target.value})} />
              </>
            )}

            {selectedAction === "batch_qc" && (
              <>
                <Select onValueChange={(v) => setActionData({...actionData, qc_type: v})}>
                  <SelectTrigger><SelectValue placeholder="QC Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first_piece">First Piece</SelectItem>
                    <SelectItem value="in_process">In-Process</SelectItem>
                    <SelectItem value="final">Final</SelectItem>
                  </SelectContent>
                </Select>
                <Select onValueChange={(v) => setActionData({...actionData, result: v})}>
                  <SelectTrigger><SelectValue placeholder="Result" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pass">Pass</SelectItem>
                    <SelectItem value="fail">Fail</SelectItem>
                    <SelectItem value="rework">Rework</SelectItem>
                  </SelectContent>
                </Select>
                <Input placeholder="Report No" onChange={(e) => setActionData({...actionData, report_no: e.target.value})} />
              </>
            )}

            {selectedAction === "build_carton" && (
              <>
                <Input placeholder="Carton ID" onChange={(e) => setActionData({...actionData, carton_id: e.target.value})} />
                <Input type="number" placeholder="Quantity (pcs)" onChange={(e) => setActionData({...actionData, quantity: e.target.value})} />
                <Input type="number" step="0.01" placeholder="Net Weight (kg)" onChange={(e) => setActionData({...actionData, net_weight: e.target.value})} />
                <Input type="number" step="0.01" placeholder="Gross Weight (kg)" onChange={(e) => setActionData({...actionData, gross_weight: e.target.value})} />
                <Input placeholder="Heat Numbers (comma-separated)" onChange={(e) => setActionData({...actionData, heat_nos: e.target.value})} />
              </>
            )}

            {selectedAction === "build_pallet" && (
              <Input placeholder="Pallet ID" onChange={(e) => setActionData({...actionData, pallet_id: e.target.value})} />
            )}

            {selectedAction === "laser_mark" && (
              <>
                <Input placeholder="Station" onChange={(e) => setActionData({...actionData, station: e.target.value})} />
                <Input placeholder="Marking Details" onChange={(e) => setActionData({...actionData, marking_details: e.target.value})} />
              </>
            )}

            {selectedAction === "ready_to_ship" && (
              <>
                <Input placeholder="Customer Name" onChange={(e) => setActionData({...actionData, customer: e.target.value})} />
                <Input placeholder="Incoterm (e.g., EXW)" onChange={(e) => setActionData({...actionData, incoterm: e.target.value})} />
              </>
            )}

            <Button 
              onClick={handleExecuteAction} 
              disabled={loading || !selectedAction}
              className="w-full h-12"
            >
              Execute Action
            </Button>
          </CardContent>
        </Card>
      )}

      {scannedEntity && actions.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No actions available for your role with this entity.
          </CardContent>
        </Card>
      )}
    </div>
  );
}