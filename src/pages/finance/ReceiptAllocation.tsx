import { useState, useEffect } from "react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Receipt, FileText, CheckCircle2, AlertCircle, Banknote, ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from "date-fns";
import { TdsPreview } from "@/components/finance/TdsPreview";
import { createReceiptTdsRecord } from "@/hooks/useTdsCalculation";

interface CustomerReceipt {
  id: string;
  receipt_no: string;
  customer_id: string;
  customer_name: string;
  receipt_date: string;
  total_amount: number;
  allocated_amount: number;
  unallocated_amount: number;
  payment_method: string;
  bank_reference: string | null;
  currency: string;
  status: string;
}

interface Invoice {
  id: string;
  invoice_no: string;
  customer_id: string;
  customer_name: string;
  invoice_date: string;
  due_date: string;
  total_amount: number;
  paid_amount: number;
  balance_amount: number;
  currency: string;
  status: string;
  selected?: boolean;
  allocate_amount?: number;
}

interface Allocation {
  id: string;
  receipt_id: string;
  receipt_no: string;
  invoice_id: string;
  invoice_no: string;
  allocated_amount: number;
  allocation_date: string;
}

export default function ReceiptAllocation() {
  const [receipts, setReceipts] = useState<CustomerReceipt[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [allocating, setAllocating] = useState(false);
  
  // Receipt creation dialog
  const [showCreateReceipt, setShowCreateReceipt] = useState(false);
  const [newReceipt, setNewReceipt] = useState({
    customer_id: "",
    receipt_date: format(new Date(), "yyyy-MM-dd"),
    total_amount: "",
    payment_method: "bank_transfer",
    bank_reference: "",
    bank_name: "",
    currency: "USD",
    notes: ""
  });
  
  // Allocation dialog
  const [showAllocate, setShowAllocate] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<CustomerReceipt | null>(null);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load customers
      const { data: customersData } = await supabase
        .from("customer_master")
        .select("id, customer_name")
        .order("customer_name");
      setCustomers(customersData || []);

      // Load receipts
      const { data: receiptsData } = await supabase
        .from("customer_receipts")
        .select("id, receipt_no, customer_id, receipt_date, total_amount, allocated_amount, unallocated_amount, payment_method, bank_reference, currency, status")
        .order("receipt_date", { ascending: false });

      // Enrich with customer names
      const customerMap: Record<string, string> = {};
      (customersData || []).forEach(c => { customerMap[c.id] = c.customer_name; });

      const enrichedReceipts = (receiptsData || []).map(r => ({
        ...r,
        customer_name: customerMap[r.customer_id] || "Unknown"
      }));
      setReceipts(enrichedReceipts);

      // Load invoices with outstanding balance
      const { data: invoicesData } = await supabase
        .from("invoices")
        .select("id, invoice_no, customer_id, invoice_date, due_date, total_amount, paid_amount, balance_amount, currency, status")
        .gt("balance_amount", 0)
        .order("due_date", { ascending: true });

      const enrichedInvoices = (invoicesData || []).map(inv => ({
        ...inv,
        customer_name: customerMap[inv.customer_id] || "Unknown"
      }));
      setInvoices(enrichedInvoices);

      // Load recent allocations
      const { data: allocationsData } = await supabase
        .from("receipt_allocations")
        .select("id, receipt_id, invoice_id, allocated_amount, allocation_date")
        .order("allocation_date", { ascending: false })
        .limit(50);

      // Enrich allocations
      const receiptMap: Record<string, string> = {};
      (receiptsData || []).forEach(r => { receiptMap[r.id] = r.receipt_no; });
      const invoiceMap: Record<string, string> = {};
      (invoicesData || []).forEach(i => { invoiceMap[i.id] = i.invoice_no; });

      const enrichedAllocations = (allocationsData || []).map(a => ({
        ...a,
        receipt_no: receiptMap[a.receipt_id] || "Unknown",
        invoice_no: invoiceMap[a.invoice_id] || "Unknown"
      }));
      setAllocations(enrichedAllocations);

    } catch (error: any) {
      toast.error("Failed to load data");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const createReceipt = async () => {
    if (!newReceipt.customer_id || !newReceipt.total_amount) {
      toast.error("Please fill in required fields");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Generate receipt number
      const { data: existing } = await supabase
        .from("customer_receipts")
        .select("receipt_no")
        .order("created_at", { ascending: false })
        .limit(1);

      let receiptNo = "RCP-001";
      if (existing && existing.length > 0) {
        const match = existing[0].receipt_no.match(/RCP-(\d+)/);
        if (match) {
          receiptNo = `RCP-${String(parseInt(match[1]) + 1).padStart(3, "0")}`;
        }
      }

      const { error } = await supabase
        .from("customer_receipts")
        .insert({
          receipt_no: receiptNo,
          customer_id: newReceipt.customer_id,
          receipt_date: newReceipt.receipt_date,
          total_amount: parseFloat(newReceipt.total_amount),
          payment_method: newReceipt.payment_method as any,
          bank_reference: newReceipt.bank_reference || null,
          bank_name: newReceipt.bank_name || null,
          currency: newReceipt.currency,
          notes: newReceipt.notes || null,
          created_by: user?.id
        });

      if (error) throw error;

      // Auto-create TDS record for domestic customers
      await createReceiptTdsRecord({
        customerId: newReceipt.customer_id,
        receiptId: receiptNo,
        grossAmount: parseFloat(newReceipt.total_amount),
        transactionDate: newReceipt.receipt_date,
        createdBy: user?.id,
      });

      toast.success(`Receipt ${receiptNo} created`);
      setShowCreateReceipt(false);
      setNewReceipt({
        customer_id: "",
        receipt_date: format(new Date(), "yyyy-MM-dd"),
        total_amount: "",
        payment_method: "bank_transfer",
        bank_reference: "",
        bank_name: "",
        currency: "USD",
        notes: ""
      });
      loadData();
    } catch (error: any) {
      toast.error("Failed to create receipt: " + error.message);
    } finally {
      setCreating(false);
    }
  };

  const openAllocateDialog = async (receipt: CustomerReceipt) => {
    setSelectedReceipt(receipt);
    
    // Load invoices for this customer with outstanding balance
    const { data: custInvoices } = await supabase
      .from("invoices")
      .select("id, invoice_no, customer_id, invoice_date, due_date, total_amount, paid_amount, balance_amount, currency, status")
      .eq("customer_id", receipt.customer_id)
      .gt("balance_amount", 0)
      .order("due_date", { ascending: true });

    const customerName = customers.find(c => c.id === receipt.customer_id)?.customer_name || "Unknown";
    
    const invoicesWithSelection = (custInvoices || []).map(inv => ({
      ...inv,
      customer_name: customerName,
      selected: false,
      allocate_amount: 0
    }));

    setCustomerInvoices(invoicesWithSelection);
    setShowAllocate(true);
  };

  const toggleInvoiceSelection = (invoiceId: string) => {
    setCustomerInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        return { ...inv, selected: !inv.selected, allocate_amount: inv.selected ? 0 : inv.balance_amount };
      }
      return inv;
    }));
  };

  const updateAllocationAmount = (invoiceId: string, amount: number) => {
    setCustomerInvoices(prev => prev.map(inv => {
      if (inv.id === invoiceId) {
        const maxAmount = inv.balance_amount;
        return { ...inv, allocate_amount: Math.min(amount, maxAmount) };
      }
      return inv;
    }));
  };

  const autoAllocateFIFO = () => {
    if (!selectedReceipt) return;
    
    let remaining = selectedReceipt.unallocated_amount;
    
    setCustomerInvoices(prev => prev.map(inv => {
      if (remaining <= 0) return { ...inv, selected: false, allocate_amount: 0 };
      
      const toAllocate = Math.min(remaining, inv.balance_amount);
      remaining -= toAllocate;
      
      return {
        ...inv,
        selected: toAllocate > 0,
        allocate_amount: toAllocate
      };
    }));
  };

  const getTotalAllocation = () => {
    return customerInvoices
      .filter(inv => inv.selected && inv.allocate_amount && inv.allocate_amount > 0)
      .reduce((sum, inv) => sum + (inv.allocate_amount || 0), 0);
  };

  const saveAllocations = async () => {
    if (!selectedReceipt) return;

    const selectedInvoices = customerInvoices.filter(inv => inv.selected && inv.allocate_amount && inv.allocate_amount > 0);
    
    if (selectedInvoices.length === 0) {
      toast.error("Please select at least one invoice");
      return;
    }

    const totalAlloc = getTotalAllocation();
    if (totalAlloc > selectedReceipt.unallocated_amount) {
      toast.error("Total allocation exceeds unallocated amount");
      return;
    }

    setAllocating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      for (const inv of selectedInvoices) {
        const { error } = await supabase
          .from("receipt_allocations")
          .insert({
            receipt_id: selectedReceipt.id,
            invoice_id: inv.id,
            allocated_amount: inv.allocate_amount,
            allocated_by: user?.id
          });

        if (error) throw error;
      }

      toast.success(`Allocated ${selectedReceipt.currency} ${totalAlloc.toLocaleString()} across ${selectedInvoices.length} invoice(s)`);
      setShowAllocate(false);
      setSelectedReceipt(null);
      loadData();
    } catch (error: any) {
      toast.error("Failed to save allocations: " + error.message);
    } finally {
      setAllocating(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "partially_allocated":
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Partial</Badge>;
      case "fully_allocated":
        return <Badge className="bg-green-600">Fully Allocated</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingReceipts = receipts.filter(r => r.status === "pending" || r.status === "partially_allocated");
  const completedReceipts = receipts.filter(r => r.status === "fully_allocated");

  const totalUnallocated = pendingReceipts.reduce((sum, r) => sum + r.unallocated_amount, 0);
  const totalOutstanding = invoices.reduce((sum, inv) => sum + inv.balance_amount, 0);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Receipt Allocation" 
        subtitle="Allocate bank receipts to multiple invoices" 
      />
      
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Receipt className="h-5 w-5 text-primary" />
                Pending Receipts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{pendingReceipts.length}</div>
              <p className="text-sm text-muted-foreground">Awaiting allocation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Banknote className="h-5 w-5 text-amber-600" />
                Unallocated Funds
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">${totalUnallocated.toLocaleString()}</div>
              <p className="text-sm text-muted-foreground">Ready to allocate</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-600" />
                Outstanding Invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{invoices.length}</div>
              <p className="text-sm text-muted-foreground">${totalOutstanding.toLocaleString()} pending</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Completed
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{completedReceipts.length}</div>
              <p className="text-sm text-muted-foreground">Fully allocated</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Bank Receipts</CardTitle>
                <CardDescription>Record and allocate customer payments</CardDescription>
              </div>
              <Button onClick={() => setShowCreateReceipt(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Record Receipt
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <Tabs defaultValue="pending">
                <TabsList className="mb-4">
                  <TabsTrigger value="pending">Pending ({pendingReceipts.length})</TabsTrigger>
                  <TabsTrigger value="completed">Completed ({completedReceipts.length})</TabsTrigger>
                  <TabsTrigger value="allocations">Recent Allocations</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                        <TableHead className="text-right">Unallocated</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingReceipts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No pending receipts
                          </TableCell>
                        </TableRow>
                      ) : (
                        pendingReceipts.map(receipt => (
                          <TableRow key={receipt.id}>
                            <TableCell className="font-medium">{receipt.receipt_no}</TableCell>
                            <TableCell>{receipt.customer_name}</TableCell>
                            <TableCell>{new Date(receipt.receipt_date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              {receipt.currency} {receipt.total_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right text-green-600">
                              {receipt.currency} {receipt.allocated_amount.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right font-medium text-amber-600">
                              {receipt.currency} {receipt.unallocated_amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                            <TableCell>
                              <Button 
                                size="sm" 
                                onClick={() => openAllocateDialog(receipt)}
                                disabled={receipt.unallocated_amount <= 0}
                              >
                                <ArrowRight className="mr-1 h-4 w-4" />
                                Allocate
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="completed">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {completedReceipts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No completed receipts
                          </TableCell>
                        </TableRow>
                      ) : (
                        completedReceipts.map(receipt => (
                          <TableRow key={receipt.id}>
                            <TableCell className="font-medium">{receipt.receipt_no}</TableCell>
                            <TableCell>{receipt.customer_name}</TableCell>
                            <TableCell>{new Date(receipt.receipt_date).toLocaleDateString()}</TableCell>
                            <TableCell className="text-right">
                              {receipt.currency} {receipt.total_amount.toLocaleString()}
                            </TableCell>
                            <TableCell>{receipt.bank_reference || "-"}</TableCell>
                            <TableCell>{getStatusBadge(receipt.status)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="allocations">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Receipt</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allocations.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                            No allocations yet
                          </TableCell>
                        </TableRow>
                      ) : (
                        allocations.map(alloc => (
                          <TableRow key={alloc.id}>
                            <TableCell>{new Date(alloc.allocation_date).toLocaleDateString()}</TableCell>
                            <TableCell className="font-medium">{alloc.receipt_no}</TableCell>
                            <TableCell>{alloc.invoice_no}</TableCell>
                            <TableCell className="text-right font-medium">
                              ${alloc.allocated_amount.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create Receipt Dialog */}
      <Dialog open={showCreateReceipt} onOpenChange={setShowCreateReceipt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record Bank Receipt</DialogTitle>
            <DialogDescription>Enter details of the payment received</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer *</Label>
              <Select value={newReceipt.customer_id} onValueChange={v => setNewReceipt(p => ({ ...p, customer_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Receipt Date</Label>
                <Input 
                  type="date" 
                  value={newReceipt.receipt_date}
                  onChange={e => setNewReceipt(p => ({ ...p, receipt_date: e.target.value }))}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={newReceipt.currency} onValueChange={v => setNewReceipt(p => ({ ...p, currency: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="INR">INR</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Amount Received *</Label>
              <Input 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={newReceipt.total_amount}
                onChange={e => setNewReceipt(p => ({ ...p, total_amount: e.target.value }))}
              />
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={newReceipt.payment_method} onValueChange={v => setNewReceipt(p => ({ ...p, payment_method: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="credit_card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bank Reference</Label>
                <Input 
                  placeholder="Transaction ID"
                  value={newReceipt.bank_reference}
                  onChange={e => setNewReceipt(p => ({ ...p, bank_reference: e.target.value }))}
                />
              </div>
              <div>
                <Label>Bank Name</Label>
                <Input 
                  placeholder="Bank name"
                  value={newReceipt.bank_name}
                  onChange={e => setNewReceipt(p => ({ ...p, bank_name: e.target.value }))}
                />
              </div>
            </div>
            {/* TDS Preview - Internal tracking only */}
            {newReceipt.customer_id && newReceipt.total_amount && (
              <TdsPreview
                customerId={newReceipt.customer_id}
                grossAmount={parseFloat(newReceipt.total_amount) || 0}
                currency={newReceipt.currency}
              />
            )}

            <div>
              <Label>Notes</Label>
              <Input 
                placeholder="Optional notes"
                value={newReceipt.notes}
                onChange={e => setNewReceipt(p => ({ ...p, notes: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateReceipt(false)}>Cancel</Button>
            <Button onClick={createReceipt} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Allocate Dialog */}
      <Dialog open={showAllocate} onOpenChange={setShowAllocate}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Allocate Receipt {selectedReceipt?.receipt_no}</DialogTitle>
            <DialogDescription>
              Unallocated: {selectedReceipt?.currency} {selectedReceipt?.unallocated_amount.toLocaleString()} • 
              Customer: {selectedReceipt?.customer_name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Select invoices and enter allocation amounts
              </p>
              <Button variant="outline" size="sm" onClick={autoAllocateFIFO}>
                Auto-Allocate (FIFO)
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Invoice Amt</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Allocate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customerInvoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No outstanding invoices for this customer
                    </TableCell>
                  </TableRow>
                ) : (
                  customerInvoices.map(inv => (
                    <TableRow key={inv.id} className={inv.selected ? "bg-primary/5" : ""}>
                      <TableCell>
                        <Checkbox 
                          checked={inv.selected} 
                          onCheckedChange={() => toggleInvoiceSelection(inv.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{inv.invoice_no}</TableCell>
                      <TableCell>{new Date(inv.due_date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-right">{inv.total_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">{inv.paid_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-medium">{inv.balance_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <Input 
                          type="number"
                          step="0.01"
                          className="w-28 text-right"
                          disabled={!inv.selected}
                          value={inv.allocate_amount || ""}
                          onChange={e => updateAllocationAmount(inv.id, parseFloat(e.target.value) || 0)}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            {customerInvoices.length > 0 && (
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Total Allocation</p>
                  <p className="text-2xl font-bold">
                    {selectedReceipt?.currency} {getTotalAllocation().toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Remaining After Allocation</p>
                  <p className="text-2xl font-bold">
                    {selectedReceipt?.currency} {((selectedReceipt?.unallocated_amount || 0) - getTotalAllocation()).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAllocate(false)}>Cancel</Button>
            <Button onClick={saveAllocations} disabled={allocating || getTotalAllocation() === 0}>
              {allocating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Allocations
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
