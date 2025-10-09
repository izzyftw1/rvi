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
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";

interface ReportRow {
  size_mm: string;
  alloy: string;
  requirement_kg: number;
  inventory_kg: number;
  on_order_kg: number;
  deficit_surplus_kg: number;
}

export default function RPOInventoryReport() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState<ReportRow[]>([]);

  useEffect(() => {
    loadReport();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    try {
      // Get requirements from open WOs
      const { data: wos, error: woError } = await supabase
        .from("work_orders")
        .select("material_size_mm, quantity, gross_weight_per_pc")
        .in("status", ["pending", "in_progress"]);

      if (woError) throw woError;

      const reqMap = new Map<string, { alloy: string; requirement: number }>();
      wos?.forEach(wo => {
        if (!wo.material_size_mm) return;
        const key = wo.material_size_mm;
        const existing = reqMap.get(key) || { alloy: "Mixed", requirement: 0 };
        existing.requirement += (wo.quantity * (wo.gross_weight_per_pc || 0)) / 1000;
        reqMap.set(key, existing);
      });

      // Get on-hand inventory
      const { data: inventory, error: invError } = await supabase
        .from("inventory_lots")
        .select("material_size_mm, alloy, qty_kg");

      if (invError) throw invError;

      const invMap = new Map<string, number>();
      inventory?.forEach(inv => {
        const key = inv.material_size_mm;
        const existing = invMap.get(key) || 0;
        invMap.set(key, existing + inv.qty_kg);
      });

      // Get on-order (approved RPOs)
      const { data: rpos, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select("material_size_mm, qty_ordered_kg")
        .in("status", ["approved", "part_received"]);

      if (rpoError) throw rpoError;

      const orderMap = new Map<string, number>();
      rpos?.forEach(rpo => {
        if (!rpo.material_size_mm) return;
        const key = rpo.material_size_mm;
        const existing = orderMap.get(key) || 0;
        orderMap.set(key, existing + rpo.qty_ordered_kg);
      });

      // Build report
      const allSizes = new Set([
        ...reqMap.keys(),
        ...invMap.keys(),
        ...orderMap.keys()
      ]);

      const report: ReportRow[] = [];
      allSizes.forEach(size => {
        const req = reqMap.get(size)?.requirement || 0;
        const inv = invMap.get(size) || 0;
        const order = orderMap.get(size) || 0;
        const deficit = req - inv - order;

        report.push({
          size_mm: size,
          alloy: reqMap.get(size)?.alloy || "Mixed",
          requirement_kg: req,
          inventory_kg: inv,
          on_order_kg: order,
          deficit_surplus_kg: deficit
        });
      });

      report.sort((a, b) => parseFloat(a.size_mm) - parseFloat(b.size_mm));
      setReportData(report);
    } catch (error: any) {
      console.error("Error loading report:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportData.map(row => ({
      "Size (mm)": row.size_mm,
      "Alloy": row.alloy,
      "Requirement (kg)": row.requirement_kg.toFixed(2),
      "Inventory (kg)": row.inventory_kg.toFixed(2),
      "On Order (kg)": row.on_order_kg.toFixed(2),
      "Deficit/Surplus (kg)": row.deficit_surplus_kg.toFixed(2)
    })));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RPO vs Inventory");
    XLSX.writeFile(wb, `RPO_Inventory_Report_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({ title: "Success", description: "Report exported to Excel" });
  };

  const exportToCSV = () => {
    const ws = XLSX.utils.json_to_sheet(reportData.map(row => ({
      "Size (mm)": row.size_mm,
      "Alloy": row.alloy,
      "Requirement (kg)": row.requirement_kg.toFixed(2),
      "Inventory (kg)": row.inventory_kg.toFixed(2),
      "On Order (kg)": row.on_order_kg.toFixed(2),
      "Deficit/Surplus (kg)": row.deficit_surplus_kg.toFixed(2)
    })));

    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `RPO_Inventory_Report_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast({ title: "Success", description: "Report exported to CSV" });
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader 
        title="RPO vs Inventory vs WO Report" 
        subtitle="Material requirement analysis by size and alloy" 
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
              <BreadcrumbPage>RPO vs Inventory Report</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      <div className="p-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Material Balance Report</CardTitle>
                <CardDescription>Requirement, inventory, and on-order status by material size</CardDescription>
              </div>
              <div className="flex gap-2">
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
              <p className="text-center py-8 text-muted-foreground">Loading report...</p>
            ) : reportData.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No data found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Size (mm)</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead className="text-right">Requirement (kg)</TableHead>
                    <TableHead className="text-right">On-Hand Inventory (kg)</TableHead>
                    <TableHead className="text-right">On-Order (kg)</TableHead>
                    <TableHead className="text-right">Deficit/Surplus (kg)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportData.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{row.size_mm}</TableCell>
                      <TableCell>{row.alloy}</TableCell>
                      <TableCell className="text-right">{row.requirement_kg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{row.inventory_kg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{row.on_order_kg.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {row.deficit_surplus_kg > 0 ? (
                          <Badge variant="destructive">-{row.deficit_surplus_kg.toFixed(2)}</Badge>
                        ) : row.deficit_surplus_kg < 0 ? (
                          <Badge className="bg-green-600">+{Math.abs(row.deficit_surplus_kg).toFixed(2)}</Badge>
                        ) : (
                          <Badge variant="outline">0.00</Badge>
                        )}
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
