import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from "recharts";
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, parseISO } from "date-fns";
import { DollarSign, TrendingDown, Package, AlertTriangle, Users, FileText, Download } from "lucide-react";
import { cn } from "@/lib/utils";

const COLORS = ["#ef4444", "#f59e0b", "#3b82f6", "#22c55e", "#8b5cf6", "#ec4899"];

interface NCRWithCost {
  id: string;
  ncr_number: string;
  quantity_affected: number;
  disposition: string | null;
  rejection_type: string | null;
  root_cause: string | null;
  created_at: string;
  work_order_id: string | null;
  customer: string | null;
  item_code: string | null;
  price_per_pc: number | null;
  currency: string | null;
  cost_impact: number;
}

export function NCRCostDashboard() {
  const [period, setPeriod] = useState<"today" | "this_month" | "last_month" | "last_3_months">("this_month");
  const [activeTab, setActiveTab] = useState("overview");

  // Calculate date range based on period
  const dateRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "today":
        return { start: startOfDay(now), end: endOfDay(now) };
      case "this_month":
        return { start: startOfMonth(now), end: endOfMonth(now) };
      case "last_month":
        const lastMonth = subMonths(now, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      case "last_3_months":
        return { start: startOfMonth(subMonths(now, 2)), end: endOfMonth(now) };
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  }, [period]);

  // Fetch NCRs with work order pricing
  const { data: ncrsWithCost = [], isLoading } = useQuery({
    queryKey: ["ncr-cost-data", dateRange],
    queryFn: async () => {
      const { data: ncrs, error } = await supabase
        .from("ncrs")
        .select(`
          id,
          ncr_number,
          quantity_affected,
          disposition,
          rejection_type,
          root_cause,
          created_at,
          work_order_id,
          work_orders (
            customer,
            customer_id,
            item_code,
            financial_snapshot
          )
        `)
        .gte("created_at", dateRange.start.toISOString())
        .lte("created_at", dateRange.end.toISOString())
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Process NCRs to extract pricing from financial_snapshot
      return (ncrs || []).map((ncr: any) => {
        const wo = ncr.work_orders;
        let pricePerPc: number | null = null;
        let currency = "USD";

        if (wo?.financial_snapshot) {
          const snapshot = wo.financial_snapshot as any;
          pricePerPc = snapshot?.line_item?.price_per_pc ?? null;
          currency = snapshot?.currency ?? "USD";
        }

        const quantity = ncr.quantity_affected || 0;
        const costImpact = pricePerPc ? quantity * pricePerPc : 0;

        return {
          id: ncr.id,
          ncr_number: ncr.ncr_number,
          quantity_affected: quantity,
          disposition: ncr.disposition,
          rejection_type: ncr.rejection_type,
          root_cause: ncr.root_cause,
          created_at: ncr.created_at,
          work_order_id: ncr.work_order_id,
          customer: wo?.customer || "Unknown",
          item_code: wo?.item_code || "Unknown",
          price_per_pc: pricePerPc,
          currency,
          cost_impact: costImpact,
        } as NCRWithCost;
      });
    },
  });

  // Calculate summary metrics
  const metrics = useMemo(() => {
    const totalCost = ncrsWithCost.reduce((sum, n) => sum + n.cost_impact, 0);
    const totalQty = ncrsWithCost.reduce((sum, n) => sum + n.quantity_affected, 0);
    const scrapCost = ncrsWithCost
      .filter(n => n.disposition === "SCRAP")
      .reduce((sum, n) => sum + n.cost_impact, 0);
    const reworkCost = ncrsWithCost
      .filter(n => n.disposition === "REWORK")
      .reduce((sum, n) => sum + n.cost_impact, 0);
    const customerRejectionCost = ncrsWithCost
      .filter(n => n.rejection_type?.toLowerCase().includes("customer"))
      .reduce((sum, n) => sum + n.cost_impact, 0);

    return {
      totalCost,
      totalQty,
      scrapCost,
      reworkCost,
      customerRejectionCost,
      ncrCount: ncrsWithCost.length,
      avgCostPerNCR: ncrsWithCost.length > 0 ? totalCost / ncrsWithCost.length : 0,
    };
  }, [ncrsWithCost]);

  // Group by customer
  const byCustomer = useMemo(() => {
    const grouped = ncrsWithCost.reduce((acc, ncr) => {
      const customer = ncr.customer || "Unknown";
      if (!acc[customer]) {
        acc[customer] = { customer, cost: 0, qty: 0, count: 0 };
      }
      acc[customer].cost += ncr.cost_impact;
      acc[customer].qty += ncr.quantity_affected;
      acc[customer].count += 1;
      return acc;
    }, {} as Record<string, { customer: string; cost: number; qty: number; count: number }>);
    return Object.values(grouped).sort((a, b) => b.cost - a.cost);
  }, [ncrsWithCost]);

  // Group by item
  const byItem = useMemo(() => {
    const grouped = ncrsWithCost.reduce((acc, ncr) => {
      const item = ncr.item_code || "Unknown";
      if (!acc[item]) {
        acc[item] = { item, cost: 0, qty: 0, count: 0 };
      }
      acc[item].cost += ncr.cost_impact;
      acc[item].qty += ncr.quantity_affected;
      acc[item].count += 1;
      return acc;
    }, {} as Record<string, { item: string; cost: number; qty: number; count: number }>);
    return Object.values(grouped).sort((a, b) => b.cost - a.cost);
  }, [ncrsWithCost]);

  // Group by reason/rejection type
  const byReason = useMemo(() => {
    const grouped = ncrsWithCost.reduce((acc, ncr) => {
      const reason = ncr.rejection_type || ncr.root_cause || "Unspecified";
      if (!acc[reason]) {
        acc[reason] = { reason, cost: 0, qty: 0, count: 0 };
      }
      acc[reason].cost += ncr.cost_impact;
      acc[reason].qty += ncr.quantity_affected;
      acc[reason].count += 1;
      return acc;
    }, {} as Record<string, { reason: string; cost: number; qty: number; count: number }>);
    return Object.values(grouped).sort((a, b) => b.cost - a.cost);
  }, [ncrsWithCost]);

  // Group by disposition
  const byDisposition = useMemo(() => {
    const grouped = ncrsWithCost.reduce((acc, ncr) => {
      const disposition = ncr.disposition || "Pending";
      if (!acc[disposition]) {
        acc[disposition] = { disposition, cost: 0, qty: 0, count: 0 };
      }
      acc[disposition].cost += ncr.cost_impact;
      acc[disposition].qty += ncr.quantity_affected;
      acc[disposition].count += 1;
      return acc;
    }, {} as Record<string, { disposition: string; cost: number; qty: number; count: number }>);
    return Object.values(grouped).sort((a, b) => b.cost - a.cost);
  }, [ncrsWithCost]);

  // Daily trend data
  const dailyTrend = useMemo(() => {
    const grouped = ncrsWithCost.reduce((acc, ncr) => {
      const date = format(parseISO(ncr.created_at), "yyyy-MM-dd");
      if (!acc[date]) {
        acc[date] = { date, cost: 0, qty: 0, count: 0 };
      }
      acc[date].cost += ncr.cost_impact;
      acc[date].qty += ncr.quantity_affected;
      acc[date].count += 1;
      return acc;
    }, {} as Record<string, { date: string; cost: number; qty: number; count: number }>);
    return Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  }, [ncrsWithCost]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleExport = () => {
    const csvContent = [
      ["NCR Number", "Date", "Customer", "Item Code", "Quantity", "Disposition", "Rejection Type", "Price/Pc", "Cost Impact"].join(","),
      ...ncrsWithCost.map(n => [
        n.ncr_number,
        format(parseISO(n.created_at), "yyyy-MM-dd"),
        n.customer,
        n.item_code,
        n.quantity_affected,
        n.disposition || "",
        n.rejection_type || "",
        n.price_per_pc || 0,
        n.cost_impact.toFixed(2),
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ncr-cost-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-destructive" />
            NCR Cost Impact
          </h2>
          <p className="text-muted-foreground">Live rejection cost analysis from NCR and Sales Order data</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="this_month">This Month</SelectItem>
              <SelectItem value="last_month">Last Month</SelectItem>
              <SelectItem value="last_3_months">Last 3 Months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingDown className="h-4 w-4" /> Total Rejection Cost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-destructive">{formatCurrency(metrics.totalCost)}</p>
            <p className="text-xs text-muted-foreground">{metrics.totalQty.toLocaleString()} pcs affected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Scrap Cost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(metrics.scrapCost)}</p>
            <Badge variant="destructive" className="mt-1">
              {metrics.totalCost > 0 ? ((metrics.scrapCost / metrics.totalCost) * 100).toFixed(0) : 0}% of total
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Package className="h-4 w-4" /> Rework Cost
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{formatCurrency(metrics.reworkCost)}</p>
            <Badge variant="secondary" className="mt-1">
              {metrics.totalCost > 0 ? ((metrics.reworkCost / metrics.totalCost) * 100).toFixed(0) : 0}% of total
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-4 w-4" /> Customer Rejection
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">{formatCurrency(metrics.customerRejectionCost)}</p>
            <p className="text-xs text-muted-foreground">{metrics.ncrCount} NCRs total</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for detailed views */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="by-customer">By Customer</TabsTrigger>
          <TabsTrigger value="by-item">By Item</TabsTrigger>
          <TabsTrigger value="by-reason">By Reason</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Trend */}
            <Card>
              <CardHeader>
                <CardTitle>Daily Cost Trend</CardTitle>
                <CardDescription>Rejection cost over time</CardDescription>
              </CardHeader>
              <CardContent>
                {dailyTrend.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No data for selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="date" tickFormatter={(v) => format(parseISO(v), "MMM dd")} className="text-xs" />
                      <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(value: number) => formatCurrency(value)}
                        labelFormatter={(label) => format(parseISO(label), "MMM dd, yyyy")}
                      />
                      <Line type="monotone" dataKey="cost" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ fill: "hsl(var(--destructive))" }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Cost by Disposition */}
            <Card>
              <CardHeader>
                <CardTitle>Cost by Disposition</CardTitle>
                <CardDescription>Scrap vs Rework vs Others</CardDescription>
              </CardHeader>
              <CardContent>
                {byDisposition.length === 0 ? (
                  <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                    No data for selected period
                  </div>
                ) : (
                  <div className="flex items-center gap-8">
                    <ResponsiveContainer width="50%" height={250}>
                      <PieChart>
                        <Pie
                          data={byDisposition}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={80}
                          dataKey="cost"
                          nameKey="disposition"
                          label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                        >
                          {byDisposition.map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="flex-1 space-y-2">
                      {byDisposition.map((item, index) => (
                        <div key={item.disposition} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-sm"
                              style={{ backgroundColor: COLORS[index % COLORS.length] }}
                            />
                            <span className="text-sm capitalize">{item.disposition.toLowerCase().replace(/_/g, " ")}</span>
                          </div>
                          <span className="text-sm font-medium">{formatCurrency(item.cost)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="by-customer">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" /> Cost by Customer
              </CardTitle>
              <CardDescription>Top customers by rejection cost</CardDescription>
            </CardHeader>
            <CardContent>
              {byCustomer.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data for selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byCustomer.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="customer" type="category" width={120} className="text-xs" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="cost" fill="hsl(var(--destructive))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Customer</th>
                      <th className="text-right py-2 px-2">NCRs</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byCustomer.slice(0, 10).map((row) => (
                      <tr key={row.customer} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">{row.customer}</td>
                        <td className="text-right py-2 px-2">{row.count}</td>
                        <td className="text-right py-2 px-2">{row.qty.toLocaleString()}</td>
                        <td className="text-right py-2 px-2 font-medium text-destructive">{formatCurrency(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-item">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" /> Cost by Item
              </CardTitle>
              <CardDescription>Top items by rejection cost</CardDescription>
            </CardHeader>
            <CardContent>
              {byItem.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data for selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byItem.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="item" type="category" width={120} className="text-xs" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="cost" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Item Code</th>
                      <th className="text-right py-2 px-2">NCRs</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byItem.slice(0, 10).map((row) => (
                      <tr key={row.item} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2 font-mono">{row.item}</td>
                        <td className="text-right py-2 px-2">{row.count}</td>
                        <td className="text-right py-2 px-2">{row.qty.toLocaleString()}</td>
                        <td className="text-right py-2 px-2 font-medium text-destructive">{formatCurrency(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-reason">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" /> Cost by Reason
              </CardTitle>
              <CardDescription>Top rejection reasons by cost</CardDescription>
            </CardHeader>
            <CardContent>
              {byReason.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  No data for selected period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={byReason.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <YAxis dataKey="reason" type="category" width={150} className="text-xs" />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Bar dataKey="cost" fill="hsl(var(--amber-500))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2">Reason</th>
                      <th className="text-right py-2 px-2">NCRs</th>
                      <th className="text-right py-2 px-2">Qty</th>
                      <th className="text-right py-2 px-2">Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byReason.slice(0, 10).map((row) => (
                      <tr key={row.reason} className="border-b hover:bg-muted/50">
                        <td className="py-2 px-2">{row.reason}</td>
                        <td className="text-right py-2 px-2">{row.count}</td>
                        <td className="text-right py-2 px-2">{row.qty.toLocaleString()}</td>
                        <td className="text-right py-2 px-2 font-medium text-destructive">{formatCurrency(row.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
