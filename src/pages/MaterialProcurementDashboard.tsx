import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { NavigationHeader } from "@/components/NavigationHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { Package, TrendingUp, AlertTriangle, CheckCircle2, Plus } from "lucide-react";

interface DashboardMetrics {
  openRPOValue: number;
  qtyOnOrder: number;
  receiptsThisMonth: number;
  variancesOpen: number;
}

interface DeficitItem {
  material_size_mm: string;
  alloy: string;
  requirement: number;
  inventory: number;
  deficit: number;
}

interface SupplierPerformance {
  supplier_id: string;
  supplier_name: string;
  total_rpos: number;
  on_time_deliveries: number;
  avg_rate_variance: number;
  short_supplies: number;
  excess_supplies: number;
}

export default function MaterialProcurementDashboard() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    openRPOValue: 0,
    qtyOnOrder: 0,
    receiptsThisMonth: 0,
    variancesOpen: 0
  });
  const [deficits, setDeficits] = useState<DeficitItem[]>([]);
  const [supplierPerf, setSupplierPerf] = useState<SupplierPerformance[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load open RPOs (approved and part_received)
      const { data: rpos, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select("*, suppliers(name)")
        .in("status", ["approved", "part_received"]);

      if (rpoError) throw rpoError;

      // Calculate open RPO value and qty on order
      const openValue = rpos?.reduce((sum, rpo) => sum + rpo.amount_ordered, 0) || 0;
      const qtyOnOrder = rpos?.reduce((sum, rpo) => sum + rpo.qty_ordered_kg, 0) || 0;

      // Load receipts this month
      const firstDayOfMonth = new Date();
      firstDayOfMonth.setDate(1);
      const { data: receipts, error: recError } = await supabase
        .from("raw_po_receipts")
        .select("qty_received_kg")
        .gte("received_date", firstDayOfMonth.toISOString().split('T')[0]);

      if (recError) throw recError;

      const receiptsThisMonth = receipts?.reduce((sum, r) => sum + r.qty_received_kg, 0) || 0;

      // Load open variances
      const { data: variances, error: varError } = await supabase
        .from("raw_po_reconciliations")
        .select("*")
        .eq("resolution", "pending");

      if (varError) throw varError;

      setMetrics({
        openRPOValue: openValue,
        qtyOnOrder,
        receiptsThisMonth,
        variancesOpen: variances?.length || 0
      });

      // Load deficits
      await loadDeficits();

      // Load supplier performance
      await loadSupplierPerformance();
    } catch (error: any) {
      console.error("Error loading dashboard:", error);
      toast({ variant: "destructive", description: error.message });
    } finally {
      setLoading(false);
    }
  };

  const loadDeficits = async () => {
    try {
      // Get requirements from approved SOs/WOs without approved RPO
      const { data: sos, error: soError } = await supabase
        .from("sales_orders")
        .select("material_rod_forging_size_mm, gross_weight_per_pc_grams, items")
        .eq("status", "approved");

      if (soError) throw soError;

      // Calculate requirements by size
      const reqMap = new Map<string, { alloy: string; requirement: number }>();
      sos?.forEach(so => {
        const items = so.items as any[];
        items?.forEach(item => {
          const key = `${so.material_rod_forging_size_mm}`;
          const existing = reqMap.get(key) || { alloy: "", requirement: 0 };
          existing.requirement += (item.quantity * so.gross_weight_per_pc_grams) / 1000;
          reqMap.set(key, existing);
        });
      });

      // Get inventory
      const { data: inventory, error: invError } = await supabase
        .from("inventory_lots")
        .select("material_size_mm, qty_kg");

      if (invError) throw invError;

      const invMap = new Map<string, number>();
      inventory?.forEach(inv => {
        const existing = invMap.get(inv.material_size_mm) || 0;
        invMap.set(inv.material_size_mm, existing + inv.qty_kg);
      });

      // Calculate deficits
      const deficitList: DeficitItem[] = [];
      reqMap.forEach((value, size) => {
        const inv = invMap.get(size) || 0;
        const deficit = value.requirement - inv;
        if (deficit > 0) {
          deficitList.push({
            material_size_mm: size,
            alloy: value.alloy || "Mixed",
            requirement: value.requirement,
            inventory: inv,
            deficit
          });
        }
      });

      deficitList.sort((a, b) => b.deficit - a.deficit);
      setDeficits(deficitList.slice(0, 10));
    } catch (error: any) {
      console.error("Error loading deficits:", error);
    }
  };

  const loadSupplierPerformance = async () => {
    try {
      const { data: rpos, error: rpoError } = await supabase
        .from("raw_purchase_orders")
        .select(`
          id,
          supplier_id,
          expected_delivery_date,
          rate_per_kg,
          suppliers(name),
          raw_po_receipts(received_date, rate_on_invoice),
          raw_po_reconciliations(reason)
        `)
        .neq("status", "draft");

      if (rpoError) throw rpoError;

      const perfMap = new Map<string, SupplierPerformance>();

      rpos?.forEach((rpo: any) => {
        const supplierId = rpo.supplier_id;
        if (!supplierId) return;

        const existing = perfMap.get(supplierId) || {
          supplier_id: supplierId,
          supplier_name: rpo.suppliers?.name || "Unknown",
          total_rpos: 0,
          on_time_deliveries: 0,
          avg_rate_variance: 0,
          short_supplies: 0,
          excess_supplies: 0
        };

        existing.total_rpos++;

        // Check on-time delivery
        if (rpo.raw_po_receipts && rpo.raw_po_receipts.length > 0) {
          const firstReceipt = rpo.raw_po_receipts[0];
          if (rpo.expected_delivery_date && firstReceipt.received_date <= rpo.expected_delivery_date) {
            existing.on_time_deliveries++;
          }

          // Calculate rate variance
          const avgInvoiceRate = rpo.raw_po_receipts.reduce((sum: number, r: any) => 
            sum + (r.rate_on_invoice || 0), 0) / rpo.raw_po_receipts.length;
          const variance = ((avgInvoiceRate - rpo.rate_per_kg) / rpo.rate_per_kg) * 100;
          existing.avg_rate_variance = (existing.avg_rate_variance + variance) / 2;
        }

        // Count reconciliations
        if (rpo.raw_po_reconciliations) {
          rpo.raw_po_reconciliations.forEach((recon: any) => {
            if (recon.reason === "short_supply") existing.short_supplies++;
            if (recon.reason === "excess_supply") existing.excess_supplies++;
          });
        }

        perfMap.set(supplierId, existing);
      });

      setSupplierPerf(Array.from(perfMap.values()));
    } catch (error: any) {
      console.error("Error loading supplier performance:", error);
    }
  };

  const handlePlaceOrder = (deficit: DeficitItem) => {
    navigate(`/material-requirements?size=${deficit.material_size_mm}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader title="Material Procurement Dashboard" subtitle="Monitor procurement metrics and performance" />
      
      <div className="p-6 space-y-6">
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Open RPO Value</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">₹{metrics.openRPOValue.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Approved & Part Received</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Qty on Order</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.qtyOnOrder.toFixed(0)} kg</div>
              <p className="text-xs text-muted-foreground">Pending receipt</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Receipts This Month</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.receiptsThisMonth.toFixed(0)} kg</div>
              <p className="text-xs text-muted-foreground">Material received</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Variances Open</CardTitle>
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.variancesOpen}</div>
              <p className="text-xs text-muted-foreground">Pending resolution</p>
            </CardContent>
          </Card>
        </div>

        {/* Top 10 Deficits */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Material Deficits</CardTitle>
            <CardDescription>Highest shortfalls by size and alloy</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : deficits.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No deficits found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Size (mm)</TableHead>
                    <TableHead>Alloy</TableHead>
                    <TableHead className="text-right">Requirement (kg)</TableHead>
                    <TableHead className="text-right">Inventory (kg)</TableHead>
                    <TableHead className="text-right">Deficit (kg)</TableHead>
                    <TableHead>Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deficits.map((deficit, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{deficit.material_size_mm}</TableCell>
                      <TableCell>{deficit.alloy}</TableCell>
                      <TableCell className="text-right">{deficit.requirement.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{deficit.inventory.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="destructive">{deficit.deficit.toFixed(2)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => handlePlaceOrder(deficit)}>
                          <Plus className="mr-1 h-3 w-3" />
                          Place Order
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Supplier Performance */}
        <Card>
          <CardHeader>
            <CardTitle>Supplier Performance</CardTitle>
            <CardDescription>Key performance indicators by supplier</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center py-8 text-muted-foreground">Loading...</p>
            ) : supplierPerf.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No supplier data found</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Total RPOs</TableHead>
                    <TableHead className="text-right">On-Time %</TableHead>
                    <TableHead className="text-right">Avg Rate Variance</TableHead>
                    <TableHead className="text-right">Short Supplies</TableHead>
                    <TableHead className="text-right">Excess Supplies</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierPerf.map((perf) => {
                    const onTimePercent = perf.total_rpos > 0 
                      ? (perf.on_time_deliveries / perf.total_rpos) * 100 
                      : 0;
                    
                    return (
                      <TableRow key={perf.supplier_id}>
                        <TableCell className="font-medium">{perf.supplier_name}</TableCell>
                        <TableCell className="text-right">{perf.total_rpos}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant={onTimePercent >= 80 ? "default" : "destructive"}>
                            {onTimePercent.toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {perf.avg_rate_variance.toFixed(2)}%
                        </TableCell>
                        <TableCell className="text-right">{perf.short_supplies}</TableCell>
                        <TableCell className="text-right">{perf.excess_supplies}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
