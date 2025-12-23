import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, Printer, Eye, History, Trash2 } from "lucide-react";

import { PageHeader, PageContainer, FormActions } from "@/components/ui/page-header";
import { cartonSchema, palletSchema } from "@/lib/validationSchemas";
import { HistoricalDataDialog } from "@/components/HistoricalDataDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BatchSelector } from "@/components/packing/BatchSelector";

const Packing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [cartons, setCartons] = useState<any[]>([]);
  const [pallets, setPallets] = useState<any[]>([]);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewData, setViewData] = useState<any>(null);
  const [viewType, setViewType] = useState<"carton" | "pallet">("carton");

  // Carton Form
  const [woId, setWoId] = useState("");
  const [wo, setWo] = useState<any>(null);
  const [materialIssues, setMaterialIssues] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [availableToPackQty, setAvailableToPackQty] = useState(0);
  const [cartonForm, setCartonForm] = useState({
    carton_id: "",
    quantity: "",
    net_weight: "",
    gross_weight: "",
  });

  // Pallet Form
  const [palletForm, setPalletForm] = useState({
    pallet_id: "",
    carton_ids: "",
  });

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const { data: cartonsData } = await supabase
      .from("cartons")
      .select("*")
      .order("built_at", { ascending: false })
      .limit(50);
    setCartons(cartonsData || []);

    const { data: palletsData } = await supabase
      .from("pallets")
      .select("*")
      .order("built_at", { ascending: false })
      .limit(50);
    setPallets(palletsData || []);
  };

  const openView = (data: any, type: "carton" | "pallet") => {
    setViewData(data);
    setViewType(type);
    setViewOpen(true);
  };

  const handleDeleteCarton = async (cartonId: string, cartonName: string) => {
    if (!confirm(`Are you sure you want to delete carton ${cartonName}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from("cartons")
        .delete()
        .eq("id", cartonId);

      if (error) throw error;

      toast({ description: `Carton ${cartonName} deleted successfully` });
      loadHistory();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Delete failed: ${err.message}` });
    }
  };

  const handleDeletePallet = async (palletId: string, palletName: string) => {
    if (!confirm(`Are you sure you want to delete pallet ${palletName}? This will also remove carton associations.`)) {
      return;
    }

    try {
      // Delete pallet_cartons relationships first
      const { error: relationError } = await supabase
        .from("pallet_cartons")
        .delete()
        .eq("pallet_id", palletId);

      if (relationError) throw relationError;

      // Delete pallet
      const { error } = await supabase
        .from("pallets")
        .delete()
        .eq("id", palletId);

      if (error) throw error;

      toast({ description: `Pallet ${palletName} deleted successfully` });
      loadHistory();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Delete failed: ${err.message}` });
    }
  };

  const handleFindWO = async () => {
    try {
      const { data: woData, error: woError } = await supabase
        .from("work_orders")
        .select("*")
        .eq("wo_id", woId)
        .single();

      if (woError) throw woError;

      if (woData) {
        setWo(woData);

        // Get heat numbers from material issues
        const { data: issuesData } = await supabase
          .from("wo_material_issues")
          .select("*, material_lots(heat_no)")
          .eq("wo_id", woData.id);

        setMaterialIssues(issuesData || []);

        // Auto-generate carton ID
        setCartonForm({
          ...cartonForm,
          carton_id: `CTN-${woId}-${Date.now().toString().slice(-6)}`,
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    }
  };

  const handleCreateCarton = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wo) return;

    // Validate batch selection
    if (!selectedBatchId) {
      toast({
        variant: "destructive",
        title: "Batch Required",
        description: "Please select a production batch before packing.",
      });
      return;
    }

    const qty = parseInt(cartonForm.quantity);
    
    // Validate quantity against available
    if (qty > availableToPackQty) {
      toast({
        variant: "destructive",
        title: "Quantity Exceeded",
        description: `Cannot pack ${qty} pcs. Only ${availableToPackQty} pcs available from QC-approved balance.`,
      });
      return;
    }

    if (availableToPackQty === 0) {
      toast({
        variant: "destructive",
        title: "No Available Quantity",
        description: "No QC-approved quantity available for packing in this batch.",
      });
      return;
    }

    setLoading(true);

    try {
      // Validate carton data
      const validationResult = cartonSchema.safeParse(cartonForm);
      if (!validationResult.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validationResult.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Extract heat numbers
      const heatNos = materialIssues.map((issue: any) => issue?.material_lots?.heat_no).filter(Boolean);

      const { error } = await supabase.from("cartons").insert({
        carton_id: cartonForm.carton_id,
        wo_id: wo.id,
        batch_id: selectedBatchId,
        quantity: qty,
        net_weight: parseFloat(cartonForm.net_weight),
        gross_weight: parseFloat(cartonForm.gross_weight),
        heat_nos: heatNos,
        built_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Carton created",
        description: `${cartonForm.carton_id} with ${qty} pcs from Batch`,
      });

      loadHistory();

      // Reset form but keep WO and batch selected
      setCartonForm({
        carton_id: `CTN-${woId}-${Date.now().toString().slice(-6)}`,
        quantity: "",
        net_weight: "",
        gross_weight: "",
      });
      
      // Refresh available quantity
      setSelectedBatchId(null);
      setTimeout(() => setSelectedBatchId(selectedBatchId), 100);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create carton",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePallet = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate pallet data
      const validationResult = palletSchema.safeParse(palletForm);
      if (!validationResult.success) {
        toast({
          variant: "destructive",
          title: "Validation Error",
          description: validationResult.error.errors[0].message,
        });
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      // Create pallet
      const { data: palletData, error: palletError } = await supabase
        .from("pallets")
        .insert({
          pallet_id: palletForm.pallet_id,
          built_by: user?.id,
        })
        .select()
        .single();

      if (palletError) throw palletError;

      // Find cartons
      const cartonIds = palletForm.carton_ids
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean);

      const { data: cartonsData } = await supabase
        .from("cartons")
        .select("id")
        .in("carton_id", cartonIds);

      if (cartonsData && cartonsData.length > 0) {
        // Link cartons to pallet
        const palletCartons = cartonsData.map((carton) => ({
          pallet_id: palletData.id,
          carton_id: carton.id,
        }));

        const { error: linkError } = await supabase
          .from("pallet_cartons")
          .insert(palletCartons);

        if (linkError) throw linkError;
      }

      toast({
        title: "Pallet created",
        description: `${palletForm.pallet_id} with ${cartonsData?.length || 0} cartons`,
      });

      loadHistory();

      // Reset
      setPalletForm({
        pallet_id: "",
        carton_ids: "",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Failed to create pallet",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageContainer maxWidth="xl">
        <div className="space-y-6">
          <PageHeader
            title="Packing & Dispatch"
            description="Build cartons and pallets for shipment"
            icon={<Box className="h-6 w-6" />}
          />

          <Tabs defaultValue="carton" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="carton">Build Carton</TabsTrigger>
              <TabsTrigger value="pallet">Build Pallet</TabsTrigger>
              <TabsTrigger value="history">
                <History className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="carton" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Find Work Order</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter WO ID..."
                      value={woId}
                      onChange={(e) => setWoId(e.target.value)}
                      onKeyPress={(e) => e.key === "Enter" && handleFindWO()}
                    />
                    <Button onClick={handleFindWO}>Find</Button>
                  </div>
                </CardContent>
              </Card>

              {wo && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Box className="h-5 w-5" />
                      Build Carton for {wo.wo_number}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleCreateCarton} className="space-y-4">
                      <div className="p-3 bg-secondary rounded-lg mb-4">
                        <p className="text-sm font-medium">Heat Numbers:</p>
                        <p className="text-sm text-muted-foreground">
                          {materialIssues.map((i: any) => i?.material_lots?.heat_no).filter(Boolean).join(", ") || "None"}
                        </p>
                      </div>

                      {/* Batch Selection */}
                      <BatchSelector
                        woId={wo.id}
                        selectedBatchId={selectedBatchId}
                        onBatchSelect={(batchId, availableQty) => {
                          setSelectedBatchId(batchId);
                          setAvailableToPackQty(availableQty);
                        }}
                      />

                      <div className="space-y-2">
                        <Label htmlFor="carton_id">Carton ID</Label>
                        <Input
                          id="carton_id"
                          value={cartonForm.carton_id}
                          onChange={(e) => setCartonForm({ ...cartonForm, carton_id: e.target.value })}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="quantity">
                            Quantity (pcs)
                            {availableToPackQty > 0 && (
                              <span className="text-muted-foreground ml-2">
                                (max: {availableToPackQty})
                              </span>
                            )}
                          </Label>
                          <Input
                            id="quantity"
                            type="number"
                            max={availableToPackQty}
                            value={cartonForm.quantity}
                            onChange={(e) => setCartonForm({ ...cartonForm, quantity: e.target.value })}
                            required
                            disabled={!selectedBatchId || availableToPackQty === 0}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="net_weight">Net Weight (kg)</Label>
                          <Input
                            id="net_weight"
                            type="number"
                            step="0.001"
                            value={cartonForm.net_weight}
                            onChange={(e) => setCartonForm({ ...cartonForm, net_weight: e.target.value })}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="gross_weight">Gross Weight (kg)</Label>
                          <Input
                            id="gross_weight"
                            type="number"
                            step="0.001"
                            value={cartonForm.gross_weight}
                            onChange={(e) => setCartonForm({ ...cartonForm, gross_weight: e.target.value })}
                            required
                          />
                        </div>
                      </div>

                      <FormActions>
                        <Button type="button" variant="outline">
                          <Printer className="h-4 w-4 mr-2" />
                          Print Label
                        </Button>
                        <Button 
                          type="submit" 
                          disabled={loading || !selectedBatchId || availableToPackQty === 0}
                        >
                          <Box className="h-4 w-4 mr-2" />
                          Build Carton
                        </Button>
                      </FormActions>
                    </form>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="pallet" className="space-y-4 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Build Pallet
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreatePallet} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="pallet_id">Pallet ID</Label>
                      <Input
                        id="pallet_id"
                        value={palletForm.pallet_id}
                        onChange={(e) => setPalletForm({ ...palletForm, pallet_id: e.target.value })}
                        placeholder="PLT-2025-001"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="carton_ids">Carton IDs (comma-separated)</Label>
                      <Input
                        id="carton_ids"
                        value={palletForm.carton_ids}
                        onChange={(e) => setPalletForm({ ...palletForm, carton_ids: e.target.value })}
                        placeholder="CTN-WO-001, CTN-WO-002"
                        required
                      />
                    </div>

                    <FormActions>
                      <Button type="submit" disabled={loading}>
                        <Package className="h-4 w-4 mr-2" />
                        Build Pallet
                      </Button>
                    </FormActions>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-6 mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Recent Cartons</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Carton ID</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Net Weight (kg)</TableHead>
                        <TableHead>Gross Weight (kg)</TableHead>
                        <TableHead>Built At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cartons.length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center">No cartons</TableCell></TableRow>
                      ) : (
                        cartons.map((carton) => (
                          <TableRow key={carton?.id ?? Math.random()}>
                            <TableCell className="font-medium">{carton?.carton_id ?? "N/A"}</TableCell>
                            <TableCell>{carton?.quantity ?? 0}</TableCell>
                            <TableCell>{Number(carton?.net_weight ?? 0).toFixed(3)}</TableCell>
                            <TableCell>{Number(carton?.gross_weight ?? 0).toFixed(3)}</TableCell>
                            <TableCell>{carton?.built_at ? new Date(carton.built_at).toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openView(carton, "carton")}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  onClick={() => handleDeleteCarton(carton.id, carton.carton_id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Pallets</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Pallet ID</TableHead>
                        <TableHead>Built At</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pallets.length === 0 ? (
                        <TableRow><TableCell colSpan={3} className="text-center">No pallets</TableCell></TableRow>
                      ) : (
                        pallets.map((pallet) => (
                          <TableRow key={pallet?.id ?? Math.random()}>
                            <TableCell className="font-medium">{pallet?.pallet_id ?? "N/A"}</TableCell>
                            <TableCell>{pallet?.built_at ? new Date(pallet.built_at).toLocaleString() : "—"}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                <Button variant="outline" size="sm" onClick={() => openView(pallet, "pallet")}>
                                  <Eye className="h-3 w-3" />
                                </Button>
                                <Button 
                                  variant="destructive" 
                                  size="sm" 
                                  onClick={() => handleDeletePallet(pallet.id, pallet.pallet_id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
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
        data={viewData}
        type={viewType}
      />
    </div>
  );
};

export default Packing;
