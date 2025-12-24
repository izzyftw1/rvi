import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Truck, Package, Send, CheckCircle2, History, Box, AlertTriangle, Info } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  num_cartons: number | null;
  num_pallets: number | null;
  status: string;
  built_at: string;
  dispatch_qc_batch_id: string | null;
  work_orders?: { 
    wo_number: string; 
    item_code: string; 
    customer: string;
  } | null;
  dispatch_qc_batches?: {
    qc_batch_id: string;
  } | null;
}

interface Shipment {
  id: string;
  ship_id: string;
  customer: string | null;
  status: string;
  created_at: string;
  dispatches: {
    id: string;
    quantity: number;
    remarks: string | null;
    work_orders?: { wo_number: string } | null;
  }[];
}

export default function Dispatch() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Ready for dispatch batches
  const [readyBatches, setReadyBatches] = useState<PackingBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  
  // Partial dispatch quantities
  const [partialQuantities, setPartialQuantities] = useState<Record<string, number>>({});
  
  // Shipment form
  const [shipmentId, setShipmentId] = useState("");
  const [remarks, setRemarks] = useState("");
  
  // Recent shipments
  const [recentShipments, setRecentShipments] = useState<Shipment[]>([]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadReadyBatches();
    loadRecentShipments();
  }, []);

  const loadReadyBatches = async () => {
    const { data } = await supabase
      .from("cartons")
      .select(`
        id, carton_id, wo_id, quantity, num_cartons, num_pallets, status, built_at, dispatch_qc_batch_id,
        work_orders(wo_number, item_code, customer),
        dispatch_qc_batches(qc_batch_id)
      `)
      .eq("status", "ready_for_dispatch")
      .order("built_at", { ascending: true });

    setReadyBatches((data as unknown as PackingBatch[]) || []);
  };

  const loadRecentShipments = async () => {
    const { data } = await supabase
      .from("shipments")
      .select(`
        id, ship_id, customer, status, created_at,
        dispatches(id, quantity, remarks, work_orders(wo_number))
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    setRecentShipments((data as unknown as Shipment[]) || []);
  };

  const handleToggleBatch = (batchId: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
      // Remove partial quantity when deselected
      const newPartials = { ...partialQuantities };
      delete newPartials[batchId];
      setPartialQuantities(newPartials);
    } else {
      newSelected.add(batchId);
    }
    setSelectedBatchIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.size === readyBatches.length) {
      setSelectedBatchIds(new Set());
      setPartialQuantities({});
    } else {
      setSelectedBatchIds(new Set(readyBatches.map(b => b.id)));
    }
  };

  const handlePartialQtyChange = (batchId: string, qty: number, maxQty: number) => {
    if (qty <= 0 || qty >= maxQty) {
      // Remove partial entry if full quantity or invalid
      const newPartials = { ...partialQuantities };
      delete newPartials[batchId];
      setPartialQuantities(newPartials);
    } else {
      setPartialQuantities({ ...partialQuantities, [batchId]: qty });
    }
  };

  const getDispatchQty = (batch: PackingBatch) => {
    return partialQuantities[batch.id] || batch.quantity;
  };

  const getSelectedSummary = () => {
    const selected = readyBatches.filter(b => selectedBatchIds.has(b.id));
    return {
      count: selected.length,
      totalQty: selected.reduce((sum, b) => sum + getDispatchQty(b), 0),
      totalCartons: selected.reduce((sum, b) => sum + (b.num_cartons || 0), 0),
      totalPallets: selected.reduce((sum, b) => sum + (b.num_pallets || 0), 0),
      hasPartial: Object.keys(partialQuantities).length > 0,
    };
  };

  const notifyLogisticsTeam = async (shipId: string, batchCount: number, totalQty: number) => {
    try {
      // Get admin and logistics users
      const { data: users } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "logistics"]);

      if (users && users.length > 0) {
        const notifications = users.map(u => ({
          user_id: u.user_id,
          type: "dispatch_created",
          title: "New Dispatch Created",
          message: `Shipment ${shipId} created with ${batchCount} batch(es), ${totalQty} pcs total.`,
          entity_type: "shipment",
        }));

        await supabase.from("notifications").insert(notifications);
      }
    } catch (error) {
      console.error("Failed to send notifications:", error);
    }
  };

  const handleCreateShipment = async () => {
    if (selectedBatchIds.size === 0) {
      toast({ variant: "destructive", description: "Please select at least one packing batch" });
      return;
    }

    const generatedShipId = shipmentId.trim() || `SHIP-${Date.now().toString().slice(-8)}`;
    const selectedBatches = readyBatches.filter(b => selectedBatchIds.has(b.id));
    
    // Get customer from first selected batch
    const primaryCustomer = selectedBatches[0]?.work_orders?.customer || "Unknown";

    setLoading(true);
    try {
      // 1. Create shipment
      const { data: shipmentData, error: shipmentError } = await supabase
        .from("shipments")
        .insert({
          ship_id: generatedShipId,
          customer: primaryCustomer,
          status: "dispatched",
        })
        .select()
        .single();

      if (shipmentError) throw shipmentError;

      // 2. Get production batch IDs for dispatch records (FK requirement)
      const { data: prodBatches } = await supabase
        .from("production_batches")
        .select("id, wo_id")
        .in("wo_id", [...new Set(selectedBatches.map(b => b.wo_id))]);

      const batchMap = new Map((prodBatches || []).map(pb => [pb.wo_id, pb.id]));

      // 3. Create dispatch records with packing batch references
      const dispatchRecords = selectedBatches.map(batch => {
        const dispatchQty = getDispatchQty(batch);
        const isPartial = partialQuantities[batch.id] !== undefined;
        
        return {
          wo_id: batch.wo_id,
          batch_id: batchMap.get(batch.wo_id) || batch.wo_id,
          quantity: dispatchQty,
          shipment_id: shipmentData.id,
          dispatched_by: user?.id,
          remarks: `Packing: ${batch.carton_id}${batch.dispatch_qc_batches?.qc_batch_id ? ` | QC: ${batch.dispatch_qc_batches.qc_batch_id}` : ""}${isPartial ? ` | Partial: ${dispatchQty}/${batch.quantity}` : ""}${remarks ? ` | ${remarks}` : ""}`,
        };
      });

      const { error: dispatchError } = await supabase
        .from("dispatches")
        .insert(dispatchRecords);

      if (dispatchError) throw dispatchError;

      // 4. Update packing batch statuses
      const fullyDispatched = selectedBatches.filter(b => !partialQuantities[b.id]);
      const partiallyDispatched = selectedBatches.filter(b => partialQuantities[b.id]);

      if (fullyDispatched.length > 0) {
        const { error: updateError } = await supabase
          .from("cartons")
          .update({ status: "dispatched" })
          .in("id", fullyDispatched.map(b => b.id));

        if (updateError) throw updateError;
      }

      // For partial dispatches, update quantity and keep as ready_for_dispatch
      for (const batch of partiallyDispatched) {
        const remainingQty = batch.quantity - partialQuantities[batch.id];
        const { error } = await supabase
          .from("cartons")
          .update({ 
            quantity: remainingQty,
            status: "ready_for_dispatch" // Remains dispatchable
          })
          .eq("id", batch.id);
        
        if (error) throw error;
      }

      // 5. Notify Admin/Logistics team
      const summary = getSelectedSummary();
      await notifyLogisticsTeam(generatedShipId, summary.count, summary.totalQty);

      toast({
        title: "Dispatch Created",
        description: `${generatedShipId} with ${selectedBatchIds.size} packing batch(es) dispatched.${partiallyDispatched.length > 0 ? ` (${partiallyDispatched.length} partial)` : ""}`,
      });

      // Reset form
      setSelectedBatchIds(new Set());
      setPartialQuantities({});
      setShipmentId("");
      setRemarks("");
      loadReadyBatches();
      loadRecentShipments();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const summary = getSelectedSummary();

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "dispatched":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Dispatched</Badge>;
      case "in_transit":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">In Transit</Badge>;
      case "delivered":
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Delivered</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Dispatch Batches"
            description="Logistics handoff — create shipments from packed batches"
            icon={<Truck className="h-6 w-6" />}
          />

          {/* Info Banner */}
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Dispatch is a logistics handoff, not production.</p>
              <p className="text-muted-foreground">
                Only fully or partially packed batches from Packing appear here. Select batches to create a shipment for logistics.
              </p>
            </div>
          </div>

          <Tabs defaultValue="dispatch" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dispatch">
                <Send className="h-4 w-4 mr-2" />
                Create Dispatch
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Dispatch History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dispatch" className="space-y-4 mt-6">
              {readyBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Batches Ready for Dispatch</h3>
                      <p className="text-muted-foreground max-w-md">
                        Packing batches will appear here when marked as ready for dispatch. 
                        Complete the packing process first.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <>
                  {/* Ready for Dispatch List */}
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div>
                          <CardTitle className="flex items-center gap-2">
                            <Box className="h-5 w-5" />
                            Packed Batches Ready for Dispatch
                          </CardTitle>
                          <CardDescription>
                            Select batches to include in a shipment. You can dispatch full or partial quantities.
                          </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={handleSelectAll}>
                          {selectedBatchIds.size === readyBatches.length ? "Deselect All" : "Select All"}
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Packing Batch</TableHead>
                            <TableHead>QC Batch</TableHead>
                            <TableHead>Work Order</TableHead>
                            <TableHead className="text-right">Available Qty</TableHead>
                            <TableHead className="text-right">Dispatch Qty</TableHead>
                            <TableHead>Packed At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyBatches.map((batch) => {
                            const isSelected = selectedBatchIds.has(batch.id);
                            const dispatchQty = getDispatchQty(batch);
                            
                            return (
                              <TableRow 
                                key={batch.id}
                                className={isSelected ? "bg-primary/5" : ""}
                              >
                                <TableCell>
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleToggleBatch(batch.id)}
                                  />
                                </TableCell>
                                <TableCell className="font-mono font-medium">{batch.carton_id}</TableCell>
                                <TableCell className="font-mono text-muted-foreground">
                                  {batch.dispatch_qc_batches?.qc_batch_id || "—"}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{batch.work_orders?.wo_number || "—"}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {batch.work_orders?.item_code} • {batch.work_orders?.customer}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{batch.quantity}</TableCell>
                                <TableCell className="text-right">
                                  {isSelected ? (
                                    <Input
                                      type="number"
                                      min="1"
                                      max={batch.quantity}
                                      value={dispatchQty}
                                      onChange={(e) => handlePartialQtyChange(batch.id, parseInt(e.target.value) || 0, batch.quantity)}
                                      className="w-20 text-right ml-auto"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {new Date(batch.built_at).toLocaleString()}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>

                  {/* Selected Summary & Shipment Creation */}
                  {selectedBatchIds.size > 0 && (
                    <Card className="border-primary/30 bg-primary/5">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                          Create Dispatch
                        </CardTitle>
                        <CardDescription>
                          Review selection and create shipment for logistics handoff
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Summary */}
                        <div className="grid grid-cols-4 gap-4 p-4 rounded-lg bg-background border">
                          <div className="text-center">
                            <p className="text-2xl font-bold text-primary">{summary.count}</p>
                            <p className="text-sm text-muted-foreground">Batches</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold">{summary.totalQty}</p>
                            <p className="text-sm text-muted-foreground">
                              {summary.hasPartial ? "Dispatch Qty" : "Total Qty"}
                            </p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold">{summary.totalCartons || "—"}</p>
                            <p className="text-sm text-muted-foreground">Cartons</p>
                          </div>
                          <div className="text-center">
                            <p className="text-2xl font-bold">{summary.totalPallets || "—"}</p>
                            <p className="text-sm text-muted-foreground">Pallets</p>
                          </div>
                        </div>

                        {summary.hasPartial && (
                          <div className="flex items-center gap-2 text-amber-600 bg-amber-500/10 px-3 py-2 rounded text-sm">
                            <AlertTriangle className="h-4 w-4" />
                            Partial dispatch selected. Remaining quantities will stay available for future dispatch.
                          </div>
                        )}

                        {/* Shipment Form */}
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="shipmentId">Shipment ID (optional)</Label>
                            <Input
                              id="shipmentId"
                              value={shipmentId}
                              onChange={(e) => setShipmentId(e.target.value)}
                              placeholder="Auto-generated if empty"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="remarks">Remarks (optional)</Label>
                            <Input
                              id="remarks"
                              value={remarks}
                              onChange={(e) => setRemarks(e.target.value)}
                              placeholder="Transporter, vehicle no..."
                            />
                          </div>
                        </div>

                        <Button 
                          onClick={handleCreateShipment} 
                          disabled={loading}
                          className="w-full gap-2"
                          size="lg"
                        >
                          <Truck className="h-5 w-5" />
                          Create Dispatch & Notify Logistics
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Dispatch History</CardTitle>
                  <CardDescription>Recent dispatches and their status</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {recentShipments.length === 0 ? (
                    <div className="py-12 text-center">
                      <Truck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-lg font-medium">No Dispatches Yet</p>
                      <p className="text-sm text-muted-foreground">
                        Dispatches will appear here after creation
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Shipment ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Work Orders</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead className="text-right">Batches</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Dispatched At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentShipments.map((shipment) => {
                          const totalQty = shipment.dispatches?.reduce((sum, d) => sum + d.quantity, 0) || 0;
                          const workOrders = [...new Set(shipment.dispatches?.map(d => d.work_orders?.wo_number).filter(Boolean))];
                          
                          return (
                            <TableRow key={shipment.id}>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">
                                  {shipment.ship_id}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {shipment.customer || "—"}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {workOrders.slice(0, 3).map(wo => (
                                    <Badge key={wo} variant="secondary" className="text-xs">
                                      {wo}
                                    </Badge>
                                  ))}
                                  {workOrders.length > 3 && (
                                    <Badge variant="secondary" className="text-xs">
                                      +{workOrders.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-right font-medium">{totalQty}</TableCell>
                              <TableCell className="text-right">{shipment.dispatches?.length || 0}</TableCell>
                              <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                              <TableCell className="text-muted-foreground text-sm">
                                {new Date(shipment.created_at).toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>
    </div>
  );
}
