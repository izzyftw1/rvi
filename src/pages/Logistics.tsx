import { useState, useCallback, useMemo } from "react";
import { Truck, RefreshCw, Filter, X, Calendar, Search, Download, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useNavigate } from "react-router-dom";
import { useLogisticsData, LogisticsFilters } from "@/hooks/useLogisticsData";
import { ExecutiveSnapshot } from "@/components/logistics/ExecutiveSnapshot";
import { OperationalPipeline } from "@/components/logistics/OperationalPipeline";
import { AgeingRiskPanel } from "@/components/logistics/AgeingRiskPanel";
import { Skeleton } from "@/components/ui/skeleton";
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";
import { downloadCSV } from "@/lib/exportHelpers";

export default function Logistics() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState<LogisticsFilters>({
    dateRange: { from: null, to: null },
    customer: "",
    workOrder: "",
    itemCode: "",
    dispatchStatus: "",
  });
  const [activeTab, setActiveTab] = useState("overview");

  const { 
    cartons,
    dispatches, 
    finishedGoods, 
    loading, 
    metrics, 
    pipeline, 
    ageingBuckets, 
    customers, 
    workOrders,
    refresh,
    totalCartons,
    totalDispatches,
  } = useLogisticsData(filters);

  const handleFilterChange = useCallback((newFilters: Partial<LogisticsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      dateRange: { from: null, to: null },
      customer: "",
      workOrder: "",
      itemCode: "",
      dispatchStatus: "",
    });
  }, []);

  const hasActiveFilters = useMemo(() => {
    return filters.customer || filters.workOrder || filters.itemCode || 
      filters.dispatchStatus || filters.dateRange.from || filters.dateRange.to;
  }, [filters]);

  const handleKPIClick = useCallback((kpi: string) => {
    if (kpi === "packed" || kpi === "packed-stock") {
      navigate("/dispatch");
    }
  }, [navigate]);

  const handleStageClick = useCallback((stage: string) => {
    if (stage === "ready" || stage === "partial") {
      navigate("/dispatch");
    } else if (stage === "awaiting-qc") {
      navigate("/dispatch-qc-list");
    }
  }, [navigate]);

  const handleExportDispatches = useCallback(() => {
    const data = dispatches.map(d => ({
      date: format(new Date(d.dispatched_at), 'yyyy-MM-dd'),
      work_order: d.work_order?.display_id || '',
      customer: d.work_order?.customer || '',
      item_code: d.work_order?.item_code || '',
      quantity: d.quantity,
      shipment_id: d.shipment?.ship_id || '',
      status: d.shipment?.status || 'Pending',
    }));
    downloadCSV(data, `dispatch-history-${format(new Date(), 'yyyy-MM-dd')}.csv`);
  }, [dispatches]);

  const getAgeBadge = (builtAt: string) => {
    const days = differenceInDays(new Date(), new Date(builtAt));
    if (days <= 7) return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 text-xs">{days}d</Badge>;
    if (days <= 15) return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 text-xs">{days}d</Badge>;
    if (days <= 30) return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 text-xs">{days}d</Badge>;
    return <Badge variant="destructive" className="text-xs">{days}d</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-[1600px] mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <Skeleton className="h-10 w-64" />
            <Skeleton className="h-10 w-32" />
          </div>
          <Skeleton className="h-12 w-full" />
          <div className="grid grid-cols-6 gap-3">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-[1600px] mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Truck className="h-6 w-6 text-primary" />
              Logistics Control Tower
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Management-grade overview of dispatch, inventory & risk
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={refresh}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            <Button onClick={() => navigate("/dispatch")}>
              Go to Dispatch
            </Button>
          </div>
        </div>

        {/* Filters Bar */}
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <Filter className="h-4 w-4" />
                Filters
              </div>

              {/* Date Range */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn("h-9", filters.dateRange.from && "bg-primary/10 border-primary")}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    {filters.dateRange.from ? (
                      filters.dateRange.to ? (
                        `${format(filters.dateRange.from, "MMM d")} - ${format(filters.dateRange.to, "MMM d")}`
                      ) : (
                        format(filters.dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      "Date Range"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: filters.dateRange.from || undefined, to: filters.dateRange.to || undefined }}
                    onSelect={(range) => handleFilterChange({ 
                      dateRange: { from: range?.from || null, to: range?.to || null } 
                    })}
                    numberOfMonths={2}
                  />
                </PopoverContent>
              </Popover>

              {/* Customer */}
              <Select 
                value={filters.customer} 
                onValueChange={(value) => handleFilterChange({ customer: value === "all" ? "" : value })}
              >
                <SelectTrigger className={cn("h-9 w-[180px]", filters.customer && "bg-primary/10 border-primary")}>
                  <SelectValue placeholder="All Customers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.customer_name}>{c.customer_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Work Order */}
              <Select 
                value={filters.workOrder} 
                onValueChange={(value) => handleFilterChange({ workOrder: value === "all" ? "" : value })}
              >
                <SelectTrigger className={cn("h-9 w-[150px]", filters.workOrder && "bg-primary/10 border-primary")}>
                  <SelectValue placeholder="All Work Orders" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Work Orders</SelectItem>
                  {workOrders.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>{wo.display_id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Item Code */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Item code..."
                  value={filters.itemCode}
                  onChange={(e) => handleFilterChange({ itemCode: e.target.value })}
                  className={cn("h-9 w-[140px] pl-8", filters.itemCode && "bg-primary/10 border-primary")}
                />
              </div>

              {/* Dispatch Status */}
              <Select 
                value={filters.dispatchStatus} 
                onValueChange={(value) => handleFilterChange({ dispatchStatus: value === "all" ? "" : value })}
              >
                <SelectTrigger className={cn("h-9 w-[140px]", filters.dispatchStatus && "bg-primary/10 border-primary")}>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="packed">Packed</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="dispatched">Dispatched</SelectItem>
                </SelectContent>
              </Select>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 text-muted-foreground">
                  <X className="h-4 w-4 mr-1" />
                  Clear All
                </Button>
              )}

              {/* Filter Indicator */}
              {hasActiveFilters && (
                <Badge variant="secondary" className="ml-auto">
                  Showing {cartons.length} of {totalCartons} cartons
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Executive Snapshot KPIs */}
        <ExecutiveSnapshot metrics={metrics} onKPIClick={handleKPIClick} />

        {/* Tabbed Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="dispatches">Dispatch History ({dispatches.length})</TabsTrigger>
            <TabsTrigger value="inventory">Packed Inventory ({finishedGoods.length})</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Operational Pipeline */}
            <OperationalPipeline pipeline={pipeline} onStageClick={handleStageClick} />

            {/* Ageing & Risk */}
            <AgeingRiskPanel buckets={ageingBuckets} />
          </TabsContent>

          {/* Dispatch History Tab */}
          <TabsContent value="dispatches">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Dispatch History</CardTitle>
                  <Button variant="outline" size="sm" onClick={handleExportDispatches}>
                    <Download className="h-4 w-4 mr-1" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Work Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Shipment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dispatches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                            No dispatch records match your filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        dispatches.slice(0, 100).map((d) => (
                          <TableRow key={d.id} className="hover:bg-muted/50">
                            <TableCell className="font-medium">
                              {format(new Date(d.dispatched_at), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {d.work_order?.display_id || '—'}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {d.work_order?.customer || '—'}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {d.work_order?.item_code || '—'}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {d.quantity.toLocaleString()}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {d.shipment?.ship_id || '—'}
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={d.shipment?.status === 'delivered' ? 'default' : 'secondary'}
                                className="text-xs"
                              >
                                {d.shipment?.status || 'pending'}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => navigate(`/work-order/${d.wo_id}`)}
                              >
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {dispatches.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {dispatches.length} records. Export CSV for full data.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Inventory Tab */}
          <TabsContent value="inventory">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Packed Inventory</CardTitle>
                  <Button variant="outline" size="sm" onClick={() => navigate("/finished-goods")}>
                    View Full Inventory
                    <ExternalLink className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card z-10">
                      <TableRow>
                        <TableHead>Carton ID</TableHead>
                        <TableHead>Item</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Available</TableHead>
                        <TableHead className="text-right">Weight (kg)</TableHead>
                        <TableHead className="text-center">Age</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {finishedGoods.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                            No packed inventory matches your filters
                          </TableCell>
                        </TableRow>
                      ) : (
                        finishedGoods.slice(0, 100).map((item) => (
                          <TableRow key={item.id} className="hover:bg-muted/50">
                            <TableCell className="font-mono text-xs font-medium">
                              {item.carton_id}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {item.item_code}
                            </TableCell>
                            <TableCell className="max-w-[150px] truncate">
                              {item.customer || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-right font-semibold">
                              {(item.quantity - item.dispatched_qty).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right">
                              {item.net_weight.toFixed(1)}
                            </TableCell>
                            <TableCell className="text-center">
                              {getAgeBadge(item.built_at)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
                {finishedGoods.length > 100 && (
                  <p className="text-sm text-muted-foreground text-center mt-4">
                    Showing 100 of {finishedGoods.length} items
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
