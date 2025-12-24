import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Plus, Home, Search, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";

interface Payment {
  id: string;
  invoice_id: string;
  payment_date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  invoice?: {
    invoice_no: string;
    currency: string;
    total_amount: number;
    balance_amount: number;
    customer_master?: {
      customer_name: string;
    };
  };
}

interface Invoice {
  id: string;
  invoice_no: string;
  currency: string;
  total_amount: number;
  balance_amount: number;
  status: string;
  customer_master?: {
    customer_name: string;
  };
}

export default function Payments() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [paymentDate, setPaymentDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("wire");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadPayments();
    loadInvoices();
  }, []);

  const loadPayments = async () => {
    try {
      const { data, error } = await supabase
        .from("payments")
        .select(`
          *,
          invoice:invoices!payments_invoice_id_fkey(
            invoice_no,
            currency,
            total_amount,
            balance_amount,
            customer_master!invoices_customer_id_fkey(customer_name)
          )
        `)
        .order("payment_date", { ascending: false });

      if (error) throw error;
      setPayments(data || []);
    } catch (error: any) {
      console.error("Error loading payments:", error);
      toast({
        title: "Error",
        description: "Failed to load payments",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadInvoices = async () => {
    try {
      const { data } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          currency,
          total_amount,
          balance_amount,
          status,
          customer_master!customer_id(customer_name)
        `)
        .in("status", ["issued", "part_paid", "overdue"])
        .gt("balance_amount", 0)
        .order("invoice_no");

      setInvoices(data || []);
    } catch (error) {
      console.error("Error loading invoices:", error);
    }
  };

  const handleCreatePayment = async () => {
    if (!selectedInvoiceId || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please select an invoice and enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    const selectedInvoice = invoices.find(inv => inv.id === selectedInvoiceId);
    if (selectedInvoice && parseFloat(amount) > selectedInvoice.balance_amount) {
      toast({
        title: "Validation Error",
        description: `Payment amount cannot exceed outstanding balance of ${selectedInvoice.currency} ${selectedInvoice.balance_amount.toLocaleString()}`,
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("payments")
        .insert({
          invoice_id: selectedInvoiceId,
          payment_date: paymentDate,
          amount: parseFloat(amount),
          method: method as any,
          reference: reference || null,
          notes: notes || null,
          created_by: user?.id
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Payment recorded successfully"
      });

      // Reset form
      setSelectedInvoiceId("");
      setAmount("");
      setReference("");
      setNotes("");
      setDialogOpen(false);

      // Reload data
      loadPayments();
      loadInvoices();
    } catch (error: any) {
      console.error("Error creating payment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record payment",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const getMethodBadge = (method: string | null) => {
    const variants: Record<string, { variant: any; label: string }> = {
      wire: { variant: "default", label: "Wire Transfer" },
      check: { variant: "secondary", label: "Check" },
      cash: { variant: "outline", label: "Cash" },
      upi: { variant: "default", label: "UPI" },
      card: { variant: "secondary", label: "Card" }
    };

    const config = variants[method || ""] || { variant: "outline", label: method || "Unknown" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const filteredPayments = payments.filter((payment) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      payment.invoice?.invoice_no?.toLowerCase().includes(searchLower) ||
      payment.invoice?.customer_master?.customer_name?.toLowerCase().includes(searchLower) ||
      payment.reference?.toLowerCase().includes(searchLower)
    );
  });

  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center justify-between">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/"><Home className="h-4 w-4" /></Link>
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
                <BreadcrumbPage>Payments</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Summary Card */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Payments</div>
              <div className="text-2xl font-bold">{payments.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Total Collected</div>
              <div className="text-2xl font-bold text-green-600">
                ₹{totalCollected.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Invoices Pending Payment</div>
              <div className="text-2xl font-bold text-amber-600">{invoices.length}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-row items-center justify-between">
              <CardTitle>Payment Receipts</CardTitle>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Invoice *</Label>
                      <Select value={selectedInvoiceId} onValueChange={setSelectedInvoiceId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select invoice" />
                        </SelectTrigger>
                        <SelectContent>
                          {invoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>
                              {inv.invoice_no} - {inv.customer_master?.customer_name} ({inv.currency} {inv.balance_amount.toLocaleString()} due)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Payment Date *</Label>
                        <Input
                          type="date"
                          value={paymentDate}
                          onChange={(e) => setPaymentDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Amount *</Label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Payment Method</Label>
                        <Select value={method} onValueChange={setMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="wire">Wire Transfer</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="upi">UPI</SelectItem>
                            <SelectItem value="card">Card</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Reference No.</Label>
                        <Input
                          placeholder="Transaction ID / Check No."
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea
                        placeholder="Additional notes..."
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleCreatePayment} disabled={creating}>
                      {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Record Payment
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice, customer, reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading payments...</div>
            ) : filteredPayments.length === 0 ? (
              <EmptyState
                icon="finance"
                title={searchQuery ? "No Payments Match Your Search" : "No Payments Recorded"}
                description={searchQuery
                  ? "Try adjusting your search criteria."
                  : "Record your first payment by clicking the button above."
                }
                hint="Payments are linked to invoices and automatically update invoice balances."
                action={!searchQuery ? {
                  label: "Record Payment",
                  onClick: () => setDialogOpen(true),
                  variant: "default"
                } : {
                  label: "Clear Search",
                  onClick: () => setSearchQuery(""),
                  variant: "outline"
                }}
              />
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{format(new Date(payment.payment_date), "MMM dd, yyyy")}</TableCell>
                        <TableCell className="font-medium">
                          <Link 
                            to={`/finance/invoices/${payment.invoice_id}`}
                            className="text-primary hover:underline"
                          >
                            {payment.invoice?.invoice_no}
                          </Link>
                        </TableCell>
                        <TableCell>{payment.invoice?.customer_master?.customer_name || "—"}</TableCell>
                        <TableCell className="text-right font-medium text-green-600">
                          <div className="flex items-center justify-end gap-1">
                            <CheckCircle2 className="h-3 w-3" />
                            {payment.invoice?.currency} {Number(payment.amount).toLocaleString()}
                          </div>
                        </TableCell>
                        <TableCell>{getMethodBadge(payment.method)}</TableCell>
                        <TableCell className="text-muted-foreground">{payment.reference || "—"}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {payment.notes || "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}