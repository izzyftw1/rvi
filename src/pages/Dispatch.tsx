import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Truck, Package, Send, CheckCircle2, History, Box, AlertTriangle, Info, Layers } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Packing batch ready for dispatch
interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  production_batch_id: string | null;
  quantity: number;
  dispatched_qty: number;
  available_qty: number;
  num_cartons: number | null;
  num_pallets: number | null;
  status: string;
  built_at: string;
  work_orders?: { 
    display_id: string; 
    item_code: string; 
    customer: string;
  } | null;
  production_batches?: {
    batch_number: number;
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
    carton_id: string | null;
    cartons?: { carton_id: string } | null;
    work_orders?: { display_id: string } | null;
  }[];
}

export default function Dispatch() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Ready for dispatch packing batches
  const [readyBatches, setReadyBatches] = useState<PackingBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  
  // Dispatch quantities (for partial dispatches)
  const [dispatchQuantities, setDispatchQuantities] = useState<Record<string, number>>({});
  
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
    // Load packing batches (cartons) that are ready for dispatch
    const { data } = await supabase
      .from("cartons")
      .select(`
        id, carton_id, wo_id, production_batch_id, quantity, dispatched_qty, 
        num_cartons, num_pallets, status, built_at,
        work_orders(display_id, item_code, customer),
        production_batches(batch_number)
      `)
      .eq("status", "ready_for_dispatch")
      .order("built_at", { ascending: true });

    // Calculate available quantity for each batch
    const enriched: PackingBatch[] = ((data || []) as any[]).map(batch => ({
      ...batch,
      dispatched_qty: batch.dispatched_qty || 0,
      available_qty: batch.quantity - (batch.dispatched_qty || 0),
    })).filter(b => b.available_qty > 0);

    setReadyBatches(enriched);
  };

  const loadRecentShipments = async () => {
    const { data } = await supabase
      .from("shipments")
      .select(`
        id, ship_id, customer, status, created_at,
        dispatches(id, quantity, remarks, carton_id, cartons(carton_id), work_orders(display_id))
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    setRecentShipments((data as unknown as Shipment[]) || []);
  };

  const handleToggleBatch = (batchId: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
      // Remove dispatch quantity when deselected
      const newQtys = { ...dispatchQuantities };
      delete newQtys[batchId];
      setDispatchQuantities(newQtys);
    } else {
      newSelected.add(batchId);
      // Default to full available quantity
      const batch = readyBatches.find(b => b.id === batchId);
      if (batch) {
        setDispatchQuantities({ ...dispatchQuantities, [batchId]: batch.available_qty });
      }
    }
    setSelectedBatchIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.size === readyBatches.length) {
      setSelectedBatchIds(new Set());
      setDispatchQuantities({});
    } else {
      const allIds = new Set(readyBatches.map(b => b.id));
      const allQtys: Record<string, number> = {};
      readyBatches.forEach(b => { allQtys[b.id] = b.available_qty; });
      setSelectedBatchIds(allIds);
      setDispatchQuantities(allQtys);
    }
  };

  const handleQtyChange = (batchId: string, qty: number, maxQty: number) => {
    const validQty = Math.max(1, Math.min(qty, maxQty));
    setDispatchQuantities({ ...dispatchQuantities, [batchId]: validQty });
  };

  const getDispatchQty = (batch: PackingBatch) => {
    return dispatchQuantities[batch.id] || batch.available_qty;
  };

  const getSelectedSummary = () => {
    const selected = readyBatches.filter(b => selectedBatchIds.has(b.id));
    return {
      count: selected.length,
      totalQty: selected.reduce((sum, b) => sum + getDispatchQty(b), 0),
      totalCartons: selected.reduce((sum, b) => sum + (b.num_cartons || 0), 0),
      totalPallets: selected.reduce((sum, b) => sum + (b.num_pallets || 0), 0),
      hasPartial: selected.some(b => getDispatchQty(b) < b.available_qty),
    };
  };

  const notifyLogisticsTeam = async (shipId: string, batchCount: number, totalQty: number) => {
    try {
      const { data: users } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "logistics"]);

      if (users && users.length > 0) {
        const notifications = users.map(u => ({
          user_id: u.user_id,
          type: "dispatch_created",
          title: "New Dispatch Created",
          message: `Shipment ${shipId} created with ${batchCount} packing batch(es), ${totalQty} pcs total.`,
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
      const prodBatchIds = [...new Set(selectedBatches.map(b => b.production_batch_id).filter(Boolean))];
      let batchMap = new Map<string, string>();
      
      if (prodBatchIds.length > 0) {
        const { data: prodBatches } = await supabase
          .from("production_batches")
          .select("id, wo_id")
          .in("id", prodBatchIds);
        
        (prodBatches || []).forEach(pb => batchMap.set(pb.wo_id, pb.id));
      }

      // Fallback: get any production batch for WOs without direct link
      const woIdsWithoutBatch = selectedBatches
        .filter(b => !b.production_batch_id && !batchMap.has(b.wo_id))
        .map(b => b.wo_id);
      
      if (woIdsWithoutBatch.length > 0) {
        const { data: fallbackBatches } = await supabase
          .from("production_batches")
          .select("id, wo_id")
          .in("wo_id", woIdsWithoutBatch);
        
        (fallbackBatches || []).forEach(pb => {
          if (!batchMap.has(pb.wo_id)) batchMap.set(pb.wo_id, pb.id);
        });
      }

      // 3. Create dispatch records referencing packing batches (carton_id)
      const dispatchRecords = selectedBatches.map(batch => {
        const dispatchQty = getDispatchQty(batch);
        const isPartial = dispatchQty < batch.available_qty;
        
        return {
          wo_id: batch.wo_id,
          batch_id: batch.production_batch_id || batchMap.get(batch.wo_id) || batch.wo_id,
          carton_id: batch.id, // Reference to packing batch
          quantity: dispatchQty,
          shipment_id: shipmentData.id,
          dispatched_by: user?.id,
          remarks: `${batch.carton_id}${batch.production_batches ? ` | Batch #${batch.production_batches.batch_number}` : ""}${isPartial ? ` | Partial: ${dispatchQty}/${batch.available_qty}` : ""}${remarks ? ` | ${remarks}` : ""}`,
        };
      });

      const { error: dispatchError } = await supabase
        .from("dispatches")
        .insert(dispatchRecords);

      if (dispatchError) throw dispatchError;

      // Note: carton status and dispatched_qty are updated by database trigger

      // 4. Notify Admin/Logistics team
      const summary = getSelectedSummary();
      await notifyLogisticsTeam(generatedShipId, summary.count, summary.totalQty);

      toast({
        title: "Dispatch Created",
        description: `${generatedShipId} with ${selectedBatchIds.size} packing batch(es), ${summary.totalQty} pcs dispatched.${summary.hasPartial ? " (includes partial dispatches)" : ""}`,
      });

      // Reset form
      setSelectedBatchIds(new Set());
      setDispatchQuantities({});
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
            title="Dispatch"
            description="Create shipments from packed batches for logistics handoff"
            icon={<Truck className="h-6 w-6" />}
          />

          {/* Info Banner */}
          <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/30">
            <Info className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Dispatch operates on packing batches, not work orders.</p>
              <p className="text-muted-foreground">
                Each packing batch can be fully or partially dispatched. Work order totals are calculated for reporting only.
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
                      <h3 className="text-lg font-semibold mb-2">No Packing Batches Ready for Dispatch</h3>
                      <p className="text-muted-foreground max-w-md">
                        Packing batches will appear here when created. Complete the packing process first.
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
                            <Layers className="h-5 w-5" />
                            Packing Batches Ready for Dispatch
                          </CardTitle>
                          <CardDescription>
                            Select batches to include in a shipment. Partial quantities are supported.
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
                            <TableHead>Source Batch</TableHead>
                            <TableHead>Work Order</TableHead>
                            <TableHead className="text-right">Available</TableHead>
                            <TableHead className="text-right">Dispatch Qty</TableHead>
                            <TableHead>Packed At</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {readyBatches.map((batch) => {
                            const isSelected = selectedBatchIds.has(batch.id);
                            const dispatchQty = getDispatchQty(batch);
                            const isPartial = isSelected && dispatchQty < batch.available_qty;
                            
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
                                <TableCell>
                                  <div>
                                    <p className="font-mono font-medium">{batch.carton_id}</p>
                                    {isPartial && (
                                      <Badge variant="outline" className="text-xs mt-1">Partial</Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {batch.production_batches 
                                    ? <span className="font-mono">Batch #{batch.production_batches.batch_number}</span>
                                    : <span className="text-muted-foreground">—</span>
                                  }
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <p className="font-medium">{batch.work_orders?.display_id || "—"}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {batch.work_orders?.item_code} • {batch.work_orders?.customer}
                                    </p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-medium">{batch.available_qty}</TableCell>
                                <TableCell className="text-right">
                                  {isSelected ? (
                                    <Input
                                      type="number"
                                      min="1"
                                      max={batch.available_qty}
                                      value={dispatchQty}
                                      onChange={(e) => handleQtyChange(batch.id, parseInt(e.target.value) || 1, batch.available_qty)}
                                      className="w-20 text-right ml-auto"
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">—</span>
                                  )}
                                </TableCell>
                                <TableCell className="text-muted-foreground text-sm">
                                  {new Date(batch.built_at).toLocaleDateString()}
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
                          Create Shipment
                        </CardTitle>
                        <CardDescription>
                          Review selection and create shipment for logistics
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-4 gap-4">
                          <div className="text-center p-3 rounded-lg bg-background border">
                            <p className="text-2xl font-bold text-primary">{summary.count}</p>
                            <p className="text-xs text-muted-foreground">Packing Batches</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background border">
                            <p className="text-2xl font-bold">{summary.totalQty}</p>
                            <p className="text-xs text-muted-foreground">Total Pieces</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background border">
                            <p className="text-2xl font-bold">{summary.totalCartons}</p>
                            <p className="text-xs text-muted-foreground">Cartons</p>
                          </div>
                          <div className="text-center p-3 rounded-lg bg-background border">
                            <p className="text-2xl font-bold">{summary.totalPallets}</p>
                            <p className="text-xs text-muted-foreground">Pallets</p>
                          </div>
                        </div>

                        {summary.hasPartial && (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <Info className="h-4 w-4 text-amber-600" />
                            <p className="text-sm text-amber-700">
                              Some batches have partial quantities. Remaining will stay available for future dispatch.
                            </p>
                          </div>
                        )}

                        {/* Shipment Form */}
                        <div className="grid gap-4 md:grid-cols-2">
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
                              placeholder="Notes for logistics"
                            />
                          </div>
                        </div>

                        <Button
                          onClick={handleCreateShipment}
                          disabled={loading}
                          className="w-full gap-2"
                          size="lg"
                        >
                          <Send className="h-4 w-4" />
                          Create Shipment ({summary.count} batches, {summary.totalQty} pcs)
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
                  <CardTitle>Recent Shipments</CardTitle>
                  <CardDescription>Dispatch history showing packing batch details</CardDescription>
                </CardHeader>
                <CardContent>
                  {recentShipments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">No shipments yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Shipment ID</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Packing Batches</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentShipments.map((shipment) => (
                          <TableRow key={shipment.id}>
                            <TableCell className="font-mono font-medium">{shipment.ship_id}</TableCell>
                            <TableCell>{shipment.customer || "—"}</TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {shipment.dispatches.slice(0, 3).map((d, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {d.cartons?.carton_id || d.work_orders?.display_id || "—"}
                                  </Badge>
                                ))}
                                {shipment.dispatches.length > 3 && (
                                  <Badge variant="secondary" className="text-xs">
                                    +{shipment.dispatches.length - 3} more
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {shipment.dispatches.reduce((sum, d) => sum + d.quantity, 0)}
                            </TableCell>
                            <TableCell>{getStatusBadge(shipment.status)}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(shipment.created_at).toLocaleDateString()}
                            </TableCell>
                          </TableRow>
                        ))}
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
