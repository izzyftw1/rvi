import { useState, useEffect } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, Truck, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  qty_mismatch: boolean;
  dispatches: {
    id: string;
    wo_id: string;
    wo_number: string;
    item_code: string;
    quantity: number;
    packed_qty: number;
    rate: number;
    currency: string;
  }[];
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

  useEffect(() => {
    loadInvoiceableShipments();
  }, []);

  const loadInvoiceableShipments = async () => {
    try {
      // Get all shipments - simplified query to avoid type recursion
      const { data: shipmentsData, error: shipError } = await supabase
        .from("shipments")
        .select("id, ship_id, customer, so_id, ship_date, status")
        .in("status", ["delivered", "in_transit", "shipped"])
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
      const invoicedSOIds = new Set(existingInvoices?.filter(i => i.so_id).map(i => i.so_id));

      // Process each shipment
      const processedShipments: InvoiceableShipment[] = [];

      for (const shipment of shipmentsData || []) {
        // Get dispatches for this shipment - simplified query
        const { data: dispatchesData } = await supabase
          .from("dispatches")
          .select("id, wo_id, quantity, carton_id")
          .eq("shipment_id", shipment.id);

        if (!dispatchesData || dispatchesData.length === 0) continue;

        // Get work orders and cartons for these dispatches
        const woIds = dispatchesData.map(d => d.wo_id).filter(Boolean);
        const cartonIds = dispatchesData.map(d => d.carton_id).filter(Boolean);

        const { data: workOrdersData } = woIds.length > 0
          ? await supabase
              .from("work_orders")
              .select("id, wo_number, item_code, customer_id, so_id, financial_snapshot")
              .in("id", woIds)
          : { data: [] };

        const { data: cartonsData } = cartonIds.length > 0
          ? await supabase
              .from("cartons")
              .select("id, quantity")
              .in("id", cartonIds)
          : { data: [] };

        const workOrderMap: Record<string, any> = {};
        (workOrdersData || []).forEach((wo: any) => {
          workOrderMap[wo.id] = wo;
        });

        const cartonMap: Record<string, number> = {};
        (cartonsData || []).forEach((c: any) => {
          cartonMap[c.id] = c.quantity || 0;
        });

        // Calculate totals and check for mismatches
        let totalDispatchedQty = 0;
        let totalPackedQty = 0;
        const dispatches: InvoiceableShipment["dispatches"] = [];

        for (const dispatch of dispatchesData) {
          const wo = workOrderMap[dispatch.wo_id] || {};
          const packedQty = dispatch.carton_id ? (cartonMap[dispatch.carton_id] || 0) : 0;
          
          // Get pricing from financial_snapshot or default
          const financialSnapshot = wo.financial_snapshot as any;
          const rate = financialSnapshot?.line_item?.price_per_pc || 0;
          const currency = financialSnapshot?.currency || "USD";

          totalDispatchedQty += dispatch.quantity;
          totalPackedQty += packedQty;

          dispatches.push({
            id: dispatch.id,
            wo_id: dispatch.wo_id,
            wo_number: wo.wo_number || "N/A",
            item_code: wo.item_code || "N/A",
            quantity: dispatch.quantity,
            packed_qty: packedQty,
            rate,
            currency
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
          qty_mismatch: totalDispatchedQty !== totalPackedQty,
          dispatches,
          currency: salesOrder?.currency || "USD",
          payment_terms_days: customer?.payment_terms_days || salesOrder?.payment_terms_days || 30,
          already_invoiced: invoicedShipmentIds.has(shipment.id) || (shipment.so_id && invoicedSOIds.has(shipment.so_id))
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
    return shipment.dispatches.reduce((sum, d) => sum + (d.quantity * d.rate), 0);
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

        // Create invoice linked to shipment
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
            total_amount: totalAmount,
            balance_amount: totalAmount,
            paid_amount: 0,
            status: 'issued',
            currency: shipment.currency,
            payment_terms_days: shipment.payment_terms_days,
            created_by: user?.id
          })
          .select()
          .single();

        if (invoiceError) throw invoiceError;

        // Create invoice items from dispatch records (not SO items)
        for (const dispatch of shipment.dispatches) {
          const itemSubtotal = dispatch.quantity * dispatch.rate;
          const itemGst = (itemSubtotal * gstPercent) / 100;

          await supabase
            .from("invoice_items")
            .insert({
              invoice_id: invoice.id,
              dispatch_id: dispatch.id,
              wo_id: dispatch.wo_id,
              item_code: dispatch.item_code,
              description: `${dispatch.item_code} - WO: ${dispatch.wo_number}`,
              quantity: dispatch.quantity, // This is DISPATCHED quantity
              rate: dispatch.rate,
              amount: itemSubtotal,
              gst_percent: gstPercent,
              gst_amount: itemGst,
              total_line: itemSubtotal + itemGst
            });
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
