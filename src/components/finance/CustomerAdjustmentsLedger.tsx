import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { FileText, RefreshCw } from "lucide-react";

interface CustomerAdjustment {
  id: string;
  customer_id: string;
  source_invoice_id: string | null;
  applied_to_invoice_id: string | null;
  adjustment_type: string;
  original_amount: number;
  remaining_amount: number;
  currency: string;
  reason: string;
  status: string;
  created_at: string;
  applied_at: string | null;
  source_invoice?: { invoice_no: string } | null;
  applied_invoice?: { invoice_no: string } | null;
}

interface CustomerAdjustmentsLedgerProps {
  customerId?: string;
  showAll?: boolean;
}

export function CustomerAdjustmentsLedger({ customerId, showAll = false }: CustomerAdjustmentsLedgerProps) {
  const [adjustments, setAdjustments] = useState<CustomerAdjustment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAdjustments();
  }, [customerId]);

  const loadAdjustments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("customer_credit_adjustments")
        .select(`
          *,
          source_invoice:invoices!source_invoice_id(invoice_no),
          applied_invoice:invoices!applied_to_invoice_id(invoice_no)
        `)
        .order("created_at", { ascending: false });

      if (customerId) {
        query = query.eq("customer_id", customerId);
      }

      if (!showAll) {
        query = query.limit(20);
      }

      const { data, error } = await query;
      if (error) throw error;
      setAdjustments(data || []);
    } catch (error) {
      console.error("Error loading adjustments:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'pending') {
      return <Badge variant="outline" className="border-amber-500 text-amber-700">Open</Badge>;
    }
    if (status === 'applied') {
      return <Badge variant="default" className="bg-green-600">Applied</Badge>;
    }
    return <Badge variant="secondary">{status}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      rejection: "bg-red-100 text-red-700 border-red-200",
      tds: "bg-blue-100 text-blue-700 border-blue-200",
      commercial: "bg-purple-100 text-purple-700 border-purple-200",
      other: "bg-gray-100 text-gray-700 border-gray-200"
    };
    return (
      <Badge variant="outline" className={colors[type] || colors.other}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    );
  };

  const pendingTotal = adjustments
    .filter(a => a.status === 'pending')
    .reduce((sum, a) => sum + Number(a.remaining_amount), 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Customer Adjustments Ledger
          </CardTitle>
          <div className="flex items-center gap-4">
            {pendingTotal > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Open Adjustments</p>
                <p className="font-bold text-amber-600">₹{pendingTotal.toLocaleString()}</p>
              </div>
            )}
            <Button variant="outline" size="sm" onClick={loadAdjustments}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : adjustments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No adjustments found
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Source Invoice</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied To</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adjustments.map((adj) => (
                  <TableRow key={adj.id}>
                    <TableCell className="text-sm">
                      {format(new Date(adj.created_at), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>{getTypeBadge(adj.adjustment_type)}</TableCell>
                    <TableCell>
                      {adj.source_invoice ? (
                        <Link 
                          to={`/finance/invoices/${adj.source_invoice_id}`}
                          className="text-primary hover:underline"
                        >
                          {adj.source_invoice.invoice_no}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {adj.reason}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {adj.currency} {Number(adj.original_amount).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {adj.status === 'pending' ? (
                        <span className="font-medium text-amber-600">
                          {adj.currency} {Number(adj.remaining_amount).toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>{getStatusBadge(adj.status)}</TableCell>
                    <TableCell>
                      {adj.applied_invoice ? (
                        <Link 
                          to={`/finance/invoices/${adj.applied_to_invoice_id}`}
                          className="text-primary hover:underline"
                        >
                          {adj.applied_invoice.invoice_no}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
