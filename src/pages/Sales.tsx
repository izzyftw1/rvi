import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, Trash2, Plus, X, UserPlus, PackagePlus, Download, AlertCircle, Info } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddCustomerDialog } from "@/components/sales/AddCustomerDialog";
import { AddItemDialog } from "@/components/sales/AddItemDialog";
import { getTdsRate, getPanEntityType, isValidPan } from "@/lib/tdsUtils";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Simplified line item - ONLY commercial data, NO manufacturing specs
interface LineItem {
  line_number: number;
  item_code: string;
  quantity: number;
  price_per_pc?: number;
  line_amount?: number;
  drawing_number?: string;
  due_date: string;
}

const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];
const CURRENCIES = ["USD", "EUR", "INR", "GBP"];

export default function Sales() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [customerItemHistory, setCustomerItemHistory] = useState<Record<string, string[]>>({});
  
  const [formData, setFormData] = useState({
    customer_id: "",
    customer_name: "",
    po_number: "",
    po_date: "",
    expected_delivery_date: "",
    drawing_number: "",
    currency: "USD",
    payment_terms_days: 30,
    payment_terms_override: false,
    gst_type: "not_applicable" as "domestic" | "export" | "not_applicable",
    gst_number: "",
    incoterm: "EXW",
    gst_percent: 18,
    advance_payment_value: "",
    advance_payment_type: "percent" as "percent" | "fixed",
    pan_number: "",
    is_export_customer: false,
    customer_country: ""
  });
  
  const [lineItems, setLineItems] = useState<LineItem[]>([{
    line_number: 1,
    item_code: "",
    quantity: 0,
    price_per_pc: undefined,
    line_amount: 0,
    drawing_number: "",
    due_date: ""
  }]);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);

  const isIndianCustomer = formData.customer_country?.toLowerCase() === 'india';
  
  const tdsRate = useMemo(() => {
    return getTdsRate(formData.pan_number, formData.is_export_customer);
  }, [formData.pan_number, formData.is_export_customer]);
  
  const panEntityType = useMemo(() => {
    return getPanEntityType(formData.pan_number);
  }, [formData.pan_number]);

  const filteredItems = useMemo(() => {
    if (!formData.customer_id) return items;
    const customerItems = customerItemHistory[formData.customer_id] || [];
    if (customerItems.length === 0) return items;
    const filtered = items.filter(item => customerItems.includes(item.item_code));
    return filtered.length > 0 ? filtered : items;
  }, [formData.customer_id, items, customerItemHistory]);

  const advancePaymentCalculated = useMemo(() => {
    const subtotal = lineItems.reduce((sum, item) => sum + (item.line_amount || 0), 0);
    const gstAmount = formData.gst_type === 'domestic' && isIndianCustomer ? (subtotal * formData.gst_percent) / 100 : 0;
    const total = subtotal + gstAmount;
    const value = parseFloat(formData.advance_payment_value) || 0;
    if (value <= 0) return 0;
    return formData.advance_payment_type === 'percent' ? (total * value) / 100 : value;
  }, [formData.advance_payment_value, formData.advance_payment_type, lineItems, formData.gst_type, formData.gst_percent, isIndianCustomer]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCustomers(), loadItems(), loadSalesOrders()]);
    setLoading(false);
    loadCustomerItemHistory();
  };

  const loadCustomerItemHistory = async () => {
    const { data } = await supabase
      .from("sales_order_line_items" as any)
      .select("item_code, sales_orders!inner(customer_id)")
      .not("sales_orders.customer_id", "is", null);
    
    if (data) {
      const mapping: Record<string, Set<string>> = {};
      data.forEach((row: any) => {
        const customerId = row.sales_orders?.customer_id;
        if (customerId && row.item_code) {
          if (!mapping[customerId]) mapping[customerId] = new Set();
          mapping[customerId].add(row.item_code);
        }
      });
      const result: Record<string, string[]> = {};
      Object.keys(mapping).forEach(key => {
        result[key] = Array.from(mapping[key]);
      });
      setCustomerItemHistory(result);
    }
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
      const ordersWithCalculatedTotals = orders.map(order => {
        const items = Array.isArray(order.items) ? order.items : [];
        const calculatedSubtotal = items.reduce((sum: number, item: any) => {
          const lineAmount = item.line_amount ?? ((item.quantity || 0) * (item.price_per_pc || 0));
          return sum + lineAmount;
        }, 0);
        return {
          ...order,
          sales_order_items: items,
          total_amount: order.total_amount && order.total_amount > 0 ? order.total_amount : calculatedSubtotal
        };
      });
      setSalesOrders(ordersWithCalculatedTotals);
    }
  };

  const handleCustomerChange = (customerId: string) => {
    const customer = customers.find(c => c.id === customerId);
    if (customer) {
      const isIndia = customer.country?.toLowerCase() === 'india';
      const isExport = customer.is_export_customer || false;
      
      let gstType: "domestic" | "export" | "not_applicable" = "not_applicable";
      if (isExport) {
        gstType = "export";
      } else if (isIndia) {
        gstType = customer.gst_type || "domestic";
      }
      
      setFormData({
        ...formData,
        customer_id: customerId,
        customer_name: customer.customer_name,
        currency: customer.credit_limit_currency || "USD",
        payment_terms_days: formData.payment_terms_override 
          ? formData.payment_terms_days 
          : (customer.payment_terms_days || 30),
        payment_terms_override: false,
        gst_number: isIndia ? (customer.gst_number || "") : "",
        gst_type: gstType,
        gst_percent: isIndia && !isExport ? 18 : 0,
        pan_number: customer.pan_number || "",
        is_export_customer: isExport,
        customer_country: customer.country || ""
      });
    }
  };

  const handlePaymentTermsChange = (value: number) => {
    setFormData({
      ...formData,
      payment_terms_days: value,
      payment_terms_override: true
    });
  };

  const handleItemCodeChange = (index: number, value: string) => {
    if (value === "__new__") {
      setIsAddItemDialogOpen(true);
      return;
    }
    
    const updated = [...lineItems];
    updated[index] = {
      ...updated[index],
      item_code: value,
      drawing_number: formData.drawing_number || updated[index].drawing_number
    };
    
    if (updated[index].quantity && updated[index].price_per_pc) {
      updated[index].line_amount = updated[index].quantity * (updated[index].price_per_pc || 0);
    }
    
    setLineItems(updated);
  };

  const handleCustomerAdded = (newCustomer: any) => {
    setCustomers([newCustomer, ...customers]);
    handleCustomerChange(newCustomer.id);
  };

  const handleItemAdded = (newItem: any) => {
    setItems([newItem, ...items]);
  };

  const updateLineItemField = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    
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
    const gstAmount = formData.gst_type === 'domestic' && isIndianCustomer ? (subtotal * formData.gst_percent) / 100 : 0;
    const total = subtotal + gstAmount;
    return { subtotal, gstAmount, total };
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.customer_id) {
      toast({ variant: "destructive", description: "Please select a customer" });
      return;
    }

    setLoading(true);

    try {
      if (lineItems.some(li => !li.item_code || !li.quantity || li.quantity <= 0 || !li.due_date)) {
        throw new Error("All line items must have item code, quantity, and due date");
      }

      const { subtotal, gstAmount, total } = calculateTotals();

      let advancePaymentData = null;
      const advanceValue = parseFloat(formData.advance_payment_value) || 0;
      if (advanceValue > 0) {
        advancePaymentData = {
          type: formData.advance_payment_type,
          value: advanceValue,
          calculated_amount: formData.advance_payment_type === 'percent' 
            ? (total * advanceValue / 100) 
            : advanceValue,
          currency: formData.currency
        };
      }

      const selectedCustomer = customers.find(c => c.id === formData.customer_id);
      if (!selectedCustomer) throw new Error("Selected customer not found");

      // Create sales order - NO manufacturing data
      const { data: newOrder, error: orderError } = await supabase
        .from("sales_orders")
        .insert([{ 
          so_id: '',
          customer: selectedCustomer.customer_name,
          customer_id: formData.customer_id,
          party_code: selectedCustomer.party_code || "",
          po_number: formData.po_number,
          po_date: formData.po_date,
          currency: formData.currency,
          payment_terms_days: formData.payment_terms_days ? Number(formData.payment_terms_days) : null,
          incoterm: formData.incoterm,
          expected_delivery_date: formData.expected_delivery_date || null,
          drawing_number: formData.drawing_number || null,
          advance_payment: advancePaymentData,
          // Line items with ONLY commercial data
          items: lineItems.map(item => ({
            item_code: String(item.item_code || ''),
            quantity: Number(item.quantity) || 0,
            due_date: item.due_date || null,
            price_per_pc: item.price_per_pc != null ? Number(item.price_per_pc) : null,
            line_amount: item.price_per_pc != null && item.quantity != null ? Number(item.price_per_pc) * Number(item.quantity) : null,
            drawing_number: item.drawing_number ? String(item.drawing_number) : null,
            priority: 3
            // NO alloy, material_size, weights, cycle_time - these are defined in Material Requirements
          })),
          total_amount: total,
          status: "pending",
          created_by: user?.id,
          // Clear all manufacturing fields
          material_rod_forging_size_mm: null,
          gross_weight_per_pc_grams: null,
          net_weight_per_pc_grams: null,
          cycle_time_seconds: null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Insert line items (must match DB schema)
      const lineItemsToInsert = lineItems.map(item => {
        const master = items.find(i => i.item_code === item.item_code);
        return {
          sales_order_id: newOrder.id,
          line_number: item.line_number,
          item_code: item.item_code,
          quantity: item.quantity,
          due_date: item.due_date,
          drawing_number: item.drawing_number || null,
          // Required/standardized spec fields (sourced from master data when available)
          alloy: (master?.alloy || 'Unknown') as string,
          material_size_mm: master?.material_size_mm || null,
          cycle_time_seconds: master?.cycle_time_seconds || null,
          gross_weight_per_pc_grams: master?.gross_weight_grams || null,
          net_weight_per_pc_grams: master?.net_weight_grams || null,
          item_id: master?.id || null
        };
      });

      const { data: insertedLineItems, error: lineItemsError } = await supabase
        .from("sales_order_line_items" as any)
        .insert(lineItemsToInsert)
        .select('id');

      if (lineItemsError) throw lineItemsError;

      if (insertedLineItems && insertedLineItems.length > 0) {
        const lineItemIds = insertedLineItems.map((li: any) => li.id);
        const { error: approveError } = await supabase
          .from("sales_order_line_items" as any)
          .update({ status: 'approved' })
          .in('id', lineItemIds);

        if (approveError) {
          toast({ variant: "destructive", description: `Sales order created but work order generation failed: ${approveError.message}` });
        } else {
          await supabase
            .from("sales_orders")
            .update({ status: 'approved' })
            .eq('id', newOrder.id);
          
          toast({ description: `Sales order ${newOrder.so_id} created. Material Requirements must be defined by Production before procurement/manufacturing.` });
        }
      } else {
        toast({ description: `Sales order ${newOrder.so_id} created with ${lineItems.length} line items` });
      }
      
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
        payment_terms_override: false,
        gst_type: "not_applicable",
        gst_number: "",
        incoterm: "EXW",
        gst_percent: 18,
        advance_payment_value: "",
        advance_payment_type: "percent",
        pan_number: "",
        is_export_customer: false,
        customer_country: ""
      });
      setLineItems([{
        line_number: 1,
        item_code: "",
        quantity: 0,
        price_per_pc: undefined,
        line_amount: 0,
        drawing_number: "",
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

  const handleDownloadProforma = async (order: any) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('generate-proforma', {
        body: { salesOrderId: order.id }
      });
      if (error) throw new Error(error.message || 'Failed to generate proforma');
      if (!data?.success) throw new Error(data?.error || 'Failed to generate proforma');
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
      toast({ description: data.isExisting 
        ? `Proforma invoice ${data.proformaNo} downloaded`
        : `Proforma invoice ${data.proformaNo} generated and saved` 
      });
      await loadSalesOrders();
    } catch (error: any) {
      toast({ variant: "destructive", description: `Failed to generate proforma: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, total } = calculateTotals();

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Info Alert - Sales Role */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            <strong>Sales Order Entry:</strong> Enter commercial terms only. Manufacturing specifications (alloy, size, weight, cycle time) 
            are defined by Production in Material Requirements after the order is received.
          </AlertDescription>
        </Alert>

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
                  {/* Customer */}
                  <div className="space-y-2">
                    <Label>Customer *</Label>
                    <div className="flex gap-2">
                      <Select value={formData.customer_id} onValueChange={handleCustomerChange} required>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Select customer" />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.customer_name} {c.country ? `(${c.country})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setIsAddCustomerDialogOpen(true)}
                        title="Add new customer"
                      >
                        <UserPlus className="h-4 w-4" />
                      </Button>
                    </div>
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
                    <Label>
                      Payment Terms (Days)
                      {formData.payment_terms_override && (
                        <Badge variant="outline" className="ml-2 text-xs">Overridden</Badge>
                      )}
                    </Label>
                    <Input
                      type="number"
                      value={formData.payment_terms_days}
                      onChange={(e) => handlePaymentTermsChange(parseInt(e.target.value) || 0)}
                    />
                    <p className="text-xs text-muted-foreground">Auto-filled from customer</p>
                  </div>

                  <div className="space-y-2">
                    <Label>GST Type</Label>
                    <Select 
                      value={formData.gst_type} 
                      onValueChange={(v) => setFormData({...formData, gst_type: v as any})}
                      disabled={!isIndianCustomer}
                    >
                      <SelectTrigger className={!isIndianCustomer ? 'opacity-50' : ''}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="domestic">Domestic</SelectItem>
                        <SelectItem value="export">Export</SelectItem>
                        <SelectItem value="not_applicable">Not Applicable</SelectItem>
                      </SelectContent>
                    </Select>
                    {!isIndianCustomer && formData.customer_id && (
                      <p className="text-xs text-muted-foreground">GST not applicable for non-India customers</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>GST Number</Label>
                    <Input
                      value={formData.gst_number}
                      disabled
                      className={!isIndianCustomer ? 'opacity-50' : ''}
                      placeholder={isIndianCustomer ? 'Auto-populated from customer' : 'N/A'}
                    />
                    {isIndianCustomer && !formData.gst_number && formData.customer_id && (
                      <p className="text-xs text-amber-600">No GST number on file for this customer</p>
                    )}
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

                  {formData.gst_type === 'domestic' && isIndianCustomer && (
                    <div className="space-y-2">
                      <Label>GST %</Label>
                      <Input
                        type="number"
                        value={formData.gst_percent}
                        onChange={(e) => setFormData({...formData, gst_percent: parseFloat(e.target.value) || 0})}
                      />
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Advance Payment</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.advance_payment_value}
                        onChange={(e) => setFormData({...formData, advance_payment_value: e.target.value})}
                        placeholder="Amount"
                        className="flex-1"
                      />
                      <Select 
                        value={formData.advance_payment_type} 
                        onValueChange={(v) => setFormData({...formData, advance_payment_type: v as any})}
                      >
                        <SelectTrigger className="w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-background z-50">
                          <SelectItem value="percent">%</SelectItem>
                          <SelectItem value="fixed">{formData.currency}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {advancePaymentCalculated > 0 && (
                      <p className="text-xs text-muted-foreground">
                        = {formData.currency} {advancePaymentCalculated.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    )}
                  </div>
                </div>

                {formData.pan_number && isValidPan(formData.pan_number) && (
                  <Alert className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      <strong>TDS Info:</strong> PAN {formData.pan_number.toUpperCase()} ({panEntityType}) → TDS Rate: {tdsRate}%
                      {formData.is_export_customer && ' (Export customer - TDS waived)'}
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              {/* Line Items - SIMPLIFIED: Only Item, Qty, Price, Drawing, Due Date */}
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-semibold text-lg">Line Items</h3>
                    <p className="text-xs text-muted-foreground">
                      Enter item code, quantity, price, and due date. Manufacturing specs are defined by Production.
                    </p>
                    {formData.customer_id && customerItemHistory[formData.customer_id]?.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Showing items previously ordered by this customer ({customerItemHistory[formData.customer_id].length} items)
                      </p>
                    )}
                  </div>
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
                        <TableHead className="min-w-[200px]">Item Code *</TableHead>
                        <TableHead className="min-w-[120px]">Quantity (pcs) *</TableHead>
                        <TableHead className="min-w-[140px]">Price/pc ({formData.currency})</TableHead>
                        <TableHead className="min-w-[140px]">Line Amount</TableHead>
                        <TableHead className="min-w-[140px]">Drawing #</TableHead>
                        <TableHead className="min-w-[140px]">Due Date</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineItems.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.line_number}</TableCell>
                          <TableCell>
                            <Select 
                              value={item.item_code} 
                              onValueChange={(v) => handleItemCodeChange(idx, v)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select item" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50 max-h-[300px]">
                                <SelectItem value="__new__">
                                  <span className="flex items-center gap-2">
                                    <PackagePlus className="h-4 w-4" />
                                    Add New Item
                                  </span>
                                </SelectItem>
                                {filteredItems.map((itm) => (
                                  <SelectItem key={itm.id} value={itm.item_code}>
                                    {itm.item_code} {itm.item_name ? `- ${itm.item_name}` : ''}
                                  </SelectItem>
                                ))}
                                {formData.customer_id && customerItemHistory[formData.customer_id]?.length > 0 && filteredItems.length < items.length && (
                                  <>
                                    <div className="px-2 py-1 text-xs text-muted-foreground border-t mt-1">All items:</div>
                                    {items.filter(i => !filteredItems.some(f => f.id === i.id)).map((itm) => (
                                      <SelectItem key={itm.id} value={itm.item_code}>
                                        {itm.item_code} {itm.item_name ? `- ${itm.item_name}` : ''}
                                      </SelectItem>
                                    ))}
                                  </>
                                )}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              value={item.quantity || ""} 
                              onChange={(e) => updateLineItemField(idx, 'quantity', parseInt(e.target.value) || 0)} 
                              required 
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              step="0.0001" 
                              value={item.price_per_pc || ""} 
                              onChange={(e) => updateLineItemField(idx, 'price_per_pc', parseFloat(e.target.value))} 
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {(item.line_amount || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>
                            <Input 
                              value={item.drawing_number || ""} 
                              onChange={(e) => updateLineItemField(idx, 'drawing_number', e.target.value)} 
                              placeholder={formData.drawing_number} 
                            />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="date" 
                              value={item.due_date} 
                              onChange={(e) => updateLineItemField(idx, 'due_date', e.target.value)} 
                            />
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
                  {formData.gst_type === 'domestic' && isIndianCustomer && (
                    <div className="flex justify-between text-sm">
                      <span>GST ({formData.gst_percent}%):</span>
                      <span>{formData.currency} {gstAmount.toFixed(2)}</span>
                    </div>
                  )}
                  {advancePaymentCalculated > 0 && (
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Advance ({formData.advance_payment_type === 'percent' ? `${formData.advance_payment_value}%` : 'Fixed'}):</span>
                      <span>{formData.currency} {advancePaymentCalculated.toFixed(2)}</span>
                    </div>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SO #</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-center">Items</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Loading...
                    </TableCell>
                  </TableRow>
                )}
                {!loading && salesOrders.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No sales orders found
                    </TableCell>
                  </TableRow>
                )}
                {salesOrders.map(order => {
                  const itemCount = order.sales_order_items?.length || 0;
                  const orderTotal = order.total_amount || 0;
                  
                  return (
                    <TableRow key={order.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">{order.so_id}</TableCell>
                      <TableCell>
                        <Badge 
                          variant={order.status === 'approved' ? 'default' : 'secondary'}
                          className={order.status === 'approved' ? 'bg-green-600' : ''}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{order.customer}</TableCell>
                      <TableCell className="text-center">
                        {itemCount > 0 ? itemCount : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {orderTotal > 0 ? (
                          `${order.currency || 'USD'} ${orderTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsViewDialogOpen(true);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadProforma(order)}
                            disabled={loading}
                            title="Download Proforma"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleDeleteOrder(order.id, order.so_id)}
                            disabled={loading}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Sales Order: {selectedOrder?.so_id}</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Customer</Label>
                    <p className="font-medium">{selectedOrder.customer}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">PO Number</Label>
                    <p className="font-medium">{selectedOrder.po_number}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">PO Date</Label>
                    <p className="font-medium">{selectedOrder.po_date}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge variant={selectedOrder.status === 'approved' ? 'default' : 'secondary'}>
                      {selectedOrder.status}
                    </Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Currency</Label>
                    <p className="font-medium">{selectedOrder.currency}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Incoterm</Label>
                    <p className="font-medium">{selectedOrder.incoterm || '-'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Terms</Label>
                    <p className="font-medium">{selectedOrder.payment_terms_days || '-'} days</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Expected Delivery</Label>
                    <p className="font-medium">{selectedOrder.expected_delivery_date || '-'}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-muted-foreground mb-2 block">Line Items</Label>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Price/pc</TableHead>
                        <TableHead>Line Amt</TableHead>
                        <TableHead>Due Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedOrder.sales_order_items || []).map((item: any, idx: number) => (
                        <TableRow key={idx}>
                          <TableCell>{idx + 1}</TableCell>
                          <TableCell className="font-medium">{item.item_code}</TableCell>
                          <TableCell>{item.quantity?.toLocaleString() || '-'}</TableCell>
                          <TableCell>{item.price_per_pc?.toFixed(4) || '-'}</TableCell>
                          <TableCell>{item.line_amount?.toFixed(2) || '-'}</TableCell>
                          <TableCell>{item.due_date || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-end">
                  <div className="w-64 space-y-1 bg-muted/20 p-3 rounded-lg text-sm">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total:</span>
                      <span>{selectedOrder.currency} {(selectedOrder.total_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <AddCustomerDialog
          open={isAddCustomerDialogOpen}
          onOpenChange={setIsAddCustomerDialogOpen}
          onCustomerAdded={handleCustomerAdded}
        />

        <AddItemDialog
          open={isAddItemDialogOpen}
          onOpenChange={setIsAddItemDialogOpen}
          onItemAdded={handleItemAdded}
        />
      </div>
    </div>
  );
}
