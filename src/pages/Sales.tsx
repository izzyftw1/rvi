import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, Edit, Filter, CheckSquare, Square } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

interface LineItem {
  id?: string;
  line_number: number;
  item_code: string;
  revision: string;
  quantity: number;
  alloy: string;
  gross_weight_per_pc_grams?: number;
  net_weight_per_pc_grams?: number;
  material_size_mm?: string;
  cycle_time_seconds?: number;
  due_date: string;
  priority: number;
  status?: string;
  approved_by?: string;
  approved_at?: string;
  rejected_by?: string;
  rejected_at?: string;
  rejection_reason?: string;
  work_order_id?: string;
}

export default function Sales() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [lineItems, setLineItems] = useState<LineItem[]>([
    {
      line_number: 1,
      item_code: "",
      revision: "0",
      quantity: 0,
      alloy: "",
      due_date: "",
      priority: 3
    }
  ]);
  const [formData, setFormData] = useState({
    customer: "",
    party_code: "",
    po_number: "",
    po_date: "",
    material_rod_forging_size_mm: "",
    gross_weight_per_pc_grams: "",
    net_weight_per_pc_grams: "",
    cycle_time_seconds: ""
  });
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedLineItems, setSelectedLineItems] = useState<any[]>([]);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [rejectionReason, setRejectionReason] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadSalesOrders();
    loadCustomers();
    loadItems();
  }, []);

  const loadCustomers = async () => {
    const { data } = await supabase
      .from("customer_master")
      .select("*")
      .order("last_used", { ascending: false });
    if (data) setCustomers(data);
  };

  const loadItems = async () => {
    const { data } = await supabase
      .from("item_master")
      .select("*")
      .order("last_used", { ascending: false });
    if (data) setItems(data);
  };

  const loadSalesOrders = async () => {
    setLoading(true);
    
    // Load sales orders
    const { data: orders, error: ordersError } = await supabase
      .from("sales_orders")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (ordersError || !orders) {
      setLoading(false);
      return;
    }

    // Load line items for all orders
    const { data: lineItems } = await supabase
      .from("sales_order_line_items" as any)
      .select("*");
    
    // Combine data
    const ordersWithCounts = orders.map((order: any) => {
      const orderLineItems = lineItems?.filter((li: any) => li.sales_order_id === order.id) || [];
      return {
        ...order,
        line_items: orderLineItems,
        line_item_counts: {
          total: orderLineItems.length,
          pending: orderLineItems.filter((li: any) => li.status === 'pending').length,
          approved: orderLineItems.filter((li: any) => li.status === 'approved').length,
          rejected: orderLineItems.filter((li: any) => li.status === 'rejected').length,
          on_hold: orderLineItems.filter((li: any) => li.status === 'on_hold').length
        }
      };
    });
    
    setSalesOrders(ordersWithCounts);
    setLoading(false);
  };

  const generatePartyCode = (customerName: string) => {
    const prefix = customerName.replace(/[^a-zA-Z]/g, '').substring(0, 3).toUpperCase();
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}${randomNum}`;
  };

  const handleCustomerChange = (value: string) => {
    if (value === "new_customer") {
      setIsNewCustomer(true);
      setFormData({ ...formData, customer: "", party_code: "" });
    } else {
      setIsNewCustomer(false);
      const customer = customers.find(c => c.customer_name === value);
      setFormData({ 
        ...formData, 
        customer: value,
        party_code: customer?.party_code || ""
      });
    }
  };

  const handleNewCustomerNameChange = (name: string) => {
    const partyCode = name.length >= 3 ? generatePartyCode(name) : "";
    setFormData({ ...formData, customer: name, party_code: partyCode });
  };

  const handleItemCodeChange = (index: number, value: string) => {
    const item = items.find(i => i.item_code === value);
    const updatedLineItems = [...lineItems];
    updatedLineItems[index] = {
      ...updatedLineItems[index],
      item_code: value,
      alloy: item?.alloy || "",
    };
    setLineItems(updatedLineItems);
    
    // Update form-level fields if first line
    if (index === 0 && item) {
      setFormData({
        ...formData,
        material_rod_forging_size_mm: item.material_size_mm?.toString() || "",
        gross_weight_per_pc_grams: item.gross_weight_grams?.toString() || "",
        net_weight_per_pc_grams: item.net_weight_grams?.toString() || "",
        cycle_time_seconds: item.cycle_time_seconds?.toString() || ""
      });
    }
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        line_number: lineItems.length + 1,
        item_code: "",
        revision: "0",
        quantity: 0,
        alloy: "",
        due_date: "",
        priority: 3
      }
    ]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      const updated = lineItems.filter((_, i) => i !== index);
      setLineItems(updated.map((item, idx) => ({ ...item, line_number: idx + 1 })));
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Generate SO ID
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      
      const { count } = await supabase
        .from("sales_orders")
        .select("*", { count: 'exact', head: true })
        .gte('created_at', new Date(today.setHours(0, 0, 0, 0)).toISOString())
        .lte('created_at', new Date(today.setHours(23, 59, 59, 999)).toISOString());
      
      const sequence = String((count || 0) + 1).padStart(3, '0');
      const so_id = `SO-${dateStr}-${sequence}`;

      // Create sales order
      const { data: newOrder, error: orderError } = await supabase
        .from("sales_orders")
        .insert([{
          so_id: so_id,
          customer: formData.customer,
          party_code: formData.party_code || null,
          po_number: formData.po_number,
          po_date: formData.po_date,
          items: [], // Keep for backward compatibility
          status: "pending",
          created_by: user?.id,
          material_rod_forging_size_mm: formData.material_rod_forging_size_mm || null,
          gross_weight_per_pc_grams: formData.gross_weight_per_pc_grams ? parseFloat(formData.gross_weight_per_pc_grams) : null,
          net_weight_per_pc_grams: formData.net_weight_per_pc_grams ? parseFloat(formData.net_weight_per_pc_grams) : null,
          cycle_time_seconds: formData.cycle_time_seconds ? parseFloat(formData.cycle_time_seconds) : null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create line items
      const lineItemsToInsert = lineItems.map(item => ({
        sales_order_id: newOrder.id,
        line_number: item.line_number,
        item_code: item.item_code,
        revision: item.revision,
        quantity: item.quantity,
        alloy: item.alloy,
        gross_weight_per_pc_grams: formData.gross_weight_per_pc_grams ? parseFloat(formData.gross_weight_per_pc_grams) : null,
        net_weight_per_pc_grams: formData.net_weight_per_pc_grams ? parseFloat(formData.net_weight_per_pc_grams) : null,
        material_size_mm: formData.material_rod_forging_size_mm || null,
        cycle_time_seconds: formData.cycle_time_seconds ? parseFloat(formData.cycle_time_seconds) : null,
        due_date: item.due_date,
        priority: item.priority,
        status: 'pending'
      }));

      const { error: lineItemsError } = await supabase
        .from("sales_order_line_items" as any)
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      toast({ description: `Sales order ${so_id} created with ${lineItems.length} line items` });
      
      // Reset form
      setFormData({ 
        customer: "", party_code: "", po_number: "", po_date: "", 
        material_rod_forging_size_mm: "", gross_weight_per_pc_grams: "", 
        net_weight_per_pc_grams: "", cycle_time_seconds: "" 
      });
      setLineItems([{
        line_number: 1,
        item_code: "",
        revision: "0",
        quantity: 0,
        alloy: "",
        due_date: "",
        priority: 3
      }]);
      setIsNewCustomer(false);
      await loadSalesOrders();
      await loadCustomers();
      await loadItems();
    } catch (err: any) {
      console.error("Error creating SO:", err);
      toast({ variant: "destructive", description: `Failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleViewOrder = async (order: any) => {
    setSelectedOrder(order);
    setIsEditMode(false);
    setIsViewDialogOpen(true);
    setSelectedLineItems([]);
  };

  const toggleLineItemSelection = (lineItem: any) => {
    setSelectedLineItems(prev => {
      const exists = prev.find(li => li.id === lineItem.id);
      if (exists) {
        return prev.filter(li => li.id !== lineItem.id);
      } else {
        return [...prev, lineItem];
      }
    });
  };

  const selectAllPendingLineItems = () => {
    const pendingItems = selectedOrder?.line_items?.filter((li: any) => li.status === 'pending') || [];
    setSelectedLineItems(pendingItems);
  };

  const handleBatchApprove = async () => {
    if (selectedLineItems.length === 0) {
      toast({ variant: "destructive", description: "No line items selected" });
      return;
    }

    setLoading(true);
    try {
      const updates = selectedLineItems.map(li => ({
        id: li.id,
        status: 'approved',
        approved_by: user?.id,
        approved_at: new Date().toISOString()
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("sales_order_line_items" as any)
          .update({
            status: update.status,
            approved_by: update.approved_by,
            approved_at: update.approved_at
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({ description: `${selectedLineItems.length} line items approved. Work orders will be auto-generated.` });
      setSelectedLineItems([]);
      setIsViewDialogOpen(false);
      await loadSalesOrders();
    } catch (err: any) {
      console.error("Batch approve error:", err);
      toast({ variant: "destructive", description: `Failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleBatchReject = async () => {
    if (selectedLineItems.length === 0) {
      toast({ variant: "destructive", description: "No line items selected" });
      return;
    }

    if (!rejectionReason.trim()) {
      toast({ variant: "destructive", description: "Please provide a rejection reason" });
      return;
    }

    setLoading(true);
    try {
      const updates = selectedLineItems.map(li => ({
        id: li.id,
        status: 'rejected',
        rejected_by: user?.id,
        rejected_at: new Date().toISOString(),
        rejection_reason: rejectionReason
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from("sales_order_line_items" as any)
          .update({
            status: update.status,
            rejected_by: update.rejected_by,
            rejected_at: update.rejected_at,
            rejection_reason: update.rejection_reason
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      toast({ description: `${selectedLineItems.length} line items rejected` });
      setSelectedLineItems([]);
      setRejectionReason("");
      setIsViewDialogOpen(false);
      await loadSalesOrders();
    } catch (err: any) {
      console.error("Batch reject error:", err);
      toast({ variant: "destructive", description: `Failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleBatchOnHold = async () => {
    if (selectedLineItems.length === 0) {
      toast({ variant: "destructive", description: "No line items selected" });
      return;
    }

    setLoading(true);
    try {
      for (const li of selectedLineItems) {
        const { error } = await supabase
          .from("sales_order_line_items" as any)
          .update({ status: 'on_hold' })
          .eq("id", li.id);

        if (error) throw error;
      }

      toast({ description: `${selectedLineItems.length} line items put on hold` });
      setSelectedLineItems([]);
      setIsViewDialogOpen(false);
      await loadSalesOrders();
    } catch (err: any) {
      console.error("Batch on hold error:", err);
      toast({ variant: "destructive", description: `Failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleInlineEdit = async (lineItemId: string, field: string, value: any) => {
    try {
      const { error } = await supabase
        .from("sales_order_line_items" as any)
        .update({ [field]: value })
        .eq("id", lineItemId);

      if (error) throw error;

      toast({ description: "Line item updated" });
      await loadSalesOrders();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Update failed: ${err.message}` });
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'approved': return 'default';
      case 'pending': return 'secondary';
      case 'rejected': return 'destructive';
      case 'on_hold': return 'outline';
      default: return 'secondary';
    }
  };

  const filteredOrders = salesOrders.filter(order => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'has_pending') return order.line_item_counts.pending > 0;
    return order.status === filterStatus;
  });

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Sales Orders" subtitle="Create and manage sales orders with line-item approval" />
      
      <div className="p-6 space-y-6">
        {/* Create Sales Order Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create Sales Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrder} className="space-y-4">
              {/* Customer Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  {!isNewCustomer ? (
                    <Select onValueChange={handleCustomerChange} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer or add new" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new_customer">+ Add New Customer</SelectItem>
                        {customers.map((customer) => (
                          <SelectItem key={customer.id} value={customer.customer_name}>
                            {customer.customer_name} {customer.party_code ? `(${customer.party_code})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter new customer name"
                        value={formData.customer}
                        onChange={(e) => handleNewCustomerNameChange(e.target.value)}
                        required
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setIsNewCustomer(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Party Code</Label>
                  <Input
                    placeholder="Auto-generated"
                    value={formData.party_code}
                    onChange={(e) => setFormData({...formData, party_code: e.target.value})}
                    disabled={!isNewCustomer}
                  />
                </div>
              </div>

              {/* PO Details */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer PO Number</Label>
                  <Input
                    placeholder="PO Number"
                    value={formData.po_number}
                    onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>PO Date</Label>
                  <Input
                    type="date"
                    value={formData.po_date}
                    onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                    required
                  />
                </div>
              </div>

              {/* Material Specs (applies to all line items) */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  placeholder="Material Size/Type (e.g., Round 12mm)"
                  value={formData.material_rod_forging_size_mm}
                  onChange={(e) => setFormData({...formData, material_rod_forging_size_mm: e.target.value})}
                />
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Cycle Time (sec/pc)"
                  value={formData.cycle_time_seconds}
                  onChange={(e) => setFormData({...formData, cycle_time_seconds: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
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
              </div>

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                    + Add Line Item
                  </Button>
                </div>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Revision</TableHead>
                        <TableHead>Qty (pcs)</TableHead>
                        <TableHead>Alloy</TableHead>
                        <TableHead>Due Date</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.line_number}</TableCell>
                          <TableCell>
                            <Select 
                              value={item.item_code} 
                              onValueChange={(val) => handleItemCodeChange(index, val)}
                              required
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent>
                                {items.map((itm) => (
                                  <SelectItem key={itm.id} value={itm.item_code}>
                                    {itm.item_code}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              type="text"
                              value={item.revision}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].revision = e.target.value;
                                setLineItems(updated);
                              }}
                              className="w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={item.quantity || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].quantity = parseInt(e.target.value) || 0;
                                setLineItems(updated);
                              }}
                              className="w-24"
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              value={item.alloy}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].alloy = e.target.value;
                                setLineItems(updated);
                              }}
                              className="w-32"
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="date"
                              value={item.due_date}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].due_date = e.target.value;
                                setLineItems(updated);
                              }}
                              required
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.priority.toString()}
                              onValueChange={(val) => {
                                const updated = [...lineItems];
                                updated[index].priority = parseInt(val);
                                setLineItems(updated);
                              }}
                            >
                              <SelectTrigger className="w-20">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">P1</SelectItem>
                                <SelectItem value="2">P2</SelectItem>
                                <SelectItem value="3">P3</SelectItem>
                                <SelectItem value="4">P4</SelectItem>
                                <SelectItem value="5">P5</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            {lineItems.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeLineItem(index)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full">
                Create Sales Order ({lineItems.length} line items)
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Sales Orders List with Filters */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Sales Orders</h2>
            <div className="flex gap-2 items-center">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Orders</SelectItem>
                  <SelectItem value="has_pending">Has Pending Items</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <p>Loading...</p>
          ) : filteredOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">No sales orders found</p>
              </CardContent>
            </Card>
          ) : (
            filteredOrders.map((so) => (
              <Card key={so.id}>
                <CardContent className="pt-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{so.so_id}</h3>
                      <p className="text-sm text-muted-foreground">
                        {so.customer} • PO: {so.po_number} • {new Date(so.po_date).toLocaleDateString()}
                      </p>
                      <div className="flex gap-2 mt-2">
                        <Badge variant={getStatusBadgeVariant(so.status)}>{so.status}</Badge>
                        <Badge variant="outline">
                          {so.line_item_counts.total} items: {so.line_item_counts.approved} approved, {so.line_item_counts.pending} pending
                          {so.line_item_counts.rejected > 0 && `, ${so.line_item_counts.rejected} rejected`}
                          {so.line_item_counts.on_hold > 0 && `, ${so.line_item_counts.on_hold} on hold`}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewOrder(so)}>
                        <Eye className="h-4 w-4 mr-1" />
                        View/Approve
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* View/Approve Line Items Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sales Order: {selectedOrder?.so_id}</DialogTitle>
            <DialogDescription>
              {selectedOrder?.customer} • PO: {selectedOrder?.po_number}
            </DialogDescription>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Action Buttons */}
              <div className="flex justify-between items-center">
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={selectAllPendingLineItems}
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    Select All Pending
                  </Button>
                  <span className="text-sm text-muted-foreground self-center">
                    {selectedLineItems.length} selected
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleBatchApprove}
                    disabled={selectedLineItems.length === 0}
                  >
                    <Check className="h-4 w-4 mr-1" />
                    Approve Selected
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleBatchOnHold}
                    disabled={selectedLineItems.length === 0}
                  >
                    On Hold
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={handleBatchReject}
                    disabled={selectedLineItems.length === 0}
                  >
                    <X className="h-4 w-4 mr-1" />
                    Reject Selected
                  </Button>
                </div>
              </div>

              {/* Rejection Reason */}
              {selectedLineItems.length > 0 && (
                <div className="space-y-2">
                  <Label>Rejection Reason (required for reject)</Label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Enter reason for rejection..."
                  />
                </div>
              )}

              {/* Line Items Table */}
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedLineItems.length === selectedOrder.line_items?.filter((li: any) => li.status === 'pending').length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              selectAllPendingLineItems();
                            } else {
                              setSelectedLineItems([]);
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>#</TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Rev</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Alloy</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>WO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedOrder.line_items?.map((item: any) => {
                      const isSelected = selectedLineItems.some(li => li.id === item.id);
                      const canSelect = item.status === 'pending';
                      
                      return (
                        <TableRow key={item.id} className={isSelected ? 'bg-muted/50' : ''}>
                          <TableCell>
                            {canSelect && (
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleLineItemSelection(item)}
                              />
                            )}
                          </TableCell>
                          <TableCell>{item.line_number}</TableCell>
                          <TableCell>{item.item_code}</TableCell>
                          <TableCell>{item.revision}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>{item.alloy}</TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                type="date"
                                value={item.due_date}
                                onChange={(e) => handleInlineEdit(item.id, 'due_date', e.target.value)}
                                className="w-36"
                              />
                            ) : (
                              new Date(item.due_date).toLocaleDateString()
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Select
                                value={item.priority.toString()}
                                onValueChange={(val) => handleInlineEdit(item.id, 'priority', parseInt(val))}
                              >
                                <SelectTrigger className="w-20">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="1">P1</SelectItem>
                                  <SelectItem value="2">P2</SelectItem>
                                  <SelectItem value="3">P3</SelectItem>
                                  <SelectItem value="4">P4</SelectItem>
                                  <SelectItem value="5">P5</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              `P${item.priority}`
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={getStatusBadgeVariant(item.status)}>
                              {item.status}
                            </Badge>
                            {item.rejection_reason && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {item.rejection_reason}
                              </p>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.work_order_id && (
                              <Button
                                variant="link"
                                size="sm"
                                onClick={() => navigate(`/work-orders/${item.work_order_id}`)}
                              >
                                View WO
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
