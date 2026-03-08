/**
 * InternalFlowPanel - Production pipeline flow
 * Clean stage cards with readable text. Batch-based SSOT.
 */
import { useNavigate } from "react-router-dom";
import { useBatchBasedWIP } from "@/hooks/useBatchBasedWIP";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Scissors, Factory, ClipboardCheck, BoxSelect, Truck,
  ArrowRight, Clock, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface InternalFlowPanelProps {
  stages?: any[];
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  cutting: { label: 'Cutting', icon: Scissors, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-950/30' },
  production: { label: 'Production', icon: Factory, color: 'text-indigo-600', bg: 'bg-indigo-50 dark:bg-indigo-950/30' },
  qc: { label: 'Quality', icon: ClipboardCheck, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-950/30' },
  packing: { label: 'Packing', icon: BoxSelect, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-950/30' },
  dispatch: { label: 'Dispatch', icon: Truck, color: 'text-cyan-600', bg: 'bg-cyan-50 dark:bg-cyan-950/30' }
};

export const InternalFlowPanel = ({ stages: _legacy }: InternalFlowPanelProps) => {
  const navigate = useNavigate();
  const { internalStages, loading } = useBatchBasedWIP();

  const totalBatches = internalStages.reduce((s, st) => s + st.batchCount, 0);
  const totalPcs = internalStages.reduce((s, st) => s + st.totalQuantity, 0);

  // Find bottleneck
  const scored = internalStages
    .map((s, i) => ({ i, score: (s.avgWaitHours * s.totalQuantity) + (s.batchCount * 10), stage: s.stage, hasWork: s.batchCount > 0 }))
    .filter(s => s.hasWork)
    .sort((a, b) => b.score - a.score);
  const bottleneckStage = scored.length > 0 && scored[0].score > 50 ? scored[0].stage : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {[...Array(5)].map((_, i) => <div key={i} className="min-w-[120px] h-28 bg-muted animate-pulse rounded-lg shrink-0" />)}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            Total: <span className="font-semibold text-foreground">{totalBatches}</span> batches
          </span>
          <span className="text-muted-foreground">
            WIP: <span className="font-semibold text-foreground">{totalPcs.toLocaleString()}</span> pcs
          </span>
        </div>
        {bottleneckStage && (
          <Badge variant="destructive" className="gap-1 text-[10px]">
            <AlertTriangle className="h-3 w-3" />
            Bottleneck: {STAGE_CONFIG[bottleneckStage]?.label}
          </Badge>
        )}
      </div>

      {/* Flow */}
      <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
        {internalStages.map((stage, index) => {
          const config = STAGE_CONFIG[stage.stage];
          if (!config) return null;
          const Icon = config.icon;
          const hasWork = stage.batchCount > 0;
          const isBottleneck = stage.stage === bottleneckStage;

          return (
            <div key={stage.stage} className="flex items-center">
              <button
                className={cn(
                  "min-w-[120px] rounded-lg p-3 text-left transition-all border",
                  isBottleneck ? "border-destructive ring-1 ring-destructive/20 shadow-sm" : "border-border/50",
                  !hasWork && "opacity-30",
                  hasWork && "hover:shadow-md hover:-translate-y-0.5"
                )}
                onClick={() => navigate(`/work-orders?stage=${stage.stage}`)}
              >
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn("p-1 rounded", config.bg)}>
                    <Icon className={cn("h-3.5 w-3.5", config.color)} />
                  </div>
                  <span className="text-xs font-medium">{config.label}</span>
                  {isBottleneck && <span className="text-[8px] text-destructive font-bold ml-auto">#1</span>}
                </div>

                <div className="text-center mb-1.5">
                  <div className={cn(
                    "text-xl font-bold leading-none",
                    isBottleneck ? "text-destructive" : hasWork ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {stage.batchCount}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">batches</p>
                </div>

                {hasWork && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{stage.totalQuantity.toLocaleString()} pcs</span>
                      <span className={cn(
                        "flex items-center gap-0.5",
                        stage.avgWaitHours > 8 ? "text-destructive font-medium" : ""
                      )}>
                        <Clock className="h-2.5 w-2.5" />
                        {Math.round(stage.avgWaitHours)}h
                      </span>
                    </div>
                    <Progress
                      value={Math.min((stage.avgWaitHours / 12) * 100, 100)}
                      className={cn("h-1", stage.avgWaitHours > 8 ? "[&>div]:bg-destructive" : stage.avgWaitHours > 4 ? "[&>div]:bg-amber-500" : "")}
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>Queue: {stage.inQueue}</span>
                      <span>Active: {stage.inProgress}</span>
                    </div>
                  </div>
                )}
              </button>

              {index < internalStages.length - 1 && (
                <ArrowRight className={cn(
                  "h-3.5 w-3.5 mx-0.5 shrink-0",
                  internalStages[index + 1]?.stage === bottleneckStage ? "text-destructive" : "text-muted-foreground/20"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
