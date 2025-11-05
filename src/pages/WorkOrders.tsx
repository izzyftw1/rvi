import { useEffect, useState, useMemo, useCallback, memo } from "react";
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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertCircle, Trash2, Send, Package, MoreVertical, Settings2, Search, Download, Factory, CheckCircle2, PackageCheck, Truck, AlertTriangle, Filter, Clock, TrendingUp, Inbox, Scissors, Hammer, Box, FileDown, Calendar } from "lucide-react";
import { NavigationHeader } from "@/components/NavigationHeader";
import { useToast } from "@/hooks/use-toast";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays, format as formatDate } from "date-fns";
import { downloadCSV, downloadPDF, formatExternalWIP } from "@/lib/exportHelpers";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const COLUMNS_KEY = "workorders_visible_columns";
const FILTER_KEY = "workorders_last_filter";
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

// Stage configuration with icons and colors
const INTERNAL_STAGES = [
  { value: 'goods_in', label: 'Goods In', icon: Inbox, color: 'hsl(var(--muted))' },
  { value: 'cutting_queue', label: 'Cutting', icon: Scissors, color: 'hsl(210 90% 52%)' },
  { value: 'forging_queue', label: 'Forging', icon: Hammer, color: 'hsl(38 92% 50%)' },
  { value: 'production', label: 'Production', icon: Factory, color: 'hsl(210 90% 42%)' },
  { value: 'qc', label: 'QC', icon: CheckCircle2, color: 'hsl(142 76% 36%)' },
  { value: 'packing', label: 'Packing', icon: Box, color: 'hsl(210 70% 40%)' },
  { value: 'dispatch', label: 'Dispatch', icon: Truck, color: 'hsl(142 76% 40%)' },
];

const EXTERNAL_STAGES = [
  { value: 'job_work', label: 'Job Work', icon: Package },
  { value: 'plating', label: 'Plating', icon: PackageCheck },
  { value: 'buffing', label: 'Buffing', icon: Package },
  { value: 'blasting', label: 'Blasting', icon: Package },
  { value: 'forging', label: 'Forging (Ext)', icon: Hammer },
];

// Memoized Stage Chip Component
const StageChip = memo(({ 
  stage, 
  count, 
  isActive, 
  onClick, 
  isExternal = false 
}: { 
  stage: any; 
  count: number; 
  isActive: boolean; 
  onClick: () => void; 
  isExternal?: boolean;
}) => {
  const Icon = stage.icon;
  
  return (
    <Badge
      variant={isActive ? 'default' : 'outline'}
      className={cn(
        "cursor-pointer transition-all duration-300 hover:scale-105 px-3 py-2 gap-1.5",
        isExternal 
          ? isActive 
            ? "bg-accent text-accent-foreground hover:bg-accent/90" 
            : "bg-accent/10 text-accent border-accent/30 hover:bg-accent/20"
          : isActive 
            ? "bg-primary text-primary-foreground shadow-md" 
            : "hover:bg-primary/10"
      )}
      onClick={onClick}
    >
      <Icon className="h-3.5 w-3.5" />
      <span className="font-medium">{stage.label}</span>
      <span className={cn(
        "ml-1 px-1.5 py-0.5 rounded-full text-xs font-semibold min-w-[1.5rem] text-center",
        count === 0 
          ? "bg-muted text-muted-foreground" 
          : isActive 
            ? "bg-background/20" 
            : isExternal 
              ? "bg-accent/20" 
              : "bg-primary/20"
      )}>
        {count}
      </span>
    </Badge>
  );
});

StageChip.displayName = "StageChip";

