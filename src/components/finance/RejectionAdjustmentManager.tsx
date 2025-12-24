import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, AlertTriangle, CheckCircle2, Clock, Loader2, ArrowRight, FileText, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";

interface CreditAdjustment {
  id: string;
  customer_id: string;
  customer_name?: string;
  source_invoice_id: string | null;
  source_invoice_no?: string;
  ncr_id: string | null;
  ncr_number?: string;
  adjustment_type: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  reason: string;
  rejection_qty: number | null;
  unit_rate: number | null;
  status: string;
  created_at: string;
  applications?: any[];
}

interface Invoice {
  id: string;
  invoice_no: string;
  customer_id: string;
  customer_name?: string;
  currency: string;
  total_amount: number;
  balance_amount: number;
  status: string;
}

export function RejectionAdjustmentManager() {
  const { toast } = useToast();
  const [adjustments, setAdjustments] = useState<CreditAdjustment[]>([]);
  const [pendingInvoices, setPendingInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [applying, setApplying] = useState(false);
  
  // Short close dialog
  const [shortCloseDialogOpen, setShortCloseDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [shortAmount, setShortAmount] = useState("");
  const [shortReason, setShortReason] = useState("");
  const [rejectionQty, setRejectionQty] = useState("");
  const [unitRate, setUnitRate] = useState("");
  const [ncrId, setNcrId] = useState("");
  const [ncrs, setNcrs] = useState<any[]>([]);
  
  // Apply adjustment dialog
  const [applyDialogOpen, setApplyDialogOpen] = useState(false);
  const [selectedAdjustment, setSelectedAdjustment] = useState<CreditAdjustment | null>(null);
  const [targetInvoice, setTargetInvoice] = useState<string>("");
  const [applyAmount, setApplyAmount] = useState("");
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Load credit adjustments with pending/partial status
      const { data: adjData } = await supabase
        .from("customer_credit_adjustments")
        .select(`
          *,
          customer_master!customer_id(customer_name),
          invoices!source_invoice_id(invoice_no),
          ncrs!ncr_id(ncr_number)
        `)
        .order("created_at", { ascending: false });

      const formattedAdj = (adjData || []).map((adj: any) => ({
        ...adj,
        customer_name: adj.customer_master?.customer_name,
        source_invoice_no: adj.invoices?.invoice_no,
        ncr_number: adj.ncrs?.ncr_number
      }));
      setAdjustments(formattedAdj);

      // Load invoices that can be short-closed
      const { data: invData } = await supabase
        .from("invoices")
        .select(`
          id, invoice_no, customer_id, currency, total_amount, balance_amount, status,
          customer_master!customer_id(customer_name)
        `)
        .in("status", ["issued", "part_paid", "overdue"])
        .gt("balance_amount", 0)
        .order("invoice_no");

      setPendingInvoices((invData || []).map((inv: any) => ({
        ...inv,
        customer_name: inv.customer_master?.customer_name
      })));

      // Load open NCRs for linking
      const { data: ncrData } = await supabase
        .from("ncrs")
        .select("id, ncr_number, rejected_quantity, item_code, disposition")
        .in("status", ["OPEN", "ACTION_IN_PROGRESS"])
        .order("created_at", { ascending: false })
        .limit(50);

      setNcrs(ncrData || []);

    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenShortClose = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setShortAmount(invoice.balance_amount.toString());
    setShortReason("");
    setRejectionQty("");
    setUnitRate("");
    setNcrId("");
    setShortCloseDialogOpen(true);
  };

  const handleShortClose = async () => {
    if (!selectedInvoice || !shortAmount || parseFloat(shortAmount) <= 0) {
      toast({ title: "Error", description: "Please enter a valid short payment amount", variant: "destructive" });
      return;
    }

    if (!shortReason.trim()) {
      toast({ title: "Error", description: "Please provide a reason for the short payment", variant: "destructive" });
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const shortAmountNum = parseFloat(shortAmount);

      // Create credit adjustment for the customer
      const { error: adjError } = await supabase
        .from("customer_credit_adjustments")
        .insert({
          customer_id: selectedInvoice.customer_id,
          source_invoice_id: selectedInvoice.id,
          ncr_id: ncrId || null,
          adjustment_type: "rejection",
          original_amount: shortAmountNum,
          remaining_amount: shortAmountNum,
          currency: selectedInvoice.currency,
          reason: shortReason,
          rejection_qty: rejectionQty ? parseInt(rejectionQty) : null,
          unit_rate: unitRate ? parseFloat(unitRate) : null,
          status: "pending",
          created_by: user?.id
        });

      if (adjError) throw adjError;

      // Mark invoice as short closed
      const { error: invError } = await supabase
        .from("invoices")
        .update({
          status: "short_closed",
          short_closed: true,
          short_close_reason: shortReason,
          short_closed_at: new Date().toISOString(),
          short_closed_by: user?.id,
          balance_amount: 0 // Zero out balance since it's closed
        })
        .eq("id", selectedInvoice.id);

      if (invError) throw invError;

      toast({ title: "Success", description: "Invoice short-closed and credit adjustment created" });
      setShortCloseDialogOpen(false);
      loadData();

    } catch (error: any) {
      console.error("Error creating short close:", error);
      toast({ title: "Error", description: error.message || "Failed to process short close", variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleOpenApplyDialog = async (adjustment: CreditAdjustment) => {
    setSelectedAdjustment(adjustment);
    setApplyAmount(adjustment.remaining_amount.toString());
    setTargetInvoice("");
    
    // Load invoices for this customer
    const { data } = await supabase
      .from("invoices")
      .select(`
        id, invoice_no, customer_id, currency, total_amount, balance_amount, status,
        customer_master!customer_id(customer_name)
      `)
      .eq("customer_id", adjustment.customer_id)
      .neq("id", adjustment.source_invoice_id || "")
      .in("status", ["draft", "issued", "part_paid"])
      .order("invoice_date", { ascending: false });

    setCustomerInvoices((data || []).map((inv: any) => ({
      ...inv,
      customer_name: inv.customer_master?.customer_name
    })));
    
    setApplyDialogOpen(true);
  };

  const handleApplyAdjustment = async () => {
    if (!selectedAdjustment || !targetInvoice || !applyAmount || parseFloat(applyAmount) <= 0) {
      toast({ title: "Error", description: "Please select an invoice and enter a valid amount", variant: "destructive" });
      return;
    }

    const applyAmountNum = parseFloat(applyAmount);
    if (applyAmountNum > selectedAdjustment.remaining_amount) {
      toast({ title: "Error", description: "Amount exceeds remaining adjustment balance", variant: "destructive" });
      return;
    }

    setApplying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Create invoice adjustment
      const { error } = await supabase
        .from("invoice_adjustments")
        .insert({
          invoice_id: targetInvoice,
          credit_adjustment_id: selectedAdjustment.id,
          amount: applyAmountNum,
          applied_by: user?.id,
          notes: `Applied from ${selectedAdjustment.source_invoice_no || 'credit adjustment'} - ${selectedAdjustment.reason}`
        });

      if (error) throw error;

      toast({ title: "Success", description: "Adjustment applied to invoice" });
      setApplyDialogOpen(false);
      loadData();

    } catch (error: any) {
      console.error("Error applying adjustment:", error);
      toast({ title: "Error", description: error.message || "Failed to apply adjustment", variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: any; label: string; icon: any }> = {
      pending: { variant: "outline", label: "Pending", icon: Clock },
      partial: { variant: "secondary", label: "Partially Applied", icon: ArrowRight },
      applied: { variant: "default", label: "Fully Applied", icon: CheckCircle2 },
      cancelled: { variant: "destructive", label: "Cancelled", icon: AlertTriangle },
      expired: { variant: "secondary", label: "Expired", icon: Clock }
    };
    const config = variants[status] || { variant: "outline", label: status, icon: Clock };
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  const pendingAdjustments = adjustments.filter(a => a.status === "pending" || a.status === "partial");
  const totalPendingCredits = pendingAdjustments.reduce((sum, a) => sum + a.remaining_amount, 0);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Pending Credits</div>
            <div className="text-2xl font-bold text-amber-600">{pendingAdjustments.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Total Credit Balance</div>
            <div className="text-2xl font-bold text-amber-600">₹{totalPendingCredits.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Invoices to Short-Close</div>
            <div className="text-2xl font-bold">{pendingInvoices.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm text-muted-foreground">Applied This Month</div>
            <div className="text-2xl font-bold text-green-600">
              {adjustments.filter(a => a.status === "applied").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert for pending credits */}
      {pendingAdjustments.length > 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You have {pendingAdjustments.length} pending rejection credit(s) totaling ₹{totalPendingCredits.toLocaleString()} 
            that can be applied to future invoices.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="adjustments">
        <TabsList>
          <TabsTrigger value="adjustments">Credit Adjustments</TabsTrigger>
          <TabsTrigger value="short-close">Short Close Invoice</TabsTrigger>
          <TabsTrigger value="history">Application History</TabsTrigger>
        </TabsList>

        <TabsContent value="adjustments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pending Credit Adjustments</CardTitle>
              <CardDescription>
                Credits from rejected goods to be applied on future invoices
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingAdjustments.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending credit adjustments
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Source Invoice</TableHead>
                      <TableHead>NCR</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Original</TableHead>
                      <TableHead className="text-right">Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingAdjustments.map((adj) => (
                      <TableRow key={adj.id}>
                        <TableCell className="font-medium">{adj.customer_name}</TableCell>
                        <TableCell>
                          {adj.source_invoice_no ? (
                            <Link to={`/finance/invoices/${adj.source_invoice_id}`} className="text-primary hover:underline">
                              {adj.source_invoice_no}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {adj.ncr_number ? (
                            <Link to={`/ncr/${adj.ncr_id}`} className="text-primary hover:underline">
                              {adj.ncr_number}
                            </Link>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                        <TableCell className="text-right">{adj.currency} {adj.original_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium text-amber-600">
                          {adj.currency} {adj.remaining_amount.toLocaleString()}
                        </TableCell>
                        <TableCell>{getStatusBadge(adj.status)}</TableCell>
                        <TableCell>{format(new Date(adj.created_at), "MMM dd, yyyy")}</TableCell>
                        <TableCell>
                          <Button size="sm" onClick={() => handleOpenApplyDialog(adj)}>
                            Apply
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="short-close" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Short Close Invoices</CardTitle>
              <CardDescription>
                Close invoices with short payment due to rejection and create credit adjustments
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pendingInvoices.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No invoices with pending balances
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingInvoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <Link to={`/finance/invoices/${inv.id}`} className="font-medium text-primary hover:underline">
                            {inv.invoice_no}
                          </Link>
                        </TableCell>
                        <TableCell>{inv.customer_name}</TableCell>
                        <TableCell className="text-right">{inv.currency} {inv.total_amount.toLocaleString()}</TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {inv.currency} {inv.balance_amount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "overdue" ? "destructive" : "outline"}>
                            {inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => handleOpenShortClose(inv)}>
                            Short Close
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Credit Adjustments</CardTitle>
              <CardDescription>
                Complete history of rejection credits and their applications
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Source Invoice</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Original</TableHead>
                    <TableHead className="text-right">Applied</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="font-medium">{adj.customer_name}</TableCell>
                      <TableCell>
                        {adj.source_invoice_no ? (
                          <Link to={`/finance/invoices/${adj.source_invoice_id}`} className="text-primary hover:underline">
                            {adj.source_invoice_no}
                          </Link>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{adj.reason}</TableCell>
                      <TableCell className="text-right">{adj.currency} {adj.original_amount.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-green-600">
                        {adj.currency} {(adj.original_amount - adj.remaining_amount).toLocaleString()}
                      </TableCell>
                      <TableCell>{getStatusBadge(adj.status)}</TableCell>
                      <TableCell>{format(new Date(adj.created_at), "MMM dd, yyyy")}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Short Close Dialog */}
      <Dialog open={shortCloseDialogOpen} onOpenChange={setShortCloseDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Short Close Invoice</DialogTitle>
            <DialogDescription>
              Close invoice {selectedInvoice?.invoice_no} with short payment and create a credit adjustment
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg">
              <div className="flex justify-between text-sm">
                <span>Invoice Total:</span>
                <span className="font-medium">{selectedInvoice?.currency} {selectedInvoice?.total_amount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span>Outstanding Balance:</span>
                <span className="font-medium text-destructive">{selectedInvoice?.currency} {selectedInvoice?.balance_amount.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Short Payment Amount *</Label>
              <Input
                type="number"
                value={shortAmount}
                onChange={(e) => setShortAmount(e.target.value)}
                placeholder="Amount customer is short paying"
              />
              <p className="text-xs text-muted-foreground">This amount will be carried forward as a credit adjustment</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rejection Qty (pcs)</Label>
                <Input
                  type="number"
                  value={rejectionQty}
                  onChange={(e) => setRejectionQty(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="space-y-2">
                <Label>Unit Rate</Label>
                <Input
                  type="number"
                  value={unitRate}
                  onChange={(e) => setUnitRate(e.target.value)}
                  placeholder="Price per piece"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Link to NCR</Label>
              <Select value={ncrId} onValueChange={setNcrId}>
                <SelectTrigger>
                  <SelectValue placeholder="Optional - link to NCR" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No NCR Link</SelectItem>
                  {ncrs.map((ncr) => (
                    <SelectItem key={ncr.id} value={ncr.id}>
                      {ncr.ncr_number} - {ncr.item_code} ({ncr.rejected_quantity} pcs)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reason for Short Payment *</Label>
              <Textarea
                value={shortReason}
                onChange={(e) => setShortReason(e.target.value)}
                placeholder="e.g., Customer rejected 50 pcs due to dimensional issues"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShortCloseDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleShortClose} disabled={creating}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Short Close & Create Credit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Apply Adjustment Dialog */}
      <Dialog open={applyDialogOpen} onOpenChange={setApplyDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Apply Credit Adjustment</DialogTitle>
            <DialogDescription>
              Apply credit from {selectedAdjustment?.source_invoice_no || 'adjustment'} to a new invoice
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="p-3 bg-muted rounded-lg space-y-1">
              <div className="flex justify-between text-sm">
                <span>Customer:</span>
                <span className="font-medium">{selectedAdjustment?.customer_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Credit Remaining:</span>
                <span className="font-medium text-amber-600">
                  {selectedAdjustment?.currency} {selectedAdjustment?.remaining_amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span>Reason:</span>
                <span className="font-medium truncate max-w-[200px]">{selectedAdjustment?.reason}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Apply to Invoice *</Label>
              <Select value={targetInvoice} onValueChange={setTargetInvoice}>
                <SelectTrigger>
                  <SelectValue placeholder="Select invoice" />
                </SelectTrigger>
                <SelectContent>
                  {customerInvoices.length === 0 ? (
                    <SelectItem value="" disabled>No invoices available for this customer</SelectItem>
                  ) : (
                    customerInvoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoice_no} - {inv.currency} {inv.total_amount.toLocaleString()} ({inv.status})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Amount to Apply *</Label>
              <Input
                type="number"
                value={applyAmount}
                onChange={(e) => setApplyAmount(e.target.value)}
                max={selectedAdjustment?.remaining_amount}
              />
              <p className="text-xs text-muted-foreground">
                Max: {selectedAdjustment?.currency} {selectedAdjustment?.remaining_amount.toLocaleString()}
              </p>
            </div>

            <Alert>
              <FileText className="h-4 w-4" />
              <AlertDescription>
                The selected invoice will show: Gross Amount → Adjustment → Net Payable
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyAdjustment} disabled={applying || customerInvoices.length === 0}>
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Apply Adjustment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
