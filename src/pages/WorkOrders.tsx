import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Plus, AlertCircle, Trash2, Scissors, Hammer, Send, Package, MoreVertical, Settings2, Search, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays } from "date-fns";
import { downloadCSV, downloadPDF, formatExternalWIP } from "@/lib/exportHelpers";

const COLUMNS_KEY = "workorders_visible_columns";
const DEFAULT_COLUMNS = {
  customer: true,
  item: true,
  qty: true,
  due: true,
  stage: true,
  external: true,
  overdue: true,
  aging: false,
};

const WorkOrders = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [filteredOrders, setFilteredOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  
  // Column toggles
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(COLUMNS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  
  // External processing
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [selectedMove, setSelectedMove] = useState<any>(null);

  useEffect(() => {
    loadWorkOrders();

    const channel = supabase
      .channel('work_orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, loadWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, loadWorkOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, loadWorkOrders)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentPage]);

  useEffect(() => {
    applyFilters();
  }, [workOrders, searchQuery, stageFilter, statusFilter]);

  useEffect(() => {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  const loadWorkOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      // Load work orders with count
      const { data: workOrders, error: queryError, count } = await supabase
        .from("work_orders")
        .select("*", { count: 'exact' })
        .order("created_at", { ascending: false })
        .range(from, to);

      if (queryError) throw queryError;

      setTotalCount(count || 0);

      // Load external moves for visible WOs
      const woIds = (workOrders || []).map((wo: any) => wo.id);
      let movesMap: Record<string, any[]> = {};
      
      if (woIds.length > 0) {
        const { data: moves } = await supabase
          .from("wo_external_moves" as any)
          .select("id, work_order_id, process, qty_sent, status, expected_return_date, challan_no")
          .in("work_order_id", woIds);
        
        (moves || []).forEach((move: any) => {
          if (!movesMap[move.work_order_id]) movesMap[move.work_order_id] = [];
          movesMap[move.work_order_id].push(move);
        });
      }

      // Combine data
      const data = (workOrders || []).map((wo: any) => ({
        ...wo,
        external_moves: movesMap[wo.id] || [],
      })) as any[];

      setWorkOrders(data);
    } catch (err: any) {
      console.error("Error loading work orders:", err);
      setError(err.message || "Failed to load work orders");
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...workOrders];

    // Search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(wo =>
        wo.display_id?.toLowerCase().includes(query) ||
        wo.wo_id?.toLowerCase().includes(query) ||
        wo.customer?.toLowerCase().includes(query) ||
        wo.item_code?.toLowerCase().includes(query)
      );
    }

    // Stage filter
    if (stageFilter !== "all") {
      if (["job_work", "plating", "buffing", "blasting", "forging"].includes(stageFilter)) {
        // External stage
        filtered = filtered.filter(wo =>
          (wo.external_wip && wo.external_wip[stageFilter] > 0) ||
          wo.external_moves?.some((m: any) => m.process === stageFilter && m.status !== 'received_full')
        );
      } else {
        // Internal stage
        filtered = filtered.filter(wo => wo.current_stage === stageFilter);
      }
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(wo => wo.status === statusFilter);
    }

    setFilteredOrders(filtered);
  };

  const getExternalWIPSummary = (wo: any) => {
    if (!wo.external_wip || Object.keys(wo.external_wip).length === 0) return null;
    return Object.entries(wo.external_wip)
      .map(([process, qty]) => `${process.replace('_', ' ')}: ${qty}`)
      .join(" / ");
  };

  const hasOverdueReturns = (wo: any) => {
    return wo.external_moves?.some((m: any) => 
      m.expected_return_date && 
      isPast(parseISO(m.expected_return_date)) && 
      m.status !== 'received_full'
    );
  };

  const getAging = (wo: any) => {
    const created = new Date(wo.created_at);
    const now = new Date();
    const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const handleDeleteWorkOrder = async (woId: string, displayId: string) => {
    if (!confirm(`Are you sure you want to delete Work Order ${displayId}?`)) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from("work_orders")
        .delete()
        .eq("id", woId);

      if (error) throw error;
      toast({ description: `Work Order ${displayId} deleted successfully` });
      await loadWorkOrders();
    } catch (err: any) {
      toast({ variant: "destructive", description: `Delete failed: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };

  const toggleColumn = (column: string) => {
    setVisibleColumns((prev: any) => ({ ...prev, [column]: !prev[column] }));
  };

  const handleExportCSV = () => {
    const exportData = filteredOrders.map(wo => ({
      'WO ID': wo.display_id || wo.wo_id,
      'Customer': wo.customer,
      'Item Code': wo.item_code,
      'Quantity': wo.quantity,
      'Due Date': wo.due_date,
      'Current Stage': wo.current_stage?.replace('_', ' ').toUpperCase(),
      'External WIP': formatExternalWIP(wo.external_wip),
      'Overdue Moves': wo.overdue_moves_count || 0,
      'Qty at Partners': (wo.external_out_total || 0) - (wo.external_in_total || 0),
      'Status': wo.status,
    }));
    downloadCSV(exportData, 'work_orders');
    toast({ description: 'CSV export completed' });
  };

  const handleExportPDF = () => {
    const exportData = filteredOrders.map(wo => ({
      woId: wo.display_id || wo.wo_id,
      customer: wo.customer,
      item: wo.item_code,
      qty: wo.quantity,
      due: wo.due_date,
      stage: wo.current_stage?.replace('_', ' ').toUpperCase(),
      externalWip: formatExternalWIP(wo.external_wip),
      overdue: wo.overdue_moves_count || 0,
      qtyAtPartners: (wo.external_out_total || 0) - (wo.external_in_total || 0),
    }));

    const columns = [
      { header: 'WO ID', dataKey: 'woId' },
      { header: 'Customer', dataKey: 'customer' },
      { header: 'Item', dataKey: 'item' },
      { header: 'Qty', dataKey: 'qty' },
      { header: 'Due', dataKey: 'due' },
      { header: 'Stage', dataKey: 'stage' },
      { header: 'External WIP', dataKey: 'externalWip' },
      { header: 'Overdue', dataKey: 'overdue' },
      { header: 'Qty @ Partners', dataKey: 'qtyAtPartners' },
    ];

    downloadPDF(exportData, 'work_orders', 'Work Orders Report', columns);
    toast({ description: 'PDF export completed' });
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Work Orders</h1>
            <p className="text-sm text-muted-foreground">Manage production orders</p>
          </div>
          <Button onClick={() => navigate("/work-orders/new")}>
            <Plus className="h-4 w-4 mr-2" />
            New Work Order
          </Button>
        </div>

        {/* Stage Filter Chips */}
        <Card>
          <CardContent className="pt-6 pb-4">
            <div className="space-y-4">
              {/* Internal Stages */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Internal Stages</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'all', label: 'All', variant: 'default' as const },
                    { value: 'goods_in', label: 'Goods In', variant: 'outline' as const },
                    { value: 'cutting_queue', label: 'Cutting Queue', variant: 'outline' as const },
                    { value: 'forging_queue', label: 'Forging Queue', variant: 'outline' as const },
                    { value: 'production', label: 'Production', variant: 'outline' as const },
                    { value: 'qc', label: 'QC', variant: 'outline' as const },
                    { value: 'packing', label: 'Packing', variant: 'outline' as const },
                    { value: 'dispatch', label: 'Dispatch', variant: 'outline' as const },
                  ].map((stage) => {
                    const count = workOrders.filter(wo => 
                      stage.value === 'all' ? true : wo.current_stage === stage.value
                    ).length;
                    return (
                      <Badge
                        key={stage.value}
                        variant={stageFilter === stage.value ? 'default' : stage.variant}
                        className="cursor-pointer hover:bg-primary/80 transition-colors"
                        onClick={() => setStageFilter(stage.value)}
                      >
                        {stage.label} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {/* External Stages */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">External Processes</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'job_work', label: 'Job Work' },
                    { value: 'plating', label: 'Plating' },
                    { value: 'buffing', label: 'Buffing' },
                    { value: 'blasting', label: 'Blasting' },
                    { value: 'forging', label: 'Forging (Ext)' },
                  ].map((process) => {
                    const count = workOrders.filter(wo => 
                      wo.external_wip && wo.external_wip[process.value] > 0
                    ).length;
                    return (
                      <Badge
                        key={process.value}
                        variant={stageFilter === process.value ? 'default' : 'secondary'}
                        className="cursor-pointer hover:bg-orange-500/80 transition-colors bg-orange-500/10 text-orange-700 border-orange-300"
                        onClick={() => setStageFilter(process.value)}
                      >
                        <Package className="h-3 w-3 mr-1" />
                        {process.label} ({count})
                      </Badge>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search WO, Customer, Item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {Object.entries(DEFAULT_COLUMNS).map(([key, _]) => (
                    <DropdownMenuItem key={key} onSelect={(e) => e.preventDefault()}>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          checked={visibleColumns[key]}
                          onCheckedChange={() => toggleColumn(key)}
                        />
                        <Label className="capitalize cursor-pointer">{key}</Label>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline">
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem onClick={handleExportCSV}>
                      Export as CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPDF}>
                      Export as PDF
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-destructive">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Error loading Work Orders</p>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </CardContent>
          </Card>
        )}

        {loading && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">Loading work orders...</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && filteredOrders.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-lg font-medium">No Work Orders Found</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && filteredOrders.length > 0 && (
          <div className="space-y-4">
            {filteredOrders.map((wo) => {
              const externalWIP = getExternalWIPSummary(wo);
              const overdueReturns = hasOverdueReturns(wo);
              const aging = getAging(wo);

              return (
                <Card key={wo.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                  <div onClick={() => navigate(`/work-orders/${wo.id}`)} className="flex-1 cursor-pointer">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {wo.display_id || wo.wo_id || "—"}
                          {wo.overdue_moves_count > 0 && (
                            <Badge variant="destructive" className="text-xs">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              {wo.overdue_moves_count} Overdue
                            </Badge>
                          )}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {visibleColumns.stage && (
                            <Badge variant="outline" className="capitalize">
                              {wo.current_stage?.replace(/_/g, " ") || "—"}
                            </Badge>
                          )}
                          {visibleColumns.external && wo.external_wip && Object.keys(wo.external_wip).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {Object.entries(wo.external_wip).map(([process, qty]: [string, any]) => (
                                <Badge 
                                  key={process}
                                  variant="secondary" 
                                  className="cursor-pointer bg-orange-500/10 text-orange-700 border-orange-300 hover:bg-orange-500/20" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/work-orders/${wo.id}?tab=external`);
                                  }}
                                >
                                  <Package className="h-3 w-3 mr-1" />
                                  {process.replace('_', ' ')}: {qty}
                                </Badge>
                              ))}
                            </div>
                          )}
                          {wo.cutting_required && <Scissors className="h-4 w-4 text-orange-600" />}
                          {wo.forging_required && <Hammer className="h-4 w-4 text-blue-600" />}
                        </div>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => {
                            setSelectedWO(wo);
                            setSendDialogOpen(true);
                          }}>
                            <Send className="h-4 w-4 mr-2" />
                            Send to External
                          </DropdownMenuItem>
                          {wo.external_moves?.length > 0 && (
                            <DropdownMenuItem onClick={() => {
                              setSelectedMove(wo.external_moves[0]);
                              setReceiptDialogOpen(true);
                            }}>
                              <Package className="h-4 w-4 mr-2" />
                              Record Receipt
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => navigate(`/work-orders/${wo.id}?tab=external`)}>
                            View External Timeline
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteWorkOrder(wo.id, wo.display_id || wo.wo_id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent onClick={() => navigate(`/work-orders/${wo.id}`)} className="cursor-pointer">
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                      {visibleColumns.customer && (
                        <div>
                          <p className="text-muted-foreground">Customer</p>
                          <p className="font-medium truncate">{wo.customer || "—"}</p>
                        </div>
                      )}
                      {visibleColumns.item && (
                        <div>
                          <p className="text-muted-foreground">Item</p>
                          <p className="font-medium truncate">{wo.item_code || "—"}</p>
                        </div>
                      )}
                      {visibleColumns.qty && (
                        <div>
                          <p className="text-muted-foreground">Quantity</p>
                          <p className="font-medium">{wo.quantity || 0} pcs</p>
                        </div>
                      )}
                      {visibleColumns.due && (
                        <div>
                          <p className="text-muted-foreground">Due Date</p>
                          <p className="font-medium">
                            {wo.due_date ? new Date(wo.due_date).toLocaleDateString() : "—"}
                          </p>
                        </div>
                      )}
                      {visibleColumns.aging && (
                        <div>
                          <p className="text-muted-foreground">Age</p>
                          <p className="font-medium">{aging} days</p>
                        </div>
                      )}
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <Badge variant={wo.status === 'completed' ? 'default' : 'secondary'}>
                          {wo.status?.replace('_', ' ')}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} work orders
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {selectedWO && (
        <SendToExternalDialog
          open={sendDialogOpen}
          onOpenChange={setSendDialogOpen}
          workOrder={selectedWO}
          onSuccess={() => {
            loadWorkOrders();
            setSendDialogOpen(false);
          }}
        />
      )}

      {selectedMove && (
        <ExternalReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          move={selectedMove}
          onSuccess={() => {
            loadWorkOrders();
            setReceiptDialogOpen(false);
          }}
        />
      )}
    </div>
  );
};

export default WorkOrders;
