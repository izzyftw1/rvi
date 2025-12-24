import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, History, Eye, Trash2, CheckCircle2, AlertTriangle, Layers } from "lucide-react";
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
    loadPackingHistory();
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
    // 1. Final QC has approved quantity
    // 2. Work order production is complete
    // 3. Has remaining quantity to pack
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
        work_orders!inner(display_id, item_code, customer, quantity, production_complete)
      `)
      .eq("qc_final_status", "passed")
      .not("batch_status", "eq", "completed")
      .not("stage_type", "eq", "dispatched")
      .order("qc_final_approved_at", { ascending: false });

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
    // ONLY include batches where production is complete
    const enriched: PackableBatch[] = (data || [])
      .filter(b => {
        const wo = b.work_orders as any;
        return wo?.production_complete === true;
      })
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
          production_complete: wo?.production_complete || false,
        };
      }).filter(b => b.available_for_packing > 0);

    setPackableBatches(enriched);
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

          <Tabs defaultValue="create" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">
                <Package className="h-4 w-4 mr-2" />
                Create Packing Batch
              </TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

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
