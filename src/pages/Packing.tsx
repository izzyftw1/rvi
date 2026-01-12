import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, History, Eye, Trash2, CheckCircle2, AlertTriangle, Layers, ClipboardList, XCircle, Clock } from "lucide-react";
import { PageHeader, PageContainer, FormActions } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Packable batch - a production batch with Final QC approval AND production complete
interface PackableBatch {
  id: string;
  wo_id: string;
  batch_number: number;
  batch_quantity: number;
  produced_qty: number;
  qc_approved_qty: number;
  qc_rejected_qty: number;
  dispatched_qty: number;
  packed_qty: number;
  available_for_packing: number;
  qc_final_status: string;
  qc_final_approved_at: string | null;
  stage_type: string;
  batch_status: string;
  wo_number: string;
  item_code: string;
  customer: string;
  wo_quantity: number;
  production_complete: boolean;
}

// Work orders with packing status (for the overview)
interface PackingWorkOrder {
  id: string;
  wo_number: string;
  item_code: string;
  customer: string;
  wo_quantity: number;
  production_complete: boolean;
  production_complete_qty: number;
  qc_approved_qty: number;
  packed_qty: number;
  available_for_packing: number;
  remaining_qty: number;
  status: 'ready' | 'blocked';
  blocking_reason: string | null;
}

interface PackingRecord {
  id: string;
  carton_id: string;
  wo_id: string;
  production_batch_id: string | null;
  quantity: number;
  num_cartons: number | null;
  num_pallets: number | null;
  status: string;
  built_at: string;
  work_orders?: { display_id: string; item_code: string } | null;
  production_batches?: { batch_number: number } | null;
}

