import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check } from "lucide-react";

export default function Purchase() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedSO, setSelectedSO] = useState("");
  const [formData, setFormData] = useState({
    po_id: "",
    supplier: "",
    alloy: "",
    quantity_kg: "",
    expected_delivery: ""
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    const { data: soData } = await supabase
      .from("sales_orders")
      .select("*")
      .eq("status", "approved");
    
    const { data: poData } = await supabase
      .from("purchase_orders")
      .select("*, sales_orders(so_id, customer)")
      .order("created_at", { ascending: false });
    
    if (soData) setSalesOrders(soData);
    if (poData) setPurchaseOrders(poData);
    setLoading(false);
  };

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const material_spec = {
      alloy: formData.alloy,
      form: "Sheet",
      finish: "2B"
    };

    const { error } = await supabase
      .from("purchase_orders")
      .insert({
        po_id: formData.po_id,
        so_id: selectedSO || null,
        supplier: formData.supplier,
        material_spec,
        quantity_kg: parseFloat(formData.quantity_kg),
        status: "pending",
        expected_delivery: formData.expected_delivery,
        created_by: user?.id
      });

    setLoading(false);

    if (error) {
      toast({ variant: "destructive", description: "Failed to create purchase order" });
    } else {
      toast({ description: "Purchase order created successfully" });
      setFormData({ po_id: "", supplier: "", alloy: "", quantity_kg: "", expected_delivery: "" });
      setSelectedSO("");
      loadData();
    }
  };

  const handleApprovePO = async (id: string) => {
    const { error } = await supabase
      .from("purchase_orders")
      .update({ 
        status: "approved", 
        approved_by: user?.id, 
        approved_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (!error) {
      toast({ description: "Purchase order approved" });
      loadData();
      
      // Notify Goods In team
      const storesUsers = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "stores");
      
      if (storesUsers.data) {
        await supabase.rpc("notify_users", {
          _user_ids: storesUsers.data.map(u => u.user_id),
          _type: "purchase_approved",
          _title: "Purchase Order Approved",
          _message: `Expecting material delivery`,
          _entity_type: "purchase_order",
          _entity_id: id
        });
      }
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <h1 className="text-3xl font-bold mb-6">Purchase Orders</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Purchase Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreatePO} className="space-y-4">
              <Select value={selectedSO} onValueChange={setSelectedSO}>
                <SelectTrigger>
                  <SelectValue placeholder="Link to Sales Order (Optional)" />
                </SelectTrigger>
                <SelectContent>
                  {salesOrders.map((so) => (
                    <SelectItem key={so.id} value={so.id}>
                      {so.so_id} - {so.customer}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                placeholder="PO ID (e.g., PO-2025-001)"
                value={formData.po_id}
                onChange={(e) => setFormData({...formData, po_id: e.target.value})}
                required
              />
              <Input
                placeholder="Supplier Name"
                value={formData.supplier}
                onChange={(e) => setFormData({...formData, supplier: e.target.value})}
                required
              />
              <Input
                placeholder="Alloy Grade (e.g., SS316L)"
                value={formData.alloy}
                onChange={(e) => setFormData({...formData, alloy: e.target.value})}
                required
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Quantity (kg)"
                value={formData.quantity_kg}
                onChange={(e) => setFormData({...formData, quantity_kg: e.target.value})}
                required
              />
              <Input
                type="date"
                placeholder="Expected Delivery"
                value={formData.expected_delivery}
                onChange={(e) => setFormData({...formData, expected_delivery: e.target.value})}
                required
              />
              <Button type="submit" disabled={loading} className="w-full">
                Create Purchase Order
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Draft Purchase Orders</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            purchaseOrders.filter(po => po.status === "draft").map((po) => (
              <Card key={po.id}>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <p className="font-semibold">{po.po_id}</p>
                    <p className="text-sm">Material Size: {po.material_spec.size_mm}mm</p>
                    <p className="text-sm">Required: {po.quantity_kg} kg</p>
                    {po.material_spec.linked_sos?.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Linked SOs: {po.material_spec.linked_sos.join(", ")}
                      </p>
                    )}
                    <div className="space-y-2">
                      <Input
                        placeholder="Enter Supplier"
                        onChange={(e) => {
                          const updated = purchaseOrders.map(p => 
                            p.id === po.id ? {...p, supplier: e.target.value} : p
                          );
                          setPurchaseOrders(updated);
                        }}
                      />
                      <Input
                        placeholder="Alloy Grade (e.g., SS316L)"
                        onChange={(e) => {
                          const updated = purchaseOrders.map(p => 
                            p.id === po.id ? {...p, material_spec: {...p.material_spec, alloy: e.target.value}} : p
                          );
                          setPurchaseOrders(updated);
                        }}
                      />
                      <Input
                        type="date"
                        placeholder="Expected Delivery"
                        onChange={(e) => {
                          const updated = purchaseOrders.map(p => 
                            p.id === po.id ? {...p, expected_delivery: e.target.value} : p
                          );
                          setPurchaseOrders(updated);
                        }}
                      />
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={async () => {
                          if (!po.supplier || !po.material_spec.alloy || !po.expected_delivery) {
                            toast({ variant: "destructive", description: "Please fill all fields" });
                            return;
                          }
                          const { error } = await supabase
                            .from("purchase_orders")
                            .update({ 
                              supplier: po.supplier,
                              material_spec: po.material_spec,
                              expected_delivery: po.expected_delivery,
                              status: "pending" 
                            })
                            .eq("id", po.id);
                          
                          if (!error) {
                            toast({ description: "Sent for approval" });
                            loadData();
                          }
                        }}
                      >
                        Send for Approval
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Approvals</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            purchaseOrders.filter(po => po.status === "pending").map((po) => (
              <Card key={po.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{po.po_id}</p>
                      <p className="text-sm text-muted-foreground">{po.supplier}</p>
                      <p className="text-sm">{po.material_spec.alloy} - {po.quantity_kg} kg</p>
                      {po.sales_orders && (
                        <p className="text-xs text-muted-foreground">For SO: {po.sales_orders.so_id}</p>
                      )}
                    </div>
                    <Button size="sm" onClick={() => handleApprovePO(po.id)}>
                      <Check className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">All Purchase Orders</h2>
        <div className="grid gap-4">
          {purchaseOrders.map((po) => (
            <Card key={po.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">{po.po_id}</p>
                    <p className="text-sm text-muted-foreground">{po.supplier}</p>
                    <p className="text-sm">{po.material_spec.alloy} - {po.quantity_kg} kg</p>
                    {po.sales_orders && (
                      <p className="text-xs text-muted-foreground">For SO: {po.sales_orders.so_id}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className={`inline-block px-2 py-1 rounded text-sm ${
                      po.status === 'approved' ? 'bg-green-100 text-green-800' :
                      po.status === 'received' ? 'bg-blue-100 text-blue-800' :
                      po.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {po.status}
                    </p>
                    <p className="text-xs mt-1">Expected: {new Date(po.expected_delivery).toLocaleDateString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}