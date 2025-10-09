import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, Trash2, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface LineItem {
  line_number: number;
  item_code: string;
  quantity: number;
  alloy: string;
  material_size: string;
  net_weight_per_pc_g?: number;
  gross_weight_per_pc_g?: number;
  price_per_pc?: number;
  line_amount?: number;
  drawing_number?: string;
  due_date: string;
}

const ALLOYS = [
  { group: "Brass Alloys", items: ["C36000", "C37700", "C38500", "C46400", "C23000", "C27200", "C26000", "C27450", "DZR Brass (CW602N)", "CW614N", "CW617N", "CZ122"] },
  { group: "Stainless Steels", items: ["SS304", "SS304L", "SS316", "SS316L", "SS410", "SS420", "SS430"] },
  { group: "Copper Alloys", items: ["ETP Copper", "OFHC Copper"] },
  { group: "Aluminium Alloys", items: ["6061", "6082", "7075", "1100", "2024", "5052"] }
];

const CURRENCIES = ["USD", "EUR", "INR", "GBP"];
const GST_TYPES = [
  { value: "domestic", label: "Domestic" },
  { value: "export", label: "Export" },
  { value: "not_applicable", label: "Not Applicable" }
];
const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];

export default function Sales() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [historicalLineItems, setHistoricalLineItems] = useState<any[]>([]);
  
  const [formData, setFormData] = useState({
    customer_id: "",
    customer_name: "",
    po_number: "",
    po_date: "",
    expected_delivery_date: "",
    drawing_number: "",
    currency: "USD",
    payment_terms_days: 30,
    gst_type: "domestic",
    gst_number: "",
    incoterm: "EXW",
    gst_percent: 18
  });
  
  const [lineItems, setLineItems] = useState<LineItem[]>([{
    line_number: 1,
    item_code: "",
    quantity: 0,
    alloy: "",
    material_size: "",
    net_weight_per_pc_g: undefined,
    gross_weight_per_pc_g: undefined,
    price_per_pc: undefined,
    line_amount: 0,
    drawing_number: "",
    due_date: ""
  }]);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCustomers(), loadItems(), loadSalesOrders(), loadHistoricalLineItems()]);
    setLoading(false);
  };

  const loadHistoricalLineItems = async () => {
    const { data } = await supabase
      .from("sales_order_line_items" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setHistoricalLineItems(data);
  };

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
    const { data: orders } = await supabase
      .from("sales_orders")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (orders) {
      const { data: lineItems } = await supabase
        .from("sales_order_line_items" as any)
        .select("*");
      
      const ordersWithItems = orders.map(order => ({
        ...order,
        sales_order_items: lineItems?.filter((li: any) => li.sales_order_id === order.id) || [],
        total_amount: 0 // Will be calculated from line items after migration
      }));
      
      setSalesOrders(ordersWithItems);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      setFormData({
        ...formData,
        customer_id: customerId,
        customer_name: customer.customer_name,
        currency: customer.currency || "USD",
        payment_terms_days: customer.payment_terms_days || 30,
        gst_number: customer.gst_number || "",
        gst_type: customer.gst_type || "domestic"
      });
    }
  };

  const handleItemCodeChange = (index: number, value: string) => {
    if (value === "__new__") {
      // User wants to add a new item - just clear the field so they can type
      const updated = [...lineItems];
      updated[index] = { ...updated[index], item_code: "" };
      setLineItems(updated);
      return;
    }
    
    const item = items.find(i => i.item_code === value);
    
    // Find most recent historical line item for this item code
    const historicalItem = historicalLineItems
      .filter((li: any) => li.item_code === value)
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
    
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      item_code: value,
      alloy: item?.alloy || historicalItem?.alloy || updated[index].alloy,
      material_size: item?.material_size_mm || historicalItem?.material_size_mm || updated[index].material_size,
      gross_weight_per_pc_g: item?.gross_weight_grams || historicalItem?.gross_weight_per_pc_grams || updated[index].gross_weight_per_pc_g,
      net_weight_per_pc_g: item?.net_weight_grams || historicalItem?.net_weight_per_pc_grams || updated[index].net_weight_per_pc_g,
      drawing_number: historicalItem?.drawing_number || formData.drawing_number || updated[index].drawing_number,
      price_per_pc: historicalItem?.price_per_pc || updated[index].price_per_pc
    };
    
    // Auto-calculate line amount if we have quantity and price
    if (updated[index].quantity && updated[index].price_per_pc) {
      updated[index].line_amount = updated[index].quantity * (updated[index].price_per_pc || 0);
    }
    
    setLineItems(updated);
  };

  const updateLineItemField = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Auto-calculate line amount if qty or price changes
    if (field === 'quantity' || field === 'price_per_pc') {
      const qty = field === 'quantity' ? value : updated[index].quantity;
      const price = field === 'price_per_pc' ? value : updated[index].price_per_pc;
      updated[index].line_amount = (qty || 0) * (price || 0);
    }
    
    setLineItems(updated);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, {
      line_number: lineItems.length + 1,
      item_code: "",
      quantity: 0,
      alloy: "",
      material_size: "",
      net_weight_per_pc_g: undefined,
      gross_weight_per_pc_g: undefined,
      price_per_pc: undefined,
      line_amount: 0,
      drawing_number: formData.drawing_number,
      due_date: ""
    }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      const updated = lineItems.filter((_, i) => i !== index);
      setLineItems(updated.map((item, idx) => ({ ...item, line_number: idx + 1 })));
    }
  };

  const calculateTotals = () => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.line_amount || 0), 0);
    const gstAmount = formData.gst_type === 'domestic' ? (subtotal * formData.gst_percent) / 100 : 0;
    const total = subtotal + gstAmount;
    return { subtotal, gstAmount, total };
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate
      if (!formData.customer_id) {
        throw new Error("Please select a customer");
      }
      if (lineItems.some(li => !li.item_code || !li.quantity || !li.alloy)) {
        throw new Error("All line items must have item code, quantity, and alloy");
      }

      // Generate SO ID
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const { count } = await supabase
        .from("sales_orders")
        .select("*", { count: 'exact', head: true })
        .gte('created_at', new Date(today.setHours(0, 0, 0, 0)).toISOString());
      const sequence = String((count || 0) + 1).padStart(3, '0');
      const so_id = `SO-${dateStr}-${sequence}`;

      const { subtotal, gstAmount, total } = calculateTotals();

      // Create sales order (auto-approved to trigger work order generation)
      const { data: newOrder, error: orderError } = await supabase
        .from("sales_orders")
        .insert([{ 
          so_id,
          customer: formData.customer_name,
          party_code: customers.find(c => c.id === formData.customer_id)?.party_code || "",
          po_number: formData.po_number,
          po_date: formData.po_date,
          currency: formData.currency,
          payment_terms_days: formData.payment_terms_days,
          incoterm: formData.incoterm,
          expected_delivery_date: formData.expected_delivery_date || null,
          drawing_number: formData.drawing_number || null,
          items: (lineItems || []).map((item: any) => ({
            item_code: item.item_code,
            quantity: Number(item.quantity) || 0,
            due_date: item.due_date || null,
            price_per_pc: item.price_per_pc ?? null,
            line_amount: item.price_per_pc != null && item.quantity != null ? Number(item.price_per_pc) * Number(item.quantity) : null,
            drawing_number: item.drawing_number ?? null,
            priority: 3,
            alloy: item.alloy || null,
            material_size_mm: item.material_size || null,
            net_weight_per_pc_grams: item.net_weight_per_pc_g ?? null,
            gross_weight_per_pc_grams: item.gross_weight_per_pc_g ?? null,
            cycle_time_seconds: null
          })),
          total_amount: total,
          status: "approved",
          created_by: user?.id,
          material_rod_forging_size_mm: null,
          gross_weight_per_pc_grams: null,
          net_weight_per_pc_grams: null,
          cycle_time_seconds: null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create line items (auto-approved to trigger work order generation)
      const lineItemsToInsert = lineItems.map(item => ({
        sales_order_id: newOrder.id,
        line_number: item.line_number,
        item_code: item.item_code,
        quantity: item.quantity,
        alloy: item.alloy,
        material_size_mm: item.material_size,
        net_weight_per_pc_grams: item.net_weight_per_pc_g || null,
        gross_weight_per_pc_grams: item.gross_weight_per_pc_g || null,
        cycle_time_seconds: null,
        due_date: item.due_date
      }));

      const { error: lineItemsError } = await supabase
        .from("sales_order_line_items" as any)
        .insert(lineItemsToInsert);

      if (lineItemsError) throw lineItemsError;

      toast({ description: `Sales order ${so_id} created with ${lineItems.length} line items` });
      
      // Reset form
      setFormData({
        customer_id: "",
        customer_name: "",
        po_number: "",
        po_date: "",
        expected_delivery_date: "",
        drawing_number: "",
        currency: "USD",
        payment_terms_days: 30,
        gst_type: "domestic",
        gst_number: "",
        incoterm: "EXW",
        gst_percent: 18
      });
      setLineItems([{
        line_number: 1,
        item_code: "",
        quantity: 0,
        alloy: "",
        material_size: "",
        due_date: ""
      }]);
      
      await loadData();
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOrder = async (orderId: string, soId: string) => {
    if (!confirm(`Delete ${soId}? This will delete all line items.`)) return;
    setLoading(true);
    try {
      await supabase.from("sales_order_line_items" as any).delete().eq("sales_order_id", orderId);
      await supabase.from("sales_orders").delete().eq("id", orderId);
      toast({ description: `${soId} deleted` });
      await loadSalesOrders();
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, total } = calculateTotals();

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Sales Orders" subtitle="Create and manage sales orders with financial tracking" />
      
      <div className="p-6 space-y-6">
        {/* Create Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create Sales Order</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateOrder} className="space-y-6">
              {/* Header Section */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg">Order Details</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <Select value={formData.customer_id} onValueChange={handleCustomerChange} required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {customers.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.customer_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Customer PO Number *</Label>
                    <Input
                      value={formData.po_number}
                      onChange={(e) => setFormData({...formData, po_number: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>PO Date *</Label>
                    <Input
                      type="date"
                      value={formData.po_date}
                      onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Expected Delivery Date</Label>
                    <Input
                      type="date"
                      value={formData.expected_delivery_date}
                      onChange={(e) => setFormData({...formData, expected_delivery_date: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Drawing Number</Label>
                    <Input
                      value={formData.drawing_number}
                      onChange={(e) => setFormData({...formData, drawing_number: e.target.value})}
                      placeholder="Default for all lines"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(v) => setFormData({...formData, currency: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Payment Terms (Days)</Label>
                    <Input
                      type="number"
                      value={formData.payment_terms_days}
                      onChange={(e) => setFormData({...formData, payment_terms_days: parseInt(e.target.value) || 0})}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>GST Type</Label>
                    <Select value={formData.gst_type} onValueChange={(v) => setFormData({...formData, gst_type: v as any})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {GST_TYPES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>GST Number</Label>
                    <Input
                      value={formData.gst_number}
                      onChange={(e) => setFormData({...formData, gst_number: e.target.value})}
                      disabled
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Incoterm</Label>
                    <Select value={formData.incoterm} onValueChange={(v) => setFormData({...formData, incoterm: v})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {INCOTERMS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>

                  {formData.gst_type === 'domestic' && (
                    <div className="space-y-2">
                      <Label>GST %</Label>
                      <Input
                        type="number"
                        value={formData.gst_percent}
                        onChange={(e) => setFormData({...formData, gst_percent: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-lg">Line Items</h3>
                  <Button type="button" size="sm" onClick={addLineItem}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Line
                  </Button>
                </div>

                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">#</TableHead>
                        <TableHead className="min-w-[180px]">Item Code *</TableHead>
                        <TableHead className="min-w-[100px]">Qty (pcs) *</TableHead>
                        <TableHead className="min-w-[120px]">Alloy *</TableHead>
                        <TableHead className="min-w-[150px]">Material Size</TableHead>
                        <TableHead className="min-w-[100px]">Net Wt (g/pc)</TableHead>
                        <TableHead className="min-w-[100px]">Gross Wt (g/pc)</TableHead>
                        <TableHead className="min-w-[120px]">Drawing #</TableHead>
                        <TableHead className="min-w-[120px]">Price/pc ({formData.currency})</TableHead>
                        <TableHead className="min-w-[120px]">Line Amt</TableHead>
                        <TableHead className="min-w-[130px]">Due Date</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.line_number}</TableCell>
                          <TableCell>
                            <Input 
                              value={item.item_code} 
                              onChange={(e) => updateLineItemField(idx, 'item_code', e.target.value.toUpperCase())}
                              placeholder="Type or select"
                              list={`item-codes-${idx}`}
                              className="w-full"
                              required
                            />
                            <datalist id={`item-codes-${idx}`}>
                              {items.slice(0, 20).map((itm) => (
                                <option key={itm.id} value={itm.item_code} />
                              ))}
                            </datalist>
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={item.quantity || ""} onChange={(e) => updateLineItemField(idx, 'quantity', parseInt(e.target.value) || 0)} required />
                          </TableCell>
                          <TableCell>
                            <Select value={item.alloy} onValueChange={(v) => updateLineItemField(idx, 'alloy', v)} required>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                {ALLOYS.map(group => (
                                  <div key={group.group}>
                                    <SelectItem value={`__${group.group}__`} disabled className="font-semibold">{group.group}</SelectItem>
                                    {group.items.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                                  </div>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input value={item.material_size || ""} onChange={(e) => updateLineItemField(idx, 'material_size', e.target.value)} placeholder="e.g., Ø12mm" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.net_weight_per_pc_g || ""} onChange={(e) => updateLineItemField(idx, 'net_weight_per_pc_g', parseFloat(e.target.value))} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.gross_weight_per_pc_g || ""} onChange={(e) => updateLineItemField(idx, 'gross_weight_per_pc_g', parseFloat(e.target.value))} />
                          </TableCell>
                          <TableCell>
                            <Input value={item.drawing_number || ""} onChange={(e) => updateLineItemField(idx, 'drawing_number', e.target.value)} placeholder={formData.drawing_number} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.0001" value={item.price_per_pc || ""} onChange={(e) => updateLineItemField(idx, 'price_per_pc', parseFloat(e.target.value))} />
                          </TableCell>
                          <TableCell className="font-medium">
                            {(item.line_amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Input type="date" value={item.due_date} onChange={(e) => updateLineItemField(idx, 'due_date', e.target.value)} />
                          </TableCell>
                          <TableCell>
                            {lineItems.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeLineItem(idx)}>
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

              {/* Footer Totals */}
              <div className="flex justify-end">
                <div className="w-96 space-y-2 bg-muted/20 p-4 rounded-lg">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span className="font-medium">{formData.currency} {subtotal.toFixed(2)}</span>
                  </div>
                  {formData.gst_type === 'domestic' && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span>GST ({formData.gst_percent}%):</span>
                        <span>{formData.currency} {gstAmount.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Total:</span>
                    <span>{formData.currency} {total.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button type="submit" disabled={loading}>
                  Create Sales Order ({lineItems.length} line items)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Sales Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {loading && <p className="text-muted-foreground">Loading...</p>}
              {salesOrders.map(order => (
                <div key={order.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{order.so_id}</span>
                      <Badge variant="outline">{order.status}</Badge>
                      <span className="text-sm text-muted-foreground">{order.customer}</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      PO: {order.po_number} | {order.sales_order_items?.length || 0} items | {order.currency} {order.total_amount?.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => {
                      setSelectedOrder(order);
                      setIsViewDialogOpen(true);
                    }}>
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDeleteOrder(order.id, order.so_id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-6xl">
          <DialogHeader>
            <DialogTitle>Sales Order: {selectedOrder?.so_id}</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Customer:</span>
                  <p className="font-medium">{selectedOrder.customer}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">PO Number:</span>
                  <p className="font-medium">{selectedOrder.po_number}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total:</span>
                  <p className="font-medium">{selectedOrder.currency} {selectedOrder.total_amount?.toFixed(2)}</p>
                </div>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead>Price/pc</TableHead>
                    <TableHead>Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedOrder.sales_order_items?.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.line_number}</TableCell>
                      <TableCell>{item.item_code}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.alloy}</TableCell>
                      <TableCell>{item.price_per_pc?.toFixed(4)}</TableCell>
                      <TableCell className="font-medium">{item.line_amount?.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
