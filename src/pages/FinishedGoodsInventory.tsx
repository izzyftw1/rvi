import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format, differenceInDays } from "date-fns";
import { 
  Package, TrendingUp, Clock, AlertTriangle, Search, Filter,
  Download, Warehouse, PackageCheck, Truck, ArrowRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface CartonItem {
  id: string;
  carton_id: string;
  wo_id: string;
  quantity: number;
  dispatched_qty: number;
  status: string;
  built_at: string;
  net_weight: number;
  gross_weight: number;
  work_order?: {
    display_id: string;
    item_code: string;
    customer: string;
  };
}

interface DispatchRecord {
  id: string;
  batch_id: string;
  wo_id: string;
  quantity: number;
  dispatched_at: string;
  shipment_id: string | null;
  work_order?: {
    display_id: string;
    item_code: string;
    customer: string;
  };
}

export default function FinishedGoodsInventory() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Fetch cartons as the source of finished goods
  const { data: cartons = [], isLoading } = useQuery({
    queryKey: ["finished-goods-cartons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartons")
        .select(`
          id, carton_id, wo_id, quantity, dispatched_qty, status, built_at, net_weight, gross_weight,
          work_orders (display_id, item_code, customer)
        `)
        .order("built_at", { ascending: false });

      if (error) throw error;
      return (data || []).map(c => ({
        ...c,
        work_order: c.work_orders as any,
      })) as CartonItem[];
    },
  });

  // Fetch recent dispatches
  const { data: dispatches = [] } = useQuery({
    queryKey: ["finished-goods-dispatches"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dispatches")
        .select(`
          id, batch_id, wo_id, quantity, dispatched_at, shipment_id,
          work_orders (display_id, item_code, customer)
        `)
        .order("dispatched_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []).map(d => ({
        ...d,
        work_order: d.work_orders as any,
      })) as DispatchRecord[];
    },
  });

  // Calculate metrics from cartons
  const metrics = useMemo(() => {
    const today = new Date();
    
    // Packed stock = cartons with status ready_for_dispatch or packed
    const packedCartons = cartons.filter(c => 
      c.status === "ready_for_dispatch" || c.status === "packed"
    );
    const packedQty = packedCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);
    const packedWeight = packedCartons.reduce((sum, c) => {
      const remainingRatio = (c.quantity - (c.dispatched_qty || 0)) / c.quantity;
      return sum + (c.net_weight || 0) * remainingRatio;
    }, 0);
    
    // Dispatched
    const dispatchedCartons = cartons.filter(c => c.status === "dispatched");
    const dispatchedQty = dispatchedCartons.reduce((sum, c) => sum + c.quantity, 0);
    
    // Today's activity
    const todayPacked = cartons
      .filter(c => differenceInDays(today, new Date(c.built_at)) === 0)
      .reduce((sum, c) => sum + c.quantity, 0);
    const todayDispatched = dispatches
      .filter(d => differenceInDays(today, new Date(d.dispatched_at)) === 0)
      .reduce((sum, d) => sum + d.quantity, 0);
    
    // Ageing (stock > 15 days old)
    const ageingCartons = packedCartons.filter(c => differenceInDays(today, new Date(c.built_at)) > 15);
    const ageingQty = ageingCartons.reduce((sum, c) => sum + (c.quantity - (c.dispatched_qty || 0)), 0);
    
    // By customer
    const byCustomer = packedCartons.reduce((acc, c) => {
      const customer = c.work_order?.customer || "Unknown";
      const qty = c.quantity - (c.dispatched_qty || 0);
      acc[customer] = (acc[customer] || 0) + qty;
      return acc;
    }, {} as Record<string, number>);
    
    // By item
    const byItem = packedCartons.reduce((acc, c) => {
      const item = c.work_order?.item_code || "Unknown";
      const qty = c.quantity - (c.dispatched_qty || 0);
      acc[item] = (acc[item] || 0) + qty;
      return acc;
    }, {} as Record<string, number>);
    
    // Age buckets
    const ageBuckets = { fresh: 0, normal: 0, aging: 0, critical: 0 };
    packedCartons.forEach(c => {
      const days = differenceInDays(today, new Date(c.built_at));
      const qty = c.quantity - (c.dispatched_qty || 0);
      if (days <= 7) ageBuckets.fresh += qty;
      else if (days <= 15) ageBuckets.normal += qty;
      else if (days <= 30) ageBuckets.aging += qty;
      else ageBuckets.critical += qty;
    });

    return {
      packedQty,
      packedWeight,
      packedCartonCount: packedCartons.length,
      dispatchedQty,
      todayPacked,
      todayDispatched,
      ageingQty,
      byCustomer: Object.entries(byCustomer).sort((a, b) => b[1] - a[1]),
      byItem: Object.entries(byItem).sort((a, b) => b[1] - a[1]),
      ageBuckets,
      uniqueItems: Object.keys(byItem).length,
      uniqueCustomers: Object.keys(byCustomer).length,
    };
  }, [cartons, dispatches]);

  // Filter cartons
  const filteredCartons = useMemo(() => {
    return cartons.filter(c => {
      const remaining = c.quantity - (c.dispatched_qty || 0);
      if (remaining <= 0 && statusFilter !== "dispatched") return false;
      
      const matchesSearch = !searchTerm || 
        c.carton_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.work_order?.display_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.work_order?.item_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.work_order?.customer?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesCustomer = customerFilter === "all" || c.work_order?.customer === customerFilter;
      
      const matchesStatus = statusFilter === "all" || 
        (statusFilter === "ready" && (c.status === "ready_for_dispatch" || c.status === "packed")) ||
        (statusFilter === "dispatched" && c.status === "dispatched") ||
        (statusFilter === "partial" && c.dispatched_qty > 0 && c.dispatched_qty < c.quantity);
      
      return matchesSearch && matchesCustomer && matchesStatus;
    });
  }, [cartons, searchTerm, customerFilter, statusFilter]);

  const uniqueCustomers = useMemo(() => {
    return [...new Set(cartons.map(c => c.work_order?.customer).filter(Boolean))].sort() as string[];
  }, [cartons]);

  const getAgeBadge = (builtAt: string) => {
    const days = differenceInDays(new Date(), new Date(builtAt));
    if (days <= 7) return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30">{days}d</Badge>;
    if (days <= 15) return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30">{days}d</Badge>;
    if (days <= 30) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30">{days}d</Badge>;
    return <Badge variant="destructive">{days}d</Badge>;
  };

  const getStatusBadge = (carton: CartonItem) => {
    if (carton.status === "dispatched") {
      return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30">Dispatched</Badge>;
    }
    if (carton.dispatched_qty > 0 && carton.dispatched_qty < carton.quantity) {
      return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30">Partial</Badge>;
    }
    return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30">Ready</Badge>;
  };

  const handleExport = () => {
    const csvContent = [
      ["Carton ID", "Work Order", "Item Code", "Customer", "Quantity", "Dispatched", "Remaining", "Status", "Age (days)", "Built At"].join(","),
      ...filteredCartons.map(c => [
        c.carton_id,
        c.work_order?.display_id || "",
        c.work_order?.item_code || "",
        c.work_order?.customer || "",
        c.quantity,
        c.dispatched_qty || 0,
        c.quantity - (c.dispatched_qty || 0),
        c.status,
        differenceInDays(new Date(), new Date(c.built_at)),
        format(new Date(c.built_at), "yyyy-MM-dd HH:mm"),
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finished-goods-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <PageHeader title="Finished Goods" description="Loading..." icon={<Warehouse className="h-5 w-5" />} />
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="2xl">
      <PageHeader 
        title="Finished Goods Inventory" 
        description="Packed goods ready for dispatch"
        icon={<Warehouse className="h-5 w-5" />}
      />

      <div className="space-y-6 mt-6">
        {/* Executive KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 dark:from-green-950/30 dark:to-green-900/20 border-green-200 dark:border-green-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Packed Stock</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-300">{metrics.packedQty.toLocaleString()}</p>
                  <p className="text-xs text-green-600/80">{metrics.packedCartonCount} cartons</p>
                </div>
                <PackageCheck className="h-8 w-8 text-green-500/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/30 dark:to-blue-900/20 border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Total Dispatched</p>
                  <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{metrics.dispatchedQty.toLocaleString()}</p>
                  <p className="text-xs text-blue-600/80">all time</p>
                </div>
                <Truck className="h-8 w-8 text-blue-500/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 dark:from-purple-950/30 dark:to-purple-900/20 border-purple-200 dark:border-purple-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide">Packed Today</p>
                  <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{metrics.todayPacked.toLocaleString()}</p>
                </div>
                <Package className="h-8 w-8 text-purple-500/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-teal-50 to-teal-100/50 dark:from-teal-950/30 dark:to-teal-900/20 border-teal-200 dark:border-teal-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">Dispatched Today</p>
                  <p className="text-2xl font-bold text-teal-700 dark:text-teal-300">{metrics.todayDispatched.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-teal-500/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/20 border-amber-200 dark:border-amber-800">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400 uppercase tracking-wide">Ageing (&gt;15d)</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">{metrics.ageingQty.toLocaleString()}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-500/40" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-950/30 dark:to-slate-900/20 border-slate-200 dark:border-slate-700">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 uppercase tracking-wide">Weight (kg)</p>
                  <p className="text-2xl font-bold text-slate-700 dark:text-slate-300">{metrics.packedWeight.toFixed(0)}</p>
                  <p className="text-xs text-slate-600/80">net weight</p>
                </div>
                <Package className="h-8 w-8 text-slate-500/40" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <TabsList className="h-10">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="by-customer">By Customer</TabsTrigger>
              <TabsTrigger value="by-item">By Item</TabsTrigger>
              <TabsTrigger value="dispatches">Dispatches</TabsTrigger>
            </TabsList>

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
              <Button size="sm" onClick={() => navigate("/dispatch")}>
                Go to Dispatch
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Age Distribution */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Stock Age Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: "Fresh (0-7d)", value: metrics.ageBuckets.fresh, color: "bg-green-500" },
                      { label: "Normal (8-15d)", value: metrics.ageBuckets.normal, color: "bg-blue-500" },
                      { label: "Aging (16-30d)", value: metrics.ageBuckets.aging, color: "bg-amber-500" },
                      { label: "Critical (>30d)", value: metrics.ageBuckets.critical, color: "bg-red-500" },
                    ].map(bucket => {
                      const total = Object.values(metrics.ageBuckets).reduce((a, b) => a + b, 0);
                      const pct = total > 0 ? (bucket.value / total) * 100 : 0;
                      return (
                        <div key={bucket.label} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span>{bucket.label}</span>
                            <span className="font-semibold">{bucket.value.toLocaleString()}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className={cn("h-full rounded-full", bucket.color)} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top Customers */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Stock by Customer
                  </CardTitle>
                  <CardDescription>{metrics.uniqueCustomers} customers with packed stock</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {metrics.byCustomer.slice(0, 6).map(([customer, qty]) => (
                      <div key={customer} className="flex items-center justify-between p-2 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors">
                        <span className="text-sm font-medium truncate max-w-[200px]">{customer}</span>
                        <Badge variant="outline" className="font-mono">{qty.toLocaleString()}</Badge>
                      </div>
                    ))}
                    {metrics.byCustomer.length === 0 && (
                      <p className="text-center text-muted-foreground py-6">No packed stock</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Top Items */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Stock by Item Code</CardTitle>
                <CardDescription>{metrics.uniqueItems} unique items in packed inventory</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {metrics.byItem.slice(0, 12).map(([item, qty]) => (
                    <div key={item} className="p-3 rounded-lg bg-muted/50 text-center">
                      <p className="font-mono text-sm font-semibold truncate">{item}</p>
                      <p className="text-lg font-bold text-primary">{qty.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* INVENTORY TAB */}
          <TabsContent value="inventory">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search carton, WO, item, customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {uniqueCustomers.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="ready">Ready</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-400px)]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Carton ID</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Dispatched</TableHead>
                        <TableHead className="text-right">Remaining</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCartons.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="text-center py-12 text-muted-foreground">
                            No cartons found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredCartons.map(carton => (
                          <TableRow key={carton.id} className="hover:bg-muted/50">
                            <TableCell className="font-mono text-xs">{carton.carton_id}</TableCell>
                            <TableCell className="font-mono text-sm">{carton.work_order?.display_id || "—"}</TableCell>
                            <TableCell className="text-sm">{carton.work_order?.item_code || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground max-w-[120px] truncate">
                              {carton.work_order?.customer || "—"}
                            </TableCell>
                            <TableCell className="text-right font-medium">{carton.quantity.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">
                              {carton.dispatched_qty > 0 ? carton.dispatched_qty.toLocaleString() : "—"}
                            </TableCell>
                            <TableCell className="text-right font-semibold text-primary">
                              {(carton.quantity - (carton.dispatched_qty || 0)).toLocaleString()}
                            </TableCell>
                            <TableCell>{getAgeBadge(carton.built_at)}</TableCell>
                            <TableCell>{getStatusBadge(carton)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY CUSTOMER TAB */}
          <TabsContent value="by-customer">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Cartons</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byCustomer.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          No packed stock
                        </TableCell>
                      </TableRow>
                    ) : (
                      metrics.byCustomer.map(([customer, qty]) => {
                        const customerCartons = cartons.filter(c => 
                          c.work_order?.customer === customer && 
                          (c.status === "ready_for_dispatch" || c.status === "packed")
                        );
                        const items = new Set(customerCartons.map(c => c.work_order?.item_code)).size;
                        return (
                          <TableRow key={customer}>
                            <TableCell className="font-medium">{customer}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{qty.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{customerCartons.length}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{items}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* BY ITEM TAB */}
          <TabsContent value="by-item">
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Cartons</TableHead>
                      <TableHead className="text-right">Customers</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {metrics.byItem.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                          No packed stock
                        </TableCell>
                      </TableRow>
                    ) : (
                      metrics.byItem.map(([item, qty]) => {
                        const itemCartons = cartons.filter(c => 
                          c.work_order?.item_code === item && 
                          (c.status === "ready_for_dispatch" || c.status === "packed")
                        );
                        const customers = new Set(itemCartons.map(c => c.work_order?.customer)).size;
                        return (
                          <TableRow key={item}>
                            <TableCell className="font-mono font-medium">{item}</TableCell>
                            <TableCell className="text-right font-semibold text-primary">{qty.toLocaleString()}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{itemCartons.length}</TableCell>
                            <TableCell className="text-right text-muted-foreground">{customers}</TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DISPATCHES TAB */}
          <TabsContent value="dispatches">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent Dispatches</CardTitle>
                <CardDescription>Last 100 dispatch records</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[calc(100vh-400px)]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Item Code</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Quantity</TableHead>
                        <TableHead>Shipment</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dispatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            No dispatch records
                          </TableCell>
                        </TableRow>
                      ) : (
                        dispatches.map(d => (
                          <TableRow key={d.id}>
                            <TableCell className="text-sm">
                              {format(new Date(d.dispatched_at), "MMM dd, HH:mm")}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{d.work_order?.display_id || "—"}</TableCell>
                            <TableCell className="text-sm">{d.work_order?.item_code || "—"}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{d.work_order?.customer || "—"}</TableCell>
                            <TableCell className="text-right font-semibold">{d.quantity.toLocaleString()}</TableCell>
                            <TableCell>
                              {d.shipment_id ? (
                                <Badge variant="outline" className="text-xs">Linked</Badge>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
