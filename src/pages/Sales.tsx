import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Eye, Trash2, Plus, X, UserPlus, PackagePlus, Download } from "lucide-react";
// Proforma generation is now server-side via Edge Function
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AddCustomerDialog } from "@/components/sales/AddCustomerDialog";
import { AddItemDialog } from "@/components/sales/AddItemDialog";
// Logo is now handled server-side in Edge Function - no frontend upload needed

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
  cycle_time_seconds?: number;
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
  // Logo is now handled server-side in Edge Function
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [historicalLineItems, setHistoricalLineItems] = useState<any[]>([]);
  const [materialSpecs, setMaterialSpecs] = useState<any[]>([]);
  
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
    gst_percent: 18,
    advance_payment: ""
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
    due_date: "",
    cycle_time_seconds: undefined
  }]);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [isAddItemDialogOpen, setIsAddItemDialogOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUser(user));
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    await Promise.all([loadCustomers(), loadItems(), loadSalesOrders(), loadHistoricalLineItems(), loadMaterialSpecs()]);
    setLoading(false);
  };

  const loadMaterialSpecs = async () => {
    const { data } = await supabase
      .from("material_specs")
      .select("*")
      .order("size_label", { ascending: true });
    if (data) setMaterialSpecs(data);
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
      // Use items JSONB from sales_orders - this is the source of truth
      // Calculate totals from line items if total_amount is missing
      const ordersWithCalculatedTotals = orders.map(order => {
        const items = Array.isArray(order.items) ? order.items : [];
        const calculatedSubtotal = items.reduce((sum: number, item: any) => {
          const lineAmount = item.line_amount ?? ((item.quantity || 0) * (item.price_per_pc || 0));
          return sum + lineAmount;
        }, 0);
        
        return {
          ...order,
          // Use items JSONB directly as the line items source
          sales_order_items: items,
          // Use stored total_amount, or calculate from items if missing/zero
          total_amount: order.total_amount && order.total_amount > 0 
            ? order.total_amount 
            : calculatedSubtotal
        };
      });
      
      setSalesOrders(ordersWithCalculatedTotals);
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
      // Open add item dialog
      setIsAddItemDialogOpen(true);
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
      // Auto-populate from item master first, then historical, then keep existing
      alloy: item?.alloy || historicalItem?.alloy || updated[index].alloy,
      material_size: item?.material_size_mm || historicalItem?.material_size_mm || updated[index].material_size,
      gross_weight_per_pc_g: item?.gross_weight_grams || historicalItem?.gross_weight_per_pc_grams || updated[index].gross_weight_per_pc_g,
      net_weight_per_pc_g: item?.net_weight_grams || historicalItem?.net_weight_per_pc_grams || updated[index].net_weight_per_pc_g,
      drawing_number: historicalItem?.drawing_number || formData.drawing_number || updated[index].drawing_number,
      price_per_pc: historicalItem?.price_per_pc || updated[index].price_per_pc,
      cycle_time_seconds: item?.cycle_time_seconds || historicalItem?.cycle_time_seconds || updated[index].cycle_time_seconds
    };
    
    // Auto-calculate line amount if we have quantity and price
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
    // Don't auto-select, let user choose it from dropdown
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
      due_date: "",
      cycle_time_seconds: undefined
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
    
    // Validate customer selection first
    if (!formData.customer_id) {
      toast({ 
        variant: "destructive", 
        description: "Please select a customer before creating sales order" 
      });
      return;
    }

    setLoading(true);

    try {
      // Validate line items
      if (lineItems.some(li => !li.item_code || !li.quantity || !li.alloy)) {
        throw new Error("All line items must have item code, quantity, and alloy");
      }

      // SO ID is now generated server-side by trigger_set_so_id
      // Do NOT pass so_id - let the server generate it atomically

      const { subtotal, gstAmount, total } = calculateTotals();

      // Calculate advance payment
      let advancePaymentData = null;
      if (formData.advance_payment) {
        const input = formData.advance_payment.trim();
        const isPercentage = input.includes('%');
        const value = parseFloat(input.replace('%', ''));
        
        if (!isNaN(value)) {
          advancePaymentData = {
            type: isPercentage ? 'percentage' : 'fixed',
            value: value,
            calculated_amount: isPercentage ? (total * value / 100) : value,
            currency: formData.currency
          };
        }
      }

      // Get selected customer data
      const selectedCustomer = customers.find(c => c.id === formData.customer_id);
      if (!selectedCustomer) {
        throw new Error("Selected customer not found");
      }

      // Create sales order with status 'pending' first
      // so_id will be auto-generated by server trigger (pass empty string to trigger generation)
      // WO generation happens when line items are approved
      const { data: newOrder, error: orderError } = await supabase
        .from("sales_orders")
        .insert([{ 
          so_id: '', // Server trigger will generate this atomically
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
          items: (lineItems || []).map((item: any) => ({
            item_code: String(item.item_code || ''),
            quantity: Number(item.quantity) || 0,
            due_date: item.due_date || null,
            price_per_pc: item.price_per_pc != null ? Number(item.price_per_pc) : null,
            line_amount: item.price_per_pc != null && item.quantity != null ? Number(item.price_per_pc) * Number(item.quantity) : null,
            drawing_number: item.drawing_number ? String(item.drawing_number) : null,
            priority: 3,
            alloy: item.alloy ? String(item.alloy) : null,
            material_size_mm: item.material_size ? String(item.material_size) : null,
            net_weight_per_pc_grams: item.net_weight_per_pc_g != null ? Number(item.net_weight_per_pc_g) : null,
            gross_weight_per_pc_grams: item.gross_weight_per_pc_g != null ? Number(item.gross_weight_per_pc_g) : null,
            cycle_time_seconds: item.cycle_time_seconds != null ? Number(item.cycle_time_seconds) : null
          })),
          total_amount: total,
          status: "pending", // Start as pending, approve after line items
          created_by: user?.id,
          material_rod_forging_size_mm: null,
          gross_weight_per_pc_grams: null,
          net_weight_per_pc_grams: null,
          cycle_time_seconds: null
        }])
        .select()
        .single();

      if (orderError) throw orderError;

      // Create line items (auto-approved to trigger work order generation after status update)
      const lineItemsToInsert = lineItems.map(item => ({
        sales_order_id: newOrder.id,
        line_number: item.line_number,
        item_code: item.item_code,
        quantity: item.quantity,
        alloy: item.alloy,
        material_size_mm: item.material_size,
        net_weight_per_pc_grams: item.net_weight_per_pc_g || null,
        gross_weight_per_pc_grams: item.gross_weight_per_pc_g || null,
        cycle_time_seconds: item.cycle_time_seconds || null,
        due_date: item.due_date || null
      }));

      const { data: insertedLineItems, error: lineItemsError } = await supabase
        .from("sales_order_line_items" as any)
        .insert(lineItemsToInsert)
        .select('id');

      if (lineItemsError) throw lineItemsError;

      // Update line items to 'approved' to trigger work order generation
      // The trigger auto_generate_work_order_from_line_item fires on UPDATE when status changes to 'approved'
      if (insertedLineItems && insertedLineItems.length > 0) {
        const lineItemIds = insertedLineItems.map((li: any) => li.id);
        const { error: approveError } = await supabase
          .from("sales_order_line_items" as any)
          .update({ status: 'approved' })
          .in('id', lineItemIds);

        if (approveError) {
          console.error("Error approving line items:", approveError);
          // Don't throw - SO was created, WO generation can be retried
          toast({ 
            variant: "destructive", 
            description: `Sales order created but work order generation failed: ${approveError.message}` 
          });
        } else {
          // Also approve the SO itself (for downstream workflows like sales_bookings)
          const { error: soApproveError } = await supabase
            .from("sales_orders")
            .update({ status: 'approved' })
            .eq('id', newOrder.id);
          
          if (soApproveError) {
            console.error("Error approving SO:", soApproveError);
          }
          
          toast({ description: `Sales order ${newOrder.so_id} created with ${lineItems.length} line items and work orders generated` });
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
        gst_type: "domestic",
        gst_number: "",
        incoterm: "EXW",
        gst_percent: 18,
        advance_payment: ""
      });
      setLineItems([{
        line_number: 1,
        item_code: "",
        quantity: 0,
        alloy: "",
        material_size: "",
        due_date: "",
        cycle_time_seconds: undefined
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
      
      // Call server-side Edge Function to generate proforma
      // This bypasses RLS and uses service role for storage uploads
      const { data, error } = await supabase.functions.invoke('generate-proforma', {
        body: { salesOrderId: order.id }
      });
      
      if (error) {
        throw new Error(error.message || 'Failed to generate proforma');
      }
      
      if (!data?.success) {
        throw new Error(data?.error || 'Failed to generate proforma');
      }
      
      // Open the signed download URL
      if (data.downloadUrl) {
        window.open(data.downloadUrl, '_blank');
      }
      
      const message = data.isExisting 
        ? `Proforma invoice ${data.proformaNo} downloaded`
        : `Proforma invoice ${data.proformaNo} generated and saved`;
      
      toast({ description: message });
      await loadSalesOrders();
    } catch (error: any) {
      console.error("Error generating proforma:", error);
      toast({ 
        variant: "destructive", 
        description: `Failed to generate proforma: ${error.message || 'Unknown error'}` 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEmailProforma = async (order: any) => {
    try {
      setLoading(true);
      
      // Check if proforma exists
      const { data: proformaData } = await supabase
        .from('proforma_invoices')
        .select('*')
        .eq('sales_order_id', order.id)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!proformaData) {
        toast({
          variant: "destructive",
          description: "Please generate the proforma invoice first"
        });
        return;
      }

      // Get customer email
      let customerEmail = null;
      if (order.customer_id) {
        const { data: customerData } = await supabase
          .from('customer_master')
          .select('primary_contact_email')
          .eq('id', order.customer_id)
          .maybeSingle();
        customerEmail = customerData?.primary_contact_email;
      }

      if (!customerEmail) {
        toast({
          variant: "destructive",
          description: "Customer email not found. Please update customer details."
        });
        return;
      }

      // Call edge function to send email
      const { data, error } = await supabase.functions.invoke('send-proforma-email', {
        body: {
          proformaId: proformaData.id,
          customerEmail: customerEmail,
          customerName: order.customer,
          salesOrderNo: order.so_id,
          proformaNo: proformaData.proforma_no,
          pdfUrl: proformaData.file_url
        }
      });

      if (error) throw error;

      if (data?.success) {
        toast({ 
          description: `Proforma invoice emailed to ${customerEmail}` 
        });
        await loadSalesOrders();
      } else {
        throw new Error(data?.error || 'Failed to send email');
      }
    } catch (error: any) {
      console.error("Error emailing proforma:", error);
      toast({
        variant: "destructive",
        description: `Failed to email proforma: ${error.message || 'Unknown error'}`
      });
    } finally {
      setLoading(false);
    }
  };

  const { subtotal, gstAmount, total } = calculateTotals();

  return (
    <div className="min-h-screen bg-background">
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
                    <div className="flex gap-2">
                      <Select value={formData.customer_id} onValueChange={handleCustomerChange} required>
                        <SelectTrigger className="flex-1">
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

                  <div className="space-y-2">
                    <Label>Advance Payment</Label>
                    <Input
                      value={formData.advance_payment}
                      onChange={(e) => setFormData({...formData, advance_payment: e.target.value})}
                      placeholder="e.g., 30% or 5000"
                    />
                    <p className="text-xs text-muted-foreground">Enter % or fixed amount</p>
                  </div>
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
                        <TableHead className="min-w-[90px]">Cycle Time (s)</TableHead>
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
                            <div className="flex gap-2">
                              <Select 
                                value={item.item_code} 
                                onValueChange={(v) => handleItemCodeChange(idx, v)}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select item" />
                                </SelectTrigger>
                                <SelectContent className="bg-background z-50">
                                  <SelectItem value="__new__">
                                    <span className="flex items-center gap-2">
                                      <PackagePlus className="h-4 w-4" />
                                      Add New Item
                                    </span>
                                  </SelectItem>
                                  {items.map((itm) => (
                                    <SelectItem key={itm.id} value={itm.item_code}>
                                      {itm.item_code}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={item.quantity || ""} onChange={(e) => updateLineItemField(idx, 'quantity', parseInt(e.target.value) || 0)} required />
                          </TableCell>
                          <TableCell>
                            <Select value={item.alloy} onValueChange={(v) => updateLineItemField(idx, 'alloy', v)} required>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select grade" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                {[...new Set(materialSpecs.map(s => s.grade_label))].map(grade => (
                                  <SelectItem key={grade} value={grade}>{grade}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={item.material_size} onValueChange={(v) => updateLineItemField(idx, 'material_size', v)}>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select size" />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                {[...new Set(materialSpecs.map(s => s.size_label))].sort((a, b) => {
                                  const numA = parseInt(a);
                                  const numB = parseInt(b);
                                  return numA - numB;
                                }).map(size => (
                                  <SelectItem key={size} value={size}>{size}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.net_weight_per_pc_g || ""} onChange={(e) => updateLineItemField(idx, 'net_weight_per_pc_g', parseFloat(e.target.value))} />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={item.gross_weight_per_pc_g || ""} onChange={(e) => updateLineItemField(idx, 'gross_weight_per_pc_g', parseFloat(e.target.value))} />
                          </TableCell>
                          <TableCell>
                            <Input 
                              type="number" 
                              step="0.1" 
                              value={item.cycle_time_seconds || ""} 
                              onChange={(e) => updateLineItemField(idx, 'cycle_time_seconds', parseFloat(e.target.value) || undefined)} 
                              placeholder="sec/pc"
                            />
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
                  const total = order.total_amount || 0;
                  
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
                        {total > 0 ? (
                          <span>{order.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {order.status === 'approved' && (
                            <>
                              <Button 
                                size="sm" 
                                variant="default"
                                onClick={() => handleDownloadProforma(order)}
                                title="Download Proforma Invoice"
                                disabled={loading}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => {
                              setSelectedOrder(order);
                              setIsViewDialogOpen(true);
                            }}
                            title="View Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            onClick={() => handleDeleteOrder(order.id, order.so_id)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
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
      </div>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl">{selectedOrder?.so_id}</DialogTitle>
                <p className="text-sm text-muted-foreground mt-1">{selectedOrder?.customer}</p>
              </div>
              <div className="text-right">
                <Badge 
                  variant={selectedOrder?.status === 'approved' ? 'default' : 'secondary'}
                  className={selectedOrder?.status === 'approved' ? 'bg-green-600' : ''}
                >
                  {selectedOrder?.status}
                </Badge>
              </div>
            </div>
          </DialogHeader>
          
          {selectedOrder && (() => {
            const items = selectedOrder.sales_order_items || [];
            const subtotal = items.reduce((sum: number, item: any) => {
              const lineAmt = item.line_amount ?? ((item.quantity || 0) * (item.price_per_pc || 0));
              return sum + lineAmt;
            }, 0);
            const hasItems = items.length > 0;
            
            return (
              <div className="space-y-6 py-2">
                {/* Header Info */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">PO Number</span>
                    <p className="font-medium">{selectedOrder.po_number || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">PO Date</span>
                    <p className="font-medium">{selectedOrder.po_date || '—'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Currency</span>
                    <p className="font-medium">{selectedOrder.currency}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-xs uppercase tracking-wide">Total</span>
                    <p className="font-semibold text-lg">
                      {selectedOrder.currency} {(selectedOrder.total_amount || subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Line Items */}
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-2">Line Items</h4>
                  {!hasItems ? (
                    <div className="text-center py-8 border rounded-lg bg-muted/20">
                      <p className="text-muted-foreground">No line items in this order</p>
                    </div>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>Item Code</TableHead>
                            <TableHead className="text-right">Qty</TableHead>
                            <TableHead className="text-right">Price/pc</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {items.map((item: any, idx: number) => {
                            const lineAmount = item.line_amount ?? ((item.quantity || 0) * (item.price_per_pc || 0));
                            return (
                              <TableRow key={idx}>
                                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                                <TableCell className="font-medium">{item.item_code}</TableCell>
                                <TableCell className="text-right">{(item.quantity || 0).toLocaleString()}</TableCell>
                                <TableCell className="text-right">
                                  {item.price_per_pc ? item.price_per_pc.toFixed(4) : '—'}
                                </TableCell>
                                <TableCell className="text-right font-medium">
                                  {lineAmount > 0 ? lineAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                {/* Footer Totals */}
                {hasItems && subtotal > 0 && (
                  <div className="flex justify-end">
                    <div className="w-64 space-y-2 bg-muted/20 p-4 rounded-lg text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {selectedOrder.currency} {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-2 text-base font-semibold">
                        <span>Total</span>
                        <span>
                          {selectedOrder.currency} {(selectedOrder.total_amount || subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <AddCustomerDialog
        open={isAddCustomerDialogOpen}
        onOpenChange={setIsAddCustomerDialogOpen}
        onCustomerAdded={handleCustomerAdded}
      />

      {/* Add Item Dialog */}
      <AddItemDialog
        open={isAddItemDialogOpen}
        onOpenChange={setIsAddItemDialogOpen}
        onItemAdded={handleItemAdded}
      />
    </div>
  );
}