// Memoized Work Order Row Component
const WorkOrderRow = memo(({ 
  wo, 
  visibleColumns, 
  onDelete, 
  onSendToExternal, 
  onReceiveFromExternal,
  onNavigate,
  onStageClick
}: any) => {
  const getShortWOId = () => {
    const itemCode = wo.item_code || '';
    const shortItem = itemCode.length > 10 ? itemCode.substring(0, 10) + '...' : itemCode;
    return `ISO-${wo.customer_po || 'N/A'}-${shortItem}`;
  };

  const getStageColor = () => {
    const stage = INTERNAL_STAGES.find(s => s.value === wo.current_stage);
    return stage?.color || 'hsl(var(--muted))';
  };

  const getExternalWIPBadges = () => {
    if (!wo.external_wip || Object.keys(wo.external_wip).length === 0) return null;
    
    return Object.entries(wo.external_wip)
      .filter(([_, qty]: any) => qty > 0)
      .map(([process, qty]: any) => {
        const move = wo.external_moves?.find((m: any) => m.process === process && m.status !== 'received_full');
        const dueDate = move?.expected_return_date ? formatDate(parseISO(move.expected_return_date), 'MMM dd') : null;
        const isOverdue = move?.expected_return_date && isPast(parseISO(move.expected_return_date));
        
        return (
          <TooltipProvider key={process}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className={cn(
                    "bg-accent/10 text-accent border-accent/30 gap-1",
                    isOverdue && "border-destructive/50 bg-destructive/10"
                  )}
                >
                  {process.replace('_', ' ')}: {qty}
                  {dueDate && (
                    <span className={cn(
                      "text-xs",
                      isOverdue && "text-destructive font-semibold"
                    )}>
                      • {dueDate}
                    </span>
                  )}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">{process.replace('_', ' ')}</p>
                <p className="text-xs text-muted-foreground">
                  {qty} pcs {dueDate ? `• Due ${dueDate}` : ''}
                </p>
                {isOverdue && <p className="text-xs text-destructive font-semibold">Overdue!</p>}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      });
  };

  const hasOverdue = wo.external_moves?.some((m: any) => 
    m.expected_return_date && 
    isPast(parseISO(m.expected_return_date)) && 
    m.status !== 'received_full'
  );

  const getProgressPercent = () => {
    if (!wo.quantity || wo.quantity === 0) return 0;
    const completed = wo.qty_completed || 0;
    return Math.min(100, Math.round((completed / wo.quantity) * 100));
  };

  return (
    <Card 
      className="hover:shadow-lg transition-all duration-300 cursor-pointer group animate-fade-in"
      onClick={() => onNavigate(wo.id)}
    >
      <CardContent className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          {/* WO ID & Status */}
          <div className="md:col-span-3">
            <HoverCard>
              <HoverCardTrigger>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-foreground hover:text-primary transition-colors">
                      {getShortWOId()}
                    </p>
                    {hasOverdue && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {wo.overdue_moves_count || 1}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {wo.customer}
                    </p>
                    <span className="text-xs text-muted-foreground">•</span>
                    <p className="text-xs text-muted-foreground line-clamp-1">
                      {wo.item_code}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Progress value={getProgressPercent()} className="h-1.5 flex-1" />
                    <span className="text-xs font-medium text-muted-foreground min-w-[3rem]">
                      {getProgressPercent()}%
                    </span>
                  </div>
                </div>
              </HoverCardTrigger>
              <HoverCardContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold">Work Order Details</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="text-muted-foreground">Customer:</div>
                    <div className="font-medium">{wo.customer}</div>
                    <div className="text-muted-foreground">PO Date:</div>
                    <div>{wo.created_at ? new Date(wo.created_at).toLocaleDateString() : 'N/A'}</div>
                    <div className="text-muted-foreground">Item Code:</div>
                    <div className="font-medium">{wo.item_code}</div>
                    <div className="text-muted-foreground">Progress:</div>
                    <div className="flex items-center gap-2">
                      <Progress value={getProgressPercent()} className="h-2 flex-1" />
                      <span className="text-xs font-medium">{getProgressPercent()}%</span>
                    </div>
                  </div>
                </div>
              </HoverCardContent>
            </HoverCard>
          </div>

          {/* Item & Quantity */}
          {visibleColumns.item && (
            <div className="md:col-span-2">
              <p className="text-sm font-medium text-foreground">{wo.item_code}</p>
              {visibleColumns.qty && (
                <p className="text-xs text-muted-foreground">Qty: {wo.quantity?.toLocaleString()}</p>
              )}
            </div>
          )}

          {/* Current Stage - Clickable */}
          {visibleColumns.stage && (
            <div className="md:col-span-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge 
                      className="font-medium cursor-pointer hover:opacity-80 transition-opacity"
                      style={{ 
                        backgroundColor: getStageColor(),
                        color: 'hsl(var(--primary-foreground))'
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        onStageClick(wo.current_stage);
                      }}
                    >
                      {wo.current_stage?.replace('_', ' ').toUpperCase()}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Click to filter by this stage
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}

          {/* External WIP */}
          {visibleColumns.external && (
            <div className="md:col-span-3 flex flex-wrap gap-1">
              {getExternalWIPBadges() || (
                <span className="text-xs text-muted-foreground">No external WIP</span>
              )}
            </div>
          )}

          {/* Due Date & Aging */}
          <div className="md:col-span-1">
            {visibleColumns.due && wo.due_date && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(wo.due_date).toLocaleDateString()}
              </p>
            )}
            {visibleColumns.aging && (
              <p className="text-xs text-muted-foreground mt-1">
                {Math.floor((new Date().getTime() - new Date(wo.created_at).getTime()) / (1000 * 60 * 60 * 24))}d
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="md:col-span-1 flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onSendToExternal(wo);
                }}>
                  <Send className="h-4 w-4 mr-2" />
                  Send to External
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => {
                  e.stopPropagation();
                  onReceiveFromExternal(wo);
                }}>
                  <Package className="h-4 w-4 mr-2" />
                  Receive from External
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(wo.id, wo.display_id || wo.wo_id);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

WorkOrderRow.displayName = "WorkOrderRow";

const WorkOrders = () => {
  const navigate = useNavigate();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  
  // Filters with localStorage persistence
  const [searchQuery, setSearchQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(() => {
    const saved = localStorage.getItem(FILTER_KEY);
    return saved || "all";
  });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [hasMore, setHasMore] = useState(true);
  
  // Column toggles
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const saved = localStorage.getItem(COLUMNS_KEY);
    return saved ? JSON.parse(saved) : DEFAULT_COLUMNS;
  });
  
  // External processing
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);

  // Debounced load function
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  
  const loadWorkOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize;

      const { data: workOrders, error: queryError } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (queryError) throw queryError;

      setHasMore((workOrders || []).length === pageSize);

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

      const data = (workOrders || []).map((wo: any) => ({
        ...wo,
        external_moves: movesMap[wo.id] || [],
      }));

      setWorkOrders(data);
    } catch (err: any) {
      console.error("Error loading work orders:", err);
      setError(err.message || "Failed to load work orders");
      setWorkOrders([]);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize]);

  // Debounced realtime subscription
  useEffect(() => {
    loadWorkOrders();

    let timeout: NodeJS.Timeout;
    const channel = supabase
      .channel('work_orders_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_orders' }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_moves' }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wo_external_receipts' }, () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => setLastUpdate(Date.now()), 500);
      })
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [currentPage, loadWorkOrders]);

  useEffect(() => {
    if (lastUpdate > 0) {
      loadWorkOrders();
    }
  }, [lastUpdate, loadWorkOrders]);

  // Persist filter selection
  useEffect(() => {
    localStorage.setItem(FILTER_KEY, stageFilter);
  }, [stageFilter]);

  useEffect(() => {
    localStorage.setItem(COLUMNS_KEY, JSON.stringify(visibleColumns));
  }, [visibleColumns]);

  // Memoized filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = [...workOrders];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(wo =>
        wo.display_id?.toLowerCase().includes(query) ||
        wo.wo_id?.toLowerCase().includes(query) ||
        wo.customer?.toLowerCase().includes(query) ||
        wo.item_code?.toLowerCase().includes(query)
      );
    }

    if (stageFilter !== "all") {
      if (EXTERNAL_STAGES.some(s => s.value === stageFilter)) {
        filtered = filtered.filter(wo =>
          (wo.external_wip && wo.external_wip[stageFilter] > 0) ||
          wo.external_moves?.some((m: any) => m.process === stageFilter && m.status !== 'received_full')
        );
      } else {
        filtered = filtered.filter(wo => wo.current_stage === stageFilter);
      }
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(wo => wo.status === statusFilter);
    }

    return filtered;
  }, [workOrders, searchQuery, stageFilter, statusFilter]);

  // Memoized stage counts
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: workOrders.length };
    
    INTERNAL_STAGES.forEach(stage => {
      counts[stage.value] = workOrders.filter(wo => wo.current_stage === stage.value).length;
    });
    
    EXTERNAL_STAGES.forEach(stage => {
      counts[stage.value] = workOrders.filter(wo => 
        wo.external_wip && wo.external_wip[stage.value] > 0
      ).length;
    });
    
    return counts;
  }, [workOrders]);

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
    ];

    downloadPDF(exportData, 'work_orders', 'Work Orders Report', columns);
    toast({ description: 'PDF export completed' });
  };

  const loadMore = () => {
    setCurrentPage(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-background">
      <NavigationHeader />
      
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Work Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" />
              Manage production orders across all stages
            </p>
          </div>
          <Button onClick={() => navigate("/work-orders/new")} className="shadow-md hover:shadow-lg transition-shadow">
            <Plus className="h-4 w-4 mr-2" />
            New Work Order
          </Button>
        </div>

        {/* Stage Filter Chips - Sticky on scroll */}
        <div className="sticky top-16 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 -mx-4 px-4 py-4 border-b">
          <Card className="shadow-lg">
            <CardContent className="pt-6 pb-4">
              <div className="space-y-4">
                {/* Active Filter Indicator */}
                {stageFilter !== 'all' && (
                  <div className="flex items-center justify-between gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-primary" />
                      <p className="text-sm font-medium">
                        Active Filter: <span className="text-primary">{stageFilter.replace('_', ' ').toUpperCase()}</span>
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setStageFilter('all')}
                    >
                      Clear Filter
                    </Button>
                  </div>
                )}

                {/* Internal Stages */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Factory className="h-4 w-4 text-primary" />
                    <p className="text-sm font-semibold text-foreground">Internal Processes</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <StageChip
                      stage={{ value: 'all', label: 'All Work Orders', icon: Factory }}
                      count={stageCounts.all || 0}
                      isActive={stageFilter === 'all'}
                      onClick={() => setStageFilter('all')}
                    />
                    {INTERNAL_STAGES.map((stage) => (
                      <StageChip
                        key={stage.value}
                        stage={stage}
                        count={stageCounts[stage.value] || 0}
                        isActive={stageFilter === stage.value}
                        onClick={() => setStageFilter(stage.value)}
                      />
                    ))}
                  </div>
                </div>

                {/* External Stages */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="h-4 w-4 text-accent" />
                    <p className="text-sm font-semibold text-foreground">External Processes</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {EXTERNAL_STAGES.map((process) => (
                      <StageChip
                        key={process.value}
                        stage={process}
                        count={stageCounts[process.value] || 0}
                        isActive={stageFilter === process.value}
                        onClick={() => setStageFilter(process.value)}
                        isExternal
                      />
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters - Desktop */}
        <Card className="hidden md:block">
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
                    View Options
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

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon">
                          <FileDown className="h-4 w-4" />
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
                  </TooltipTrigger>
                  <TooltipContent>
                    Download Excel Summary
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        {/* Filters - Mobile */}
        <div className="md:hidden">
          <Sheet open={showMobileFilters} onOpenChange={setShowMobileFilters}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full">
                <Filter className="h-4 w-4 mr-2" />
                Filters & Options
              </Button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[80vh]">
              <SheetHeader>
                <SheetTitle>Filters & Options</SheetTitle>
              </SheetHeader>
              <div className="space-y-4 mt-6">
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
                <div className="space-y-2">
                  <Label className="font-semibold">Visible Columns</Label>
                  {Object.entries(DEFAULT_COLUMNS).map(([key, _]) => (
                    <div key={key} className="flex items-center space-x-2">
                      <Checkbox
                        checked={visibleColumns[key]}
                        onCheckedChange={() => toggleColumn(key)}
                      />
                      <Label className="capitalize cursor-pointer">{key}</Label>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportCSV} className="flex-1">
                    Export CSV
                  </Button>
                  <Button variant="outline" onClick={handleExportPDF} className="flex-1">
                    Export PDF
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive animate-fade-in">
            <CardContent className="py-6">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Error loading Work Orders</p>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading Skeletons */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredOrders.length === 0 && (
          <Card className="animate-fade-in">
            <CardContent className="py-12 text-center">
              <Factory className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium">No Work Orders Found</p>
              <p className="text-sm text-muted-foreground mt-2">
                {stageFilter !== 'all' 
                  ? `No work orders in ${stageFilter.replace('_', ' ')} stage`
                  : 'Create a new work order to get started'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Work Orders List */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div className="space-y-3">
            {filteredOrders.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                visibleColumns={visibleColumns}
                onDelete={handleDeleteWorkOrder}
                onSendToExternal={(wo: any) => {
                  setSelectedWO(wo);
                  setSendDialogOpen(true);
                }}
                onReceiveFromExternal={(wo: any) => {
                  setSelectedWO(wo);
                  setReceiptDialogOpen(true);
                }}
                onNavigate={(id: string) => navigate(`/work-orders/${id}`)}
                onStageClick={(stage: string) => setStageFilter(stage)}
              />
            ))}

            {/* Load More */}
            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button 
                  variant="outline" 
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <SendToExternalDialog
        open={sendDialogOpen}
        onOpenChange={setSendDialogOpen}
        workOrder={selectedWO}
        onSuccess={loadWorkOrders}
      />
      
      {selectedWO?.external_moves?.[0] && (
        <ExternalReceiptDialog
          open={receiptDialogOpen}
          onOpenChange={setReceiptDialogOpen}
          move={selectedWO.external_moves[0]}
          onSuccess={loadWorkOrders}
        />
      )}
    </div>
  );
};

export default WorkOrders;
