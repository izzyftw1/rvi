import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Truck, Package, Send, CheckCircle2, History, Box } from "lucide-react";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  num_cartons: number;
  num_pallets: number | null;
  status: string;
  built_at: string;
  work_orders?: { 
    wo_number: string; 
    item_code: string; 
    customer: string;
  } | null;
}

interface Shipment {
  id: string;
  ship_id: string;
  created_at: string;
  dispatches: {
    id: string;
    quantity: number;
    cartons?: { carton_id: string } | null;
    work_orders?: { wo_number: string } | null;
  }[];
}

export default function Dispatch() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  
  // Ready for dispatch batches
  const [readyBatches, setReadyBatches] = useState<PackingBatch[]>([]);
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(new Set());
  
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
        id, carton_id, wo_id, quantity, num_cartons, num_pallets, status, built_at,
        work_orders(wo_number, item_code, customer)
      `)
      .eq("status", "ready_for_dispatch")
      .order("built_at", { ascending: true });

    setReadyBatches((data as unknown as PackingBatch[]) || []);
  };

  const loadRecentShipments = async () => {
    const { data } = await supabase
      .from("shipments")
      .select(`
        id, ship_id, created_at,
        dispatches(id, quantity, work_orders(wo_number))
      `)
      .order("created_at", { ascending: false })
      .limit(20);

    setRecentShipments((data as unknown as Shipment[]) || []);
  };

  const handleToggleBatch = (batchId: string) => {
    const newSelected = new Set(selectedBatchIds);
    if (newSelected.has(batchId)) {
      newSelected.delete(batchId);
    } else {
      newSelected.add(batchId);
    }
    setSelectedBatchIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBatchIds.size === readyBatches.length) {
      setSelectedBatchIds(new Set());
    } else {
      setSelectedBatchIds(new Set(readyBatches.map(b => b.id)));
    }
  };

  const getSelectedSummary = () => {
    const selected = readyBatches.filter(b => selectedBatchIds.has(b.id));
    return {
      count: selected.length,
      totalQty: selected.reduce((sum, b) => sum + b.quantity, 0),
      totalCartons: selected.reduce((sum, b) => sum + (b.num_cartons || 1), 0),
      totalPallets: selected.reduce((sum, b) => sum + (b.num_pallets || 0), 0),
    };
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

      // 2. Create dispatch records for each selected batch (without modifying production_batches)
      
      // Get production batch IDs for dispatch records (we need a valid batch_id for FK)
      const { data: prodBatches } = await supabase
        .from("production_batches")
        .select("id, wo_id")
        .in("wo_id", [...new Set(selectedBatches.map(b => b.wo_id))]);

      const batchMap = new Map((prodBatches || []).map(pb => [pb.wo_id, pb.id]));

      const dispatchRecords = selectedBatches.map(batch => ({
        wo_id: batch.wo_id,
        batch_id: batchMap.get(batch.wo_id) || batch.wo_id, // Fallback to wo_id if no batch
        quantity: batch.quantity,
        shipment_id: shipmentData.id,
        dispatched_by: user?.id,
        remarks: remarks || `Packing batch: ${batch.carton_id}`,
      }));

      const { error: dispatchError } = await supabase
        .from("dispatches")
        .insert(dispatchRecords);

      if (dispatchError) throw dispatchError;

      // 3. Update packing batches status to "dispatched"
      const { error: updateError } = await supabase
        .from("cartons")
        .update({ status: "dispatched" })
        .in("id", Array.from(selectedBatchIds));

      if (updateError) throw updateError;

      toast({
        title: "Shipment Created",
        description: `${generatedShipId} with ${selectedBatchIds.size} packing batch(es) dispatched.`,
      });

      // Reset form
      setSelectedBatchIds(new Set());
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

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Dispatch"
            description="Create shipments from packing batches"
            icon={<Truck className="h-6 w-6" />}
          />

          <Tabs defaultValue="dispatch" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="dispatch">
                <Send className="h-4 w-4 mr-2" />
                Create Shipment
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                Shipment History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dispatch" className="space-y-4 mt-6">
              {/* Ready for Dispatch List */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Box className="h-5 w-5" />
                        Ready for Dispatch
                      </CardTitle>
                      <CardDescription>
                        Select packing batches to include in a shipment
                      </CardDescription>
                    </div>
                    {readyBatches.length > 0 && (
                      <Button variant="outline" size="sm" onClick={handleSelectAll}>
                        {selectedBatchIds.size === readyBatches.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {readyBatches.length === 0 ? (
                    <div className="py-12 text-center">
                      <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-lg font-medium">No Batches Ready</p>
                      <p className="text-sm text-muted-foreground">
                        Packing batches will appear here when marked as ready for dispatch
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Packing Batch</TableHead>
                          <TableHead>Work Order</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-right">Cartons</TableHead>
                          <TableHead className="text-right">Pallets</TableHead>
                          <TableHead>Packed At</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {readyBatches.map((batch) => (
                          <TableRow 
                            key={batch.id}
                            className={selectedBatchIds.has(batch.id) ? "bg-primary/5" : ""}
                          >
                            <TableCell>
                              <Checkbox
                                checked={selectedBatchIds.has(batch.id)}
                                onCheckedChange={() => handleToggleBatch(batch.id)}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{batch.carton_id}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{batch.work_orders?.wo_number || "—"}</p>
                                <p className="text-xs text-muted-foreground">
                                  {batch.work_orders?.item_code} • {batch.work_orders?.customer}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{batch.quantity}</TableCell>
                            <TableCell className="text-right">{batch.num_cartons || 1}</TableCell>
                            <TableCell className="text-right">{batch.num_pallets || "—"}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {new Date(batch.built_at).toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
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
                        <p className="text-sm text-muted-foreground">Total Qty</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{summary.totalCartons}</p>
                        <p className="text-sm text-muted-foreground">Cartons</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-bold">{summary.totalPallets || 0}</p>
                        <p className="text-sm text-muted-foreground">Pallets</p>
                      </div>
                    </div>

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
                      Create Shipment & Dispatch
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Shipments</CardTitle>
                  <CardDescription>Dispatched shipments and their contents</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {recentShipments.length === 0 ? (
                    <div className="py-12 text-center">
                      <Truck className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-lg font-medium">No Shipments Yet</p>
                      <p className="text-sm text-muted-foreground">
                        Shipments will appear here after dispatch
                      </p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Shipment ID</TableHead>
                          <TableHead>Work Orders</TableHead>
                          <TableHead className="text-right">Total Qty</TableHead>
                          <TableHead className="text-right">Batches</TableHead>
                          <TableHead>Created At</TableHead>
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
                              <TableCell className="text-muted-foreground">
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
