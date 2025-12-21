import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertCircle, Trash2, Send, Package, MoreVertical, Search, Factory, CheckCircle2, Truck, AlertTriangle, Clock, ExternalLink, ArrowRight, Timer, Building2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays, format as formatDate } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Compact stage configuration
const STAGES = {
  goods_in: { label: 'Goods In', color: 'bg-slate-500' },
  cutting_queue: { label: 'Cutting', color: 'bg-blue-500' },
  production: { label: 'Production', color: 'bg-indigo-500' },
  qc: { label: 'QC', color: 'bg-emerald-500' },
  packing: { label: 'Packing', color: 'bg-violet-500' },
  dispatch: { label: 'Dispatch', color: 'bg-green-600' },
};

// Memoized KPI Card
const KPICard = memo(({ 
  label, 
  count, 
  icon: Icon, 
  variant = 'default',
  onClick 
}: { 
  label: string; 
  count: number; 
  icon: any; 
  variant?: 'default' | 'warning' | 'danger';
  onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left",
      variant === 'danger' && "bg-destructive/10 border border-destructive/30 hover:bg-destructive/20",
      variant === 'warning' && "bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20",
      variant === 'default' && "bg-muted/50 border border-border hover:bg-muted"
    )}
  >
    <Icon className={cn(
      "h-5 w-5",
      variant === 'danger' && "text-destructive",
      variant === 'warning' && "text-amber-500",
      variant === 'default' && "text-muted-foreground"
    )} />
    <div>
      <p className={cn(
        "text-2xl font-bold",
        variant === 'danger' && "text-destructive",
        variant === 'warning' && "text-amber-600",
        variant === 'default' && "text-foreground"
      )}>
        {count}
      </p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  </button>
));
KPICard.displayName = "KPICard";

// Compact Work Order Row
const WorkOrderRow = memo(({ 
  wo, 
  onDelete, 
  onSendToExternal, 
  onReceiveFromExternal,
  onNavigate,
  canManageExternal
}: any) => {
  const stageConfig = STAGES[wo.current_stage as keyof typeof STAGES] || STAGES.goods_in;
  
  const isOverdue = wo.due_date && isPast(parseISO(wo.due_date)) && wo.status !== 'completed';
  const daysUntilDue = wo.due_date ? differenceInDays(parseISO(wo.due_date), new Date()) : null;
  
  const externalWipTotal = wo.external_wip 
    ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
    : 0;
  
  const hasExternalOverdue = wo.external_moves?.some((m: any) => 
    m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
  );

  const ownershipType = externalWipTotal > 0 ? 'external' : 'internal';

  return (
    <div 
      className={cn(
        "group flex items-center gap-4 px-4 py-3 bg-card border rounded-lg cursor-pointer transition-all hover:shadow-md",
        isOverdue && "border-l-4 border-l-destructive",
        hasExternalOverdue && !isOverdue && "border-l-4 border-l-amber-500"
      )}
      onClick={() => onNavigate(wo.id)}
    >
      {/* Stage Indicator */}
      <div className="flex-shrink-0">
        <Badge className={cn("text-white text-xs font-medium", stageConfig.color)}>
          {stageConfig.label}
        </Badge>
      </div>

      {/* Main Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground truncate">
            {wo.customer_po || wo.wo_id?.slice(0, 8)}
          </span>
          <span className="text-muted-foreground">•</span>
          <span className="text-sm text-muted-foreground truncate">{wo.customer}</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">{wo.item_code}</p>
      </div>

      {/* Quantity */}
      <div className="hidden sm:block text-right min-w-[60px]">
        <p className="text-sm font-medium">{wo.quantity?.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground">pcs</p>
      </div>

      {/* Ownership Indicator */}
      <div className="flex-shrink-0 min-w-[90px]">
        {ownershipType === 'external' ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className={cn(
                  "gap-1 text-xs",
                  hasExternalOverdue ? "border-amber-500 text-amber-600 bg-amber-500/10" : "border-accent text-accent"
                )}>
                  <ExternalLink className="h-3 w-3" />
                  {externalWipTotal} ext
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">External WIP: {externalWipTotal} pcs</p>
                {Object.entries(wo.external_wip || {}).map(([process, qty]: any) => (
                  qty > 0 && <p key={process} className="text-xs">{process}: {qty}</p>
                ))}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Building2 className="h-3 w-3" />
            Internal
          </Badge>
        )}
      </div>

      {/* Due Date */}
      <div className="hidden md:flex flex-shrink-0 min-w-[80px] items-center gap-1">
        {wo.due_date ? (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <span className={cn(
                  "text-xs flex items-center gap-1",
                  isOverdue ? "text-destructive font-semibold" : 
                  daysUntilDue !== null && daysUntilDue <= 3 ? "text-amber-600" : "text-muted-foreground"
                )}>
                  <Clock className="h-3 w-3" />
                  {formatDate(parseISO(wo.due_date), 'MMM dd')}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isOverdue ? 'Overdue!' : daysUntilDue !== null ? `${daysUntilDue} days remaining` : 'Due date'}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground">No due date</span>
        )}
      </div>

      {/* Status Flags */}
      <div className="flex items-center gap-1">
        {isOverdue && (
          <Badge variant="destructive" className="text-xs px-1.5">
            <AlertTriangle className="h-3 w-3" />
          </Badge>
        )}
        {hasExternalOverdue && !isOverdue && (
          <Badge variant="outline" className="text-xs px-1.5 border-amber-500 text-amber-600">
            <Timer className="h-3 w-3" />
          </Badge>
        )}
      </div>

      {/* Quick Actions */}
      <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigate(wo.id); }}>
              <ArrowRight className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {canManageExternal && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSendToExternal(wo); }}>
                  <Send className="h-4 w-4 mr-2" />
                  Send External
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onReceiveFromExternal(wo); }}>
                  <Package className="h-4 w-4 mr-2" />
                  Receive External
                </DropdownMenuItem>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="text-destructive"
              onClick={(e) => { e.stopPropagation(); onDelete(wo.id, wo.display_id || wo.wo_id); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
});
WorkOrderRow.displayName = "WorkOrderRow";

