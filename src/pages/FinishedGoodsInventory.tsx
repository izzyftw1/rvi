import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, PageContainer } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";
import { format, differenceInDays } from "date-fns";
import { Package, TrendingUp, Clock, AlertTriangle, Search, Plus, ArrowUpRight, ArrowDownRight, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444"];

interface InventoryItem {
  id: string;
  item_code: string;
  customer_id: string | null;
  customer_name: string | null;
  work_order_id: string | null;
  production_batch_id: string | null;
  quantity_available: number;
  quantity_reserved: number;
  quantity_original: number;
  source_type: string;
  created_at: string;
  last_movement_at: string | null;
  heat_nos: string[] | null;
  notes: string | null;
  work_orders?: { wo_number: string; item_code: string } | null;
}

interface InventoryMovement {
  id: string;
  inventory_id: string;
  movement_type: string;
  quantity: number;
  work_order_id: string | null;
  notes: string | null;
  created_at: string;
  work_orders?: { wo_number: string } | null;
}

export default function FinishedGoodsInventory() {
  const [activeTab, setActiveTab] = useState("overview");
  const [searchTerm, setSearchTerm] = useState("");
  const [customerFilter, setCustomerFilter] = useState<string>("all");
  const [ageFilter, setAgeFilter] = useState<string>("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch inventory items
  const { data: inventory = [], isLoading } = useQuery({
    queryKey: ["finished-goods-inventory"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finished_goods_inventory")
        .select(`
          *,
          work_orders (wo_number, item_code)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as InventoryItem[];
    },
  });

  // Fetch movements
  const { data: movements = [] } = useQuery({
    queryKey: ["inventory-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select(`
          *,
          work_orders (wo_number)
        `)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data as InventoryMovement[];
    },
  });

  // Fetch customers for filter
  const { data: customers = [] } = useQuery({
    queryKey: ["customers-for-filter"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_master")
        .select("id, customer_name")
        .order("customer_name");
      if (error) throw error;
      return data;
    },
  });

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalQty = inventory.reduce((sum, i) => sum + i.quantity_available, 0);
    const reservedQty = inventory.reduce((sum, i) => sum + i.quantity_reserved, 0);
    const uniqueItems = new Set(inventory.map(i => i.item_code)).size;
    const customerLinked = inventory.filter(i => i.customer_id).length;

    // Age distribution
    const ageDist = { fresh: 0, normal: 0, aging: 0, stale: 0 };
    inventory.forEach(i => {
      const days = differenceInDays(new Date(), new Date(i.created_at));
      if (days <= 30) ageDist.fresh += i.quantity_available;
      else if (days <= 90) ageDist.normal += i.quantity_available;
      else if (days <= 180) ageDist.aging += i.quantity_available;
      else ageDist.stale += i.quantity_available;
    });

    // By source
    const bySource = inventory.reduce((acc, i) => {
      const source = i.source_type || "overproduction";
      acc[source] = (acc[source] || 0) + i.quantity_available;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalQty,
      reservedQty,
      availableQty: totalQty - reservedQty,
      uniqueItems,
      customerLinked,
      ageDist,
      bySource,
    };
  }, [inventory]);

  // Filtered inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter(item => {
      const matchesSearch = !searchTerm || 
        item.item_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.work_orders?.wo_number?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesCustomer = customerFilter === "all" || 
        (customerFilter === "none" ? !item.customer_id : item.customer_id === customerFilter);

      const days = differenceInDays(new Date(), new Date(item.created_at));
      const matchesAge = ageFilter === "all" ||
        (ageFilter === "fresh" && days <= 30) ||
        (ageFilter === "normal" && days > 30 && days <= 90) ||
        (ageFilter === "aging" && days > 90 && days <= 180) ||
        (ageFilter === "stale" && days > 180);

      return matchesSearch && matchesCustomer && matchesAge && item.quantity_available > 0;
    });
  }, [inventory, searchTerm, customerFilter, ageFilter]);

  // Chart data
  const ageChartData = [
    { name: "Fresh (≤30d)", value: metrics.ageDist.fresh, fill: COLORS[0] },
    { name: "Normal (31-90d)", value: metrics.ageDist.normal, fill: COLORS[1] },
    { name: "Aging (91-180d)", value: metrics.ageDist.aging, fill: COLORS[2] },
    { name: "Stale (>180d)", value: metrics.ageDist.stale, fill: COLORS[3] },
  ].filter(d => d.value > 0);

  const sourceChartData = Object.entries(metrics.bySource).map(([source, qty]) => ({
    source: source.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
    quantity: qty,
  }));

  // By item summary
  const byItemSummary = useMemo(() => {
    const grouped = inventory.reduce((acc, i) => {
      if (!acc[i.item_code]) {
        acc[i.item_code] = { item_code: i.item_code, qty: 0, reserved: 0, lots: 0 };
      }
      acc[i.item_code].qty += i.quantity_available;
      acc[i.item_code].reserved += i.quantity_reserved;
      acc[i.item_code].lots += 1;
      return acc;
    }, {} as Record<string, { item_code: string; qty: number; reserved: number; lots: number }>);
    return Object.values(grouped).sort((a, b) => b.qty - a.qty);
  }, [inventory]);

  // By customer summary
  const byCustomerSummary = useMemo(() => {
    const grouped = inventory.reduce((acc, i) => {
      const key = i.customer_name || "Unallocated";
      if (!acc[key]) {
        acc[key] = { customer: key, qty: 0, reserved: 0, items: new Set() };
      }
      acc[key].qty += i.quantity_available;
      acc[key].reserved += i.quantity_reserved;
      acc[key].items.add(i.item_code);
      return acc;
    }, {} as Record<string, { customer: string; qty: number; reserved: number; items: Set<string> }>);
    return Object.values(grouped)
      .map(g => ({ ...g, itemCount: g.items.size }))
      .sort((a, b) => b.qty - a.qty);
  }, [inventory]);

  const getAgeBadge = (createdAt: string) => {
    const days = differenceInDays(new Date(), new Date(createdAt));
    if (days <= 30) return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">{days}d</Badge>;
    if (days <= 90) return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">{days}d</Badge>;
    if (days <= 180) return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">{days}d</Badge>;
    return <Badge variant="destructive">{days}d</Badge>;
  };

  const handleExport = () => {
    const csvContent = [
      ["Item Code", "Customer", "Available Qty", "Reserved", "Source", "Age (days)", "WO Number", "Created At"].join(","),
      ...filteredInventory.map(i => [
        i.item_code,
        i.customer_name || "",
        i.quantity_available,
        i.quantity_reserved,
        i.source_type,
        differenceInDays(new Date(), new Date(i.created_at)),
        i.work_orders?.wo_number || "",
        format(new Date(i.created_at), "yyyy-MM-dd"),
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finished-goods-inventory-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  if (isLoading) {
    return (
      <PageContainer maxWidth="2xl">
        <PageHeader 
          title="Finished Goods Inventory" 
          description="Loading..."
          icon={<Package className="h-5 w-5" />}
        />
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
        description="Overproduction and stock tracking"
        icon={<Package className="h-5 w-5" />}
      />

      <div className="space-y-6 mt-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Package className="h-4 w-4" /> Total Stock
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{metrics.totalQty.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">{metrics.uniqueItems} unique items</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" /> Available
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{metrics.availableQty.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">For dispatch</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Clock className="h-4 w-4" /> Reserved
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-amber-600">{metrics.reservedQty.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Pending orders</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" /> Aging Stock
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">
                {(metrics.ageDist.aging + metrics.ageDist.stale).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">&gt;90 days old</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="inventory">Inventory</TabsTrigger>
              <TabsTrigger value="by-item">By Item</TabsTrigger>
              <TabsTrigger value="by-customer">By Customer</TabsTrigger>
              <TabsTrigger value="movements">Movements</TabsTrigger>
            </TabsList>

            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Age Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle>Stock Age Distribution</CardTitle>
                  <CardDescription>Quantity by age category</CardDescription>
                </CardHeader>
                <CardContent>
                  {ageChartData.length === 0 ? (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No inventory data
                    </div>
                  ) : (
                    <div className="flex items-center gap-8">
                      <ResponsiveContainer width="50%" height={250}>
                        <PieChart>
                          <Pie
                            data={ageChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            dataKey="value"
                            label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                          >
                            {ageChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => v.toLocaleString()} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {ageChartData.map((item) => (
                          <div key={item.name} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: item.fill }} />
                              <span className="text-sm">{item.name}</span>
                            </div>
                            <span className="text-sm font-medium">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* By Source */}
              <Card>
                <CardHeader>
                  <CardTitle>Stock by Source</CardTitle>
                  <CardDescription>How inventory was created</CardDescription>
                </CardHeader>
                <CardContent>
                  {sourceChartData.length === 0 ? (
                    <div className="h-[250px] flex items-center justify-center text-muted-foreground">
                      No inventory data
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={sourceChartData}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="source" className="text-xs" />
                        <YAxis />
                        <Tooltip formatter={(v: number) => v.toLocaleString()} />
                        <Bar dataKey="quantity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="inventory">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search item, customer, WO..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Customer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="none">Unallocated</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={ageFilter} onValueChange={setAgeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Age" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Ages</SelectItem>
                  <SelectItem value="fresh">Fresh (≤30d)</SelectItem>
                  <SelectItem value="normal">Normal (31-90d)</SelectItem>
                  <SelectItem value="aging">Aging (91-180d)</SelectItem>
                  <SelectItem value="stale">Stale (&gt;180d)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Inventory Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Available</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Age</TableHead>
                      <TableHead>WO</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredInventory.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No inventory items found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredInventory.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-mono font-medium">{item.item_code}</TableCell>
                          <TableCell>{item.customer_name || <span className="text-muted-foreground">Unallocated</span>}</TableCell>
                          <TableCell className="text-right font-medium text-green-600">
                            {item.quantity_available.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-amber-600">
                            {item.quantity_reserved > 0 ? item.quantity_reserved.toLocaleString() : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {item.source_type.replace(/_/g, " ")}
                            </Badge>
                          </TableCell>
                          <TableCell>{getAgeBadge(item.created_at)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {item.work_orders?.wo_number || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="by-item">
            <Card>
              <CardHeader>
                <CardTitle>Inventory by Item</CardTitle>
                <CardDescription>Aggregated stock by item code</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Code</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead className="text-right">Lots</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byItemSummary.map((row) => (
                      <TableRow key={row.item_code}>
                        <TableCell className="font-mono font-medium">{row.item_code}</TableCell>
                        <TableCell className="text-right font-medium">{row.qty.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-amber-600">
                          {row.reserved > 0 ? row.reserved.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.lots}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="by-customer">
            <Card>
              <CardHeader>
                <CardTitle>Inventory by Customer</CardTitle>
                <CardDescription>Customer-linked stock ownership</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total Qty</TableHead>
                      <TableHead className="text-right">Reserved</TableHead>
                      <TableHead className="text-right">Items</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byCustomerSummary.map((row) => (
                      <TableRow key={row.customer}>
                        <TableCell className="font-medium">{row.customer}</TableCell>
                        <TableCell className="text-right font-medium">{row.qty.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-amber-600">
                          {row.reserved > 0 ? row.reserved.toLocaleString() : "-"}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">{row.itemCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="movements">
            <Card>
              <CardHeader>
                <CardTitle>Recent Movements</CardTitle>
                <CardDescription>Last 100 inventory transactions</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead>WO</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No movements recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      movements.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="text-sm">
                            {format(new Date(m.created_at), "MMM dd, HH:mm")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {m.movement_type.startsWith("in") ? (
                                <ArrowDownRight className="h-4 w-4 text-green-600" />
                              ) : (
                                <ArrowUpRight className="h-4 w-4 text-red-600" />
                              )}
                              <Badge variant="outline" className="text-xs">
                                {m.movement_type.replace(/_/g, " ")}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className={cn(
                            "text-right font-medium",
                            m.movement_type.startsWith("in") ? "text-green-600" : "text-red-600"
                          )}>
                            {m.movement_type.startsWith("in") ? "+" : "-"}{Math.abs(m.quantity).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {m.work_orders?.wo_number || "-"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[200px]">
                            {m.notes || "-"}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageContainer>
  );
}
