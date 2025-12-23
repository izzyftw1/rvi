import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertCircle, Trash2, Send, Package, MoreVertical, Search, Factory, CheckCircle2, Truck, AlertTriangle, Clock, ArrowRight, Timer, Scissors, Box, Inbox, Building2, ExternalLink, TrendingUp, Percent, FileWarning, Activity } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays, format as formatDate } from "date-fns";
import { cn } from "@/lib/utils";

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

// Block reasons for filtering
const BLOCK_REASONS = {
  qc_pending: { label: 'QC pending', key: 'qc_pending' },
  ncr_open: { label: 'NCR open', key: 'ncr_open' },
  ext_overdue: { label: 'Ext overdue', key: 'ext_overdue' },
  not_released: { label: 'Not released', key: 'not_released' },
  material_pending: { label: 'Material pending', key: 'material_pending' },
};

// Helper to determine block reason for a work order
// Uses qc_material_status and qc_first_piece_status as authoritative sources
const getBlockReason = (wo: any): string | null => {
  const hasExternalOverdue = wo.external_moves?.some((m: any) => 
    m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
  );
  if (hasExternalOverdue) return 'ext_overdue';
  
  // Check QC gates using authoritative status fields
  const materialStatus = wo.qc_material_status;
  const firstPieceStatus = wo.qc_first_piece_status;
  const materialFailed = materialStatus === 'failed';
  const firstPieceFailed = firstPieceStatus === 'failed';
  const materialPending = !materialStatus || materialStatus === 'pending';
  const firstPiecePending = !firstPieceStatus || firstPieceStatus === 'pending';
  
  // If any QC gate is failed, it's a blocker
  if (materialFailed || firstPieceFailed) return 'qc_pending';
  // If material is pending, first piece is blocked
  if (materialPending) return 'qc_pending';
  // If material is passed but first piece is pending
  const materialComplete = materialStatus === 'passed' || materialStatus === 'waived';
  if (materialComplete && firstPiecePending) return 'qc_pending';
  
  if (wo.has_open_ncr) return 'ncr_open';
  if (wo.planning_status === 'pending' || wo.status === 'draft') return 'not_released';
  if (wo.material_status === 'pending' || wo.material_received === false) return 'material_pending';
  return null;
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

// Helper to get detailed block reason description for tooltip
const getBlockReasonDetails = (wo: any, blockReasonKey: string | null): { title: string; description: string } => {
  if (!blockReasonKey) return { title: '', description: '' };
  
  switch (blockReasonKey) {
    case 'qc_pending': {
      const materialStatus = wo.qc_material_status;
      const firstPieceStatus = wo.qc_first_piece_status;
      if (materialStatus === 'failed') return { title: 'QC Block', description: 'Material QC failed - requires re-inspection or rejection' };
      if (firstPieceStatus === 'failed') return { title: 'QC Block', description: 'First piece QC failed - setup adjustment needed' };
      if (!materialStatus || materialStatus === 'pending') return { title: 'QC Block', description: 'Material QC pending - awaiting inspection' };
      if (firstPieceStatus === 'pending') return { title: 'QC Block', description: 'First piece QC pending - awaiting approval' };
      return { title: 'QC Block', description: 'Quality check pending' };
    }
    case 'ncr_open':
      return { title: 'NCR Block', description: `${wo.open_ncr_count || 1} open NCR(s) - requires resolution before proceeding` };
    case 'ext_overdue': {
      const overdueMove = wo.external_moves?.find((m: any) => 
        m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
      );
      const days = overdueMove?.expected_return_date 
        ? Math.abs(differenceInDays(new Date(), parseISO(overdueMove.expected_return_date)))
        : 0;
      return { title: 'External Overdue', description: `Material at external partner is ${days}d overdue` };
    }
    case 'not_released':
      return { title: 'Not Released', description: 'Production logging not yet unlocked' };
    case 'material_pending':
      return { title: 'Material Block', description: 'Raw material not yet received or issued' };
    default:
      return { title: 'Blocked', description: blockReasonKey };
  }
};

// Helper to compute external processing status
const getExternalStatus = (wo: any): { status: 'none' | 'in' | 'partial' | 'overdue'; label: string; color: string } => {
  if (!wo.external_moves || wo.external_moves.length === 0) {
    return { status: 'none', label: '', color: '' };
  }
  
  const activeMoves = wo.external_moves.filter((m: any) => m.status !== 'received_full');
  if (activeMoves.length === 0) {
    return { status: 'none', label: '', color: '' };
  }
  
  const hasOverdue = activeMoves.some((m: any) => 
    m.expected_return_date && isPast(parseISO(m.expected_return_date))
  );
  const hasPartial = wo.external_moves.some((m: any) => m.status === 'partial');
  
  if (hasOverdue) return { status: 'overdue', label: 'Overdue', color: 'text-destructive bg-destructive/10' };
  if (hasPartial) return { status: 'partial', label: 'Partial', color: 'text-amber-600 bg-amber-500/10' };
  return { status: 'in', label: 'In Process', color: 'text-purple-600 bg-purple-500/10' };
};

// Work Order Card - Stage-dominant design with quick-scan operational indicators
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

  // Days in current stage calculation
  const daysInStage = useMemo(() => {
    const stageDate = wo.stage_entered_at || wo.updated_at || wo.created_at;
    if (!stageDate) return null;
    return Math.max(0, differenceInDays(new Date(), parseISO(stageDate)));
  }, [wo.stage_entered_at, wo.updated_at, wo.created_at]);

  // Derived operational signals
  const progressPct = wo.ok_qty && wo.quantity ? Math.min(100, Math.round((wo.ok_qty / wo.quantity) * 100)) : 0;
  const scrapPct = wo.total_rejection && wo.ok_qty 
    ? Math.round((wo.total_rejection / (wo.ok_qty + wo.total_rejection)) * 100) 
    : 0;
  const openNCRCount = wo.open_ncr_count || 0;
  const agingDays = wo.last_production_date 
    ? differenceInDays(new Date(), parseISO(wo.last_production_date))
    : null;
  const externalStatus = getExternalStatus(wo);

  // Get block reason using shared helper
  const blockReasonKey = getBlockReason(wo);
  const blockReasonLabel = blockReasonKey 
    ? BLOCK_REASONS[blockReasonKey as keyof typeof BLOCK_REASONS]?.label || blockReasonKey 
    : null;
  const blockDetails = getBlockReasonDetails(wo, blockReasonKey);

  // Visual severity logic:
  // - Critical (red): overdue AND blocked
  // - Warning (amber): overdue but progressing OR blocked but on time
  // - Neutral: on time and not blocked
  const isBlocked = !!blockReasonKey;
  const isCritical = isOverdue && isBlocked;
  const isWarning = (isOverdue && !isBlocked) || (!isOverdue && isBlocked);
  const hasIssue = isCritical || isWarning;
  const isExternal = externalWipTotal > 0;
  
  // Human-readable WO code - wo_number is the primary identifier (WO-YYYY-XXXXX)
  const woCode = wo.wo_number;

  return (
    <div 
      className={cn(
        "group flex items-stretch rounded-md cursor-pointer transition-all hover:shadow-md overflow-hidden border",
        // Background tint based on severity
        isCritical && "bg-destructive/5 border-destructive/40",
        isWarning && "bg-amber-500/5 border-amber-500/40",
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
          isCritical ? "bg-destructive" : isWarning ? "bg-amber-500" : "bg-purple-500"
        )} />
      )}

      {/* STAGE + Days indicator */}
      <div className={cn(
        "flex flex-col items-center justify-center px-2.5 py-1 min-w-[72px] text-white relative",
        stageConfig.color
      )}>
        <div className="flex items-center gap-1">
          <StageIcon className="h-3.5 w-3.5" />
          <span className="text-[10px] font-bold uppercase tracking-wide">
            {stageConfig.label}
          </span>
        </div>
        {daysInStage !== null && daysInStage > 0 && (
          <span className="text-[9px] opacity-80 font-medium">
            {daysInStage}d
          </span>
        )}
        
        {/* Issue overlay icon on stage */}
        {hasIssue && (
          <div className={cn(
            "absolute -top-0.5 -right-0.5 rounded-full p-0.5",
            isCritical ? "bg-destructive" : "bg-amber-500"
          )}>
            {isCritical ? (
              <AlertTriangle className="h-2.5 w-2.5 text-white" />
            ) : (
              <Timer className="h-2.5 w-2.5 text-white" />
            )}
          </div>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 flex items-center gap-2 px-2.5 py-1">
        {/* INT/EXT badge - compact */}
        <Badge 
          variant="outline" 
          className={cn(
            "text-[8px] px-1 py-0 h-4 font-bold tracking-wide flex-shrink-0",
            isExternal 
              ? "border-purple-400 text-purple-600 bg-purple-50" 
              : "border-slate-300 text-slate-500 bg-slate-50"
          )}
        >
          {isExternal ? 'EXT' : 'INT'}
        </Badge>

        {/* Primary: WO Code / Customer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-semibold text-foreground truncate">
              {woCode}
            </p>
            {wo.customer_po && (
              <span className="text-[10px] text-muted-foreground">({wo.customer_po})</span>
            )}
            {/* Block reason badge with tooltip */}
            {blockReasonLabel && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className={cn(
                      "text-[8px] px-1 py-0 h-3.5 whitespace-nowrap cursor-help",
                      isCritical ? "bg-destructive/90 hover:bg-destructive" : "bg-amber-500/90 hover:bg-amber-500"
                    )}>
                      {blockReasonLabel}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[200px]">
                    <p className="font-medium text-xs">{blockDetails.title}</p>
                    <p className="text-[10px] text-muted-foreground">{blockDetails.description}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {/* Overdue badge - only show if progressing (amber) */}
            {isOverdue && !isBlocked && (
              <Badge className="text-[8px] px-1 py-0 h-3.5 whitespace-nowrap bg-amber-500/90 hover:bg-amber-500">
                {daysOverdue}d late
              </Badge>
            )}
            {/* Critical overdue badge */}
            {isCritical && (
              <Badge variant="destructive" className="text-[8px] px-1 py-0 h-3.5 whitespace-nowrap">
                {daysOverdue}d late
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-muted-foreground truncate">{wo.customer}</p>
            <span className="text-[10px] text-muted-foreground/70">• {wo.item_code}</span>
          </div>
        </div>

        {/* Operational Signals - Progress, Scrap, NCR, External, Aging */}
        <div className="hidden lg:flex items-center gap-3 text-[10px]">
          {/* Progress % with mini bar */}
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 min-w-[60px]">
                  <Progress value={progressPct} className="h-1.5 w-8" />
                  <span className={cn(
                    "font-medium",
                    progressPct >= 100 ? "text-green-600" : progressPct > 0 ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {progressPct}%
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Progress: {wo.ok_qty?.toLocaleString() || 0} / {wo.quantity?.toLocaleString()} pcs OK</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          
          {/* Scrap % */}
          {scrapPct > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "font-medium",
                    scrapPct > 5 ? "text-destructive" : scrapPct > 2 ? "text-amber-600" : "text-muted-foreground"
                  )}>
                    {scrapPct}% scrap
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Rejections: {wo.total_rejection?.toLocaleString() || 0} pcs</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* Open NCR count */}
          {openNCRCount > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive/50 text-destructive">
                    <FileWarning className="h-2.5 w-2.5 mr-0.5" />
                    {openNCRCount} NCR
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{openNCRCount} open Non-Conformance Report(s)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {/* External processing status */}
          {externalStatus.status !== 'none' && (
            <Badge variant="outline" className={cn("text-[9px] px-1 py-0 h-4", externalStatus.color)}>
              {externalStatus.label}
            </Badge>
          )}
          
          {/* Aging since last production */}
          {agingDays !== null && agingDays > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className={cn(
                    "font-medium flex items-center gap-0.5",
                    agingDays > 7 ? "text-destructive" : agingDays > 3 ? "text-amber-600" : "text-muted-foreground"
                  )}>
                    <Activity className="h-2.5 w-2.5" />
                    {agingDays}d idle
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">Last production entry: {agingDays} day(s) ago</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Quantity */}
        <div className="hidden sm:block text-right min-w-[50px]">
          <span className="font-medium text-foreground text-[11px]">{wo.quantity?.toLocaleString()}</span>
          <p className="text-[9px] text-muted-foreground">pcs</p>
        </div>

        {/* Due Date */}
        <div className="hidden md:block">
          {wo.due_date ? (
            <span className={cn(
              "text-[10px] flex items-center gap-0.5 whitespace-nowrap",
              isOverdue ? "text-destructive font-semibold" : 
              daysUntilDue !== null && daysUntilDue <= 3 ? "text-amber-600 font-medium" : "text-muted-foreground"
            )}>
              {formatDate(parseISO(wo.due_date), 'MMM d')}
            </span>
          ) : null}
        </div>

        {/* Open affordance - visible on hover */}
        <span className="hidden sm:flex items-center gap-0.5 text-[10px] text-muted-foreground/50 group-hover:text-muted-foreground transition-colors flex-shrink-0">
          Open
          <ArrowRight className="h-3 w-3" />
        </span>

        {/* Quick Actions */}
        <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon" className="h-5 w-5">
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onNavigate(wo.id); }}>
                <ArrowRight className="h-4 w-4 mr-2" />
                View
              </DropdownMenuItem>
              {canManageExternal && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onSendToExternal(wo); }}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Ext
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onReceiveFromExternal(wo); }}>
                    <Package className="h-4 w-4 mr-2" />
                    Receive
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
  // Block reason filter
  const [blockReasonFilter, setBlockReasonFilter] = useState<string>('all');
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
      let productionMetrics: Record<string, { ok_qty: number; total_rejection: number; last_date: string | null }> = {};
      let ncrCounts: Record<string, number> = {};
      
      if (woIds.length > 0) {
        // Fetch external moves
        const movesPromise = supabase
          .from("wo_external_moves" as any)
          .select("id, work_order_id, process, qty_sent, status, expected_return_date, challan_no")
          .in("work_order_id", woIds);
        
        // Fetch production log aggregates - OK qty, rejections, last log date
        const productionPromise = supabase
          .from("daily_production_logs")
          .select("wo_id, ok_quantity, total_rejection_quantity, log_date")
          .in("wo_id", woIds);
        
        // Fetch open NCR counts
        const ncrPromise = supabase
          .from("ncrs" as any)
          .select("work_order_id")
          .in("work_order_id", woIds)
          .eq("status", "open");
        
        const [movesResult, productionResult, ncrResult] = await Promise.all([
          movesPromise,
          productionPromise,
          ncrPromise
        ]);
        
        // Process moves
        (movesResult.data || []).forEach((move: any) => {
          if (!movesMap[move.work_order_id]) movesMap[move.work_order_id] = [];
          movesMap[move.work_order_id].push(move);
        });
        
        // Aggregate production metrics per WO
        (productionResult.data || []).forEach((log: any) => {
          if (!productionMetrics[log.wo_id]) {
            productionMetrics[log.wo_id] = { ok_qty: 0, total_rejection: 0, last_date: null };
          }
          productionMetrics[log.wo_id].ok_qty += log.ok_quantity || 0;
          productionMetrics[log.wo_id].total_rejection += log.total_rejection_quantity || 0;
          // Track most recent log date
          if (!productionMetrics[log.wo_id].last_date || log.log_date > productionMetrics[log.wo_id].last_date) {
            productionMetrics[log.wo_id].last_date = log.log_date;
          }
        });
        
        // Count NCRs per WO
        (ncrResult.data || []).forEach((ncr: any) => {
          ncrCounts[ncr.work_order_id] = (ncrCounts[ncr.work_order_id] || 0) + 1;
        });
      }

      const data = (workOrders || []).map((wo: any) => ({
        ...wo,
        external_moves: movesMap[wo.id] || [],
        ok_qty: productionMetrics[wo.id]?.ok_qty || 0,
        total_rejection: productionMetrics[wo.id]?.total_rejection || 0,
        last_production_date: productionMetrics[wo.id]?.last_date || null,
        open_ncr_count: ncrCounts[wo.id] || 0,
        has_open_ncr: (ncrCounts[wo.id] || 0) > 0,
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
      filtered = filtered.filter(wo => getBlockReason(wo) !== null);
    }

    // Block reason filter
    if (blockReasonFilter !== 'all') {
      filtered = filtered.filter(wo => getBlockReason(wo) === blockReasonFilter);
    }

    return filtered;
  }, [workOrders, searchQuery, primaryFilter, stageFilter, issueFilter, blockReasonFilter]);

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

  // Block reason counts for filter dropdown
  const blockReasonCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    Object.keys(BLOCK_REASONS).forEach(key => {
      counts[key] = workOrders.filter(wo => getBlockReason(wo) === key).length;
    });
    counts.all = Object.values(counts).reduce((sum, c) => sum + c, 0);
    return counts;
  }, [workOrders]);

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
            <h1 className="text-2xl font-bold text-foreground">Production Workload</h1>
            <p className="text-sm text-muted-foreground">
              {kpis.total} active jobs · {kpis.delayed > 0 ? `${kpis.delayed} need attention` : "On track"}
            </p>
          </div>
          <Button onClick={() => navigate("/work-orders/new")} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            New Job
          </Button>
        </div>

        {/* KPI Summary Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KPICard 
            label="In Progress" 
            count={kpis.total} 
            icon={Factory} 
            onClick={() => { setIssueFilter('all'); setStageFilter('all'); }}
          />
          <KPICard 
            label="Needs Action" 
            count={kpis.blocked} 
            icon={AlertTriangle} 
            variant={kpis.blocked > 0 ? 'danger' : 'default'}
            onClick={() => setIssueFilter('blocked')}
          />
          <KPICard 
            label="Running Late" 
            count={kpis.delayed} 
            icon={Clock} 
            variant={kpis.delayed > 0 ? 'warning' : 'default'}
            onClick={() => setIssueFilter('delayed')}
          />
          <KPICard 
            label="With Partners" 
            count={kpis.externalCount} 
            icon={ExternalLink} 
            onClick={() => { setPrimaryFilter('external'); setStageFilter('all'); }}
          />
        </div>

        {/* Filter Bar - Secondary visual weight */}
        <div className="flex flex-wrap items-center gap-3 py-2">
          {/* Primary Toggle - Compact */}
          <div className="inline-flex rounded-md border border-border/60 p-0.5 bg-muted/20">
            <button
              onClick={() => { setPrimaryFilter('internal'); setStageFilter('all'); }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-all",
                primaryFilter === 'internal' 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              In-House
              <span className="text-[10px] opacity-70">{kpis.internalCount}</span>
            </button>
            <button
              onClick={() => { setPrimaryFilter('external'); setStageFilter('all'); }}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-all",
                primaryFilter === 'external' 
                  ? "bg-background text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Partners
              <span className="text-[10px] opacity-70">{kpis.externalCount}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-border/50" />

          {/* Stage Pills - Subtle */}
          <div className="flex items-center gap-1 flex-wrap">
            {stageFilter !== 'all' && (
              <button
                onClick={() => setStageFilter('all')}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors mr-0.5"
              >
                ×
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
                        "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                        stageFilter === key 
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {config.label} {stageCounts[key] || 0}
                    </button>
                  ))
              : Object.entries(EXTERNAL_STAGES)
                  .filter(([key]) => showInactiveStages || (stageCounts[key] || 0) > 0)
                  .map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => setStageFilter(key)}
                      className={cn(
                        "px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                        stageFilter === key 
                          ? "bg-foreground/10 text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      {config.label} {stageCounts[key] || 0}
                    </button>
                  ))
            }

            {isAdmin && (
              <button
                onClick={() => setShowInactiveStages(!showInactiveStages)}
                className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-1"
              >
                {showInactiveStages ? '−' : '+'}
              </button>
            )}
          </div>

          {/* Divider */}
          <div className="h-4 w-px bg-border/50" />

          {/* Block Reason Filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors",
                blockReasonFilter !== 'all' 
                  ? "bg-amber-500/10 text-amber-600" 
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}>
                {blockReasonFilter !== 'all' 
                  ? BLOCK_REASONS[blockReasonFilter as keyof typeof BLOCK_REASONS]?.label 
                  : 'Block reason'}
                {blockReasonCounts.all > 0 && (
                  <span className="opacity-70">{blockReasonFilter === 'all' ? blockReasonCounts.all : ''}</span>
                )}
                {blockReasonFilter !== 'all' && <span className="ml-0.5">×</span>}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[140px]">
              {blockReasonFilter !== 'all' && (
                <>
                  <DropdownMenuItem onClick={() => setBlockReasonFilter('all')}>
                    Clear filter
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {Object.entries(BLOCK_REASONS)
                .filter(([key]) => blockReasonCounts[key] > 0)
                .map(([key, config]) => (
                  <DropdownMenuItem 
                    key={key}
                    onClick={() => setBlockReasonFilter(key)}
                    className={cn(blockReasonFilter === key && "bg-accent")}
                  >
                    <span className="flex-1">{config.label}</span>
                    <span className="text-muted-foreground text-xs">{blockReasonCounts[key]}</span>
                  </DropdownMenuItem>
                ))
              }
              {blockReasonCounts.all === 0 && (
                <DropdownMenuItem disabled>No blocked items</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Issue Filter - if active */}
          {issueFilter !== 'all' && (
            <button 
              onClick={() => setIssueFilter('all')}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded",
                issueFilter === 'blocked' ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"
              )}
            >
              {issueFilter === 'blocked' ? 'Blocked' : 'Late'} ×
            </button>
          )}

          {/* Spacer + Search */}
          <div className="flex-1" />
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              placeholder="Find..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-7 text-xs bg-muted/30 border-border/50"
            />
          </div>
        </div>

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

        {/* Empty State - Contextual messaging */}
        {!loading && !error && filteredOrders.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-8">
              {(() => {
                // Build contextual empty state based on active filters
                let icon: "workOrders" | "search" | "partners" | "calendar" = "workOrders";
                let title = "Ready to start";
                let description = "No jobs in the queue. Create one to get moving.";
                
                if (searchQuery) {
                  icon = "search";
                  title = "No matches";
                  description = `Nothing found for "${searchQuery}". Try different keywords.`;
                } else if (issueFilter === 'blocked') {
                  title = "All clear";
                  description = "No jobs waiting on external partners. Keep it moving!";
                } else if (issueFilter === 'delayed') {
                  icon = "calendar";
                  title = "On schedule";
                  description = "No late jobs. Everything is running on time.";
                } else if (primaryFilter === 'external') {
                  icon = "partners";
                  if (stageFilter !== 'all') {
                    const externalStage = EXTERNAL_STAGES[stageFilter as keyof typeof EXTERNAL_STAGES];
                    title = `${externalStage?.label || 'Partner'} queue empty`;
                    description = `No jobs at ${externalStage?.label || 'this partner'} right now.`;
                  } else {
                    title = "Nothing with partners";
                    description = "All jobs are in-house. Send work out when ready.";
                  }
                } else if (stageFilter !== 'all') {
                  const internalStage = INTERNAL_STAGES[stageFilter as keyof typeof INTERNAL_STAGES];
                  title = `${internalStage?.label || 'Stage'} is clear`;
                  description = `No jobs waiting in ${internalStage?.label || 'this stage'}. Check other queues.`;
                } else {
                  title = "In-house queue empty";
                  description = "Jobs may be with partners, or create a new one to start.";
                }

                return (
                  <EmptyState
                    icon={icon}
                    title={title}
                    description={description}
                    action={searchQuery || issueFilter !== 'all' || stageFilter !== 'all' ? {
                      label: "Show All",
                      onClick: () => { setIssueFilter('all'); setStageFilter('all'); setSearchQuery(''); },
                      variant: "outline",
                    } : {
                      label: "Start New Job",
                      onClick: () => navigate("/work-orders/new"),
                    }}
                  />
                );
              })()}
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
