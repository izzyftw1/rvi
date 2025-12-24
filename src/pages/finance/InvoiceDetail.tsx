import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Home, ArrowLeft, FileText, Calendar, Phone, Mail, CheckCircle2, AlertTriangle, MinusCircle, Package, Truck, ClipboardList, Lock } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { QuantityLayersDisplay } from "@/components/finance/QuantityLayersDisplay";
import { CloseAdjustedDialog } from "@/components/finance/CloseAdjustedDialog";
import { useUserRole } from "@/hooks/useUserRole";

interface InvoiceItem {
  id: string;
  item_code: string;
  description: string;
  quantity: number;
  so_ordered_qty: number | null;
  rate: number;
  amount: number;
  gst_percent: number;
  gst_amount: number;
  total_line: number;
  dispatch_note_id: string | null;
  dispatch_notes?: {
    packed_qty: number;
    dispatched_qty: number;
    so_ordered_qty: number | null;
  } | null;
}

export default function InvoiceDetail() {
  const { id } = useParams();
  const { hasAnyRole } = useUserRole();
  const [invoice, setInvoice] = useState<any>(null);
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [closureAdjustments, setClosureAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCloseDialog, setShowCloseDialog] = useState(false);

  const canCloseAdjusted = hasAnyRole(['finance_admin', 'admin', 'super_admin']);

  useEffect(() => {
    loadInvoiceData();
  }, [id]);

  const loadInvoiceData = async () => {
    try {
      // Load invoice with customer
      const { data: invData } = await supabase
        .from("invoices")
        .select(`
          *,
          customer_master!customer_id(*)
        `)
        .eq("id", id)
        .single();

      setInvoice(invData);

      // Load invoice items with dispatch notes for quantity layers
      const { data: itemsData } = await supabase
        .from("invoice_items")
        .select(`
          *,
          dispatch_notes!dispatch_note_id(packed_qty, dispatched_qty, so_ordered_qty)
        `)
        .eq("invoice_id", id)
        .order("created_at", { ascending: true });

      setInvoiceItems((itemsData || []) as InvoiceItem[]);
      // Load invoice adjustments
      const { data: adjData } = await supabase
        .from("invoice_adjustments")
        .select(`
          *,
          customer_credit_adjustments!credit_adjustment_id(
            source_invoice_id,
            reason,
            rejection_qty,
            invoices!source_invoice_id(invoice_no)
          )
        `)
        .eq("invoice_id", id)
        .order("applied_at", { ascending: false });

      setAdjustments(adjData || []);

      // Load closure adjustments (immutable audit trail)
      const { data: closureData } = await supabase
        .from("invoice_closure_adjustments")
        .select("*")
        .eq("invoice_id", id)
        .order("closed_at", { ascending: false });

      setClosureAdjustments(closureData || []);
      // Build timeline from payments and follow-ups
      const timelineEvents: any[] = [];

      // Add invoice created event
      timelineEvents.push({
        type: "created",
        date: invData.created_at,
        description: "Invoice created",
        icon: FileText
      });

      // Add payments
      const { data: payments } = await supabase
        .from("payments")
        .select("*")
        .eq("invoice_id", id)
        .order("payment_date", { ascending: false });

      payments?.forEach((payment) => {
        timelineEvents.push({
          type: "payment",
          date: payment.payment_date,
          description: `Payment received: ${payment.method}`,
          amount: payment.amount,
          reference: payment.reference,
          icon: CheckCircle2
        });
      });

      // Add adjustments to timeline
      adjData?.forEach((adj: any) => {
        timelineEvents.push({
          type: "adjustment",
          date: adj.applied_at,
          description: `Rejection adjustment applied`,
          amount: adj.amount,
          source: adj.customer_credit_adjustments?.invoices?.invoice_no,
          reason: adj.customer_credit_adjustments?.reason,
          icon: MinusCircle
        });
      });

      // Add follow-ups
      const { data: followups } = await supabase
        .from("ar_followups")
        .select("*")
        .eq("invoice_id", id)
        .order("followup_date", { ascending: false });

      followups?.forEach((followup) => {
        const icon = followup.channel === 'phone' ? Phone : 
                     followup.channel === 'email' ? Mail : 
                     Calendar;
        
        timelineEvents.push({
          type: "followup",
          date: followup.followup_date,
          description: `Follow-up via ${followup.channel}`,
          outcome: followup.outcome,
          notes: followup.notes,
          icon
        });
      });

      // Sort timeline by date (newest first)
      timelineEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTimeline(timelineEvents);

    } catch (error) {
      console.error("Error loading invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; className?: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      issued: { variant: "default", label: "Issued" },
      part_paid: { variant: "outline", label: "Part Paid" },
      paid: { variant: "default", label: "Paid" },
      overdue: { variant: "destructive", label: "Overdue" },
      short_closed: { variant: "outline", label: "Short Closed" },
      closed_adjusted: { variant: "outline", label: "Closed – Adjusted", className: "border-amber-500 text-amber-700 bg-amber-50" }
    };

    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>;
  };

  const totalAdjustments = adjustments.reduce((sum, adj) => sum + Number(adj.amount), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6 text-center text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-background">
        <div className="p-6 text-center">
          <p className="text-muted-foreground mb-4">Invoice not found</p>
          <Button asChild>
            <Link to="/finance/invoices">Back to Invoices</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">
                    <Home className="h-4 w-4" />
                  </Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/finance/dashboard">Finance</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/finance/invoices">Invoices</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{invoice.invoice_no}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <Button variant="outline" asChild>
            <Link to="/finance/invoices">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Invoices
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Summary */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Invoice Summary</CardTitle>
                  {getStatusBadge(invoice.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Customer</p>
                  <p className="font-medium">{invoice.customer_master?.customer_name}</p>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground">Invoice Date</p>
                  <p className="font-medium">{format(new Date(invoice.invoice_date), 'MMMM dd, yyyy')}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Due Date</p>
                  <p className="font-medium">{format(new Date(invoice.due_date), 'MMMM dd, yyyy')}</p>
                </div>

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground">Subtotal</p>
                  <p className="font-medium">{invoice.currency} {invoice.subtotal?.toLocaleString()}</p>
                </div>

                {invoice.gst_amount > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">GST ({invoice.gst_percent}%)</p>
                    <p className="font-medium">{invoice.currency} {invoice.gst_amount?.toLocaleString()}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground">Gross Amount</p>
                  <p className="text-xl font-bold">{invoice.currency} {invoice.total_amount?.toLocaleString()}</p>
                </div>

                {totalAdjustments > 0 && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">Rejection Adjustment</p>
                    <p className="text-lg font-bold text-amber-600">- {invoice.currency} {totalAdjustments.toLocaleString()}</p>
                  </div>
                )}

                {totalAdjustments > 0 && (
                  <div>
                    <p className="text-sm text-muted-foreground">Net Payable</p>
                    <p className="text-xl font-bold text-primary">{invoice.currency} {(invoice.total_amount - totalAdjustments).toLocaleString()}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <p className="text-sm text-muted-foreground">Paid</p>
                  <p className="font-medium text-green-600">{invoice.currency} {invoice.paid_amount?.toLocaleString()}</p>
                </div>

                <div>
                  <p className="text-sm text-muted-foreground">Balance Due</p>
                  <p className="text-xl font-bold text-destructive">{invoice.currency} {invoice.balance_amount?.toLocaleString()}</p>
                </div>

                {invoice.short_closed && (
                  <Alert className="border-amber-500">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <AlertDescription>
                      <span className="font-medium">Short Closed:</span> {invoice.short_close_reason}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Closed Adjusted Section */}
                {invoice.status === 'closed_adjusted' && closureAdjustments.length > 0 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800 space-y-3">
                    <div className="flex items-center gap-2">
                      <Lock className="h-4 w-4 text-amber-600" />
                      <span className="font-medium text-amber-700 dark:text-amber-300">Closed with Adjustment</span>
                    </div>
                    {closureAdjustments.map((adj: any) => (
                      <div key={adj.id} className="text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Adjustment Amount:</span>
                          <span className="font-medium text-amber-600">{invoice.currency} {Number(adj.adjustment_amount).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reason:</span>
                          <Badge variant="outline" className="capitalize">{adj.adjustment_reason}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Reference:</span>
                          <span>{adj.reference_type?.replace('_', ' ')}</span>
                        </div>
                        {adj.reference_note && (
                          <p className="text-xs text-muted-foreground mt-2 p-2 bg-background rounded">
                            {adj.reference_note}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          Closed on {format(new Date(adj.closed_at), 'MMM dd, yyyy h:mm a')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Close Adjusted Button - Only for finance admin on unpaid invoices */}
                {canCloseAdjusted && 
                 invoice.balance_amount > 0 && 
                 !['paid', 'closed_adjusted', 'void'].includes(invoice.status) && (
                  <>
                    <Separator />
                    <Button 
                      variant="outline" 
                      className="w-full border-amber-500 text-amber-700 hover:bg-amber-50"
                      onClick={() => setShowCloseDialog(true)}
                    >
                      <Lock className="h-4 w-4 mr-2" />
                      Close with Adjustment
                    </Button>
                  </>
                )}

                {invoice.expected_payment_date && (
                  <>
                    <Separator />
                    <div>
                      <p className="text-sm text-muted-foreground">Expected Payment</p>
                      <p className="font-medium">{format(new Date(invoice.expected_payment_date), 'MMMM dd, yyyy')}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Customer Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {invoice.customer_master?.primary_contact_name && (
                  <div>
                    <p className="text-sm text-muted-foreground">Contact</p>
                    <p className="font-medium">{invoice.customer_master.primary_contact_name}</p>
                  </div>
                )}
                {invoice.customer_master?.primary_contact_email && (
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{invoice.customer_master.primary_contact_email}</p>
                  </div>
                )}
                {invoice.customer_master?.primary_contact_phone && (
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <p className="font-medium">{invoice.customer_master.primary_contact_phone}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right: Invoice Items with Quantity Layers */}
          <div className="lg:col-span-2 space-y-6">
            {/* Quantity Summary */}
            {invoiceItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Quantity Layers Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <QuantityLayersDisplay
                    soQty={invoiceItems.reduce((sum, item) => sum + (item.so_ordered_qty || item.dispatch_notes?.so_ordered_qty || 0), 0)}
                    packedQty={invoiceItems.reduce((sum, item) => sum + (item.dispatch_notes?.packed_qty || item.quantity), 0)}
                    dispatchedQty={invoiceItems.reduce((sum, item) => sum + (item.dispatch_notes?.dispatched_qty || item.quantity), 0)}
                    invoicedQty={invoiceItems.reduce((sum, item) => sum + item.quantity, 0)}
                    showSoQty={true}
                    showInvoicedQty={true}
                  />
                  <p className="text-xs text-muted-foreground mt-4">
                    <strong>Rule:</strong> Invoice qty always equals Dispatched qty. SO qty is contractual reference only.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Invoice Line Items */}
            <Card>
              <CardHeader>
                <CardTitle>Invoice Line Items</CardTitle>
              </CardHeader>
              <CardContent>
                {invoiceItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No line items found
                  </div>
                ) : (
                  <div className="rounded-md border overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col items-center">
                              <ClipboardList className="h-4 w-4 mb-1 text-muted-foreground" />
                              <span className="text-xs">SO Qty</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col items-center">
                              <Package className="h-4 w-4 mb-1 text-blue-500" />
                              <span className="text-xs">Packed</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col items-center">
                              <Truck className="h-4 w-4 mb-1 text-green-500" />
                              <span className="text-xs">Dispatched</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-center">
                            <div className="flex flex-col items-center">
                              <FileText className="h-4 w-4 mb-1 text-purple-500" />
                              <span className="text-xs">Invoiced</span>
                            </div>
                          </TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoiceItems.map((item) => {
                          const soQty = item.so_ordered_qty || item.dispatch_notes?.so_ordered_qty || null;
                          const packedQty = item.dispatch_notes?.packed_qty || item.quantity;
                          const dispatchedQty = item.dispatch_notes?.dispatched_qty || item.quantity;
                          const invoicedQty = item.quantity;
                          
                          return (
                            <TableRow key={item.id}>
                              <TableCell>
                                <div>
                                  <p className="font-medium">{item.item_code}</p>
                                  <p className="text-xs text-muted-foreground">{item.description}</p>
                                </div>
                              </TableCell>
                              <TableCell className="text-center text-muted-foreground">
                                {soQty !== null ? soQty.toLocaleString() : "—"}
                              </TableCell>
                              <TableCell className="text-center font-medium text-blue-600">
                                {packedQty.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center font-medium text-green-600">
                                {dispatchedQty.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-center font-medium text-purple-600">
                                {invoicedQty.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right">
                                {invoice.currency} {item.rate?.toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {invoice.currency} {item.amount?.toLocaleString()}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity Timeline */}
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                {timeline.length === 0 ? (
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="font-medium mb-1">No activity recorded</p>
                    <p className="text-sm text-muted-foreground mb-1">
                      <span className="font-medium">Why:</span> No follow-ups or payments logged for this invoice.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">How to populate:</span> Record a payment or log a follow-up action.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {timeline.map((event, idx) => {
                      const Icon = event.icon;
                      return (
                        <div key={idx} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className="rounded-full bg-primary/10 p-2">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>
                            {idx !== timeline.length - 1 && (
                              <div className="w-px h-full bg-border mt-2" />
                            )}
                          </div>
                          <div className="flex-1 pb-6">
                            <p className="font-medium">{event.description}</p>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(event.date), 'MMMM dd, yyyy h:mm a')}
                            </p>
                            {event.amount && (
                              <p className="text-sm font-medium text-green-600 mt-1">
                                {invoice.currency} {event.amount.toLocaleString()}
                                {event.reference && ` • ${event.reference}`}
                              </p>
                            )}
                            {event.outcome && (
                              <p className="text-sm mt-1">
                                <span className="font-medium">Outcome:</span> {event.outcome}
                              </p>
                            )}
                            {event.notes && (
                              <p className="text-sm text-muted-foreground mt-1">{event.notes}</p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Close Adjusted Dialog */}
      {invoice && (
        <CloseAdjustedDialog
          open={showCloseDialog}
          onOpenChange={setShowCloseDialog}
          invoice={{
            id: invoice.id,
            invoice_no: invoice.invoice_no,
            total_amount: invoice.total_amount || 0,
            paid_amount: invoice.paid_amount || 0,
            balance_amount: invoice.balance_amount || 0,
            currency: invoice.currency || 'INR'
          }}
          onSuccess={loadInvoiceData}
        />
      )}
    </div>
  );
}