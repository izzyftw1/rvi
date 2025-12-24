import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, History, Eye, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
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

interface DispatchQCBatchWithContext {
  id: string;
  qc_batch_id: string;
  work_order_id: string;
  qc_approved_quantity: number;
  consumed_quantity: number;
  qc_date: string;
  status: string;
  work_order?: {
    wo_number: string;
    item_code: string;
    customer: string;
  } | null;
}

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
  work_orders?: { wo_number: string; item_code: string } | null;
  dispatch_qc_batches?: { qc_batch_id: string } | null;
}

const Packing = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [qcBatches, setQcBatches] = useState<DispatchQCBatchWithContext[]>([]);
  const [packingBatches, setPackingBatches] = useState<PackingBatch[]>([]);
  
  // Form state
  const [selectedQCBatchId, setSelectedQCBatchId] = useState<string>("");
  const [selectedQCBatch, setSelectedQCBatch] = useState<DispatchQCBatchWithContext | null>(null);
  const [form, setForm] = useState({
    quantity: "",
    numCartons: "",
    numPallets: "",
  });

  // View dialog
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);

  useEffect(() => {
    loadQCBatches();
    loadPackingBatches();
  }, []);

  useEffect(() => {
    if (selectedQCBatchId) {
      const batch = qcBatches.find(b => b.id === selectedQCBatchId);
      setSelectedQCBatch(batch || null);
    } else {
      setSelectedQCBatch(null);
    }
  }, [selectedQCBatchId, qcBatches]);

  const loadQCBatches = async () => {
    // Load only Dispatch QC batches with remaining quantity
    const { data } = await supabase
      .from("dispatch_qc_batches")
      .select(`
        id,
        qc_batch_id,
        work_order_id,
        qc_approved_quantity,
        consumed_quantity,
        qc_date,
        status,
        work_orders(wo_number, item_code, customer)
      `)
      .neq("status", "consumed")
      .order("qc_date", { ascending: false });
    
    // Filter to only those with remaining quantity
    const batchesWithRemaining = (data || []).filter(
      b => (b.qc_approved_quantity - b.consumed_quantity) > 0
    ) as unknown as DispatchQCBatchWithContext[];
    
    setQcBatches(batchesWithRemaining);
  };

  const loadPackingBatches = async () => {
    const { data } = await supabase
      .from("cartons")
      .select(`
        id, 
        carton_id, 
        wo_id, 
        quantity, 
        num_cartons, 
        num_pallets, 
        status, 
        built_at, 
        dispatch_qc_batch_id,
        work_orders(wo_number, item_code),
        dispatch_qc_batches(qc_batch_id)
      `)
      .order("built_at", { ascending: false })
      .limit(50);

    setPackingBatches((data as unknown as PackingBatch[]) || []);
  };

  const getRemainingPackable = (batch: DispatchQCBatchWithContext) => {
    return batch.qc_approved_quantity - batch.consumed_quantity;
  };

  const handleCreatePackingBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQCBatch) return;

    const qty = parseInt(form.quantity);
    const numCartons = form.numCartons ? parseInt(form.numCartons) : null;
    const numPallets = form.numPallets ? parseInt(form.numPallets) : null;
    const remainingPackable = getRemainingPackable(selectedQCBatch);

    if (!qty || qty <= 0) {
      toast({ variant: "destructive", description: "Please enter a valid quantity" });
      return;
    }

    if (qty > remainingPackable) {
      toast({ 
        variant: "destructive", 
        description: `Cannot pack ${qty} pcs. Only ${remainingPackable} pcs remaining in this QC batch.` 
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Generate packing batch ID
      const batchId = `PKB-${selectedQCBatch.qc_batch_id}-${Date.now().toString().slice(-6)}`;

      // Get heat numbers from material issues
      const { data: issues } = await supabase
        .from("wo_material_issues")
        .select("material_lots(heat_no)")
        .eq("wo_id", selectedQCBatch.work_order_id);

      const heatNos = (issues || [])
        .map((i: any) => i?.material_lots?.heat_no)
        .filter(Boolean);

      // Create packing batch with dispatch_qc_batch_id link
      const { error } = await supabase.from("cartons").insert({
        carton_id: batchId,
        wo_id: selectedQCBatch.work_order_id,
        dispatch_qc_batch_id: selectedQCBatch.id,
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

      // Check if QC batch is now fully consumed
      const newConsumed = selectedQCBatch.consumed_quantity + qty;
      const isFullyPacked = newConsumed >= selectedQCBatch.qc_approved_quantity;

      toast({
        title: "Packing Complete",
        description: `${batchId} created with ${qty} pcs.${isFullyPacked ? " QC batch fully packed." : ""}`,
      });

      // Reset form and refresh
      setForm({ quantity: "", numCartons: "", numPallets: "" });
      setSelectedQCBatchId("");
      loadQCBatches();
      loadPackingBatches();
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
      loadQCBatches();
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

  const getQCBatchStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Open</Badge>;
      case "partially_consumed":
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">Partially Packed</Badge>;
      case "consumed":
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Fully Packed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Packing"
            description="Pack QC-approved batches for dispatch"
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
              {qcBatches.length === 0 ? (
                <Card>
                  <CardContent className="py-12">
                    <div className="flex flex-col items-center justify-center text-center">
                      <AlertTriangle className="h-12 w-12 text-amber-500 mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No Batches Ready for Packing</h3>
                      <p className="text-muted-foreground max-w-md">
                        There are no Dispatch QC-approved batches with remaining quantity. 
                        Complete Dispatch QC approval in Final QC to create packable batches.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* QC Batch Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Package className="h-5 w-5" />
                        Select QC Batch
                      </CardTitle>
                      <CardDescription>
                        Choose a Dispatch QC-approved batch to pack
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Select
                        value={selectedQCBatchId}
                        onValueChange={setSelectedQCBatchId}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select QC batch..." />
                        </SelectTrigger>
                        <SelectContent>
                          {qcBatches.map((batch) => (
                            <SelectItem key={batch.id} value={batch.id}>
                              <div className="flex items-center gap-2">
                                <span className="font-mono">{batch.qc_batch_id}</span>
                                <span className="text-muted-foreground">
                                  ({getRemainingPackable(batch)} pcs available)
                                </span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>

                      {selectedQCBatch && (
                        <form onSubmit={handleCreatePackingBatch} className="space-y-4 pt-4 border-t">
                          <div className="space-y-2">
                            <Label htmlFor="quantity">
                              Quantity to Pack
                              <span className="text-muted-foreground ml-1">
                                (max: {getRemainingPackable(selectedQCBatch)})
                              </span>
                            </Label>
                            <Input
                              id="quantity"
                              type="number"
                              min="1"
                              max={getRemainingPackable(selectedQCBatch)}
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

                  {/* Read-only Context Panel */}
                  <Card>
                    <CardHeader>
                      <CardTitle>Batch Context</CardTitle>
                      <CardDescription>
                        {selectedQCBatch 
                          ? "Details of the selected QC batch" 
                          : "Select a QC batch to view details"}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {selectedQCBatch ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Work Order</p>
                              <p className="font-medium">{selectedQCBatch.work_order?.wo_number || "—"}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Item</p>
                              <p className="font-medium">{selectedQCBatch.work_order?.item_code || "—"}</p>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide">Customer</p>
                            <p className="font-medium">{selectedQCBatch.work_order?.customer || "—"}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">QC Batch ID</p>
                              <p className="font-mono font-medium">{selectedQCBatch.qc_batch_id}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                              {getQCBatchStatusBadge(selectedQCBatch.status)}
                            </div>
                          </div>

                          <div className="border-t pt-4">
                            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Quantities</p>
                            <div className="grid grid-cols-3 gap-4 text-center">
                              <div className="p-3 rounded-lg bg-muted/50">
                                <p className="text-2xl font-bold text-primary">
                                  {selectedQCBatch.qc_approved_quantity}
                                </p>
                                <p className="text-xs text-muted-foreground">QC Approved</p>
                              </div>
                              <div className="p-3 rounded-lg bg-muted/50">
                                <p className="text-2xl font-bold text-blue-600">
                                  {selectedQCBatch.consumed_quantity}
                                </p>
                                <p className="text-xs text-muted-foreground">Already Packed</p>
                              </div>
                              <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                                <p className="text-2xl font-bold text-green-600">
                                  {getRemainingPackable(selectedQCBatch)}
                                </p>
                                <p className="text-xs text-muted-foreground">Remaining</p>
                              </div>
                            </div>
                          </div>

                          <div className="text-xs text-muted-foreground pt-2">
                            QC Date: {new Date(selectedQCBatch.qc_date).toLocaleDateString()}
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center text-muted-foreground">
                          <Package className="h-12 w-12 mb-4 opacity-50" />
                          <p>Select a QC batch to view its details</p>
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
                  <CardTitle>Packing Batches</CardTitle>
                  <CardDescription>Recent packing batches and their status</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Packing Batch</TableHead>
                        <TableHead>QC Batch</TableHead>
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
                          <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                            No packing batches found
                          </TableCell>
                        </TableRow>
                      ) : (
                        packingBatches.map((batch) => (
                          <TableRow key={batch.id}>
                            <TableCell className="font-mono font-medium">{batch.carton_id}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">
                              {batch.dispatch_qc_batches?.qc_batch_id || "—"}
                            </TableCell>
                            <TableCell>
                              <div>
                                <p className="font-medium">{batch.work_orders?.wo_number || "—"}</p>
                                <p className="text-xs text-muted-foreground">{batch.work_orders?.item_code || ""}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">{batch.quantity}</TableCell>
                            <TableCell className="text-right">{batch.num_cartons || "—"}</TableCell>
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
                                  <Eye className="h-4 w-4" />
                                </Button>
                                {batch.status !== "dispatched" && (
                                  <Button 
                                    variant="outline" 
                                    size="sm" 
                                    className="text-destructive"
                                    onClick={() => handleDelete(batch.id, batch.carton_id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
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

      {/* View Dialog */}
      <HistoricalDataDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
        type="carton"
        data={viewData}
      />
    </div>
  );
};

export default Packing;
