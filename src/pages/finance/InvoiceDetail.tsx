import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Home, ArrowLeft, FileText, Calendar, Phone, Mail, CheckCircle2, AlertTriangle, MinusCircle } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [adjustments, setAdjustments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
    const variants: Record<string, { variant: any; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      issued: { variant: "default", label: "Issued" },
      part_paid: { variant: "outline", label: "Part Paid" },
      paid: { variant: "default", label: "Paid" },
      overdue: { variant: "destructive", label: "Overdue" },
      short_closed: { variant: "outline", label: "Short Closed" }
    };

    const config = variants[status] || { variant: "secondary", label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
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

          {/* Right: Timeline */}
          <div className="lg:col-span-2">
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
    </div>
  );
}