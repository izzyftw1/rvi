import { useEffect, useState, useMemo, useCallback, memo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, AlertCircle, Trash2, Send, Package, MoreVertical, Search, Factory, CheckCircle2, Truck, AlertTriangle, Clock, ArrowRight, Timer, Scissors, Box, Inbox, Building2, ExternalLink, TrendingUp, Percent, FileWarning, Activity, GitBranch } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { SendToExternalDialog } from "@/components/SendToExternalDialog";
import { ExternalReceiptDialog } from "@/components/ExternalReceiptDialog";
import { isPast, parseISO, differenceInDays, format as formatDate } from "date-fns";
import { cn } from "@/lib/utils";
import { useWOBatchStages, WOBatchStageBreakdown, getEmptyBreakdown } from "@/hooks/useWOBatchStages";
import { fetchBatchQuantitiesMultiple } from "@/hooks/useBatchQuantities";

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

// Batch Stage Summary Component - shows multi-stage breakdown
const BatchStageSummary = memo(({ breakdown, className }: { breakdown: WOBatchStageBreakdown; className?: string }) => {
  const stages = [
    { key: 'cutting', label: 'Cutting', qty: breakdown.cutting, color: 'bg-blue-500', icon: Scissors },
    { key: 'production', label: 'Prod', qty: breakdown.production, color: 'bg-indigo-500', icon: Factory },
    { key: 'external', label: 'Ext', qty: breakdown.external, color: 'bg-purple-500', icon: ExternalLink },
    { key: 'qc', label: 'QC', qty: breakdown.qc, color: 'bg-emerald-500', icon: CheckCircle2 },
    { key: 'packing', label: 'Pack', qty: breakdown.packing, color: 'bg-violet-500', icon: Box },
  ].filter(s => s.qty > 0);
  
  if (stages.length === 0) {
    return (
      <div className={cn("flex items-center gap-1 px-2 py-1 bg-slate-500 text-white min-w-[72px]", className)}>
        <Inbox className="h-3 w-3" />
        <span className="text-[9px] font-medium">Queue</span>
      </div>
    );
  }
  
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn("flex flex-col gap-0.5 px-2 py-1 min-w-[85px] bg-muted/50", className)}>
            {stages.slice(0, 3).map(stage => {
              const Icon = stage.icon;
              return (
                <div key={stage.key} className="flex items-center gap-1 text-[9px]">
                  <div className={cn("w-1.5 h-1.5 rounded-full", stage.color)} />
                  <span className="font-medium text-foreground">{stage.label}:</span>
                  <span className="text-muted-foreground">{stage.qty.toLocaleString()}</span>
                </div>
              );
            })}
            {stages.length > 3 && (
              <span className="text-[8px] text-muted-foreground">+{stages.length - 3} more</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[200px]">
          <p className="font-medium text-xs mb-1">Batch Distribution</p>
          <div className="space-y-0.5 text-[10px]">
            {breakdown.cutting > 0 && (
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-blue-500" /> Cutting:</span>
                <span>{breakdown.cutting.toLocaleString()} pcs</span>
              </div>
            )}
            {breakdown.production > 0 && (
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Production:</span>
                <span>{breakdown.production.toLocaleString()} pcs</span>
              </div>
            )}
            {breakdown.external > 0 && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> External:</span>
                  <span>{breakdown.external.toLocaleString()} pcs</span>
                </div>
                {Object.entries(breakdown.externalBreakdown).map(([process, qty]) => (
                  <div key={process} className="flex justify-between gap-4 pl-3 text-muted-foreground">
                    <span>└ {process}:</span>
                    <span>{(qty as number).toLocaleString()}</span>
                  </div>
                ))}
              </>
            )}
            {breakdown.qc > 0 && (
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> QC:</span>
                <span>{breakdown.qc.toLocaleString()} pcs</span>
              </div>
            )}
            {breakdown.packing > 0 && (
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Packing:</span>
                <span>{breakdown.packing.toLocaleString()} pcs</span>
              </div>
            )}
            {breakdown.dispatched > 0 && (
              <div className="flex justify-between gap-4">
                <span className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-green-600" /> Dispatched:</span>
                <span>{breakdown.dispatched.toLocaleString()} pcs</span>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
BatchStageSummary.displayName = "BatchStageSummary";

// Work Order Card - Batch-based design with multi-stage support
const WorkOrderRow = memo(({ 
  wo, 
  batchBreakdown,
  onDelete, 
  onSendToExternal, 
  onReceiveFromExternal,
  onNavigate,
  canManageExternal
}: {
  wo: any;
  batchBreakdown: WOBatchStageBreakdown;
  onDelete: any;
  onSendToExternal: any;
  onReceiveFromExternal: any;
  onNavigate: any;
  canManageExternal: boolean;
}) => {
  const isOverdue = wo.due_date && isPast(parseISO(wo.due_date)) && wo.status !== 'completed';
  const daysUntilDue = wo.due_date ? differenceInDays(parseISO(wo.due_date), new Date()) : null;
  const daysOverdue = isOverdue && wo.due_date ? Math.abs(differenceInDays(new Date(), parseISO(wo.due_date))) : 0;
  
  const hasExternalOverdue = wo.external_moves?.some((m: any) => 
    m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
  );

  // Use batch-derived external WIP
  const externalWipTotal = batchBreakdown.external;
  const isSplitFlow = batchBreakdown.isSplitFlow;

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

  // Visual severity logic
  const isBlocked = !!blockReasonKey;
  const isCritical = isOverdue && isBlocked;
  const isWarning = (isOverdue && !isBlocked) || (!isOverdue && isBlocked);
  const hasIssue = isCritical || isWarning;
  const isExternal = externalWipTotal > 0;
  
  const woCode = wo.wo_number;

  return (
    <div 
      className={cn(
        "group flex items-stretch rounded-md cursor-pointer transition-all hover:shadow-md overflow-hidden border",
        isCritical && "bg-destructive/5 border-destructive/40",
        isWarning && "bg-amber-500/5 border-amber-500/40",
        !hasIssue && isExternal && "bg-purple-500/5 border-purple-500/30 hover:border-purple-500/50",
        !hasIssue && !isExternal && "bg-card border-border hover:border-border/80"
      )}
      onClick={() => onNavigate(wo.id)}
    >
      {/* Status Strip - Left edge indicator */}
      {(hasIssue || isExternal || isSplitFlow) && (
        <div className={cn(
          "w-1 flex-shrink-0",
          isCritical ? "bg-destructive" : isWarning ? "bg-amber-500" : isSplitFlow ? "bg-gradient-to-b from-indigo-500 via-purple-500 to-emerald-500" : "bg-purple-500"
        )} />
      )}

      {/* BATCH STAGE SUMMARY - replaces single stage indicator */}
      <BatchStageSummary breakdown={batchBreakdown} />

      {/* Content Area */}
      <div className="flex-1 flex items-center gap-2 px-2.5 py-1">
        {/* Split Flow badge - shows when batches are in multiple stages */}
        {isSplitFlow ? (
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="outline" 
                  className="text-[8px] px-1 py-0 h-4 font-bold tracking-wide flex-shrink-0 border-gradient-to-r from-indigo-400 to-purple-400 text-indigo-600 bg-indigo-50"
                >
                  <GitBranch className="h-2.5 w-2.5 mr-0.5" />
                  SPLIT
                </Badge>
              </TooltipTrigger>
              <TooltipContent side="top">
                <p className="text-xs">Batches in {batchBreakdown.stageCount} different stages</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
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
        )}

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

        {/* Operational Signals - Batch Status Rollup + Progress, Scrap, NCR, External, Aging */}
        <div className="hidden lg:flex items-center gap-3 text-[10px]">
          {/* Batch Status Rollup Chips - calculated per batch */}
          {batchBreakdown.statusRollup.late > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive/50 text-destructive bg-destructive/10">
                    <Clock className="h-2.5 w-2.5 mr-0.5" />
                    {batchBreakdown.statusRollup.late} Late
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{batchBreakdown.statusRollup.late} batch(es) past due date</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {batchBreakdown.statusRollup.qcPending > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-emerald-500/50 text-emerald-600 bg-emerald-500/10">
                    <CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />
                    {batchBreakdown.statusRollup.qcPending} QC
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{batchBreakdown.statusRollup.qcPending} batch(es) awaiting QC inspection</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
          {batchBreakdown.statusRollup.blocked > 0 && (
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-amber-500/50 text-amber-600 bg-amber-500/10">
                    <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                    {batchBreakdown.statusRollup.blocked} Blocked
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">{batchBreakdown.statusRollup.blocked} batch(es) blocked</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          
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

        {/* Quantity Progress with Tooltip - Independent Stages */}
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="hidden sm:flex flex-col items-end min-w-[70px] cursor-help">
                <div className="flex items-center gap-1">
                  <span className="font-medium text-foreground text-[11px]">
                    {(wo.qty_dispatched || 0).toLocaleString()}
                  </span>
                  <span className="text-[9px] text-muted-foreground">
                    / {wo.quantity?.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center gap-0.5 mt-0.5">
                  {/* Mini stage indicators */}
                  {(wo.ok_qty || 0) > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Produced" />
                  )}
                  {(wo.qc_approved_qty || batchBreakdown.qc || 0) > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" title="QC Approved" />
                  )}
                  {batchBreakdown.packing > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Packed" />
                  )}
                  {(wo.qty_dispatched || batchBreakdown.dispatched || 0) > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Dispatched" />
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent side="left" className="max-w-[220px]">
              <p className="font-medium text-xs mb-2">Quantity Progress (Independent Stages)</p>
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between gap-4 items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    Produced:
                  </span>
                  <span className="font-medium">{(wo.ok_qty || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    QC Approved:
                  </span>
                  <span className="font-medium">{(wo.qc_approved_qty || batchBreakdown.qc || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-amber-500" />
                    Packed:
                  </span>
                  <span className="font-medium">{batchBreakdown.packing.toLocaleString()}</span>
                </div>
                <div className="flex justify-between gap-4 items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    Dispatched:
                  </span>
                  <span className="font-medium">{(wo.qty_dispatched || batchBreakdown.dispatched || 0).toLocaleString()}</span>
                </div>
                <div className="border-t pt-1 mt-1 flex justify-between gap-4">
                  <span className="text-muted-foreground">Ordered:</span>
                  <span className="font-bold">{wo.quantity?.toLocaleString() || 0}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Remaining:</span>
                  <span className={cn(
                    "font-bold",
                    (wo.quantity - (wo.qty_dispatched || batchBreakdown.dispatched || 0)) === 0 
                      ? "text-green-600" 
                      : "text-amber-600"
                  )}>
                    {Math.max(0, wo.quantity - (wo.qty_dispatched || batchBreakdown.dispatched || 0)).toLocaleString()}
                  </span>
                </div>
                {externalWipTotal > 0 && (
                  <div className="flex justify-between gap-4 items-center text-purple-500">
                    <span className="flex items-center gap-1">
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                      At External:
                    </span>
                    <span className="font-medium">{externalWipTotal.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

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
  
  // Get WO IDs for batch stage loading
  const woIds = useMemo(() => workOrders.map(wo => wo.id), [workOrders]);
  
  // Load batch stage breakdown - SINGLE SOURCE OF TRUTH for stage distribution
  const { stagesByWO, loading: batchLoading } = useWOBatchStages(woIds.length > 0 ? woIds : undefined);
  
  const [searchQuery, setSearchQuery] = useState("");
  // Level 1: Location-based filter - 'internal', 'external', or 'transit'
  // WOs can appear in multiple filters if their batches span locations
  const [locationFilter, setLocationFilter] = useState<'all' | 'internal' | 'external' | 'transit'>(() => {
    const urlLoc = searchParams.get('location');
    if (urlLoc === 'external') return 'external';
    if (urlLoc === 'transit') return 'transit';
    if (urlLoc === 'internal') return 'internal';
    return 'all';
  });
  // Level 2: Contextual stage/process filter based on location selection
  const [stageFilter, setStageFilter] = useState<string>(() => searchParams.get('stage') || 'all');
  // Issue filter for blocked/delayed - read from URL params
  const [issueFilter, setIssueFilter] = useState<'all' | 'blocked' | 'delayed'>(() => {
    const urlBlocked = searchParams.get('blocked');
    if (urlBlocked) return 'blocked';
    return 'all';
  });
  // Block reason filter - read from URL params (production, quality, external)
  const [blockReasonFilter, setBlockReasonFilter] = useState<string>(() => {
    const urlBlocked = searchParams.get('blocked');
    if (urlBlocked === 'production') return 'not_released';
    if (urlBlocked === 'quality') return 'qc_pending';
    if (urlBlocked === 'external') return 'ext_overdue';
    return 'all';
  });
  // Due date filter - read from URL params (3days, 7days)
  const [dueFilter, setDueFilter] = useState<'all' | '3days' | '7days'>(() => {
    const urlDue = searchParams.get('due');
    if (urlDue === '3days') return '3days';
    if (urlDue === '7days') return '7days';
    return 'all';
  });
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [hasMore, setHasMore] = useState(true);
  
  const [selectedWO, setSelectedWO] = useState<any>(null);
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(Date.now());
  
  // Helper to get batch breakdown for a WO
  const getBatchBreakdown = useCallback((woId: string): WOBatchStageBreakdown => {
    return stagesByWO[woId] || getEmptyBreakdown();
  }, [stagesByWO]);
  
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
      let ncrCounts: Record<string, number> = {};
      let batchQuantities: Map<string, any> = new Map();

      if (woIds.length > 0) {
        // Fetch external moves (chunked to avoid URL length limit)
        const chunkArr = <T,>(arr: T[], size: number): T[][] => {
          const chunks: T[][] = [];
          for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
          return chunks;
        };
        const CHUNK_SIZE = 10;
        const chunks = chunkArr(woIds, CHUNK_SIZE);

        const movesResults = await Promise.all(
          chunks.map((ids) =>
            supabase
              .from("wo_external_moves" as any)
              .select("id, work_order_id, process, quantity_sent, status, expected_return_date, challan_no")
              .in("work_order_id", ids)
          )
        );
        movesResults.forEach((r) => {
          (r.data || []).forEach((move: any) => {
            if (!movesMap[move.work_order_id]) movesMap[move.work_order_id] = [];
            movesMap[move.work_order_id].push(move);
          });
        });

        // Fetch NCRs (chunked)
        const ncrResults = await Promise.all(
          chunks.map((ids) =>
            supabase
              .from("ncrs" as any)
              .select("work_order_id")
              .in("work_order_id", ids)
              .eq("status", "OPEN")
          )
        );
        ncrResults.forEach((r) => {
          (r.data || []).forEach((ncr: any) => {
            ncrCounts[ncr.work_order_id] = (ncrCounts[ncr.work_order_id] || 0) + 1;
          });
        });

        // Fetch BATCH QUANTITIES — SINGLE SOURCE OF TRUTH
        batchQuantities = await fetchBatchQuantitiesMultiple(woIds);
      }

      const data = (workOrders || []).map((wo: any) => {
        const bq = batchQuantities.get(wo.id);
        return {
          ...wo,
          external_moves: movesMap[wo.id] || [],
          // BATCH-DERIVED — production_batches.produced_qty & qc_rejected_qty
          ok_qty: bq?.producedQty || 0,
          qc_approved_qty: bq?.qcApprovedQty || 0,
          total_rejection: bq?.qcRejectedQty || 0,
          packed_qty: bq?.packedQty || 0,
          dispatched_qty: bq?.dispatchedQty || 0,
          open_ncr_count: ncrCounts[wo.id] || 0,
          has_open_ncr: (ncrCounts[wo.id] || 0) > 0,
        };
      });

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'production_batches' }, () => {
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

  // Compute KPIs - derived from batch data, location-aware
  const kpis = useMemo(() => {
    let blocked = 0, delayed = 0, internalCount = 0, externalCount = 0, transitCount = 0, splitFlowCount = 0;
    
    workOrders.forEach(wo => {
      const breakdown = getBatchBreakdown(wo.id);
      
      // Delayed: past due date
      if (wo.due_date && isPast(parseISO(wo.due_date)) && wo.status !== 'completed') {
        delayed++;
      }
      // External overdue counts as blocked
      const hasExternalOverdue = wo.external_moves?.some((m: any) => 
        m.expected_return_date && isPast(parseISO(m.expected_return_date)) && m.status !== 'received_full'
      );
      if (hasExternalOverdue) blocked++;
      
      // Count by batch location - WOs can appear in multiple counts if batches span locations
      const hasInternalBatches = (breakdown.cutting + breakdown.production + breakdown.qc + breakdown.packing) > 0;
      const hasExternalBatches = breakdown.external > 0;
      const hasTransitBatches = breakdown.transit > 0;
      
      if (hasInternalBatches) internalCount++;
      if (hasExternalBatches) externalCount++;
      if (hasTransitBatches) transitCount++;
      
      // Count split flow WOs
      if (breakdown.isSplitFlow) {
        splitFlowCount++;
      }
    });
    
    return { total: workOrders.length, blocked, delayed, internalCount, externalCount, transitCount, splitFlowCount };
  }, [workOrders, getBatchBreakdown]);

  // Filtered orders with location-based filtering - WOs appear in multiple filters if batches span locations
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

    // Level 1: Location filter - based on BATCH location
    if (locationFilter === 'internal') {
      // Show WOs with batches in factory (cutting, production, qc, packing)
      filtered = filtered.filter(wo => {
        const breakdown = getBatchBreakdown(wo.id);
        return (breakdown.cutting + breakdown.production + breakdown.qc + breakdown.packing) > 0;
      });
      
      // Level 2: Internal stage filter
      if (stageFilter !== 'all') {
        filtered = filtered.filter(wo => {
          const breakdown = getBatchBreakdown(wo.id);
          switch (stageFilter) {
            case 'cutting': 
            case 'cutting_queue': return breakdown.cutting > 0;
            case 'production': return breakdown.production > 0;
            case 'qc': return breakdown.qc > 0;
            case 'packing': return breakdown.packing > 0;
            case 'dispatch': return breakdown.dispatched > 0;
            default: return true;
          }
        });
      }
    } else if (locationFilter === 'external') {
      // Show WOs with batches at external partners
      filtered = filtered.filter(wo => {
        const breakdown = getBatchBreakdown(wo.id);
        return breakdown.external > 0;
      });
      
      // Level 2: External process filter
      if (stageFilter !== 'all') {
        const externalStage = EXTERNAL_STAGES[stageFilter as keyof typeof EXTERNAL_STAGES];
        if (externalStage) {
          filtered = filtered.filter(wo => {
            const breakdown = getBatchBreakdown(wo.id);
            return (breakdown.externalBreakdown[externalStage.process] || 0) > 0;
          });
        }
      }
    } else if (locationFilter === 'transit') {
      // Show WOs with batches in transit
      filtered = filtered.filter(wo => {
        const breakdown = getBatchBreakdown(wo.id);
        return breakdown.transit > 0;
      });
    }
    // 'all' shows everything - no location filter

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
    
    // Due date filter (from URL params like ?due=3days)
    if (dueFilter === '3days') {
      const in3Days = new Date();
      in3Days.setDate(in3Days.getDate() + 3);
      filtered = filtered.filter(wo => {
        if (!wo.due_date) return false;
        const dueDate = parseISO(wo.due_date);
        return dueDate <= in3Days && !isPast(dueDate);
      });
    } else if (dueFilter === '7days') {
      const in7Days = new Date();
      in7Days.setDate(in7Days.getDate() + 7);
      filtered = filtered.filter(wo => {
        if (!wo.due_date) return false;
        const dueDate = parseISO(wo.due_date);
        return dueDate <= in7Days && !isPast(dueDate);
      });
    }

    return filtered;
  }, [workOrders, searchQuery, locationFilter, stageFilter, issueFilter, blockReasonFilter, dueFilter, getBatchBreakdown]);

  // Stage counts for filter bar - based on BATCH presence
  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = { all: filteredOrders.length };
    
    if (locationFilter === 'internal') {
      // Count by batch presence, not work_orders.current_stage
      counts['cutting_queue'] = filteredOrders.filter(wo => getBatchBreakdown(wo.id).cutting > 0).length;
      counts['production'] = filteredOrders.filter(wo => getBatchBreakdown(wo.id).production > 0).length;
      counts['qc'] = filteredOrders.filter(wo => getBatchBreakdown(wo.id).qc > 0).length;
      counts['packing'] = filteredOrders.filter(wo => getBatchBreakdown(wo.id).packing > 0).length;
      counts['dispatch'] = filteredOrders.filter(wo => getBatchBreakdown(wo.id).dispatched > 0).length;
    } else if (locationFilter === 'external') {
      Object.entries(EXTERNAL_STAGES).forEach(([key, config]) => {
        counts[key] = filteredOrders.filter(wo => {
          const breakdown = getBatchBreakdown(wo.id);
          return (breakdown.externalBreakdown[config.process] || 0) > 0;
        }).length;
      });
    }
    // transit has no sub-filters
    
    return counts;
  }, [filteredOrders, locationFilter, getBatchBreakdown]);

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KPICard 
            label="Total Active" 
            count={kpis.total} 
            icon={Factory} 
            onClick={() => { setLocationFilter('all'); setIssueFilter('all'); setStageFilter('all'); }}
          />
          <KPICard 
            label="In Factory" 
            count={kpis.internalCount} 
            icon={Factory} 
            onClick={() => { setLocationFilter('internal'); setStageFilter('all'); }}
          />
          <KPICard 
            label="At Partners" 
            count={kpis.externalCount} 
            icon={ExternalLink} 
            onClick={() => { setLocationFilter('external'); setStageFilter('all'); }}
          />
          <KPICard 
            label="In Transit" 
            count={kpis.transitCount} 
            icon={Truck}
            onClick={() => { setLocationFilter('transit'); setStageFilter('all'); }}
          />
          <KPICard 
            label="Needs Attention" 
            count={kpis.blocked + kpis.delayed} 
            icon={AlertTriangle} 
            variant={(kpis.blocked + kpis.delayed) > 0 ? 'danger' : 'default'}
            onClick={() => setIssueFilter('blocked')}
          />
        </div>

        {/* Filter Bar - Clear and Always Visible */}
        <Card className="p-3 bg-muted/20">
          <div className="flex flex-col gap-3">
            {/* Row 1: Location Toggle + Search */}
            <div className="flex items-center gap-3 flex-wrap">
              {/* Location Toggle - WOs can appear in multiple */}
              <div className="inline-flex rounded-lg border border-border p-1 bg-background">
                <button
                  onClick={() => { setLocationFilter('all'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
                    locationFilter === 'all' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  All
                  <Badge variant="secondary" className="ml-1 text-xs">{kpis.total}</Badge>
                </button>
                <button
                  onClick={() => { setLocationFilter('internal'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
                    locationFilter === 'internal' 
                      ? "bg-primary text-primary-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Factory className="h-4 w-4" />
                  Internal
                  <Badge variant="secondary" className="ml-1 text-xs">{kpis.internalCount}</Badge>
                </button>
                <button
                  onClick={() => { setLocationFilter('external'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
                    locationFilter === 'external' 
                      ? "bg-purple-600 text-white shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  External
                  <Badge variant="secondary" className="ml-1 text-xs">{kpis.externalCount}</Badge>
                </button>
                <button
                  onClick={() => { setLocationFilter('transit'); setStageFilter('all'); }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-all",
                    locationFilter === 'transit' 
                      ? "bg-amber-600 text-white shadow-sm" 
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Truck className="h-4 w-4" />
                  Transit
                  <Badge variant="secondary" className="ml-1 text-xs">{kpis.transitCount}</Badge>
                </button>
              </div>

              {/* Spacer */}
              <div className="flex-1" />
              
              {/* Search */}
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search WO, customer, item..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm"
                />
              </div>
            </div>

            {/* Row 2: Stage Pills + Issue Filters - only show when location filter is set */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Stage Pills - context depends on location filter */}
              {locationFilter === 'internal' && (
                <>
                  <span className="text-xs text-muted-foreground mr-1">Stage:</span>
                  <button
                    onClick={() => setStageFilter('all')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                      stageFilter === 'all' 
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-muted-foreground hover:text-foreground border-border hover:border-foreground/30"
                    )}
                  >
                    All
                  </button>
                  {Object.entries(INTERNAL_STAGES).map(([key, config]) => {
                    const count = stageCounts[key] || 0;
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        onClick={() => setStageFilter(key)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                          stageFilter === key 
                            ? "bg-primary text-primary-foreground border-primary"
                            : count > 0 
                              ? "bg-background text-foreground border-border hover:border-foreground/30"
                              : "bg-muted/50 text-muted-foreground border-border/50"
                        )}
                      >
                        <Icon className="h-3 w-3" />
                        {config.label}
                        <span className={cn(
                          "text-[10px] px-1 rounded",
                          stageFilter === key ? "bg-primary-foreground/20" : "bg-muted"
                        )}>{count}</span>
                      </button>
                    );
                  })}
                </>
              )}
              
              {locationFilter === 'external' && (
                <>
                  <span className="text-xs text-muted-foreground mr-1">Process:</span>
                  <button
                    onClick={() => setStageFilter('all')}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                      stageFilter === 'all' 
                        ? "bg-purple-600 text-white border-purple-600"
                        : "bg-background text-muted-foreground hover:text-foreground border-border hover:border-foreground/30"
                    )}
                  >
                    All
                  </button>
                  {Object.entries(EXTERNAL_STAGES).map(([key, config]) => {
                    const count = stageCounts[key] || 0;
                    return (
                      <button
                        key={key}
                        onClick={() => setStageFilter(key)}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                          stageFilter === key 
                            ? "bg-purple-600 text-white border-purple-600"
                            : count > 0 
                              ? "bg-background text-foreground border-border hover:border-foreground/30"
                              : "bg-muted/50 text-muted-foreground border-border/50"
                        )}
                      >
                        {config.label}
                        <span className={cn(
                          "text-[10px] px-1 rounded",
                          stageFilter === key ? "bg-white/20" : "bg-muted"
                        )}>{count}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {/* Divider */}
              <div className="h-6 w-px bg-border mx-2" />

              {/* Issue Filters */}
              <span className="text-xs text-muted-foreground">Issues:</span>
              <button
                onClick={() => setIssueFilter(issueFilter === 'blocked' ? 'all' : 'blocked')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                  issueFilter === 'blocked'
                    ? "bg-destructive text-destructive-foreground border-destructive"
                    : kpis.blocked > 0
                      ? "bg-destructive/10 text-destructive border-destructive/30 hover:border-destructive/50"
                      : "bg-muted/50 text-muted-foreground border-border/50"
                )}
              >
                <AlertTriangle className="h-3 w-3" />
                Blocked
                <span className={cn(
                  "text-[10px] px-1 rounded",
                  issueFilter === 'blocked' ? "bg-destructive-foreground/20" : "bg-destructive/20"
                )}>{kpis.blocked}</span>
              </button>
              <button
                onClick={() => setIssueFilter(issueFilter === 'delayed' ? 'all' : 'delayed')}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                  issueFilter === 'delayed'
                    ? "bg-amber-500 text-white border-amber-500"
                    : kpis.delayed > 0
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30 hover:border-amber-500/50"
                      : "bg-muted/50 text-muted-foreground border-border/50"
                )}
              >
                <Clock className="h-3 w-3" />
                Late
                <span className={cn(
                  "text-[10px] px-1 rounded",
                  issueFilter === 'delayed' ? "bg-white/20" : "bg-amber-500/20"
                )}>{kpis.delayed}</span>
              </button>

              {/* Block Reason Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors border",
                    blockReasonFilter !== 'all' 
                      ? "bg-amber-500/10 text-amber-600 border-amber-500/30" 
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  )}>
                    <FileWarning className="h-3 w-3" />
                    {blockReasonFilter !== 'all' 
                      ? BLOCK_REASONS[blockReasonFilter as keyof typeof BLOCK_REASONS]?.label 
                      : 'Block Reason'}
                    {blockReasonFilter !== 'all' && <span className="ml-1">×</span>}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
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
                        <Badge variant="secondary" className="text-xs">{blockReasonCounts[key]}</Badge>
                      </DropdownMenuItem>
                    ))
                  }
                  {blockReasonCounts.all === 0 && (
                    <DropdownMenuItem disabled>No blocked items</DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Active Filter Summary */}
              {(stageFilter !== 'all' || issueFilter !== 'all' || blockReasonFilter !== 'all' || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStageFilter('all');
                    setIssueFilter('all');
                    setBlockReasonFilter('all');
                    setSearchQuery('');
                  }}
                  className="ml-auto text-xs h-7"
                >
                  Clear all filters
                </Button>
              )}
            </div>
          </div>
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
                } else if (locationFilter === 'external') {
                  icon = "partners";
                  if (stageFilter !== 'all') {
                    const externalStage = EXTERNAL_STAGES[stageFilter as keyof typeof EXTERNAL_STAGES];
                    title = `${externalStage?.label || 'Partner'} queue empty`;
                    description = `No jobs at ${externalStage?.label || 'this partner'} right now.`;
                  } else {
                    title = "Nothing with partners";
                    description = "All jobs are in-house. Send work out when ready.";
                  }
                } else if (locationFilter === 'transit') {
                  icon = "partners";
                  title = "Nothing in transit";
                  description = "No jobs currently moving between locations.";
                } else if (locationFilter === 'internal' && stageFilter !== 'all') {
                  const internalStage = INTERNAL_STAGES[stageFilter as keyof typeof INTERNAL_STAGES];
                  title = `${internalStage?.label || 'Stage'} is clear`;
                  description = `No jobs waiting in ${internalStage?.label || 'this stage'}. Check other queues.`;
                } else {
                  title = "Queue empty";
                  description = "No matching jobs found. Adjust filters or create a new one.";
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
                batchBreakdown={getBatchBreakdown(wo.id)}
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
