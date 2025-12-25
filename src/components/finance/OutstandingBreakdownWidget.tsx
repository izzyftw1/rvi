import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DollarSign, FileText, AlertTriangle, Clock, CreditCard, 
  ChevronRight, ExternalLink, X 
} from "lucide-react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { formatINR } from "@/lib/currencyConverter";

interface OutstandingCategory {
  key: string;
  label: string;
  description: string;
  amount: number;
  count: number;
  color: string;
  icon: React.ReactNode;
  items: any[];
}

interface OutstandingBreakdownWidgetProps {
  dateFrom?: string;
  dateTo?: string;
}

export function OutstandingBreakdownWidget({ dateFrom, dateTo }: OutstandingBreakdownWidgetProps) {
  const [selectedCategory, setSelectedCategory] = useState<OutstandingCategory | null>(null);
  const [drillDownOpen, setDrillDownOpen] = useState(false);

  // Fetch unpaid invoices (Payable)
  const { data: invoices = [] } = useQuery({
    queryKey: ["outstanding-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          id,
          invoice_no,
          invoice_date,
          due_date,
          balance_amount,
          currency,
          status,
          customer_master!customer_id(customer_name)
        `)
        .in("status", ["issued", "part_paid", "overdue"])
        .gt("balance_amount", 0)
        .order("due_date", { ascending: true });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch NCR-linked invoices (Under Dispute)
  const { data: disputedInvoices = [] } = useQuery({
    queryKey: ["disputed-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ncrs")
        .select(`
          id,
          ncr_number,
          quantity_affected,
          cost_impact,
          financial_impact_type,
          linked_invoice_id,
          work_orders(customer, customer_id)
        `)
        .not("linked_invoice_id", "is", null)
        .in("status", ["OPEN", "ACTION_IN_PROGRESS", "EFFECTIVENESS_PENDING"]);

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch pending customer adjustments
  const { data: pendingAdjustments = [] } = useQuery({
    queryKey: ["pending-adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_credit_adjustments")
        .select(`
          id,
          original_amount,
          remaining_amount,
          currency,
          reason,
          adjustment_type,
          created_at,
          ncr_id,
          source_invoice_id,
          customer_master!customer_id(customer_name),
          invoices!source_invoice_id(invoice_no)
        `)
        .eq("status", "pending")
        .gt("remaining_amount", 0)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Fetch TDS pending credit
  const { data: pendingTds = [] } = useQuery({
    queryKey: ["pending-tds"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tds_records")
        .select(`
          id,
          gross_amount,
          tds_amount,
          tds_rate,
          record_type,
          created_at,
          status,
          customer_master!customer_id(customer_name),
          invoices!invoice_id(invoice_no)
        `)
        .eq("status", "deducted")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  // Calculate categories
  const categories = useMemo((): OutstandingCategory[] => {
    // Payable - unpaid invoices not linked to disputes
    const disputedInvoiceIds = new Set(disputedInvoices.map(d => d.linked_invoice_id));
    const payableInvoices = invoices.filter((inv: any) => !disputedInvoiceIds.has(inv.id));
    const payableAmount = payableInvoices.reduce((sum: number, inv: any) => sum + Number(inv.balance_amount || 0), 0);

    // Under Dispute - NCR-linked
    const disputeAmount = disputedInvoices.reduce((sum: number, ncr: any) => sum + Number(ncr.cost_impact || 0), 0);

    // Adjusted Pending
    const adjustedAmount = pendingAdjustments.reduce((sum: number, adj: any) => sum + Number(adj.remaining_amount || 0), 0);

    // TDS Pending Credit
    const tdsAmount = pendingTds.reduce((sum: number, tds: any) => sum + Number(tds.tds_amount || 0), 0);

    return [
      {
        key: "payable",
        label: "Payable",
        description: "Unpaid invoices awaiting payment",
        amount: payableAmount,
        count: payableInvoices.length,
        color: "bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400",
        icon: <FileText className="h-5 w-5" />,
        items: payableInvoices.map((inv: any) => ({
          id: inv.id,
          type: "invoice",
          reference: inv.invoice_no,
          customer: inv.customer_master?.customer_name || "Unknown",
          amount: Number(inv.balance_amount),
          currency: inv.currency,
          date: inv.due_date,
          status: inv.status,
        })),
      },
      {
        key: "dispute",
        label: "Under Dispute",
        description: "Amounts linked to open NCRs",
        amount: disputeAmount,
        count: disputedInvoices.length,
        color: "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400",
        icon: <AlertTriangle className="h-5 w-5" />,
        items: disputedInvoices.map((ncr: any) => ({
          id: ncr.id,
          type: "ncr",
          reference: ncr.ncr_number,
          customer: ncr.work_orders?.customer || "Unknown",
          amount: Number(ncr.cost_impact || 0),
          currency: "USD",
          date: null,
          status: ncr.financial_impact_type || "Dispute",
          linkedInvoiceId: ncr.linked_invoice_id,
        })),
      },
      {
        key: "adjusted",
        label: "Adjusted Pending",
        description: "Customer adjustments not yet applied",
        amount: adjustedAmount,
        count: pendingAdjustments.length,
        color: "bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-400",
        icon: <CreditCard className="h-5 w-5" />,
        items: pendingAdjustments.map((adj: any) => ({
          id: adj.id,
          type: "adjustment",
          reference: adj.invoices?.invoice_no || `ADJ-${adj.id.slice(0, 8)}`,
          customer: adj.customer_master?.customer_name || "Unknown",
          amount: Number(adj.remaining_amount),
          currency: adj.currency,
          date: adj.created_at,
          status: adj.adjustment_type,
          reason: adj.reason,
          ncrId: adj.ncr_id,
        })),
      },
      {
        key: "tds",
        label: "TDS Pending Credit",
        description: "TDS deducted but not deposited",
        amount: tdsAmount,
        count: pendingTds.length,
        color: "bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400",
        icon: <Clock className="h-5 w-5" />,
        items: pendingTds.map((tds: any) => ({
          id: tds.id,
          type: "tds",
          reference: tds.invoices?.invoice_no || `TDS-${tds.id.slice(0, 8)}`,
          customer: tds.customer_master?.customer_name || "Unknown",
          amount: Number(tds.tds_amount),
          currency: "INR",
          date: tds.created_at,
          status: `${tds.tds_rate}% TDS`,
          grossAmount: tds.gross_amount,
        })),
      },
    ];
  }, [invoices, disputedInvoices, pendingAdjustments, pendingTds]);

  const totalOutstanding = useMemo(() => {
    return categories.reduce((sum, cat) => sum + cat.amount, 0);
  }, [categories]);

  const handleCategoryClick = (category: OutstandingCategory) => {
    if (category.count > 0) {
      setSelectedCategory(category);
      setDrillDownOpen(true);
    }
  };

  const getItemLink = (item: any): string => {
    switch (item.type) {
      case "invoice":
        return `/finance/invoices/${item.id}`;
      case "ncr":
        return `/ncr/${item.id}`;
      case "adjustment":
        return item.ncrId ? `/ncr/${item.ncrId}` : "#";
      case "tds":
        return "/finance/tds";
      default:
        return "#";
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Outstanding Breakdown
              </CardTitle>
              <CardDescription>Classification of outstanding amounts</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total Outstanding</p>
              <p className="text-2xl font-bold">{formatINR(totalOutstanding)}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {categories.map((category) => (
              <button
                key={category.key}
                onClick={() => handleCategoryClick(category)}
                disabled={category.count === 0}
                className={`p-4 rounded-lg border transition-all text-left ${category.color} ${
                  category.count > 0 
                    ? "hover:ring-2 hover:ring-primary/50 cursor-pointer" 
                    : "opacity-50 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  {category.icon}
                  {category.count > 0 && (
                    <ChevronRight className="h-4 w-4 opacity-50" />
                  )}
                </div>
                <p className="text-sm font-medium">{category.label}</p>
                <p className="text-xl font-bold mt-1">{formatINR(category.amount)}</p>
                <p className="text-xs opacity-70 mt-1">
                  {category.count} {category.count === 1 ? "item" : "items"}
                </p>
              </button>
            ))}
          </div>

          {/* Quick summary */}
          <div className="mt-4 pt-4 border-t">
            <div className="flex flex-wrap gap-2">
              {categories.filter(c => c.count > 0).map((cat) => (
                <Badge 
                  key={cat.key} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => handleCategoryClick(cat)}
                >
                  {cat.label}: {cat.count}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Drill-down Dialog */}
      <Dialog open={drillDownOpen} onOpenChange={setDrillDownOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedCategory?.icon}
              {selectedCategory?.label} - {selectedCategory?.count} Items
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh]">
            {selectedCategory && (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground">{selectedCategory.description}</span>
                  <span className="font-bold">{formatINR(selectedCategory.amount)}</span>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedCategory.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {item.type.toUpperCase()}
                            </Badge>
                            {item.reference}
                          </div>
                        </TableCell>
                        <TableCell>{item.customer}</TableCell>
                        <TableCell>
                          {item.date ? format(new Date(item.date), "MMM dd, yyyy") : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {item.currency} {item.amount.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={getItemLink(item)}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                {/* Category-specific additional info */}
                {selectedCategory.key === "adjusted" && (
                  <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-900">
                    <p className="text-sm text-purple-700 dark:text-purple-300">
                      💡 These adjustments will be automatically applied to the next invoice for each customer.
                    </p>
                  </div>
                )}

                {selectedCategory.key === "tds" && (
                  <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                    <p className="text-sm text-green-700 dark:text-green-300">
                      💡 TDS amounts are for internal tracking and do not appear on invoice PDFs.
                    </p>
                  </div>
                )}

                {selectedCategory.key === "dispute" && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-900">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      💡 Resolve NCRs to move disputed amounts to adjustments or clear them.
                    </p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}