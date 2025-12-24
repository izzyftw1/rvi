import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Plus, Home, Search, Loader2, ArrowRight, Receipt, Banknote } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "@/components/ui/empty-state";

interface CustomerReceipt {
  id: string;
  receipt_no: string;
  customer_id: string;
  receipt_date: string;
  total_amount: number;
  allocated_amount: number;
  unallocated_amount: number | null;
  payment_method: string;
  bank_reference: string | null;
  bank_name: string | null;
  currency: string | null;
  status: string;
  notes: string | null;
  customer_master?: {
    customer_name: string;
  };
}

interface Customer {
  id: string;
  customer_name: string;
}

export default function Payments() {
  const { toast } = useToast();
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Form state - no invoice selection required
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [receiptDate, setReceiptDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<string>("bank_transfer");
  const [reference, setReference] = useState("");
  const [bankName, setBankName] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadReceipts();
    loadCustomers();
  }, []);

  const loadReceipts = async () => {
    try {
      const { data, error } = await supabase
        .from("customer_receipts")
        .select(`
          *,
          customer_master!customer_receipts_customer_id_fkey(customer_name)
        `)
        .order("receipt_date", { ascending: false });

      if (error) throw error;
      setReceipts(data || []);
    } catch (error: any) {
      console.error("Error loading receipts:", error);
      toast({
        title: "Error",
        description: "Failed to load receipts",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const { data } = await supabase
        .from("customer_master")
        .select("id, customer_name")
        .order("customer_name");

      setCustomers(data || []);
    } catch (error) {
      console.error("Error loading customers:", error);
    }
  };

  const generateReceiptNumber = async (): Promise<string> => {
    const yearSuffix = format(new Date(), "yy");
    const { data: existing } = await supabase
      .from("customer_receipts")
      .select("receipt_no")
      .like("receipt_no", `RCP-%-${yearSuffix}`)
      .order("created_at", { ascending: false })
      .limit(1);

    let nextNumber = 1;
    if (existing && existing.length > 0) {
      const match = existing[0].receipt_no.match(/RCP-(\d+)-/);
      if (match) {
        nextNumber = parseInt(match[1]) + 1;
      }
    }

    return `RCP-${String(nextNumber).padStart(5, "0")}-${yearSuffix}`;
  };

  const handleCreateReceipt = async () => {
    if (!selectedCustomerId || !amount || parseFloat(amount) <= 0) {
      toast({
        title: "Validation Error",
        description: "Please select a customer and enter a valid amount",
        variant: "destructive"
      });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const receiptNo = await generateReceiptNumber();

      const { error } = await supabase
        .from("customer_receipts")
        .insert({
          receipt_no: receiptNo,
          customer_id: selectedCustomerId,
          receipt_date: receiptDate,
          total_amount: parseFloat(amount),
          payment_method: method as any,
          bank_reference: reference || null,
          bank_name: bankName || null,
          currency: currency,
          notes: notes || null,
          created_by: user?.id
        });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Receipt ${receiptNo} recorded. Allocate to invoices in Receipt Allocation.`
      });

      // Reset form
      setSelectedCustomerId("");
      setAmount("");
      setReference("");
      setBankName("");
      setNotes("");
      setDialogOpen(false);

      loadReceipts();
    } catch (error: any) {
      console.error("Error creating receipt:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to record receipt",
        variant: "destructive"
      });
    } finally {
      setCreating(false);
    }
  };

  const getMethodBadge = (method: string | null) => {
    const variants: Record<string, { variant: any; label: string }> = {
      bank_transfer: { variant: "default", label: "Bank Transfer" },
      cheque: { variant: "secondary", label: "Cheque" },
      cash: { variant: "outline", label: "Cash" },
      upi: { variant: "default", label: "UPI" },
      credit_card: { variant: "secondary", label: "Credit Card" },
      other: { variant: "outline", label: "Other" }
    };

    const config = variants[method || ""] || { variant: "outline", label: method || "Unknown" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending Allocation</Badge>;
      case "partially_allocated":
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Partial</Badge>;
      case "fully_allocated":
        return <Badge className="bg-green-600">Fully Allocated</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const filteredReceipts = receipts.filter((receipt) => {
    const searchLower = searchQuery.toLowerCase();
    return (
      receipt.receipt_no?.toLowerCase().includes(searchLower) ||
      receipt.customer_master?.customer_name?.toLowerCase().includes(searchLower) ||
      receipt.bank_reference?.toLowerCase().includes(searchLower)
    );
  });

  const totalReceived = receipts.reduce((sum, r) => sum + Number(r.total_amount), 0);
  const totalUnallocated = receipts.reduce((sum, r) => sum + Number(r.unallocated_amount || 0), 0);
  const pendingCount = receipts.filter(r => r.status === "pending" || r.status === "partially_allocated").length;

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
                <BreadcrumbPage>Bank Receipts</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                <div className="text-sm text-muted-foreground">Total Receipts</div>
              </div>
              <div className="text-2xl font-bold">{receipts.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Banknote className="h-5 w-5 text-green-600" />
                <div className="text-sm text-muted-foreground">Total Received</div>
              </div>
              <div className="text-2xl font-bold text-green-600">
                ₹{totalReceived.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Unallocated Funds</div>
              <div className="text-2xl font-bold text-amber-600">
                ₹{totalUnallocated.toLocaleString()}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Pending Allocation</div>
              <div className="text-2xl font-bold">{pendingCount}</div>
              <Link to="/finance/receipt-allocation" className="text-xs text-primary hover:underline flex items-center gap-1 mt-1">
                Allocate now <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="space-y-4">
            <div className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Bank Receipts</CardTitle>
                <CardDescription>Record receipts independently, then allocate to invoices</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link to="/finance/receipt-allocation">
                    <ArrowRight className="h-4 w-4 mr-2" />
                    Allocate to Invoices
                  </Link>
                </Button>
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Record Receipt
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                      <DialogTitle>Record Bank Receipt</DialogTitle>
                      <DialogDescription>
                        Record a payment received from customer. Invoice allocation is done separately.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Customer *</Label>
                        <Select value={selectedCustomerId} onValueChange={setSelectedCustomerId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select customer" />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((cust) => (
                              <SelectItem key={cust.id} value={cust.id}>
                                {cust.customer_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Receipt Date *</Label>
                          <Input
                            type="date"
                            value={receiptDate}
                            onChange={(e) => setReceiptDate(e.target.value)}
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
                          <Label>Currency</Label>
                          <Select value={currency} onValueChange={setCurrency}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="INR">INR</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Payment Method</Label>
                          <Select value={method} onValueChange={setMethod}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                              <SelectItem value="cheque">Cheque</SelectItem>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="upi">UPI</SelectItem>
                              <SelectItem value="credit_card">Credit Card</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Bank Name</Label>
                          <Input
                            placeholder="e.g., HDFC Bank"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                          />
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
                      <Button onClick={handleCreateReceipt} disabled={creating}>
                        {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Record Receipt
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {/* Search */}
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by receipt no, customer, reference..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading receipts...</div>
            ) : filteredReceipts.length === 0 ? (
              <EmptyState
                icon="finance"
                title={searchQuery ? "No Receipts Match Your Search" : "No Receipts Recorded"}
                description={searchQuery
                  ? "Try adjusting your search criteria."
                  : "Record your first bank receipt by clicking the button above."
                }
                hint="Receipts are recorded first, then allocated to invoices separately."
                action={!searchQuery ? {
                  label: "Record Receipt",
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
                      <TableHead>Receipt #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Unallocated</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredReceipts.map((receipt) => (
                      <TableRow key={receipt.id}>
                        <TableCell className="font-medium">{receipt.receipt_no}</TableCell>
                        <TableCell>{format(new Date(receipt.receipt_date), "MMM dd, yyyy")}</TableCell>
                        <TableCell>{receipt.customer_master?.customer_name || "—"}</TableCell>
                        <TableCell className="text-right font-medium">
                          {receipt.currency} {Number(receipt.total_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {receipt.currency} {Number(receipt.allocated_amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-amber-600">
                          {receipt.currency} {Number(receipt.unallocated_amount || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>{getMethodBadge(receipt.payment_method)}</TableCell>
                        <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                        <TableCell className="text-muted-foreground">{receipt.bank_reference || "—"}</TableCell>
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