import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, X } from "lucide-react";

export default function Sales() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [formData, setFormData] = useState({
    so_id: "",
    customer: "",
    po_number: "",
    po_date: "",
    item_code: "",
    quantity: "",
    alloy: "",
    due_date: ""
  });

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadSalesOrders();
  }, []);

  const loadSalesOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales_orders")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error && data) setSalesOrders(data);
    setLoading(false);
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const items = [{
      item_code: formData.item_code,
      quantity: parseInt(formData.quantity),
      alloy: formData.alloy,
      due_date: formData.due_date
    }];

    const { error } = await supabase
      .from("sales_orders")
      .insert({
        so_id: formData.so_id,
        customer: formData.customer,
        po_number: formData.po_number,
        po_date: formData.po_date,
        items,
        status: "pending",
        created_by: user?.id
      });

    setLoading(false);

    if (error) {
      toast({ variant: "destructive", description: "Failed to create sales order" });
    } else {
      toast({ description: "Sales order created successfully" });
      setFormData({ so_id: "", customer: "", po_number: "", po_date: "", item_code: "", quantity: "", alloy: "", due_date: "" });
      loadSalesOrders();
    }
  };

  const handleApprove = async (id: string) => {
    const { error } = await supabase
      .from("sales_orders")
      .update({ 
        status: "approved", 
        approved_by: user?.id, 
        approved_at: new Date().toISOString() 
      })
      .eq("id", id);

    if (!error) {
      toast({ description: "Sales order approved" });
      loadSalesOrders();
      
      // Notify purchase team
      const purchaseUsers = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "purchase");
      
      if (purchaseUsers.data) {
        await supabase.rpc("notify_users", {
          _user_ids: purchaseUsers.data.map(u => u.user_id),
          _type: "sales_approved",
          _title: "New Sales Order Approved",
          _message: `Sales Order requires purchase order creation`,
          _entity_type: "sales_order",
          _entity_id: id
        });
      }
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await supabase
      .from("sales_orders")
      .update({ status: "rejected" })
      .eq("id", id);

    if (!error) {
      toast({ description: "Sales order rejected" });
      loadSalesOrders();
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <Button variant="ghost" onClick={() => navigate("/")} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <h1 className="text-3xl font-bold mb-6">Sales Orders</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Create Sales Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              <Input
                placeholder="SO ID (e.g., SO-2025-001)"
                value={formData.so_id}
                onChange={(e) => setFormData({...formData, so_id: e.target.value})}
                required
              />
              <Input
                placeholder="Customer Name"
                value={formData.customer}
                onChange={(e) => setFormData({...formData, customer: e.target.value})}
                required
              />
              <Input
                placeholder="Customer PO Number"
                value={formData.po_number}
                onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                required
              />
              <Input
                type="date"
                placeholder="PO Date"
                value={formData.po_date}
                onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                required
              />
              <Input
                placeholder="Item Code"
                value={formData.item_code}
                onChange={(e) => setFormData({...formData, item_code: e.target.value})}
                required
              />
              <Input
                type="number"
                placeholder="Quantity (pcs)"
                value={formData.quantity}
                onChange={(e) => setFormData({...formData, quantity: e.target.value})}
                required
              />
              <Input
                placeholder="Alloy (e.g., SS316L)"
                value={formData.alloy}
                onChange={(e) => setFormData({...formData, alloy: e.target.value})}
                required
              />
              <Input
                type="date"
                placeholder="Due Date"
                value={formData.due_date}
                onChange={(e) => setFormData({...formData, due_date: e.target.value})}
                required
              />
              <Button type="submit" disabled={loading} className="w-full">
                Create Sales Order
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Pending Approvals</h2>
          {loading ? (
            <p>Loading...</p>
          ) : (
            salesOrders.filter(so => so.status === "pending").map((so) => (
              <Card key={so.id}>
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold">{so.so_id}</p>
                        <p className="text-sm text-muted-foreground">{so.customer}</p>
                        <p className="text-sm">PO: {so.po_number}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="default" onClick={() => handleApprove(so.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(so.id)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold mb-4">All Sales Orders</h2>
        <div className="grid gap-4">
          {salesOrders.map((so) => (
            <Card key={so.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">{so.so_id}</p>
                    <p className="text-sm text-muted-foreground">{so.customer}</p>
                    <p className="text-sm">PO: {so.po_number}</p>
                  </div>
                  <div className="text-right">
                    <p className={`inline-block px-2 py-1 rounded text-sm ${
                      so.status === 'approved' ? 'bg-green-100 text-green-800' :
                      so.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      so.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {so.status}
                    </p>
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