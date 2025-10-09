import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface Supplier {
  id: string;
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
}

interface LedgerEntry {
  id: string;
  type: "rpo" | "receipt" | "reconciliation";
  date: string;
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export default function SupplierLedger() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);

  useEffect(() => {
    loadSupplierLedger();
  }, [id]);

  const loadSupplierLedger = async () => {
    if (!id) return;
    
    setLoading(true);
    try {
      // Load supplier details
      const { data: supplierData, error: suppError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", id)
        .single();

      if (suppError) throw suppError;
      setSupplier(supplierData);

      // Load RPOs
      const { data: rpos, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select("*")
        .eq("supplier_id", id)
        .order("created_at", { ascending: true });

      if (rpoError) throw rpoError;

      // Load receipts for these RPOs
      const rpoIds = rpos?.map(r => r.id) || [];
      const { data: receipts, error: recError } = await supabase
        .from("raw_po_receipts")
        .select("*, raw_purchase_orders(rpo_no)")
        .in("rpo_id", rpoIds)
        .order("received_date", { ascending: true });

      if (recError) throw recError;

      // Load reconciliations
      const { data: reconciliations, error: reconError } = await supabase
        .from("raw_po_reconciliations")
        .select("*, raw_purchase_orders(rpo_no)")
        .in("rpo_id", rpoIds)
        .order("created_at", { ascending: true });

      if (reconError) throw reconError;

      // Build ledger entries
      const ledger: LedgerEntry[] = [];
      let balance = 0;

      // Add RPOs as debits (amount we owe to supplier based on order)
      rpos?.forEach(rpo => {
        balance += rpo.amount_ordered;
        ledger.push({
          id: rpo.id,
          type: "rpo",
          date: rpo.created_at,
          reference: rpo.rpo_no,
          description: `Purchase Order - ${rpo.item_code} (${rpo.qty_ordered_kg.toFixed(3)} kg @ ₹${rpo.rate_per_kg.toFixed(2)}/kg)`,
          debit: rpo.amount_ordered,
          credit: 0,
          balance
        });
      });

      // Add receipts as credits (actual amounts invoiced)
      receipts?.forEach((receipt: any) => {
        const amount = receipt.qty_received_kg * (receipt.rate_on_invoice || 0);
        balance -= amount;
        ledger.push({
          id: receipt.id,
          type: "receipt",
          date: receipt.received_date,
          reference: receipt.raw_purchase_orders?.rpo_no || "N/A",
          description: `Material Receipt - ${receipt.qty_received_kg.toFixed(3)} kg @ ₹${receipt.rate_on_invoice?.toFixed(2) || "0"}/kg` + 
            (receipt.supplier_invoice_no ? ` (Invoice: ${receipt.supplier_invoice_no})` : ""),
          debit: 0,
          credit: amount,
          balance
        });
      });

      // Add reconciliations (adjustments)
      reconciliations?.forEach((recon: any) => {
        if (recon.amount_delta && recon.resolution !== "pending") {
          const isDebit = recon.amount_delta > 0;
          balance += isDebit ? recon.amount_delta : -Math.abs(recon.amount_delta);
          ledger.push({
            id: recon.id,
            type: "reconciliation",
            date: recon.resolved_at || recon.created_at,
            reference: recon.raw_purchase_orders?.rpo_no || "N/A",
            description: `Reconciliation - ${recon.reason.replace(/_/g, " ")} (${recon.resolution.replace(/_/g, " ")})` +
              (recon.resolution_ref ? ` - Ref: ${recon.resolution_ref}` : ""),
            debit: isDebit ? Math.abs(recon.amount_delta) : 0,
            credit: !isDebit ? Math.abs(recon.amount_delta) : 0,
            balance
          });
        }
      });

      // Sort by date
      ledger.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      // Recalculate running balance
      let runningBalance = 0;
      ledger.forEach(entry => {
        runningBalance += entry.debit - entry.credit;
        entry.balance = runningBalance;
      });

      setEntries(ledger);
    } catch (error: any) {
      console.error("Error loading supplier ledger:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!supplier && !loading) {
    return (
      <div className="min-h-screen bg-background">
        <NavigationHeader title="Supplier Not Found" />
        <div className="p-6">
          <Button variant="ghost" onClick={() => navigate("/purchase/raw-po")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Purchase Orders
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title={supplier?.name || "Supplier Ledger"} 
        subtitle="Transaction history and balance"
      />
      
      <div className="p-6 pb-0">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/" className="flex items-center gap-1">
                <Home className="h-4 w-4" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/purchase/rpo">Raw Purchase Orders</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{supplier?.name || "Supplier Ledger"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6">
        <Button variant="ghost" onClick={() => navigate("/purchase/raw-po")} className="mb-4">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Purchase Orders
        </Button>

        {/* Supplier Info */}
        {supplier && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Supplier Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Contact Person</p>
                  <p className="font-medium">{supplier.contact_name || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p className="font-medium">{supplier.email || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phone</p>
                  <p className="font-medium">{supplier.phone || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Current Balance</p>
                  <p className={`font-medium text-lg ${entries.length > 0 && entries[entries.length - 1].balance !== 0 ? (entries[entries.length - 1].balance > 0 ? "text-red-600" : "text-green-600") : ""}`}>
                    ₹{entries.length > 0 ? Math.abs(entries[entries.length - 1].balance).toFixed(2) : "0.00"}
                    {entries.length > 0 && entries[entries.length - 1].balance > 0 && " (Payable)"}
                    {entries.length > 0 && entries[entries.length - 1].balance < 0 && " (Receivable)"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Ledger */}
        <Card>
          <CardHeader>
            <CardTitle>Transaction Ledger</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : entries.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No transactions found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-xs">{new Date(entry.date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{entry.reference}</Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[300px]">{entry.description}</TableCell>
                      <TableCell className="text-right text-red-600 font-medium">
                        {entry.debit > 0 ? `₹${entry.debit.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-medium">
                        {entry.credit > 0 ? `₹${entry.credit.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${entry.balance > 0 ? "text-red-600" : entry.balance < 0 ? "text-green-600" : ""}`}>
                        ₹{Math.abs(entry.balance).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