const Packing = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [packableBatches, setPackableBatches] = useState<PackableBatch[]>([]);
  const [packingWorkOrders, setPackingWorkOrders] = useState<PackingWorkOrder[]>([]);
  const [packingHistory, setPackingHistory] = useState<PackingRecord[]>([]);
  
  // Form state
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [selectedBatch, setSelectedBatch] = useState<PackableBatch | null>(null);
  const [form, setForm] = useState({
    quantity: "",
    numCartons: "",
    numPallets: "",
  });

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);

  useEffect(() => {
    loadPackableBatches();
    loadPackingWorkOrders();
    loadPackingHistory();

    // Real-time subscriptions for live data updates
    const channel = supabase
      .channel('packing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => {
        loadPackableBatches();
        loadPackingWorkOrders();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cartons' }, () => {
        loadPackableBatches();
        loadPackingWorkOrders();
        loadPackingHistory();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        loadPackableBatches();
        loadPackingWorkOrders();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      const batch = packableBatches.find(b => b.id === selectedBatchId);
      setSelectedBatch(batch || null);
    } else {
      setSelectedBatch(null);
    }
  }, [selectedBatchId, packableBatches]);

  const loadPackableBatches = async () => {
    // Load production batches where:
    // ONLY CONDITION: qc_approved_qty > already_packed (quantity-based eligibility)
    // Packing is NOT gated by:
    // - production_complete status
    // - qc_final_status
    // - batch_status
    // - stage_type
    // Partial production + partial QC unlocks packing
    const { data, error } = await supabase
      .from("production_batches")
      .select(`
        id,
        wo_id,
        batch_number,
        batch_quantity,
        produced_qty,
        qc_approved_qty,
        qc_rejected_qty,
        dispatched_qty,
        qc_final_status,
        qc_final_approved_at,
        stage_type,
        batch_status,
        production_complete,
        production_complete_qty,
        production_completed_at,
        work_orders!inner(display_id, item_code, customer, quantity)
      `)
      .gt("qc_approved_qty", 0)  // Only filter: has QC-approved quantity
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading packable batches:", error);
      return;
    }

    // Get packed quantities for each batch
    const batchIds = (data || []).map(b => b.id);
    
    let packedQtyMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const { data: cartonData } = await supabase
        .from("cartons")
        .select("production_batch_id, quantity")
        .in("production_batch_id", batchIds);
      
      (cartonData || []).forEach(c => {
        if (c.production_batch_id) {
          packedQtyMap[c.production_batch_id] = (packedQtyMap[c.production_batch_id] || 0) + c.quantity;
        }
      });
    }

    // Enrich with packed qty and available for packing
    // Batch-level production_complete is already filtered in query
    const enriched: PackableBatch[] = (data || [])
      .map(b => {
        const wo = b.work_orders as any;
        const packedQty = packedQtyMap[b.id] || 0;
        const availableForPacking = Math.max(0, (b.qc_approved_qty || 0) - packedQty);
      
        return {
          id: b.id,
          wo_id: b.wo_id,
          batch_number: b.batch_number,
          batch_quantity: b.batch_quantity || 0,
          produced_qty: b.produced_qty || 0,
          qc_approved_qty: b.qc_approved_qty || 0,
          qc_rejected_qty: b.qc_rejected_qty || 0,
          dispatched_qty: b.dispatched_qty || 0,
          packed_qty: packedQty,
          available_for_packing: availableForPacking,
          qc_final_status: b.qc_final_status || "",
          qc_final_approved_at: b.qc_final_approved_at,
          stage_type: b.stage_type || "",
          batch_status: b.batch_status || "",
          wo_number: wo?.display_id || "",
          item_code: wo?.item_code || "",
          customer: wo?.customer || "",
          wo_quantity: wo?.quantity || 0,
          production_complete: b.production_complete || false,  // Now from batch level
        };
      }).filter(b => b.available_for_packing > 0);

    setPackableBatches(enriched);
  };

  const loadPackingWorkOrders = async () => {
    // Load batches that are ready for packing (QUANTITY-BASED eligibility)
    // Packing is available when qc_approved_qty - packed_qty > 0
    // NOT gated by production_complete or qc_final_status
    
    const { data: batchData, error: batchError } = await supabase
      .from("production_batches")
      .select(`
        id,
        wo_id,
        batch_number,
        qc_approved_qty,
        qc_final_status,
        production_complete,
        production_complete_qty,
        work_orders!inner(
          id,
          display_id,
          item_code,
          customer,
          quantity,
          status
        )
      `)
      .gt("qc_approved_qty", 0);  // Only filter: has QC-approved quantity

    if (batchError) {
      console.error("Error loading packing-ready batches:", batchError);
      return;
    }

    // Build unique WO map from batches - now based on BATCH production_complete
    const woMap = new Map<string, {
      wo: any;
      qcApproved: number;
      completeBatches: number;
      totalBatches: number;
    }>();

    (batchData || []).forEach(b => {
      const wo = b.work_orders as any;
      if (!wo) return;
      
      const existing = woMap.get(wo.id);
      if (existing) {
        existing.qcApproved += b.qc_approved_qty || 0;
        existing.completeBatches += 1;
      } else {
        woMap.set(wo.id, {
          wo,
          qcApproved: b.qc_approved_qty || 0,
          completeBatches: 1,
          totalBatches: 1,
        });
      }
    });

    const woIds = Array.from(woMap.keys());
    if (woIds.length === 0) {
      setPackingWorkOrders([]);
      return;
    }

    // Get total batch count per WO (to show "X of Y batches complete")
    const { data: allBatches } = await supabase
      .from("production_batches")
      .select("wo_id")
      .in("wo_id", woIds);
    
    const totalBatchMap: Record<string, number> = {};
    (allBatches || []).forEach(b => {
      totalBatchMap[b.wo_id] = (totalBatchMap[b.wo_id] || 0) + 1;
    });

    // Update total batch counts
    woMap.forEach((val, woId) => {
      val.totalBatches = totalBatchMap[woId] || val.completeBatches;
    });

    // Get packed quantities for these WOs
    const { data: cartonData } = await supabase
      .from("cartons")
      .select("wo_id, quantity")
      .in("wo_id", woIds);

    const packedQtyMap: Record<string, number> = {};
    (cartonData || []).forEach(c => {
      packedQtyMap[c.wo_id] = (packedQtyMap[c.wo_id] || 0) + c.quantity;
    });

    // Build WO list with status
    const workOrders: PackingWorkOrder[] = Array.from(woMap.values()).map(({ wo, qcApproved, completeBatches, totalBatches }) => {
      const packedQty = packedQtyMap[wo.id] || 0;
      const availableForPacking = Math.max(0, qcApproved - packedQty);
      const remainingQty = wo.quantity - packedQty;

      let status: 'ready' | 'blocked' = 'ready';
      let blockingReason: string | null = null;

      if (availableForPacking === 0) {
        status = 'blocked';
        blockingReason = 'Fully packed';
      }

      return {
        id: wo.id,
        wo_number: wo.display_id || '',
        item_code: wo.item_code || '',
        customer: wo.customer || '',
        wo_quantity: wo.quantity || 0,
        production_complete: completeBatches === totalBatches,  // Derived from batch counts
        production_complete_qty: qcApproved,
        qc_approved_qty: qcApproved,
        packed_qty: packedQty,
        available_for_packing: availableForPacking,
        remaining_qty: remainingQty,
        status,
        blocking_reason: blockingReason,
      };
    }).sort((a, b) => {
      // Sort ready items first, then by available quantity
      if (a.status !== b.status) return a.status === 'ready' ? -1 : 1;
      return b.available_for_packing - a.available_for_packing;
    });

    setPackingWorkOrders(workOrders);
  };

  const loadPackingHistory = async () => {
    const { data } = await supabase
      .from("cartons")
      .select(`
        id, 
        carton_id, 
        wo_id, 
        production_batch_id,
        quantity, 
        num_cartons, 
        num_pallets, 
        status, 
        built_at,
        work_orders(display_id, item_code),
        production_batches(batch_number)
      `)
      .order("built_at", { ascending: false })
      .limit(50);

    setPackingHistory((data as unknown as PackingRecord[]) || []);
  };

  const handleCreatePackingBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatch) return;

    const qty = parseInt(form.quantity);
    const numCartons = form.numCartons ? parseInt(form.numCartons) : null;
    const numPallets = form.numPallets ? parseInt(form.numPallets) : null;

    if (!qty || qty <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid quantity" });
      return;
    }

    if (qty > selectedBatch.available_for_packing) {
      toast({ 
        variant: "destructive", 
        description: `Cannot pack ${qty} pcs. Only ${selectedBatch.available_for_packing} pcs available in this batch.` 
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate packing batch ID: PKB-{WO}-{BatchNum}-{timestamp}
      const batchId = `PKB-${selectedBatch.wo_number}-B${selectedBatch.batch_number}-${Date.now().toString().slice(-6)}`;

      // Get heat numbers from material issues
      const { data: issues } = await supabase
        .from("wo_material_issues")
        .select("material_lots(heat_no)")
        .eq("wo_id", selectedBatch.wo_id);

      const heatNos = (issues || [])
        .map((i: any) => i?.material_lots?.heat_no)
        .filter(Boolean);

      // Create packing record linked to production batch
      const { error } = await supabase.from("cartons").insert({
        carton_id: batchId,
        wo_id: selectedBatch.wo_id,
        production_batch_id: selectedBatch.id, // Link to source batch
        quantity: qty,
        num_cartons: numCartons,
        num_pallets: numPallets,
        net_weight: 0,
        gross_weight: 0,
        heat_nos: heatNos.length > 0 ? heatNos : [],
        status: "ready_for_dispatch",
        built_by: user?.id,
      });

      if (error) throw error;

      // Check if batch is now fully packed
      const newPackedQty = selectedBatch.packed_qty + qty;
      const isFullyPacked = newPackedQty >= selectedBatch.qc_approved_qty;

      toast({
        title: "Packing Complete",
        description: `${batchId} created with ${qty} pcs from Batch #${selectedBatch.batch_number}.${isFullyPacked ? " Batch fully packed." : ""}`,
      });

      // Reset form and refresh
      setForm({ quantity: "", numCartons: "", numPallets: "" });
      setSelectedBatchId("");
      loadPackableBatches();
      loadPackingWorkOrders();
      loadPackingHistory();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create packing batch",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, cartonId: string) => {
    if (!confirm(`Delete packing record ${cartonId}?`)) return;

    try {
      const { error } = await supabase.from("cartons").delete().eq("id", id);
      if (error) throw error;
      toast({ description: `${cartonId} deleted` });
      loadPackableBatches();
      loadPackingWorkOrders();
      loadPackingHistory();
    } catch (error: any) {
      toast({ variant: "destructive", description: error.message });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "ready_for_dispatch":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Ready for Dispatch</Badge>;
      case "dispatched":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Dispatched</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getBatchProgressBadge = (batch: PackableBatch) => {
    const progress = (batch.packed_qty / batch.qc_approved_qty) * 100;
    if (progress === 0) {
      return <Badge variant="outline">Not Started</Badge>;
    } else if (progress >= 100) {
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Fully Packed</Badge>;
    } else {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">{Math.round(progress)}% Packed</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Packing"
            description="Pack QC-approved production batches for dispatch"
            icon={<Box className="h-6 w-6" />}
          />

          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">
                <ClipboardList className="h-4 w-4 mr-2" />
                Ready for Packing
              </TabsTrigger>
              <TabsTrigger value="create">
                <Package className="h-4 w-4 mr-2" />
                Create Packing Batch
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            {/* Ready for Packing Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ClipboardList className="h-5 w-5" />
                    Work Orders - Packing Status
                  </CardTitle>
                  <CardDescription>
                    Overview of work orders and their packing eligibility
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {packingWorkOrders.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      No active work orders found
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Work Order</TableHead>
                            <TableHead>Item / Customer</TableHead>
                            <TableHead className="text-right">Ordered</TableHead>
                            <TableHead className="text-right">QC Approved</TableHead>
                            <TableHead className="text-right">Packed</TableHead>
                            <TableHead className="text-right">Available</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {packingWorkOrders.map((wo) => (
                            <TableRow key={wo.id} className={wo.status === 'blocked' ? 'opacity-60' : ''}>
                              <TableCell className="font-mono font-medium">
                                {wo.wo_number}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm font-medium">{wo.item_code}</div>
                                <div className="text-xs text-muted-foreground">{wo.customer}</div>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {wo.wo_quantity.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {wo.qc_approved_qty > 0 ? (
                                  <span className="text-green-600 font-medium">{wo.qc_approved_qty.toLocaleString()}</span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {wo.packed_qty > 0 ? wo.packed_qty.toLocaleString() : '—'}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {wo.available_for_packing > 0 ? (
                                  <span className="text-primary">{wo.available_for_packing.toLocaleString()}</span>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {wo.status === 'ready' ? (
                                  <Badge className="bg-green-500/10 text-green-600 border-green-500/20 gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Ready
                                  </Badge>
                                ) : (
                                  <div className="flex flex-col gap-1">
                                    <Badge variant="outline" className="text-amber-600 border-amber-500/30 gap-1">
                                      {wo.blocking_reason === 'Production not complete' && <Clock className="h-3 w-3" />}
                                      {wo.blocking_reason === 'Final QC pending' && <AlertTriangle className="h-3 w-3" />}
                                      {wo.blocking_reason === 'Fully packed' && <CheckCircle2 className="h-3 w-3" />}
                                      {wo.blocking_reason === 'No QC-approved quantity' && <XCircle className="h-3 w-3" />}
                                      Blocked
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">{wo.blocking_reason}</span>
                                  </div>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Cards */}
              <div className="grid gap-4 md:grid-cols-3">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10">
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {packingWorkOrders.filter(wo => wo.status === 'ready').length}
                        </div>
                        <div className="text-sm text-muted-foreground">Ready for Packing</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-amber-500/10">
                        <Clock className="h-5 w-5 text-amber-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {packingWorkOrders.filter(wo => wo.blocking_reason === 'Production not complete').length}
                        </div>
                        <div className="text-sm text-muted-foreground">Awaiting Production</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10">
                        <AlertTriangle className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <div className="text-2xl font-bold">
                          {packingWorkOrders.filter(wo => wo.blocking_reason === 'Final QC pending').length}
                        </div>
                        <div className="text-sm text-muted-foreground">Awaiting Final QC</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="create" className="space-y-4 mt-6">
              {packableBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Batches Ready for Packing</h3>
                      <p className="text-muted-foreground max-w-md">
                        Batches are ready for packing when:
                      </p>
                      <ul className="text-muted-foreground text-sm mt-2 space-y-1 text-left">
                        <li>• Production is marked complete on the Work Order</li>
                        <li>• Final QC has approved quantity</li>
                        <li>• There is remaining quantity to pack</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Batch Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Layers className="h-5 w-5" />
                        Select Production Batch
                      </CardTitle>
                      <CardDescription>
                        Choose a Final QC-approved batch to pack
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select
                        value={selectedBatchId}
                        onValueChange={setSelectedBatchId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select batch..." />
                        </SelectTrigger>
                        <SelectContent>
                          {packableBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{batch.wo_number}</span>
                                <span className="text-muted-foreground">Batch #{batch.batch_number}</span>
                                <span className="text-muted-foreground">
                                  ({batch.available_for_packing} pcs available)
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedBatch && (
                        <form onSubmit={handleCreatePackingBatch} className="space-y-4 pt-4 border-t">
                          <div className="space-y-2">
                            <Label htmlFor="quantity">
                              Quantity to Pack
                              <span className="text-muted-foreground ml-1">
                                (max: {selectedBatch.available_for_packing})
                              </span>
                            </Label>
                            <Input
                              id="quantity"
                              type="number"
                              min="1"
                              max={selectedBatch.available_for_packing}
                              value={form.quantity}
                              onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                              placeholder="Enter quantity"
                              required
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="numCartons">Cartons (optional)</Label>
                              <Input
                                id="numCartons"
                                type="number"
                                min="0"
                                value={form.numCartons}
                                onChange={(e) => setForm({ ...form, numCartons: e.target.value })}
                                placeholder="Optional"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="numPallets">Pallets (optional)</Label>
                              <Input
                                id="numPallets"
                                type="number"
                                min="0"
                                value={form.numPallets}
                                onChange={(e) => setForm({ ...form, numPallets: e.target.value })}
                                placeholder="Optional"
                              />
                            </div>
                          </div>

                          <FormActions>
                            <Button 
                              type="submit" 
                              disabled={loading}
                              className="gap-2 w-full"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                              Complete Packing
                            </Button>
                          </FormActions>
                        </form>
                      )}
                    </CardContent>
                  </Card>

                  {/* Batch Context Panel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Batch Context</CardTitle>
                      <CardDescription>
                        {selectedBatch 
                          ? "Details of the selected production batch" 
                          : "Select a batch to view details"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedBatch ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Order</p>
                              <p className="font-medium">{selectedBatch.wo_number}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Batch #</p>
                              <p className="font-medium">{selectedBatch.batch_number}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Item</p>
                              <p className="font-medium">{selectedBatch.item_code}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
                              <p className="font-medium">{selectedBatch.customer}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">QC Status</p>
                              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                                Final QC Passed
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Packing Status</p>
                              {getBatchProgressBadge(selectedBatch)}
                            </div>
                          </div>

                          <div className="border-t pt-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Batch Quantities</p>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div className="p-3 rounded-lg bg-muted/50">
                                <p className="text-2xl font-bold text-primary">
                                  {selectedBatch.qc_approved_qty}
                                </p>
                                <p className="text-xs text-muted-foreground">QC Approved</p>
                              </div>
                              <div className="p-3 rounded-lg bg-muted/50">
                                <p className="text-2xl font-bold text-blue-600">
                                  {selectedBatch.packed_qty}
                                </p>
                                <p className="text-xs text-muted-foreground">Already Packed</p>
                              </div>
                              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                <p className="text-2xl font-bold text-green-600">
                                  {selectedBatch.available_for_packing}
                                </p>
                                <p className="text-xs text-muted-foreground">Available</p>
                              </div>
                            </div>
                          </div>

                          {selectedBatch.qc_final_approved_at && (
                            <div className="pt-2 text-xs text-muted-foreground">
                              QC Approved: {new Date(selectedBatch.qc_final_approved_at).toLocaleString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                          <Package className="h-12 w-12 mb-4 opacity-50" />
                          <p>Select a production batch to view its details and create packing records.</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Packing History</CardTitle>
                  <CardDescription>Recent packing batches across all work orders</CardDescription>
                </CardHeader>
                <CardContent>
                  {packingHistory.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <History className="h-12 w-12 text-muted-foreground/50 mb-4" />
                      <p className="text-muted-foreground">No packing history yet</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Packing ID</TableHead>
                          <TableHead>Work Order</TableHead>
                          <TableHead>Source Batch</TableHead>
                          <TableHead className="text-right">Quantity</TableHead>
                          <TableHead className="text-center">Cartons</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Packed At</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {packingHistory.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="font-mono text-sm">{record.carton_id}</TableCell>
                            <TableCell>{record.work_orders?.display_id || "—"}</TableCell>
                            <TableCell>
                              {record.production_batches 
                                ? `Batch #${record.production_batches.batch_number}` 
                                : <span className="text-muted-foreground">Legacy</span>
                              }
                            </TableCell>
                            <TableCell className="text-right font-medium">{record.quantity}</TableCell>
                            <TableCell className="text-center">{record.num_cartons || "—"}</TableCell>
                            <TableCell>{getStatusBadge(record.status)}</TableCell>
                            <TableCell>{new Date(record.built_at).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setViewData(record);
                                    setViewOpen(true);
                                  }}
                                >
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {record.status !== "dispatched" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:text-destructive"
                                    onClick={() => handleDelete(record.id, record.carton_id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
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

        <HistoricalDataDialog
          open={viewOpen}
          onOpenChange={setViewOpen}
          type="carton"
          data={viewData}
        />
      </PageContainer>
    </div>
  );
};

export default Packing;
