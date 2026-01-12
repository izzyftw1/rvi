import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ClipboardCheck, Truck, ArrowRight, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PipelineCount } from "@/hooks/useLogisticsData";

interface OperationalPipelineProps {
  pipeline: PipelineCount;
  onStageClick?: (stage: string) => void;
}

interface PipelineStageProps {
  label: string;
  count: number;
  icon: React.ReactNode;
  color: "amber" | "green" | "blue" | "emerald";
  isLast?: boolean;
  onClick?: () => void;
}

const PipelineStage = memo(({ label, count, icon, color, isLast, onClick }: PipelineStageProps) => {
  const colorClasses = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  };

  const iconBgClasses = {
    amber: "bg-amber-500",
    green: "bg-green-500",
    blue: "bg-blue-500",
    emerald: "bg-emerald-500",
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onClick}
        className={cn(
          "flex-1 flex items-center gap-3 p-3 rounded-lg border transition-all hover:shadow-sm cursor-pointer",
          colorClasses[color]
        )}
      >
        <div className={cn("p-2 rounded-full text-white", iconBgClasses[color])}>
          {icon}
        </div>
        <div className="flex-1 text-left">
          <p className="text-xs font-medium opacity-80">{label}</p>
          <p className="text-xl font-bold">{count}</p>
        </div>
      </button>
      {!isLast && (
        <ArrowRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
});

PipelineStage.displayName = "PipelineStage";

export const OperationalPipeline = memo(({ pipeline, onStageClick }: OperationalPipelineProps) => {
  const total = pipeline.awaitingDispatchQC + pipeline.readyForDispatch + pipeline.partiallyDispatched + pipeline.fullyDispatched;
  
  const stages = [
    { key: "awaiting-qc", label: "Awaiting QC", count: pipeline.awaitingDispatchQC, color: "amber" as const, icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "ready", label: "Ready to Dispatch", count: pipeline.readyForDispatch, color: "green" as const, icon: <Truck className="h-4 w-4" /> },
    { key: "partial", label: "Partially Dispatched", count: pipeline.partiallyDispatched, color: "blue" as const, icon: <ArrowRight className="h-4 w-4" /> },
    { key: "complete", label: "Fully Dispatched", count: pipeline.fullyDispatched, color: "emerald" as const, icon: <CheckCircle2 className="h-4 w-4" /> },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">Operational Pipeline</CardTitle>
          <Badge variant="outline" className="font-mono">
            {total} total cartons
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          {stages.map((stage, idx) => (
            <PipelineStage
              key={stage.key}
              label={stage.label}
              count={stage.count}
              icon={stage.icon}
              color={stage.color}
              isLast={idx === stages.length - 1}
              onClick={() => onStageClick?.(stage.key)}
            />
          ))}
        </div>

        {total > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Pipeline Progress</span>
              <span>{Math.round((pipeline.fullyDispatched / total) * 100)}% Complete</span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              <div 
                className="bg-amber-500 transition-all" 
                style={{ width: `${(pipeline.awaitingDispatchQC / total) * 100}%` }} 
              />
              <div 
                className="bg-green-500 transition-all" 
                style={{ width: `${(pipeline.readyForDispatch / total) * 100}%` }} 
              />
              <div 
                className="bg-blue-500 transition-all" 
                style={{ width: `${(pipeline.partiallyDispatched / total) * 100}%` }} 
              />
              <div 
                className="bg-emerald-500 transition-all" 
                style={{ width: `${(pipeline.fullyDispatched / total) * 100}%` }} 
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
});

OperationalPipeline.displayName = "OperationalPipeline";
