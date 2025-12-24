import { useState, useEffect } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Truck, FileText, AlertTriangle, CheckCircle2, Edit2, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useUserRole } from "@/hooks/useUserRole";

interface DispatchNoteItem {
  id: string;
  dispatch_note_no: string;
  work_order_id: string;
  sales_order_id: string | null;
  shipment_id: string | null;
  dispatch_id: string | null;
  item_code: string;
  item_description: string | null;
  so_ordered_qty: number | null;
  packed_qty: number;
  dispatched_qty: number;
  rejected_qty: number | null;
  dispatch_date: string;
  unit_rate: number | null;
  currency: string | null;
  invoiced: boolean;
  invoice_id: string | null;
  // Override fields
  override_qty?: number;
  override_reason?: string;
}

interface InvoiceableShipment {
  id: string;
  ship_id: string;
  customer: string;
  customer_id: string | null;
  so_id: string | null;
  so_number: string | null;
  ship_date: string;
  status: string;
  total_dispatched_qty: number;
  total_packed_qty: number;
  total_so_qty: number;
  qty_mismatch: boolean;
  dispatch_notes: DispatchNoteItem[];
  currency: string;
  payment_terms_days: number;
  already_invoiced: boolean;
}

export default function CreateInvoices() {
  const [shipments, setShipments] = useState<InvoiceableShipment[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeTab, setActiveTab] = useState("ready");
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});
  const { hasAnyRole, loading: roleLoading } = useUserRole();
  
  // Only finance_admin or admin can override invoice quantities
  const canOverrideQty = hasAnyRole(['finance_admin', 'admin', 'super_admin']);

  useEffect(() => {
    loadInvoiceableShipments();
  }, []);

  const loadInvoiceableShipments = async () => {
    try {
      // Get all shipments with dispatch_notes (source of truth for invoicing)
      const { data: shipmentsData, error: shipError } = await supabase
        .from("shipments")
        .select("id, ship_id, customer, so_id, ship_date, status")
        .in("status", ["delivered", "in_transit", "shipped", "dispatched"])
        .order("ship_date", { ascending: false });

      if (shipError) throw shipError;

      // Get sales orders for customer info
      const soIds = (shipmentsData || []).map(s => s.so_id).filter(Boolean);
      const { data: salesOrdersData } = soIds.length > 0 
        ? await supabase
            .from("sales_orders")
            .select("id, so_id, customer_id, currency, payment_terms_days")
            .in("id", soIds)
        : { data: [] };

      // Get customer info
      const customerIds = (salesOrdersData || []).map(so => so.customer_id).filter(Boolean);
      const { data: customersData } = customerIds.length > 0
        ? await supabase
            .from("customer_master")
            .select("id, customer_name, payment_terms_days")
            .in("id", customerIds)
        : { data: [] };

      const salesOrderMap: Record<string, any> = {};
      (salesOrdersData || []).forEach((so: any) => {
        salesOrderMap[so.id] = so;
      });

      const customerMap: Record<string, any> = {};
      (customersData || []).forEach((c: any) => {
        customerMap[c.id] = c;
      });

      // Get existing invoices to check which shipments are already invoiced
      const { data: existingInvoices } = await supabase
        .from("invoices")
        .select("shipment_id, so_id");

      const invoicedShipmentIds = new Set(existingInvoices?.filter(i => i.shipment_id).map(i => i.shipment_id));

      // Process each shipment using dispatch_notes as source of truth
      const processedShipments: InvoiceableShipment[] = [];

      for (const shipment of shipmentsData || []) {
        // Get dispatch_notes for this shipment (SOURCE OF TRUTH FOR INVOICING)
        const { data: dispatchNotesData } = await supabase
          .from("dispatch_notes")
          .select("*")
          .eq("shipment_id", shipment.id)
          .eq("invoiced", false);

        if (!dispatchNotesData || dispatchNotesData.length === 0) continue;

        // Calculate totals from dispatch notes
        let totalDispatchedQty = 0;
        let totalPackedQty = 0;
        let totalSoQty = 0;
        const dispatchNotes: DispatchNoteItem[] = [];

        for (const note of dispatchNotesData) {
          totalDispatchedQty += note.dispatched_qty || 0;
          totalPackedQty += note.packed_qty || 0;
          totalSoQty += note.so_ordered_qty || 0;

          dispatchNotes.push({
            id: note.id,
            dispatch_note_no: note.dispatch_note_no,
            work_order_id: note.work_order_id,
            sales_order_id: note.sales_order_id,
            shipment_id: note.shipment_id,
            dispatch_id: note.dispatch_id,
            item_code: note.item_code,
            item_description: note.item_description,
            so_ordered_qty: note.so_ordered_qty,
            packed_qty: note.packed_qty,
            dispatched_qty: note.dispatched_qty,
            rejected_qty: note.rejected_qty,
            dispatch_date: note.dispatch_date,
            unit_rate: note.unit_rate,
            currency: note.currency,
            invoiced: note.invoiced,
            invoice_id: note.invoice_id,
          });
        }

        const salesOrder = shipment.so_id ? salesOrderMap[shipment.so_id] : null;
        const customer = salesOrder?.customer_id ? customerMap[salesOrder.customer_id] : null;

        processedShipments.push({
          id: shipment.id,
          ship_id: shipment.ship_id,
          customer: customer?.customer_name || shipment.customer,
          customer_id: salesOrder?.customer_id || null,
          so_id: shipment.so_id,
          so_number: salesOrder?.so_id || null,
          ship_date: shipment.ship_date,
          status: shipment.status || "unknown",
          total_dispatched_qty: totalDispatchedQty,
          total_packed_qty: totalPackedQty,
          total_so_qty: totalSoQty,
          qty_mismatch: totalDispatchedQty !== totalPackedQty,
          dispatch_notes: dispatchNotes,
          currency: dispatchNotes[0]?.currency || salesOrder?.currency || "USD",
          payment_terms_days: customer?.payment_terms_days || salesOrder?.payment_terms_days || 30,
          already_invoiced: invoicedShipmentIds.has(shipment.id),
        });
      }

      setShipments(processedShipments);
    } catch (error: any) {
      toast.error("Failed to load shipments");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const readyShipments = shipments.filter(s => !s.already_invoiced && !s.qty_mismatch);
  const mismatchShipments = shipments.filter(s => !s.already_invoiced && s.qty_mismatch);
  const invoicedShipments = shipments.filter(s => s.already_invoiced);

  const toggleSelection = (id: string) => {
    const shipment = shipments.find(s => s.id === id);
    if (shipment?.qty_mismatch) {
      toast.error("Cannot invoice: Dispatched qty ≠ Packed qty");
      return;
    }
    if (shipment?.already_invoiced) {
      toast.error("This shipment has already been invoiced");
      return;
    }

    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === readyShipments.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(readyShipments.map(s => s.id)));
    }
  };

  const calculateShipmentTotal = (shipment: InvoiceableShipment) => {
    return shipment.dispatch_notes.reduce((sum, note) => {
      const qty = qtyOverrides[note.id] ?? note.dispatched_qty;
      return sum + (qty * (note.unit_rate || 0));
    }, 0);
  };

  const createInvoices = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one shipment");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const selectedShipments = shipments.filter(s => selected.has(s.id));

      for (const shipment of selectedShipments) {
        // Validate: dispatched qty must equal packed qty
        if (shipment.qty_mismatch) {
          toast.error(`Shipment ${shipment.ship_id}: Dispatch qty ≠ Packed qty. Cannot invoice.`);
          continue;
        }

        // Generate invoice number
        const { data: existingInvoices } = await supabase
          .from("invoices")
          .select("invoice_no")
          .order("created_at", { ascending: false })
          .limit(1);

        let invoiceNo = "INV-001";
        if (existingInvoices && existingInvoices.length > 0) {
          const lastNo = existingInvoices[0].invoice_no;
          const numMatch = lastNo.match(/INV-(\d+)/);
          if (numMatch) {
            const lastNum = parseInt(numMatch[1]);
            invoiceNo = `INV-${String(lastNum + 1).padStart(3, "0")}`;
          }
        }

        const invoiceDate = new Date();
        const dueDate = new Date(invoiceDate);
        dueDate.setDate(dueDate.getDate() + shipment.payment_terms_days);

        // Calculate totals from dispatched quantities
        const subtotal = calculateShipmentTotal(shipment);
        const gstPercent = 18;
        const gstAmount = (subtotal * gstPercent) / 100;
        const totalAmount = subtotal + gstAmount;

        // Check for open customer adjustments to auto-apply (INTERNAL ONLY - not on PDF)
        let internalAdjustmentTotal = 0;
        let internalAdjustmentNotes = '';
        const appliedAdjustmentIds: string[] = [];

        if (shipment.customer_id) {
          const { data: openAdjustments } = await supabase
            .from("customer_credit_adjustments")
            .select("*")
            .eq("customer_id", shipment.customer_id)
            .eq("status", "pending")
            .gt("remaining_amount", 0)
            .order("created_at", { ascending: true });

          if (openAdjustments && openAdjustments.length > 0) {
            let remainingToApply = totalAmount;
            
            for (const adj of openAdjustments) {
              if (remainingToApply <= 0) break;
              
              const applyAmount = Math.min(adj.remaining_amount, remainingToApply);
              internalAdjustmentTotal += applyAmount;
              remainingToApply -= applyAmount;
              
              internalAdjustmentNotes += `${adj.adjustment_type}: ${adj.currency} ${applyAmount.toLocaleString()} (from ${adj.reason}); `;
              appliedAdjustmentIds.push(adj.id);
            }
          }
        }

        // Create invoice linked to shipment
        // Note: total_amount and balance_amount remain unchanged for PDF - adjustment is internal only
        const { data: invoice, error: invoiceError } = await supabase
          .from("invoices")
          .insert({
            invoice_no: invoiceNo,
            shipment_id: shipment.id,
            so_id: shipment.so_id,
            customer_id: shipment.customer_id,
            invoice_date: invoiceDate.toISOString().split('T')[0],
            due_date: dueDate.toISOString().split('T')[0],
            subtotal,
            gst_percent: gstPercent,
            gst_amount: gstAmount,
            total_amount: totalAmount, // PDF total remains full amount
            balance_amount: totalAmount - internalAdjustmentTotal, // Balance reduced by internal adjustment
            paid_amount: internalAdjustmentTotal, // Internal adjustment counts as "paid"
            status: 'issued',
            currency: shipment.currency,
            payment_terms_days: shipment.payment_terms_days,
            created_by: user?.id,
            internal_adjustment_total: internalAdjustmentTotal > 0 ? internalAdjustmentTotal : null,
            internal_adjustment_notes: internalAdjustmentNotes || null
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Mark adjustments as applied
        if (appliedAdjustmentIds.length > 0 && invoice) {
          for (const adjId of appliedAdjustmentIds) {
            await supabase
              .from("customer_credit_adjustments")
              .update({
                status: 'applied',
                applied_to_invoice_id: invoice.id,
                applied_at: new Date().toISOString(),
                remaining_amount: 0
              })
              .eq("id", adjId);
          }
        }

        // Create invoice items from dispatch_notes (SOURCE OF TRUTH - not SO items)
        const dispatchNoteIds: string[] = [];
        for (const note of shipment.dispatch_notes) {
          const invoiceQty = qtyOverrides[note.id] ?? note.dispatched_qty;
          const itemSubtotal = invoiceQty * (note.unit_rate || 0);
          const itemGst = (itemSubtotal * gstPercent) / 100;

          await supabase
            .from("invoice_items")
            .insert({
              invoice_id: invoice.id,
              dispatch_id: note.dispatch_id,
              dispatch_note_id: note.id,
              wo_id: note.work_order_id,
              item_code: note.item_code,
              description: note.item_description || note.item_code,
              quantity: invoiceQty, // DISPATCHED qty from dispatch_notes (or override)
              so_ordered_qty: note.so_ordered_qty, // Original SO qty for reference
              rate: note.unit_rate || 0,
              amount: itemSubtotal,
              gst_percent: gstPercent,
              gst_amount: itemGst,
              total_line: itemSubtotal + itemGst,
              qty_override_by: qtyOverrides[note.id] ? user?.id : null,
              qty_override_at: qtyOverrides[note.id] ? new Date().toISOString() : null,
            });

          dispatchNoteIds.push(note.id);
        }

        // Mark dispatch notes as invoiced
        await supabase
          .from("dispatch_notes")
          .update({ invoiced: true, invoice_id: invoice.id })
          .in("id", dispatchNoteIds);

        // Show info if adjustments were applied
        if (internalAdjustmentTotal > 0) {
          toast.info(`Applied ${shipment.currency} ${internalAdjustmentTotal.toLocaleString()} customer adjustment to ${invoiceNo}`);
        }
      }

      toast.success(`Created ${selected.size} invoice(s) from dispatched quantities`);
      setSelected(new Set());
      loadInvoiceableShipments();
    } catch (error: any) {
      toast.error("Failed to create invoices: " + error.message);
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const ShipmentTable = ({ data, showCheckboxes = false }: { data: InvoiceableShipment[], showCheckboxes?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          {showCheckboxes && (
            <TableHead className="w-12">
              <Checkbox
                checked={selected.size === readyShipments.length && readyShipments.length > 0}
                onCheckedChange={toggleAll}
              />
            </TableHead>
          )}
          <TableHead>Shipment</TableHead>
          <TableHead>Customer</TableHead>
          <TableHead>SO</TableHead>
          <TableHead>Ship Date</TableHead>
          <TableHead className="text-right">Packed Qty</TableHead>
          <TableHead className="text-right">Dispatched Qty</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.length === 0 ? (
          <TableRow>
            <TableCell colSpan={showCheckboxes ? 9 : 8} className="text-center text-muted-foreground py-8">
              No shipments found
            </TableCell>
          </TableRow>
        ) : (
          data.map((shipment) => {
            const total = calculateShipmentTotal(shipment);
            return (
              <TableRow 
                key={shipment.id} 
                className={shipment.qty_mismatch ? "bg-destructive/10" : shipment.already_invoiced ? "bg-muted/50" : ""}
              >
                {showCheckboxes && (
                  <TableCell>
                    <Checkbox
                      checked={selected.has(shipment.id)}
                      onCheckedChange={() => toggleSelection(shipment.id)}
                      disabled={shipment.qty_mismatch || shipment.already_invoiced}
                    />
                  </TableCell>
                )}
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground" />
                    {shipment.ship_id}
                  </div>
                </TableCell>
                <TableCell>{shipment.customer}</TableCell>
                <TableCell>{shipment.so_number || "-"}</TableCell>
                <TableCell>{new Date(shipment.ship_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Package className="h-3 w-3 text-muted-foreground" />
                    {shipment.total_packed_qty.toLocaleString()}
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {shipment.total_dispatched_qty.toLocaleString()}
                  {shipment.qty_mismatch && (
                    <Badge variant="destructive" className="ml-2">Mismatch</Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={shipment.status === "delivered" ? "default" : "secondary"}>
                    {shipment.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {shipment.currency} {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Create Invoices" 
        subtitle="Generate invoices from dispatched shipments (not sales orders)" 
      />
      
      <div className="p-6 space-y-6">
        <Alert>
          <FileText className="h-4 w-4" />
          <AlertTitle>Quantity-Based Invoicing</AlertTitle>
          <AlertDescription>
            Invoices are now created from <strong>dispatched quantities</strong>, not sales order quantities. 
            The dispatched quantity must equal the packed quantity before an invoice can be generated.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Ready to Invoice
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{readyShipments.length}</div>
              <p className="text-sm text-muted-foreground">Shipments with matching quantities</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                Quantity Mismatch
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{mismatchShipments.length}</div>
              <p className="text-sm text-muted-foreground">Dispatch ≠ Packed qty</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Already Invoiced
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{invoicedShipments.length}</div>
              <p className="text-sm text-muted-foreground">Shipments with invoices</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Shipments</CardTitle>
                <CardDescription>Select dispatched shipments to generate invoices</CardDescription>
              </div>
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
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4">
                  <TabsTrigger value="ready">
                    Ready ({readyShipments.length})
                  </TabsTrigger>
                  <TabsTrigger value="mismatch">
                    Mismatch ({mismatchShipments.length})
                  </TabsTrigger>
                  <TabsTrigger value="invoiced">
                    Invoiced ({invoicedShipments.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="ready">
                  <ShipmentTable data={readyShipments} showCheckboxes />
                </TabsContent>

                <TabsContent value="mismatch">
                  {mismatchShipments.length > 0 && (
                    <Alert variant="destructive" className="mb-4">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Quantity Mismatch Detected</AlertTitle>
                      <AlertDescription>
                        These shipments cannot be invoiced because the dispatched quantity doesn't match the packed quantity.
                        Please reconcile before invoicing.
                      </AlertDescription>
                    </Alert>
                  )}
                  <ShipmentTable data={mismatchShipments} />
                </TabsContent>

                <TabsContent value="invoiced">
                  <ShipmentTable data={invoicedShipments} />
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
