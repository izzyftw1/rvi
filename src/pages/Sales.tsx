import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, Edit } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NavigationHeader } from "@/components/NavigationHeader";

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
    due_date: "",
    material_rod_forging_size_mm: "",
    gross_weight_per_pc_grams: "",
    net_weight_per_pc_grams: ""
  });
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

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
        created_by: user?.id,
        material_rod_forging_size_mm: formData.material_rod_forging_size_mm ? parseFloat(formData.material_rod_forging_size_mm) : null,
        gross_weight_per_pc_grams: formData.gross_weight_per_pc_grams ? parseFloat(formData.gross_weight_per_pc_grams) : null,
        net_weight_per_pc_grams: formData.net_weight_per_pc_grams ? parseFloat(formData.net_weight_per_pc_grams) : null
      });

    setLoading(false);

    if (error) {
      toast({ variant: "destructive", description: "Failed to create sales order" });
    } else {
      toast({ description: "Sales order created successfully" });
      setFormData({ 
        so_id: "", customer: "", po_number: "", po_date: "", item_code: "", quantity: "", 
        alloy: "", due_date: "", material_rod_forging_size_mm: "", 
        gross_weight_per_pc_grams: "", net_weight_per_pc_grams: "" 
      });
      loadSalesOrders();
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from("sales_orders")
        .update({ 
          status: "approved", 
          approved_by: user?.id, 
          approved_at: new Date().toISOString() 
        })
        .eq("id", id);

      if (error) {
        console.error("Approve SO failed:", error);
        toast({ variant: "destructive", description: `Failed to approve: ${error.message}` });
        return;
      }

      toast({ description: "Sales order approved" });
      await loadSalesOrders();
      
      // Notify purchase team
      const purchaseUsers = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "purchase");
      
      if (purchaseUsers.data && purchaseUsers.data.length) {
        const { error: notifyError } = await supabase.rpc("notify_users", {
          _user_ids: purchaseUsers.data.map(u => u.user_id),
          _type: "sales_approved",
          _title: "New Sales Order Approved",
          _message: `Sales Order requires purchase order creation`,
          _entity_type: "sales_order",
          _entity_id: id
        });
        if (notifyError) {
          console.warn("Notification RPC failed:", notifyError);
        }
      }
    } catch (err: any) {
      console.error("Unexpected error approving SO:", err);
      toast({ variant: "destructive", description: "Unexpected error while approving." });
    } finally {
      setLoading(false);
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

  const handleViewOrder = (order: any) => {
    setSelectedOrder(order);
    setIsEditMode(false);
    setIsViewDialogOpen(true);
  };

  const handleEditOrder = (order: any) => {
    setSelectedOrder(order);
    setIsEditMode(true);
    setIsViewDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedOrder) return;

    const { error } = await supabase
      .from("sales_orders")
      .update({
        customer: selectedOrder.customer,
        po_number: selectedOrder.po_number,
        po_date: selectedOrder.po_date,
        material_rod_forging_size_mm: selectedOrder.material_rod_forging_size_mm,
        gross_weight_per_pc_grams: selectedOrder.gross_weight_per_pc_grams,
        net_weight_per_pc_grams: selectedOrder.net_weight_per_pc_grams,
        items: selectedOrder.items
      })
      .eq("id", selectedOrder.id);

    if (!error) {
      toast({ description: "Sales order updated successfully" });
      setIsViewDialogOpen(false);
      loadSalesOrders();
    } else {
      toast({ variant: "destructive", description: "Failed to update sales order" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Sales Orders" subtitle="Create and manage sales orders" />
      
      <div className="p-6">

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
              <Input
                type="number"
                step="0.01"
                placeholder="Material/Rod/Forging Size (mm)"
                value={formData.material_rod_forging_size_mm}
                onChange={(e) => setFormData({...formData, material_rod_forging_size_mm: e.target.value})}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Gross Weight per pc (grams)"
                value={formData.gross_weight_per_pc_grams}
                onChange={(e) => setFormData({...formData, gross_weight_per_pc_grams: e.target.value})}
              />
              <Input
                type="number"
                step="0.01"
                placeholder="Net Weight per pc (grams)"
                value={formData.net_weight_per_pc_grams}
                onChange={(e) => setFormData({...formData, net_weight_per_pc_grams: e.target.value})}
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
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold">{so.so_id}</p>
                    <p className="text-sm text-muted-foreground">{so.customer}</p>
                    <p className="text-sm">PO: {so.po_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`inline-block px-2 py-1 rounded text-sm ${
                      so.status === 'approved' ? 'bg-green-100 text-green-800' :
                      so.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                      so.status === 'rejected' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {so.status}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => handleViewOrder(so)}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleEditOrder(so)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditMode ? "Edit" : "View"} Sales Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>SO ID</Label>
                  <p className="text-sm font-medium">{selectedOrder.so_id}</p>
                </div>
                <div>
                  <Label>Status</Label>
                  <p className={`inline-block px-2 py-1 rounded text-sm ${
                    selectedOrder.status === 'approved' ? 'bg-green-100 text-green-800' :
                    selectedOrder.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                    selectedOrder.status === 'rejected' ? 'bg-red-100 text-red-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {selectedOrder.status}
                  </p>
                </div>
              </div>

              <div>
                <Label>Customer</Label>
                {isEditMode ? (
                  <Input
                    value={selectedOrder.customer}
                    onChange={(e) => setSelectedOrder({...selectedOrder, customer: e.target.value})}
                  />
                ) : (
                  <p className="text-sm">{selectedOrder.customer}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>PO Number</Label>
                  {isEditMode ? (
                    <Input
                      value={selectedOrder.po_number}
                      onChange={(e) => setSelectedOrder({...selectedOrder, po_number: e.target.value})}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.po_number}</p>
                  )}
                </div>
                <div>
                  <Label>PO Date</Label>
                  {isEditMode ? (
                    <Input
                      type="date"
                      value={selectedOrder.po_date}
                      onChange={(e) => setSelectedOrder({...selectedOrder, po_date: e.target.value})}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.po_date}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Material/Rod/Forging Size (mm)</Label>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedOrder.material_rod_forging_size_mm || ""}
                      onChange={(e) => setSelectedOrder({...selectedOrder, material_rod_forging_size_mm: e.target.value})}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.material_rod_forging_size_mm || "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label>Gross Weight (g/pc)</Label>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedOrder.gross_weight_per_pc_grams || ""}
                      onChange={(e) => setSelectedOrder({...selectedOrder, gross_weight_per_pc_grams: e.target.value})}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.gross_weight_per_pc_grams || "N/A"}</p>
                  )}
                </div>
                <div>
                  <Label>Net Weight (g/pc)</Label>
                  {isEditMode ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={selectedOrder.net_weight_per_pc_grams || ""}
                      onChange={(e) => setSelectedOrder({...selectedOrder, net_weight_per_pc_grams: e.target.value})}
                    />
                  ) : (
                    <p className="text-sm">{selectedOrder.net_weight_per_pc_grams || "N/A"}</p>
                  )}
                </div>
              </div>

              <div>
                <Label>Items</Label>
                {selectedOrder.items && selectedOrder.items.map((item: any, idx: number) => (
                  <Card key={idx} className="mt-2">
                    <CardContent className="pt-4">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div><strong>Item Code:</strong> {item.item_code}</div>
                        <div><strong>Quantity:</strong> {item.quantity} pcs</div>
                        <div><strong>Alloy:</strong> {item.alloy}</div>
                        <div><strong>Due Date:</strong> {item.due_date}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {isEditMode && (
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveEdit}>
                    Save Changes
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}