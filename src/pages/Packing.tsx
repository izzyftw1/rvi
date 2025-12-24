import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, History, Eye, Trash2, CheckCircle2, AlertCircle, ClipboardCheck } from "lucide-react";
import { PageHeader, PageContainer, FormActions } from "@/components/ui/page-header";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { WorkOrderSelect } from "@/components/ui/work-order-select";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import { DispatchQCBatchSelector } from "@/components/packing/DispatchQCBatchSelector";
import { getRemainingUnQCdQuantity } from "@/hooks/useDispatchQCBatches";

interface WorkOrder {
  id: string;
  wo_id: string;
  wo_number: string;
  item_code: string;
  quantity: number;
  customer_master?: { customer_name: string } | null;
}

interface PackingBatch {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  num_cartons: number;
  num_pallets: number | null;
  status: string;
  built_at: string;
  dispatch_qc_batch_id: string | null;
  work_orders?: { wo_number: string; item_code: string } | null;
}

interface WOQuantitySummary {
  orderedQty: number;
  producedQty: number;
  dispatchQCApprovedQty: number;
  remainingForQC: number;
}

const Packing = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [packingBatches, setPackingBatches] = useState<PackingBatch[]>([]);
  
  // Form state
  const [selectedWoId, setSelectedWoId] = useState<string>("");
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null);
  const [selectedDispatchQCBatchId, setSelectedDispatchQCBatchId] = useState<string | null>(null);
  const [availableQty, setAvailableQty] = useState(0);
  const [woQuantitySummary, setWoQuantitySummary] = useState<WOQuantitySummary | null>(null);
  const [form, setForm] = useState({
    quantity: "",
    numCartons: "",
    numPallets: "",
  });

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);

  useEffect(() => {
    loadWorkOrders();
    loadPackingBatches();
  }, []);

  useEffect(() => {
    if (selectedWoId) {
      const wo = workOrders.find(w => w.id === selectedWoId);
      setSelectedWo(wo || null);
      setSelectedDispatchQCBatchId(null);
      setAvailableQty(0);
      if (wo) {
        loadWOQuantitySummary(wo.id);
      }
    } else {
      setSelectedWo(null);
      setSelectedDispatchQCBatchId(null);
      setAvailableQty(0);
      setWoQuantitySummary(null);
    }
  }, [selectedWoId, workOrders]);

  const loadWOQuantitySummary = async (woId: string) => {
    const summary = await getRemainingUnQCdQuantity(woId);
    setWoQuantitySummary(summary);
  };

  const handleDispatchQCBatchSelect = (batchId: string | null, availableQty: number) => {
    setSelectedDispatchQCBatchId(batchId);
    setAvailableQty(availableQty);
  };

  const loadWorkOrders = async () => {
    const { data } = await supabase
      .from("work_orders")
      .select("id, wo_id, wo_number, item_code, quantity, customer_master(customer_name)")
      .in("status", ["in_progress", "packing", "qc"])
      .order("created_at", { ascending: false });
    
    setWorkOrders(data || []);
  };

  const loadPackingBatches = async () => {
    const { data } = await supabase
      .from("cartons")
      .select("id, carton_id, wo_id, quantity, num_cartons, num_pallets, status, built_at, dispatch_qc_batch_id, work_orders(wo_number, item_code)")
      .order("built_at", { ascending: false })
      .limit(50);

    setPackingBatches((data as unknown as PackingBatch[]) || []);
  };


  const handleCreatePackingBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWo) return;

    const qty = parseInt(form.quantity);
    const numCartons = parseInt(form.numCartons);
    const numPallets = form.numPallets ? parseInt(form.numPallets) : null;

    // Validation - MUST have Dispatch QC batch selected
    if (!selectedDispatchQCBatchId) {
      toast({ 
        variant: "destructive", 
        description: "Please select a Dispatch QC batch. Packing requires QC approval." 
      });
      return;
    }

    if (!qty || qty <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid quantity" });
      return;
    }

    if (qty > availableQty) {
      toast({ 
        variant: "destructive", 
        description: `Cannot pack ${qty} pcs. Only ${availableQty} pcs available from this QC batch.` 
      });
      return;
    }

    if (!numCartons || numCartons <= 0) {
      toast({ variant: "destructive", description: "Please enter number of cartons" });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate packing batch ID
      const batchId = `PKB-${selectedWo.wo_id}-${Date.now().toString().slice(-6)}`;

      // Get heat numbers from material issues
      const { data: issues } = await supabase
        .from("wo_material_issues")
        .select("material_lots(heat_no)")
        .eq("wo_id", selectedWo.id);

      const heatNos = (issues || [])
        .map((i: any) => i?.material_lots?.heat_no)
        .filter(Boolean);

      // Create packing batch with dispatch_qc_batch_id link
      const { error } = await supabase.from("cartons").insert({
        carton_id: batchId,
        wo_id: selectedWo.id,
        dispatch_qc_batch_id: selectedDispatchQCBatchId,
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

      toast({
        title: "Packing Complete",
        description: `${batchId} created with ${qty} pcs in ${numCartons} carton(s). Ready for dispatch.`,
      });

      // Reset form and refresh
      setForm({ quantity: "", numCartons: "", numPallets: "" });
      setSelectedWoId("");
      loadPackingBatches();
      loadWorkOrders();
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

  const handleDelete = async (id: string, batchId: string) => {
    if (!confirm(`Delete packing batch ${batchId}?`)) return;

    try {
      const { error } = await supabase.from("cartons").delete().eq("id", id);
      if (error) throw error;
      toast({ description: `${batchId} deleted` });
      loadPackingBatches();
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

  const woOptions = workOrders.map(wo => ({
    id: wo.id,
    wo_number: wo.wo_number,
    item_code: wo.item_code,
    customer: wo.customer_master?.customer_name || "",
    quantity: wo.quantity,
  }));

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Packing"
            description="Create packing batches from QC-approved production"
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Create Packing Batch
                  </CardTitle>
                  <CardDescription>
                    Pack QC-approved quantities for dispatch
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreatePackingBatch} className="space-y-6">
                    {/* Work Order Selection */}
                    <div className="space-y-2">
                      <Label>Work Order</Label>
                      <WorkOrderSelect
                        value={selectedWoId}
                        onValueChange={setSelectedWoId}
                        workOrders={woOptions}
                        placeholder="Select work order..."
                      />
                    </div>

                    {/* Selected WO Info with Remaining Un-QC'd Quantity */}
                    {selectedWo && (
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg border bg-muted/30 space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{selectedWo.wo_number}</p>
                              <p className="text-sm text-muted-foreground">{selectedWo.item_code}</p>
                            </div>
                            {woQuantitySummary && (
                              <div className="text-right">
                                <p className="text-sm text-muted-foreground">Order Progress</p>
                                <p className="text-sm">
                                  <span className="font-bold">{woQuantitySummary.dispatchQCApprovedQty}</span>
                                  <span className="text-muted-foreground"> / {woQuantitySummary.orderedQty} QC'd</span>
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Show remaining un-QC'd quantity */}
                          {woQuantitySummary && woQuantitySummary.remainingForQC > 0 && (
                            <div className="flex items-center gap-2 text-blue-600 bg-blue-500/10 px-3 py-2 rounded">
                              <ClipboardCheck className="h-4 w-4" />
                              <span className="text-sm">
                                {woQuantitySummary.remainingForQC} pcs still pending Dispatch QC 
                                (Produced: {woQuantitySummary.producedQty})
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Dispatch QC Batch Selector - REQUIRED for packing */}
                        <DispatchQCBatchSelector
                          woId={selectedWo.id}
                          selectedBatchId={selectedDispatchQCBatchId}
                          onBatchSelect={handleDispatchQCBatchSelect}
                        />
                      </div>
                    )}

                    {/* Quantity Inputs */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="quantity">
                          Quantity to Pack (pcs)
                          {availableQty > 0 && (
                            <span className="text-muted-foreground ml-1">(max: {availableQty})</span>
                          )}
                        </Label>
                        <Input
                          id="quantity"
                          type="number"
                          min="1"
                          max={availableQty}
                          value={form.quantity}
                          onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                          placeholder="Enter quantity"
                          disabled={!selectedWo || availableQty === 0}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="numCartons">Number of Cartons</Label>
                        <Input
                          id="numCartons"
                          type="number"
                          min="1"
                          value={form.numCartons}
                          onChange={(e) => setForm({ ...form, numCartons: e.target.value })}
                          placeholder="Enter cartons"
                          disabled={!selectedWo || availableQty === 0}
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="numPallets">Number of Pallets (optional)</Label>
                        <Input
                          id="numPallets"
                          type="number"
                          min="0"
                          value={form.numPallets}
                          onChange={(e) => setForm({ ...form, numPallets: e.target.value })}
                          placeholder="Optional"
                          disabled={!selectedWo || availableQty === 0}
                        />
                      </div>
                    </div>

                    <FormActions>
                      <Button 
                        type="submit" 
                        disabled={loading || !selectedWo || availableQty === 0}
                        className="gap-2"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Complete Packing
                      </Button>
                    </FormActions>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Packing Batches</CardTitle>
                  <CardDescription>Recent packing batches and their status</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Batch ID</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead className="text-right">Cartons</TableHead>
                        <TableHead className="text-right">Pallets</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Packed At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {packingBatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No packing batches found
                          </TableCell>
                        </TableRow>
                      ) : (
                        packingBatches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell className="font-medium">{batch.carton_id}</TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{batch.work_orders?.wo_number || "—"}</p>
                                <p className="text-xs text-muted-foreground">{batch.work_orders?.item_code || ""}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right">{batch.quantity}</TableCell>
                            <TableCell className="text-right">{batch.num_cartons || 1}</TableCell>
                            <TableCell className="text-right">{batch.num_pallets || "—"}</TableCell>
                            <TableCell>{getStatusBadge(batch.status)}</TableCell>
                            <TableCell>{new Date(batch.built_at).toLocaleString()}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => {
                                    setViewData(batch);
                                    setViewOpen(true);
                                  }}
                                >
                                  <Eye className="h-3 w-3" />
                                </Button>
                                {batch.status !== "dispatched" && (
                                  <Button 
                                    variant="destructive" 
                                    size="sm"
                                    onClick={() => handleDelete(batch.id, batch.carton_id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </PageContainer>

      <HistoricalDataDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        data={viewData}
        type="carton"
      />
    </div>
  );
};

export default Packing;
