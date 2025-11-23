import { useState, useEffect } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function CreateInvoices() {
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [advanceReceived, setAdvanceReceived] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSalesOrders();
  }, []);

  const loadSalesOrders = async () => {
    try {
      // Get approved sales orders that don't have invoices yet
      const { data: orders } = await supabase
        .from("sales_orders")
        .select(`
          *,
          customer_master!customer_id(customer_name, payment_terms_days)
        `)
        .eq("status", "approved")
        .order("created_at", { ascending: false });

      // Filter out orders that already have invoices
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("so_id");

      const invoicedSOIds = new Set(existingInvoices?.map(inv => inv.so_id));
      const uninvoicedOrders = orders?.filter(order => !invoicedSOIds.has(order.id)) || [];

      setSalesOrders(uninvoicedOrders);
      
      // Initialize advance received state based on sales_orders.advance_payment_received
      const advanceMap: Record<string, boolean> = {};
      uninvoicedOrders.forEach(order => {
        advanceMap[order.id] = order.advance_payment_received || false;
      });
      setAdvanceReceived(advanceMap);
    } catch (error: any) {
      toast.error("Failed to load sales orders");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === salesOrders.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(salesOrders.map(so => so.id)));
    }
  };

  const toggleAdvanceReceived = (orderId: string) => {
    setAdvanceReceived(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  const calculateAdvanceAmount = (order: any) => {
    const totalAmount = Number(order.total_amount) || 0;
    const advancePercent = Number(order.advance_payment_percent) || 0;
    return (totalAmount * advancePercent) / 100;
  };

  const createInvoices = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one sales order");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const selectedOrders = salesOrders.filter(so => selected.has(so.id));
      
      for (const order of selectedOrders) {
        // Generate invoice number
        const { data: existingInvoices } = await supabase
          .from("invoices")
          .select("invoice_no")
          .order("created_at", { ascending: false })
          .limit(1);

        let invoiceNo = "INV-001";
        if (existingInvoices && existingInvoices.length > 0) {
          const lastNo = existingInvoices[0].invoice_no;
          const lastNum = parseInt(lastNo.split("-")[1]);
          invoiceNo = `INV-${String(lastNum + 1).padStart(3, "0")}`;
        }

        const invoiceDate = new Date();
        const paymentTerms = order.customer_master?.payment_terms_days || order.payment_terms_days || 30;
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + paymentTerms);

        // Calculate totals
        const subtotal = Number(order.total_amount) || 0;
        const gstPercent = 18; // Default GST
        const gstAmount = (subtotal * gstPercent) / 100;
        const totalAmount = subtotal + gstAmount;

        // Calculate advance payment
        const advanceAmount = calculateAdvanceAmount(order);
        const advanceWithGst = advanceAmount * (1 + gstPercent / 100);
        const isAdvanceReceived = advanceReceived[order.id] || false;
        
        // Adjust balance based on advance
        const paidAmount = isAdvanceReceived ? advanceWithGst : 0;
        const balanceAmount = totalAmount - paidAmount;

        // Create invoice
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            invoice_no: invoiceNo,
            so_id: order.id,
            customer_id: order.customer_id,
            invoice_date: invoiceDate.toISOString().split('T')[0],
            due_date: dueDate.toISOString().split('T')[0],
            subtotal: subtotal,
            gst_percent: gstPercent,
            gst_amount: gstAmount,
            total_amount: totalAmount,
            balance_amount: balanceAmount,
            paid_amount: paidAmount,
            status: paidAmount > 0 ? 'part_paid' : 'issued',
            currency: order.currency || 'USD',
            payment_terms_days: paymentTerms,
            created_by: user?.id
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Create invoice items from sales order items
        if (order.items && invoice) {
          const items = typeof order.items === 'string' 
            ? JSON.parse(order.items) 
            : Array.isArray(order.items) 
            ? order.items 
            : [];
          
          for (const item of items) {
            const itemSubtotal = Number(item.line_amount) || (Number(item.quantity) * Number(item.price_per_pc || 0));
            const itemGst = (itemSubtotal * gstPercent) / 100;
            
            const { error: itemError } = await supabase
              .from("invoice_items")
              .insert({
                invoice_id: invoice.id,
                description: `${item.item_code || 'Item'} - ${item.drawing_number || ''}`,
                quantity: item.quantity || 0,
                rate: item.price_per_pc || 0,
                amount: itemSubtotal,
                gst_percent: gstPercent,
                gst_amount: itemGst,
                total_line: itemSubtotal + itemGst
              });
            
            if (itemError) {
              console.error("Error creating invoice item:", itemError);
            }
          }
          
          // Add advance payment line item if applicable
          if (isAdvanceReceived && advanceAmount > 0) {
            await supabase
              .from("invoice_items")
              .insert({
                invoice_id: invoice.id,
                description: "Advance Payment Received",
                quantity: 1,
                rate: -advanceAmount,
                amount: -advanceAmount,
                gst_percent: gstPercent,
                gst_amount: -(advanceAmount * gstPercent / 100),
                total_line: -advanceWithGst
              });
          }
        }

        // Update sales order to mark advance as received
        if (isAdvanceReceived && !order.advance_payment_received) {
          await supabase
            .from("sales_orders")
            .update({ advance_payment_received: true })
            .eq("id", order.id);
        }
      }

      toast.success(`Created ${selected.size} invoice(s) successfully`);
      setSelected(new Set());
      loadSalesOrders();
    } catch (error: any) {
      toast.error("Failed to create invoices: " + error.message);
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Create Invoices" 
        subtitle="Generate invoices from approved sales orders" 
      />
      
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Approved Sales Orders (Not Yet Invoiced)</CardTitle>
              <Button 
                onClick={createInvoices} 
                disabled={selected.size === 0 || creating}
              >
                {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create {selected.size > 0 ? `${selected.size} ` : ''}Invoice{selected.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : salesOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No uninvoiced sales orders found. All approved sales orders have been invoiced.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selected.size === salesOrders.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>SO ID</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>PO Number</TableHead>
                    <TableHead className="text-right">Total Amount</TableHead>
                    <TableHead className="text-right">Advance</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                    <TableHead>Advance Received</TableHead>
                    <TableHead>Payment Terms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesOrders.map((order) => {
                    const totalAmount = Number(order.total_amount) || 0;
                    const gstPercent = 18;
                    const totalWithGst = totalAmount * (1 + gstPercent / 100);
                    const advanceAmount = calculateAdvanceAmount(order);
                    const advanceWithGst = advanceAmount * (1 + gstPercent / 100);
                    const hasAdvance = advanceAmount > 0;
                    const isAdvanceReceived = advanceReceived[order.id] || false;
                    const balanceDue = isAdvanceReceived ? totalWithGst - advanceWithGst : totalWithGst;

                    return (
                      <TableRow key={order.id} className={hasAdvance ? "bg-accent/50" : ""}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(order.id)}
                            onCheckedChange={() => toggleSelection(order.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{order.so_id}</TableCell>
                        <TableCell>{order.customer_master?.customer_name || order.customer}</TableCell>
                        <TableCell>{order.po_number}</TableCell>
                        <TableCell className="text-right font-medium">
                          {order.currency} {totalWithGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right">
                          {hasAdvance ? (
                            <div className="flex flex-col items-end">
                              <span className="text-sm font-medium text-green-600">
                                {order.currency} {advanceWithGst.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                ({order.advance_payment_percent}%)
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">None</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {order.currency} {balanceDue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          {hasAdvance ? (
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={isAdvanceReceived}
                                onCheckedChange={() => toggleAdvanceReceived(order.id)}
                              />
                              <Label className="text-xs">
                                {isAdvanceReceived ? (
                                  <span className="flex items-center gap-1 text-green-600">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Received
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-amber-600">
                                    <AlertCircle className="h-3 w-3" />
                                    Pending
                                  </span>
                                )}
                              </Label>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">N/A</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.customer_master?.payment_terms_days || order.payment_terms_days || 30} days
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}