const WorkOrders = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { hasAnyRole } = useUserRole();
  
  const canManageExternal = hasAnyRole(['production', 'logistics', 'admin']);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [viewFilter, setViewFilter] = useState<'all' | 'blocked' | 'delayed' | 'external'>(() => {
    const urlFilter = searchParams.get('view');
    return (urlFilter as any) || 'all';
  });
  const [stageFilter, setStageFilter] = useState<string>(() => searchParams.get('stage') || 'all');
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
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
        .neq("status", "completed")
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
      .subscribe();

    return () => {
      clearTimeout(timeout);
      supabase.removeChannel(channel);
    };
  }, [currentPage, loadWorkOrders]);

  useEffect(() => {
    if (lastUpdate > 0) loadWorkOrders();
  }, [lastUpdate, loadWorkOrders]);

  // Compute KPIs
  const kpis = useMemo(() => {
    const now = new Date();
    let blocked = 0, delayed = 0, externalWIP = 0;
    
    workOrders.forEach(wo => {
      // Delayed: past due date
      if (wo.due_date && isPast(parseISO(wo.due_date)) && wo.status !== 'completed') {
        delayed++;
      }
      // External overdue counts as blocked
      const hasExternalOverdue = wo.external_moves?.some((m: any) => 
        m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
      );
      if (hasExternalOverdue) blocked++;
      
      // External WIP count
      if (wo.external_wip) {
        const total = Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number;
        if (total > 0) externalWIP++;
      }
    });
    
    return { total: workOrders.length, blocked, delayed, externalWIP };
  }, [workOrders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = [...workOrders];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(wo =>
        wo.display_id?.toLowerCase().includes(query) ||
        wo.wo_id?.toLowerCase().includes(query) ||
        wo.customer?.toLowerCase().includes(query) ||
        wo.customer_po?.toLowerCase().includes(query) ||
        wo.item_code?.toLowerCase().includes(query)
      );
    }

    // View filter
    if (viewFilter === 'delayed') {
      filtered = filtered.filter(wo => wo.due_date && isPast(parseISO(wo.due_date)));
    } else if (viewFilter === 'blocked') {
      filtered = filtered.filter(wo => 
        wo.external_moves?.some((m: any) => 
          m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
        )
      );
    } else if (viewFilter === 'external') {
      filtered = filtered.filter(wo => {
        const total = wo.external_wip 
          ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
          : 0;
        return total > 0;
      });
    }

    // Stage filter
    if (stageFilter !== 'all') {
      filtered = filtered.filter(wo => wo.current_stage === stageFilter);
    }

    return filtered;
  }, [workOrders, searchQuery, viewFilter, stageFilter]);

  // Stage counts for filter bar
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filteredOrders.length };
    Object.keys(STAGES).forEach(stage => {
      counts[stage] = filteredOrders.filter(wo => wo.current_stage === stage).length;
    });
    return counts;
  }, [filteredOrders]);

  const handleDeleteWorkOrder = async (woId: string, displayId: string) => {
    if (!confirm(`Delete Work Order ${displayId}?`)) return;
    try {
      const { error } = await supabase.from("work_orders").delete().eq("id", woId);
      if (error) throw error;
      toast({ description: `Deleted ${displayId}` });
      loadWorkOrders();
    } catch (err: any) {
      toast({ variant: "destructive", description: err.message });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Work Orders</h1>
            <p className="text-sm text-muted-foreground">Operational Control Panel</p>
          </div>
          <Button onClick={() => navigate("/work-orders/new")} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New WO
          </Button>
        </div>

        {/* KPI Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard 
            label="Active Orders" 
            count={kpis.total} 
            icon={Factory} 
            onClick={() => { setViewFilter('all'); setStageFilter('all'); }}
          />
          <KPICard 
            label="Blocked / Overdue Ext" 
            count={kpis.blocked} 
            icon={AlertTriangle} 
            variant={kpis.blocked > 0 ? 'danger' : 'default'}
            onClick={() => setViewFilter('blocked')}
          />
          <KPICard 
            label="Past Due Date" 
            count={kpis.delayed} 
            icon={Clock} 
            variant={kpis.delayed > 0 ? 'warning' : 'default'}
            onClick={() => setViewFilter('delayed')}
          />
          <KPICard 
            label="At External" 
            count={kpis.externalWIP} 
            icon={ExternalLink} 
            onClick={() => setViewFilter('external')}
          />
        </div>

        {/* Compact Filter Bar */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative flex-1 min-w-[200px] max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>

              {/* Stage Pills */}
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setStageFilter('all')}
                  className={cn(
                    "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                    stageFilter === 'all' 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  )}
                >
                  All ({stageCounts.all})
                </button>
                {Object.entries(STAGES).map(([key, config]) => (
                  <button
                    key={key}
                    onClick={() => setStageFilter(key)}
                    className={cn(
                      "px-3 py-1 text-xs font-medium rounded-full transition-colors",
                      stageFilter === key 
                        ? cn("text-white", config.color)
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {config.label} ({stageCounts[key] || 0})
                  </button>
                ))}
              </div>

              {/* Active View Filter Indicator */}
              {viewFilter !== 'all' && (
                <Badge 
                  variant="secondary" 
                  className="cursor-pointer" 
                  onClick={() => setViewFilter('all')}
                >
                  {viewFilter === 'blocked' ? 'Blocked' : viewFilter === 'delayed' ? 'Delayed' : 'External'} 
                  <span className="ml-1">×</span>
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error State */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="py-4">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-5 w-5" />
                <p className="font-medium">Failed to load</p>
              </div>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && filteredOrders.length === 0 && (
          <Card>
            <CardContent className="py-0">
              <EmptyState
                icon="workOrders"
                title={viewFilter !== 'all' 
                  ? `No ${viewFilter} work orders`
                  : stageFilter !== 'all' 
                    ? `No orders in ${STAGES[stageFilter as keyof typeof STAGES]?.label || stageFilter}`
                    : "No active work orders"
                }
                description="All clear! Create a new work order to get started."
                action={viewFilter === 'all' && stageFilter === 'all' ? {
                  label: "Create Work Order",
                  onClick: () => navigate("/work-orders/new"),
                } : {
                  label: "Clear Filters",
                  onClick: () => { setViewFilter('all'); setStageFilter('all'); setSearchQuery(''); },
                  variant: "outline",
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Work Orders List */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div className="space-y-2">
            {filteredOrders.map((wo) => (
              <WorkOrderRow
                key={wo.id}
                wo={wo}
                onDelete={handleDeleteWorkOrder}
                onSendToExternal={(wo: any) => { setSelectedWO(wo); setSendDialogOpen(true); }}
                onReceiveFromExternal={(wo: any) => { setSelectedWO(wo); setReceiptDialogOpen(true); }}
                onNavigate={(id: string) => navigate(`/work-orders/${id}`)}
                canManageExternal={canManageExternal}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-4">
                <Button variant="outline" onClick={() => setCurrentPage(p => p + 1)} disabled={loading}>
                  Load More
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
