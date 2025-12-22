import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertCircle, Trash2, Send, Package, MoreVertical, Search, Factory, CheckCircle2, Truck, AlertTriangle, Clock, ExternalLink, ArrowRight, Timer, Building2, Scissors, Hammer, Box, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays, format as formatDate } from "date-fns";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Internal stages
const INTERNAL_STAGES = {
  goods_in: { label: 'Goods In', color: 'bg-slate-500', icon: Inbox },
  cutting_queue: { label: 'Cutting', color: 'bg-blue-500', icon: Scissors },
  production: { label: 'Production', color: 'bg-indigo-500', icon: Factory },
  qc: { label: 'QC', color: 'bg-emerald-500', icon: CheckCircle2 },
  packing: { label: 'Packing', color: 'bg-violet-500', icon: Box },
  dispatch: { label: 'Dispatch', color: 'bg-green-600', icon: Truck },
};

// External processes
const EXTERNAL_STAGES = {
  forging: { label: 'Forging', color: 'bg-orange-500', process: 'Forging' },
  heat_treatment: { label: 'Heat Treatment', color: 'bg-red-500', process: 'Heat Treatment' },
  plating: { label: 'Plating', color: 'bg-cyan-500', process: 'Plating' },
  job_work: { label: 'Job Work', color: 'bg-purple-500', process: 'Job Work' },
  buffing: { label: 'Buffing', color: 'bg-amber-500', process: 'Buffing' },
  blasting: { label: 'Blasting', color: 'bg-gray-500', process: 'Blasting' },
};

// Legacy stage mapping for display
const STAGES = { ...INTERNAL_STAGES };

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

