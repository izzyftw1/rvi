import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Eye, Filter, CheckSquare, Copy, Upload } from "lucide-react";
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
  quantity: number;
  alloy: string;
  gross_weight_per_pc_grams?: number;
  net_weight_per_pc_grams?: number;
  material_size_mm?: string;
  cycle_time_seconds?: number;
  due_date: string;
  priority: number;
  notes?: string;
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
      quantity: 0,
      alloy: "",
      material_size_mm: "",
      gross_weight_per_pc_grams: undefined,
      net_weight_per_pc_grams: undefined,
      cycle_time_seconds: undefined,
      due_date: "",
      priority: 3,
      notes: ""
    }
  ]);
  const [formData, setFormData] = useState({
    customer: "",
    party_code: "",
    po_number: "",
    po_date: ""
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
      alloy: item?.alloy || updatedLineItems[index].alloy,
      material_size_mm: item?.material_size_mm || updatedLineItems[index].material_size_mm,
      gross_weight_per_pc_grams: item?.gross_weight_grams || updatedLineItems[index].gross_weight_per_pc_grams,
      net_weight_per_pc_grams: item?.net_weight_grams || updatedLineItems[index].net_weight_per_pc_grams,
      cycle_time_seconds: item?.cycle_time_seconds || updatedLineItems[index].cycle_time_seconds
    };
    setLineItems(updatedLineItems);
  };

  const addLineItem = () => {
    setLineItems([
      ...lineItems,
      {
        line_number: lineItems.length + 1,
        item_code: "",
        quantity: 0,
        alloy: "",
        material_size_mm: "",
        gross_weight_per_pc_grams: undefined,
        net_weight_per_pc_grams: undefined,
        cycle_time_seconds: undefined,
        due_date: "",
        priority: 3,
        notes: ""
      }
    ]);
  };

  const duplicateLineItem = (index: number) => {
    const itemToDuplicate = { ...lineItems[index] };
    const newLineItems = [...lineItems];
    newLineItems.splice(index + 1, 0, {
      ...itemToDuplicate,
      line_number: index + 2,
      id: undefined,
      status: undefined
    });
    // Renumber all items after insertion
    const renumbered = newLineItems.map((item, idx) => ({ ...item, line_number: idx + 1 }));
    setLineItems(renumbered);
  };

  const handleBulkPaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      const rows = clipboardText.trim().split('\n').map(row => row.split('\t'));
      
      if (rows.length === 0) {
        toast({ variant: "destructive", description: "No data found in clipboard" });
        return;
      }

      const newItems: LineItem[] = rows.map((row, idx) => ({
        line_number: lineItems.length + idx + 1,
        item_code: row[0] || "",
        quantity: parseInt(row[1]) || 0,
        due_date: row[2] || "",
        priority: parseInt(row[3]) || 3,
        material_size_mm: row[4] || "",
        alloy: row[5] || "",
        cycle_time_seconds: parseFloat(row[6]) || undefined,
        gross_weight_per_pc_grams: parseFloat(row[7]) || undefined,
        net_weight_per_pc_grams: parseFloat(row[8]) || undefined,
        notes: row[9] || ""
      }));

      setLineItems([...lineItems, ...newItems]);
      toast({ description: `${newItems.length} rows pasted from clipboard` });
    } catch (err) {
      toast({ variant: "destructive", description: "Failed to paste from clipboard" });
    }
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

      // Create sales order (header only)
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
          material_rod_forging_size_mm: null,
          gross_weight_per_pc_grams: null,
          net_weight_per_pc_grams: null,
          cycle_time_seconds: null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create line items (each with its own product details)
      const lineItemsToInsert = lineItems.map(item => ({
        sales_order_id: newOrder.id,
        line_number: item.line_number,
        item_code: item.item_code,
        quantity: item.quantity,
        alloy: item.alloy,
        gross_weight_per_pc_grams: item.gross_weight_per_pc_grams || null,
        net_weight_per_pc_grams: item.net_weight_per_pc_grams || null,
        material_size_mm: item.material_size_mm || null,
        cycle_time_seconds: item.cycle_time_seconds || null,
        due_date: item.due_date,
        priority: item.priority,
        notes: item.notes || null,
        status: 'pending'
      }));

      const { error: lineItemsError } = await supabase
        .from("sales_order_line_items" as any)
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      toast({ description: `Sales order ${so_id} created with ${lineItems.length} line items` });
      
      // Reset form
      setFormData({ 
        customer: "", party_code: "", po_number: "", po_date: ""
      });
      setLineItems([{
        line_number: 1,
        item_code: "",
        quantity: 0,
        alloy: "",
        material_size_mm: "",
        gross_weight_per_pc_grams: undefined,
        net_weight_per_pc_grams: undefined,
        cycle_time_seconds: undefined,
        due_date: "",
        priority: 3,
        notes: ""
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

              {/* Line Items Table */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Line Items</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={handleBulkPaste}>
                      <Upload className="h-4 w-4 mr-1" />
                      Paste from Excel
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                      + Add Line Item
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="min-w-[150px]">Item Code</TableHead>
                        <TableHead className="min-w-[100px]">Qty (pcs)</TableHead>
                        <TableHead className="min-w-[130px]">Due Date</TableHead>
                        <TableHead className="min-w-[90px]">Priority</TableHead>
                        <TableHead className="min-w-[150px]">Material Size</TableHead>
                        <TableHead className="min-w-[120px]">Alloy</TableHead>
                        <TableHead className="min-w-[120px]">Cycle (s/pc)</TableHead>
                        <TableHead className="min-w-[120px]">Gross (g/pc)</TableHead>
                        <TableHead className="min-w-[120px]">Net (g/pc)</TableHead>
                        <TableHead className="min-w-[200px]">Notes</TableHead>
                        <TableHead className="w-24"></TableHead>
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
                                <SelectValue placeholder="Select or type" />
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
                              type="number"
                              value={item.quantity || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].quantity = parseInt(e.target.value) || 0;
                                setLineItems(updated);
                              }}
                              className="w-full"
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
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="1">P1</SelectItem>
                                <SelectItem value="2">P2</SelectItem>
                                <SelectItem value="3">P3</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="e.g., Round 12mm"
                              value={item.material_size_mm || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].material_size_mm = e.target.value;
                                setLineItems(updated);
                              }}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Select
                              value={item.alloy}
                              onValueChange={(val) => {
                                const updated = [...lineItems];
                                if (val === "other") {
                                  updated[index].alloy = "";
                                } else {
                                  updated[index].alloy = val;
                                }
                                setLineItems(updated);
                              }}
                              required
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select alloy" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="brass_header" disabled className="font-semibold">
                                  Brass Alloys
                                </SelectItem>
                                <SelectItem value="C36000">C36000</SelectItem>
                                <SelectItem value="C37700">C37700</SelectItem>
                                <SelectItem value="C38500">C38500</SelectItem>
                                <SelectItem value="C46400">C46400</SelectItem>
                                <SelectItem value="C23000">C23000</SelectItem>
                                <SelectItem value="C27200">C27200</SelectItem>
                                <SelectItem value="C26000">C26000</SelectItem>
                                <SelectItem value="C27450">C27450</SelectItem>
                                <SelectItem value="DZR Brass (CW602N)">DZR Brass (CW602N)</SelectItem>
                                <SelectItem value="CW614N">CW614N</SelectItem>
                                <SelectItem value="CW617N">CW617N</SelectItem>
                                <SelectItem value="CZ122">CZ122</SelectItem>
                                
                                <SelectItem value="ss_header" disabled className="font-semibold mt-2">
                                  Stainless Steels
                                </SelectItem>
                                <SelectItem value="SS304">SS304</SelectItem>
                                <SelectItem value="SS304L">SS304L</SelectItem>
                                <SelectItem value="SS316">SS316</SelectItem>
                                <SelectItem value="SS316L">SS316L</SelectItem>
                                <SelectItem value="SS410">SS410</SelectItem>
                                <SelectItem value="SS420">SS420</SelectItem>
                                <SelectItem value="SS430">SS430</SelectItem>
                                
                                <SelectItem value="copper_header" disabled className="font-semibold mt-2">
                                  Copper Alloys
                                </SelectItem>
                                <SelectItem value="ETP Copper">ETP Copper</SelectItem>
                                <SelectItem value="OFHC Copper">OFHC Copper</SelectItem>
                                
                                <SelectItem value="aluminium_header" disabled className="font-semibold mt-2">
                                  Aluminium Alloys
                                </SelectItem>
                                <SelectItem value="6061">6061</SelectItem>
                                <SelectItem value="6082">6082</SelectItem>
                                <SelectItem value="7075">7075</SelectItem>
                                <SelectItem value="1100">1100</SelectItem>
                                <SelectItem value="2024">2024</SelectItem>
                                <SelectItem value="5052">5052</SelectItem>
                                
                                <SelectItem value="other" className="font-semibold mt-2">
                                  Other (specify)
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {item.alloy && !["C36000", "C37700", "C38500", "C46400", "C23000", "C27200", "C26000", "C27450", "DZR Brass (CW602N)", "CW614N", "CW617N", "CZ122", "SS304", "SS304L", "SS316", "SS316L", "SS410", "SS420", "SS430", "ETP Copper", "OFHC Copper", "6061", "6082", "7075", "1100", "2024", "5052"].includes(item.alloy) && (
                              <Input
                                placeholder="Specify alloy"
                                value={item.alloy}
                                onChange={(e) => {
                                  const updated = [...lineItems];
                                  updated[index].alloy = e.target.value;
                                  setLineItems(updated);
                                }}
                                className="w-full mt-1"
                                required
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="sec/pc"
                              value={item.cycle_time_seconds || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].cycle_time_seconds = parseFloat(e.target.value) || undefined;
                                setLineItems(updated);
                              }}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="grams"
                              value={item.gross_weight_per_pc_grams || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].gross_weight_per_pc_grams = parseFloat(e.target.value) || undefined;
                                setLineItems(updated);
                              }}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="grams"
                              value={item.net_weight_per_pc_grams || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].net_weight_per_pc_grams = parseFloat(e.target.value) || undefined;
                                setLineItems(updated);
                              }}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Optional notes"
                              value={item.notes || ""}
                              onChange={(e) => {
                                const updated = [...lineItems];
                                updated[index].notes = e.target.value;
                                setLineItems(updated);
                              }}
                              className="w-full"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => duplicateLineItem(index)}
                                title="Duplicate row"
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              {lineItems.length > 1 && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => removeLineItem(index)}
                                  title="Remove row"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
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
                      <TableHead>Qty</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead>Alloy</TableHead>
                      <TableHead>Cycle</TableHead>
                      <TableHead>Gross</TableHead>
                      <TableHead>Net</TableHead>
                      <TableHead>Notes</TableHead>
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
                          <TableCell className="font-medium">{item.item_code}</TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => handleInlineEdit(item.id, 'quantity', parseInt(e.target.value))}
                                className="w-24"
                              />
                            ) : (
                              item.quantity
                            )}
                          </TableCell>
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
                                </SelectContent>
                              </Select>
                            ) : (
                              `P${item.priority}`
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                value={item.material_size_mm || ""}
                                onChange={(e) => handleInlineEdit(item.id, 'material_size_mm', e.target.value)}
                                className="w-32"
                                placeholder="e.g., Round 12mm"
                              />
                            ) : (
                              item.material_size_mm || "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                value={item.alloy}
                                onChange={(e) => handleInlineEdit(item.id, 'alloy', e.target.value)}
                                className="w-28"
                              />
                            ) : (
                              item.alloy
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={item.cycle_time_seconds || ""}
                                onChange={(e) => handleInlineEdit(item.id, 'cycle_time_seconds', parseFloat(e.target.value) || null)}
                                className="w-24"
                                placeholder="s/pc"
                              />
                            ) : (
                              item.cycle_time_seconds ? `${item.cycle_time_seconds}s` : "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={item.gross_weight_per_pc_grams || ""}
                                onChange={(e) => handleInlineEdit(item.id, 'gross_weight_per_pc_grams', parseFloat(e.target.value) || null)}
                                className="w-24"
                                placeholder="g"
                              />
                            ) : (
                              item.gross_weight_per_pc_grams ? `${item.gross_weight_per_pc_grams}g` : "-"
                            )}
                          </TableCell>
                          <TableCell>
                            {item.status === 'pending' ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={item.net_weight_per_pc_grams || ""}
                                onChange={(e) => handleInlineEdit(item.id, 'net_weight_per_pc_grams', parseFloat(e.target.value) || null)}
                                className="w-24"
                                placeholder="g"
                              />
                            ) : (
                              item.net_weight_per_pc_grams ? `${item.net_weight_per_pc_grams}g` : "-"
                            )}
                          </TableCell>
                          <TableCell className="max-w-[200px]">
                            {item.status === 'pending' ? (
                              <Textarea
                                value={item.notes || ""}
                                onChange={(e) => handleInlineEdit(item.id, 'notes', e.target.value)}
                                className="min-h-[60px]"
                                placeholder="Optional notes"
                              />
                            ) : (
                              <span className="text-sm text-muted-foreground">{item.notes || "-"}</span>
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
