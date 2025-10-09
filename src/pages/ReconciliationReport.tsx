import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Download, Home } from "lucide-react";
import * as XLSX from "xlsx";
import { differenceInDays } from "date-fns";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface ReconciliationRow {
  id: string;
  rpo_no: string;
  supplier_name: string;
  reason: string;
  qty_delta_kg: number | null;
  rate_delta: number | null;
  amount_delta: number | null;
  resolution: string;
  days_open: number;
  created_at: string;
  notes: string | null;
}

export default function ReconciliationReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reconciliations, setReconciliations] = useState<ReconciliationRow[]>([]);
  const [filterStatus, setFilterStatus] = useState<"all" | "pending">("pending");

  useEffect(() => {
    loadReconciliations();
  }, [filterStatus]);

  const loadReconciliations = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("raw_po_reconciliations")
        .select(`
          id,
          rpo_id,
          reason,
          qty_delta_kg,
          rate_delta,
          amount_delta,
          resolution,
          notes,
          created_at,
          raw_purchase_orders(rpo_no, suppliers(name))
        `)
        .order("created_at", { ascending: false });

      if (filterStatus === "pending") {
        query = query.eq("resolution", "pending");
      }

      const { data, error } = await query;

      if (error) throw error;

      const rows: ReconciliationRow[] = (data || []).map((recon: any) => ({
        id: recon.id,
        rpo_no: recon.raw_purchase_orders?.rpo_no || "N/A",
        supplier_name: recon.raw_purchase_orders?.suppliers?.name || "Unknown",
        reason: recon.reason,
        qty_delta_kg: recon.qty_delta_kg,
        rate_delta: recon.rate_delta,
        amount_delta: recon.amount_delta,
        resolution: recon.resolution,
        days_open: differenceInDays(new Date(), new Date(recon.created_at)),
        created_at: recon.created_at,
        notes: recon.notes
      }));

      setReconciliations(rows);
    } catch (error: any) {
      console.error("Error loading reconciliations:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reconciliations.map(row => ({
      "RPO No": row.rpo_no,
      "Supplier": row.supplier_name,
      "Type": row.reason.replace(/_/g, " ").toUpperCase(),
      "Qty Δ (kg)": row.qty_delta_kg?.toFixed(3) || "-",
      "Rate Δ": row.rate_delta?.toFixed(2) || "-",
      "Amount Δ": row.amount_delta?.toFixed(2) || "-",
      "Resolution": row.resolution.replace(/_/g, " ").toUpperCase(),
      "Days Open": row.days_open,
      "Created": new Date(row.created_at).toLocaleDateString(),
      "Notes": row.notes || "-"
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Reconciliations");
    XLSX.writeFile(wb, `Reconciliation_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({ title: "Success", description: "Report exported to Excel" });
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(reconciliations.map(row => ({
      "RPO No": row.rpo_no,
      "Supplier": row.supplier_name,
      "Type": row.reason.replace(/_/g, " ").toUpperCase(),
      "Qty Δ (kg)": row.qty_delta_kg?.toFixed(3) || "-",
      "Rate Δ": row.rate_delta?.toFixed(2) || "-",
      "Amount Δ": row.amount_delta?.toFixed(2) || "-",
      "Resolution": row.resolution.replace(/_/g, " ").toUpperCase(),
      "Days Open": row.days_open,
      "Created": new Date(row.created_at).toLocaleDateString(),
      "Notes": row.notes || "-"
    })));

    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reconciliation_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Success", description: "Report exported to CSV" });
  };

  const getReasonBadge = (reason: string) => {
    const variants: Record<string, any> = {
      short_supply: { variant: "destructive" },
      excess_supply: { variant: "default", className: "bg-blue-600" },
      rate_variance: { variant: "secondary", className: "bg-amber-100 text-amber-700 dark:bg-amber-950" }
    };
    const config = variants[reason] || { variant: "outline" };
    return <Badge {...config}>{reason.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  const getResolutionBadge = (resolution: string) => {
    const variants: Record<string, any> = {
      pending: { variant: "outline" },
      credit_note: { variant: "default", className: "bg-green-600" },
      debit_note: { variant: "destructive" },
      price_adjustment: { variant: "secondary" }
    };
    const config = variants[resolution] || { variant: "outline" };
    return <Badge {...config}>{resolution.replace(/_/g, " ").toUpperCase()}</Badge>;
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="Reconciliation Report" 
        subtitle="Track and manage procurement variances" 
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
              <BreadcrumbPage>Reconciliation Report</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Procurement Reconciliations</CardTitle>
                <CardDescription>All variances with supplier details and resolution status</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button 
                  variant={filterStatus === "pending" ? "default" : "outline"}
                  onClick={() => setFilterStatus("pending")}
                >
                  Pending Only
                </Button>
                <Button 
                  variant={filterStatus === "all" ? "default" : "outline"}
                  onClick={() => setFilterStatus("all")}
                >
                  All
                </Button>
                <Button variant="outline" onClick={exportToCSV}>
                  <Download className="mr-2 h-4 w-4" />
                  CSV
                </Button>
                <Button variant="outline" onClick={exportToExcel}>
                  <Download className="mr-2 h-4 w-4" />
                  Excel
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading reconciliations...</p>
            ) : reconciliations.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No {filterStatus === "pending" ? "pending" : ""} reconciliations found
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RPO No</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Qty Δ (kg)</TableHead>
                    <TableHead className="text-right">Rate Δ</TableHead>
                    <TableHead className="text-right">Amount Δ</TableHead>
                    <TableHead>Resolution</TableHead>
                    <TableHead className="text-right">Days Open</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.rpo_no}</TableCell>
                      <TableCell>{row.supplier_name}</TableCell>
                      <TableCell>{getReasonBadge(row.reason)}</TableCell>
                      <TableCell className="text-right">
                        {row.qty_delta_kg !== null ? row.qty_delta_kg.toFixed(3) : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.rate_delta !== null ? `₹${row.rate_delta.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        {row.amount_delta !== null ? (
                          <span className={row.amount_delta > 0 ? "text-red-600" : "text-green-600"}>
                            ₹{Math.abs(row.amount_delta).toFixed(2)}
                          </span>
                        ) : "-"}
                      </TableCell>
                      <TableCell>{getResolutionBadge(row.resolution)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant={row.days_open > 30 ? "destructive" : "outline"}>
                          {row.days_open}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">
                        {row.notes || "-"}
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