// Work Order Card - Stage-dominant design with clear status signals
const WorkOrderRow = memo(({ 
  wo, 
  onDelete, 
  onSendToExternal, 
  onReceiveFromExternal,
  onNavigate,
  canManageExternal
}: any) => {
  const stageConfig = STAGES[wo.current_stage as keyof typeof STAGES] || STAGES.goods_in;
  const StageIcon = stageConfig.icon;
  
  const isOverdue = wo.due_date && isPast(parseISO(wo.due_date)) && wo.status !== 'completed';
  const daysUntilDue = wo.due_date ? differenceInDays(parseISO(wo.due_date), new Date()) : null;
  const daysOverdue = isOverdue && wo.due_date ? Math.abs(differenceInDays(new Date(), parseISO(wo.due_date))) : 0;
  
  const externalWipTotal = wo.external_wip 
    ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
    : 0;
  
  const hasExternalOverdue = wo.external_moves?.some((m: any) => 
    m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
  );

  // Determine card status for styling
  const isBlocked = hasExternalOverdue;
  const hasIssue = isOverdue || isBlocked;
  const isExternal = externalWipTotal > 0;

  return (
    <div 
      className={cn(
        "group flex items-stretch rounded-md cursor-pointer transition-all hover:shadow-md overflow-hidden border",
        // Background tint for issues (priority)
        isOverdue && "bg-destructive/5 border-destructive/40",
        isBlocked && !isOverdue && "bg-amber-500/5 border-amber-500/40",
        // External ownership distinction (when no issues)
        !hasIssue && isExternal && "bg-purple-500/5 border-purple-500/30 hover:border-purple-500/50",
        !hasIssue && !isExternal && "bg-card border-border hover:border-border/80"
      )}
      onClick={() => onNavigate(wo.id)}
    >
      {/* Status Strip - Left edge indicator */}
      {(hasIssue || isExternal) && (
        <div className={cn(
          "w-1 flex-shrink-0",
          isOverdue ? "bg-destructive" : isBlocked ? "bg-amber-500" : "bg-purple-500"
        )} />
      )}

      {/* STAGE - Dominant Visual Element */}
      <div className={cn(
        "flex flex-row items-center justify-center gap-1.5 px-3 py-1.5 min-w-[80px] text-white relative",
        stageConfig.color
      )}>
        <StageIcon className="h-4 w-4" />
        <span className="text-[11px] font-bold uppercase tracking-wide">
          {stageConfig.label}
        </span>
        
        {/* Issue overlay icon on stage */}
        {hasIssue && (
          <div className={cn(
            "absolute -top-0.5 -right-0.5 rounded-full p-0.5",
            isOverdue ? "bg-destructive" : "bg-amber-500"
          )}>
            {isOverdue ? (
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            ) : (
              <Timer className="h-2.5 w-2.5 text-white" />
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 flex items-center gap-3 px-3 py-1.5">
        {/* Primary: PO / Customer + Status Badge */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-foreground truncate">
              {wo.customer_po || wo.wo_id?.slice(0, 8)}
            </p>
            {/* Inline status badges */}
            {isOverdue && (
              <Badge variant="destructive" className="text-[9px] px-1 py-0 h-4 gap-0.5 whitespace-nowrap">
                <AlertTriangle className="h-2.5 w-2.5" />
                {daysOverdue}d
              </Badge>
            )}
            {isBlocked && !isOverdue && (
              <Badge className="text-[9px] px-1 py-0 h-4 gap-0.5 whitespace-nowrap bg-amber-500 hover:bg-amber-500/90">
                <Timer className="h-2.5 w-2.5" />
                Ext
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">{wo.customer}</p>
        </div>

        {/* Secondary: Item & Qty */}
        <div className="hidden sm:flex items-center gap-3 text-xs text-muted-foreground">
          <span className="truncate max-w-[80px]">{wo.item_code}</span>
          <span className="font-medium text-foreground">{wo.quantity?.toLocaleString()}</span>
        </div>

        {/* External Ownership indicator */}
        {isExternal && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Badge className="gap-1 text-[10px] px-1.5 py-0.5 h-5 whitespace-nowrap bg-purple-500 hover:bg-purple-600 text-white">
                  <Building2 className="h-3 w-3" />
                  External
                  <span className="font-bold">{externalWipTotal}</span>
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="font-medium">At External Partner: {externalWipTotal} pcs</p>
                {Object.entries(wo.external_wip || {}).map(([process, qty]: any) => (
                  qty > 0 && <p key={process} className="text-xs">{process}: {qty}</p>
                ))}
                {hasExternalOverdue && (
                  <p className="text-xs text-amber-500 mt-1">⚠ Return overdue</p>
                )}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        {/* Due Date */}
        <div className="hidden md:block">
          {wo.due_date ? (
            <span className={cn(
              "text-[10px] flex items-center gap-0.5",
              isOverdue ? "text-destructive font-semibold" : 
              daysUntilDue !== null && daysUntilDue <= 3 ? "text-amber-600 font-medium" : "text-muted-foreground"
            )}>
              <Clock className="h-2.5 w-2.5" />
              {formatDate(parseISO(wo.due_date), 'MMM d')}
            </span>
          ) : null}
        </div>

        {/* Quick Actions */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <MoreVertical className="h-3.5 w-3.5" />
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
  // Level 1: Primary toggle - 'internal' or 'external'
  const [primaryFilter, setPrimaryFilter] = useState<'internal' | 'external'>(() => {
    const urlPrimary = searchParams.get('type');
    return urlPrimary === 'external' ? 'external' : 'internal';
  });
  // Level 2: Contextual stage filter based on primary selection
  const [stageFilter, setStageFilter] = useState<string>(() => searchParams.get('stage') || 'all');
  // Issue filter for blocked/delayed
  const [issueFilter, setIssueFilter] = useState<'all' | 'blocked' | 'delayed'>('all');
  // Show inactive (zero-count) stages toggle - for admins
  const [showInactiveStages, setShowInactiveStages] = useState(false);
  const isAdmin = hasAnyRole(['admin', 'super_admin']);
  
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
    let blocked = 0, delayed = 0, internalCount = 0, externalCount = 0;
    
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
      
      // Count by ownership
      const externalWipTotal = wo.external_wip 
        ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
        : 0;
      if (externalWipTotal > 0) {
        externalCount++;
      } else {
        internalCount++;
      }
    });
    
    return { total: workOrders.length, blocked, delayed, internalCount, externalCount };
  }, [workOrders]);

  // Filtered orders with two-level filtering
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

    // Level 1: Primary filter (Internal vs External)
    if (primaryFilter === 'external') {
      // Show only WOs with external WIP
      filtered = filtered.filter(wo => {
        const total = wo.external_wip 
          ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
          : 0;
        return total > 0;
      });
      
      // Level 2: External stage filter
      if (stageFilter !== 'all') {
        const externalStage = EXTERNAL_STAGES[stageFilter as keyof typeof EXTERNAL_STAGES];
        if (externalStage) {
          filtered = filtered.filter(wo => 
            wo.external_moves?.some((m: any) => 
              m.process === externalStage.process && m.status !== 'received_full'
            )
          );
        }
      }
    } else {
      // Internal: Show only WOs without external WIP (or all if viewing internal)
      filtered = filtered.filter(wo => {
        const total = wo.external_wip 
          ? Object.values(wo.external_wip).reduce((sum: number, qty: any) => sum + (qty || 0), 0) as number
          : 0;
        return total === 0;
      });
      
      // Level 2: Internal stage filter
      if (stageFilter !== 'all') {
        filtered = filtered.filter(wo => wo.current_stage === stageFilter);
      }
    }

    // Issue filter (blocked/delayed)
    if (issueFilter === 'delayed') {
      filtered = filtered.filter(wo => wo.due_date && isPast(parseISO(wo.due_date)));
    } else if (issueFilter === 'blocked') {
      filtered = filtered.filter(wo => 
        wo.external_moves?.some((m: any) => 
          m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
        )
      );
    }

    return filtered;
  }, [workOrders, searchQuery, primaryFilter, stageFilter, issueFilter]);

  // Stage counts for filter bar - contextual based on primary filter
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filteredOrders.length };
    
    if (primaryFilter === 'internal') {
      Object.keys(INTERNAL_STAGES).forEach(stage => {
        counts[stage] = filteredOrders.filter(wo => wo.current_stage === stage).length;
      });
    } else {
      Object.entries(EXTERNAL_STAGES).forEach(([key, config]) => {
        counts[key] = filteredOrders.filter(wo => 
          wo.external_moves?.some((m: any) => 
            m.process === config.process && m.status !== 'received_full'
          )
        ).length;
      });
    }
    
    return counts;
  }, [filteredOrders, primaryFilter]);

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
            onClick={() => { setIssueFilter('all'); setStageFilter('all'); }}
          />
          <KPICard 
            label="Blocked / Overdue Ext" 
            count={kpis.blocked} 
            icon={AlertTriangle} 
            variant={kpis.blocked > 0 ? 'danger' : 'default'}
            onClick={() => setIssueFilter('blocked')}
          />
          <KPICard 
            label="Past Due Date" 
            count={kpis.delayed} 
            icon={Clock} 
            variant={kpis.delayed > 0 ? 'warning' : 'default'}
            onClick={() => setIssueFilter('delayed')}
          />
          <KPICard 
            label="At External" 
            count={kpis.externalCount} 
            icon={ExternalLink} 
            onClick={() => { setPrimaryFilter('external'); setStageFilter('all'); }}
          />
        </div>

        {/* Two-Level Filter Bar */}
        <Card>
          <CardContent className="py-3 px-4 space-y-3">
            {/* Level 1: Primary Toggle */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-2">View:</span>
              <div className="inline-flex rounded-lg border border-border p-1 bg-muted/30">
                <button
                  onClick={() => { setPrimaryFilter('internal'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    primaryFilter === 'internal' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Building2 className="h-4 w-4" />
                  Internal
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                    {kpis.internalCount}
                  </Badge>
                </button>
                <button
                  onClick={() => { setPrimaryFilter('external'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium rounded-md transition-all",
                    primaryFilter === 'external' 
                      ? "bg-accent text-accent-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  External
                  <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">
                    {kpis.externalCount}
                  </Badge>
                </button>
              </div>

              {/* Issue Filter Badge */}
              {issueFilter !== 'all' && (
                <Badge 
                  variant={issueFilter === 'blocked' ? 'destructive' : 'default'}
                  className="cursor-pointer ml-2" 
                  onClick={() => setIssueFilter('all')}
                >
                  {issueFilter === 'blocked' ? 'Blocked Only' : 'Delayed Only'} 
                  <span className="ml-1">×</span>
                </Badge>
              )}
            </div>

            {/* Level 2: Contextual Stage Filters + Search */}
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

              {/* Contextual Stage Pills */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Demoted "All" as reset link - only show when a stage is selected */}
                {stageFilter !== 'all' && (
                  <button
                    onClick={() => setStageFilter('all')}
                    className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline transition-colors mr-1"
                  >
                    ← All ({stageCounts.all})
                  </button>
                )}
                
                {primaryFilter === 'internal' 
                  ? Object.entries(INTERNAL_STAGES)
                      .filter(([key]) => showInactiveStages || (stageCounts[key] || 0) > 0)
                      .map(([key, config]) => (
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
                      ))
                  : Object.entries(EXTERNAL_STAGES)
                      .filter(([key]) => showInactiveStages || (stageCounts[key] || 0) > 0)
                      .map(([key, config]) => (
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
                      ))
                }

                {/* Show inactive stages toggle - admin only */}
                {isAdmin && (
                  <button
                    onClick={() => setShowInactiveStages(!showInactiveStages)}
                    className={cn(
                      "px-2 py-1 text-xs rounded transition-colors ml-1",
                      showInactiveStages 
                        ? "text-primary underline underline-offset-2" 
                        : "text-muted-foreground/60 hover:text-muted-foreground"
                    )}
                  >
                    {showInactiveStages ? 'Hide empty' : '+ Show all'}
                  </button>
                )}
              </div>
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
                title={issueFilter !== 'all' 
                  ? `No ${issueFilter} work orders`
                  : stageFilter !== 'all' 
                    ? `No orders in this stage`
                    : `No ${primaryFilter} work orders`
                }
                description={primaryFilter === 'external' 
                  ? "No work orders currently at external partners."
                  : "All clear! Create a new work order to get started."
                }
                action={issueFilter === 'all' && stageFilter === 'all' ? {
                  label: "Create Work Order",
                  onClick: () => navigate("/work-orders/new"),
                } : {
                  label: "Clear Filters",
                  onClick: () => { setIssueFilter('all'); setStageFilter('all'); setSearchQuery(''); },
                  variant: "outline",
                }}
              />
            </CardContent>
          </Card>
        )}

        {/* Work Orders List */}
        {!loading && !error && filteredOrders.length > 0 && (
          <div className="space-y-1">
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
