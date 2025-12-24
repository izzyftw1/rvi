import { useNavigate } from "react-router-dom";
import { useBatchBasedWIP, BatchStageMetrics } from "@/hooks/useBatchBasedWIP";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  Scissors, 
  Factory, 
  ClipboardCheck, 
  BoxSelect, 
  Truck,
  ArrowRight,
  Clock,
  AlertTriangle,
  ShieldAlert,
  Pause
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * InternalFlowPanel - Production flow visualization
 * 
 * SINGLE SOURCE OF TRUTH: All quantities derived from production_batches table.
 * A Work Order may have multiple active batches in different stages simultaneously.
 * Do NOT infer stage from work_orders.current_stage.
 */

interface InternalFlowPanelProps {
  stages?: any[]; // Legacy prop - ignored
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  cutting: { label: 'Cutting', icon: Scissors, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/30' },
  production: { label: 'Production', icon: Factory, color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30' },
  qc: { label: 'Quality', icon: ClipboardCheck, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
  packing: { label: 'Packing', icon: BoxSelect, color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-950/30' },
  dispatch: { label: 'Dispatch', icon: Truck, color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30' }
};

const BLOCKING_COLORS: Record<string, string> = {
  capacity: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  overdue: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
  none: 'text-muted-foreground bg-muted'
};

interface EnhancedStageData extends BatchStageMetrics {
  blockingReason: { type: string; label: string; count: number };
  isBottleneck: boolean;
  bottleneckRank: number;
}

export const InternalFlowPanel = ({ stages: _legacyStages }: InternalFlowPanelProps) => {
  const navigate = useNavigate();
  // Use batch-based WIP - single source of truth
  const { internalStages, summary, loading } = useBatchBasedWIP();

  // Calculate totals from batch data
  const totalActiveJobs = internalStages.reduce((sum, s) => sum + s.batchCount, 0);
  const totalPcs = internalStages.reduce((sum, s) => sum + s.totalQuantity, 0);

  // Enhance stages with bottleneck detection
  const enhancedStages: EnhancedStageData[] = internalStages.map(stage => {
    // Determine blocking reason based on batch characteristics
    let blockingReason = { type: 'none', label: 'Normal', count: 0 };
    
    if (stage.avgWaitHours > 8) {
      blockingReason = { type: 'capacity', label: 'Capacity', count: stage.batchCount };
    } else if (stage.overdueCount > 0) {
      blockingReason = { type: 'overdue', label: 'Overdue', count: stage.overdueCount };
    }
    
    return {
      ...stage,
      blockingReason,
      isBottleneck: false,
      bottleneckRank: 0
    };
  });

  // Score stages for bottleneck identification
  const stageScores = enhancedStages
    .map((stage, index) => ({
      index,
      stage: stage.stage,
      score: (stage.avgWaitHours * stage.totalQuantity) + (stage.batchCount * 10),
      hasWork: stage.batchCount > 0
    }))
    .filter(s => s.hasWork && s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Mark top 2 as bottlenecks
  stageScores.slice(0, 2).forEach((scored, rank) => {
    if (scored.score > 50) {
      enhancedStages[scored.index].isBottleneck = true;
      enhancedStages[scored.index].bottleneckRank = rank + 1;
    }
  });

  const handleStageClick = (stageName: string) => {
    navigate(`/work-orders?stage=${stageName}`);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="min-w-[140px] h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary strip with bottleneck alert */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">
              Total: <span className="font-semibold text-foreground">{totalActiveJobs}</span> batches
            </span>
            <span className="text-muted-foreground">
              WIP: <span className="font-semibold text-foreground">{totalPcs.toLocaleString()}</span> pcs
            </span>
          </div>
          
          {stageScores.length > 0 && stageScores[0].score > 50 && (
            <Badge variant="destructive" className="flex items-center gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              Bottleneck: {STAGE_CONFIG[stageScores[0].stage]?.label || stageScores[0].stage}
            </Badge>
          )}
        </div>

        {/* Flow visualization - batch-based */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {enhancedStages.map((stage, index) => {
            const config = STAGE_CONFIG[stage.stage];
            if (!config) return null;
            
            const Icon = config.icon;
            const hasWork = stage.batchCount > 0;
            
            // Determine visual emphasis
            const isWorstBottleneck = stage.bottleneckRank === 1;
            const isSecondBottleneck = stage.bottleneckRank === 2;
            const isDeemphasized = hasWork && !stage.isBottleneck && totalActiveJobs > 3;
            
            return (
              <div key={stage.stage} className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Card
                      className={cn(
                        "min-w-[140px] cursor-pointer transition-all",
                        // Bottleneck emphasis
                        isWorstBottleneck && "ring-2 ring-destructive shadow-lg shadow-destructive/20 scale-105 z-10",
                        isSecondBottleneck && "ring-2 ring-amber-500 shadow-md shadow-amber-500/10",
                        // De-emphasis for non-critical
                        isDeemphasized && "opacity-50 scale-95",
                        // No work
                        !hasWork && "opacity-30",
                        // Hover
                        "hover:shadow-lg hover:-translate-y-1"
                      )}
                      onClick={() => handleStageClick(stage.stage)}
                    >
                      <CardContent className="p-3">
                        {/* Header with icon and bottleneck badge */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn("p-1 rounded", config.bgColor)}>
                              <Icon className={cn("h-4 w-4", config.color)} />
                            </div>
                            <span className="text-xs font-medium truncate">{config.label}</span>
                          </div>
                          {stage.isBottleneck && (
                            <Badge 
                              variant={isWorstBottleneck ? "destructive" : "outline"} 
                              className={cn(
                                "text-[9px] px-1 py-0",
                                isWorstBottleneck && "animate-pulse"
                              )}
                            >
                              #{stage.bottleneckRank}
                            </Badge>
                          )}
                        </div>
                        
                        {/* Main metrics - batch count */}
                        <div className="text-center mb-2">
                          <div className={cn(
                            "text-2xl font-bold",
                            hasWork ? "text-foreground" : "text-muted-foreground",
                            isWorstBottleneck && "text-destructive"
                          )}>
                            {stage.batchCount}
                          </div>
                          <p className="text-[10px] text-muted-foreground">batches</p>
                        </div>

                        {hasWork && (
                          <div className="space-y-2">
                            {/* Pcs and wait time */}
                            <div className="flex justify-between text-[10px]">
                              <span className="text-muted-foreground">
                                {stage.totalQuantity.toLocaleString()} pcs
                              </span>
                              <span className={cn(
                                "flex items-center gap-0.5 font-medium",
                                stage.avgWaitHours > 8 ? "text-destructive" :
                                stage.avgWaitHours > 4 ? "text-amber-600" : "text-muted-foreground"
                              )}>
                                <Clock className="h-2.5 w-2.5" />
                                {Math.round(stage.avgWaitHours)}h
                              </span>
                            </div>
                            
                            {/* Progress bar colored by severity */}
                            <Progress 
                              value={Math.min((stage.avgWaitHours / 12) * 100, 100)} 
                              className={cn(
                                "h-1.5",
                                stage.avgWaitHours > 8 ? "[&>div]:bg-destructive" :
                                stage.avgWaitHours > 4 ? "[&>div]:bg-amber-500" : ""
                              )}
                            />
                            
                            {/* Status breakdown */}
                            <div className="flex justify-between text-[9px] text-muted-foreground">
                              <span>Queue: {stage.inQueue}</span>
                              <span>Active: {stage.inProgress}</span>
                            </div>
                            
                            {/* Blocking reason */}
                            {stage.blockingReason.type !== 'none' && (
                              <div className={cn(
                                "flex items-center justify-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full",
                                BLOCKING_COLORS[stage.blockingReason.type]
                              )}>
                                {stage.blockingReason.type === 'overdue' ? (
                                  <ShieldAlert className="h-2.5 w-2.5" />
                                ) : (
                                  <Pause className="h-2.5 w-2.5" />
                                )}
                                <span>{stage.blockingReason.label}</span>
                                {stage.blockingReason.count > 0 && (
                                  <span className="font-medium">({stage.blockingReason.count})</span>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-[200px]">
                    <div className="text-xs space-y-1">
                      <p className="font-semibold">{config.label}</p>
                      <p>{stage.batchCount} batches • {stage.totalQuantity.toLocaleString()} pcs</p>
                      <p>Avg wait: {stage.avgWaitHours.toFixed(1)} hours</p>
                      <p>In queue: {stage.inQueue} | Active: {stage.inProgress}</p>
                      {stage.isBottleneck && (
                        <p className="text-destructive font-medium">
                          ⚠️ Bottleneck #{stage.bottleneckRank}
                        </p>
                      )}
                      {stage.blockingReason.type !== 'none' && (
                        <p>Issue: {stage.blockingReason.label} ({stage.blockingReason.count})</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>

                {index < enhancedStages.length - 1 && (
                  <ArrowRight className={cn(
                    "h-4 w-4 flex-shrink-0 mx-1",
                    // Highlight flow into bottleneck
                    enhancedStages[index + 1]?.isBottleneck 
                      ? "text-destructive animate-pulse" 
                      : "text-muted-foreground/30"
                  )} />
                )}
              </div>
            );
          })}
        </div>
        
        {/* Source indicator */}
        <p className="text-[10px] text-muted-foreground italic text-right">
          All values derived from production_batches (batch-level source of truth)
        </p>
      </div>
    </TooltipProvider>
  );
};
