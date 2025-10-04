import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Box, Package, Printer } from "lucide-react";

const Packing = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  // Carton Form
  const [woId, setWoId] = useState("");
  const [wo, setWo] = useState<any>(null);
  const [materialIssues, setMaterialIssues] = useState<any[]>([]);
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

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Extract heat numbers
      const heatNos = materialIssues.map((issue: any) => issue.material_lots?.heat_no).filter(Boolean);

      const { error } = await supabase.from("cartons").insert({
        carton_id: cartonForm.carton_id,
        wo_id: wo.id,
        quantity: parseInt(cartonForm.quantity),
        net_weight: parseFloat(cartonForm.net_weight),
        gross_weight: parseFloat(cartonForm.gross_weight),
        heat_nos: heatNos,
        built_by: user?.id,
      });

      if (error) throw error;

      toast({
        title: "Carton created",
        description: `${cartonForm.carton_id} with ${heatNos.length} heat numbers`,
      });

      // Reset
      setWoId("");
      setWo(null);
      setMaterialIssues([]);
      setCartonForm({
        carton_id: "",
        quantity: "",
        net_weight: "",
        gross_weight: "",
      });
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" onClick={() => navigate("/")}>
            ← Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Packing & Dispatch</h1>
            <p className="text-sm text-muted-foreground">Build cartons and pallets</p>
          </div>
        </div>

        <Tabs defaultValue="carton" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="carton">Build Carton</TabsTrigger>
            <TabsTrigger value="pallet">Build Pallet</TabsTrigger>
          </TabsList>

          <TabsContent value="carton" className="space-y-4">
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
                    Build Carton for {wo.wo_id}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateCarton} className="space-y-4">
                    <div className="p-3 bg-secondary rounded-lg mb-4">
                      <p className="text-sm font-medium">Heat Numbers:</p>
                      <p className="text-sm text-muted-foreground">
                        {materialIssues.map((i: any) => i.material_lots?.heat_no).join(", ") || "None"}
                      </p>
                    </div>

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
                        <Label htmlFor="quantity">Quantity (pcs)</Label>
                        <Input
                          id="quantity"
                          type="number"
                          value={cartonForm.quantity}
                          onChange={(e) => setCartonForm({ ...cartonForm, quantity: e.target.value })}
                          required
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

                    <div className="flex gap-3">
                      <Button type="submit" disabled={loading} className="flex-1">
                        <Box className="h-4 w-4 mr-2" />
                        Build Carton
                      </Button>
                      <Button type="button" variant="outline">
                        <Printer className="h-4 w-4 mr-2" />
                        Print Label
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="pallet" className="space-y-4">
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

                  <Button type="submit" disabled={loading} className="w-full">
                    <Package className="h-4 w-4 mr-2" />
                    Build Pallet
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Packing;
