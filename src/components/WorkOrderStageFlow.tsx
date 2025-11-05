import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Circle, Clock, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StageFlowProps {
  currentStage: string;
  stageHistory?: Array<{
    from_stage: string;
    to_stage: string;
    changed_at: string;
    profiles?: { full_name: string };
  }>;
  onStageClick?: (stage: string) => void;
}

const WORKFLOW_STAGES = [
  { key: 'production_planning', label: 'Planning', icon: '📋' },
  { key: 'proforma_sent', label: 'Proforma', icon: '📄' },
  { key: 'raw_material_check', label: 'Material Check', icon: '🔍' },
  { key: 'raw_material_order', label: 'Material Order', icon: '📦' },
  { key: 'raw_material_inwards', label: 'Material In', icon: '📥' },
  { key: 'raw_material_qc', label: 'Material QC', icon: '✓' },
  { key: 'cutting', label: 'Cutting', icon: '✂️' },
  { key: 'forging', label: 'Forging', icon: '🔨' },
  { key: 'cnc_production', label: 'CNC', icon: '⚙️' },
  { key: 'first_piece_qc', label: 'First Piece QC', icon: '🔬' },
  { key: 'mass_production', label: 'Production', icon: '🏭' },
  { key: 'buffing', label: 'Buffing', icon: '✨' },
  { key: 'plating', label: 'Plating', icon: '🎨' },
  { key: 'blasting', label: 'Blasting', icon: '💨' },
  { key: 'packing', label: 'Packing', icon: '📦' },
  { key: 'dispatch', label: 'Dispatch', icon: '🚚' },
];

export function WorkOrderStageFlow({ currentStage, stageHistory = [], onStageClick }: StageFlowProps) {
  const currentIndex = WORKFLOW_STAGES.findIndex(s => s.key === currentStage);
  
  const getStageStatus = (index: number): 'done' | 'active' | 'pending' => {
    if (index < currentIndex) return 'done';
    if (index === currentIndex) return 'active';
    return 'pending';
  };

  const getStageInfo = (stage: string) => {
    const history = stageHistory.find(h => h.to_stage === stage);
    if (!history) return null;
    
    return {
      timestamp: new Date(history.changed_at).toLocaleString(),
      user: history.profiles?.full_name || 'System'
    };
  };

  return (
    <div className="w-full overflow-x-auto pb-4 bg-card rounded-lg border p-4">
      <TooltipProvider>
        <div className="flex items-center gap-1 min-w-max">
          {WORKFLOW_STAGES.map((stage, index) => {
            const status = getStageStatus(index);
            const stageInfo = getStageInfo(stage.key);
            const isLast = index === WORKFLOW_STAGES.length - 1;
            const isClickable = status !== 'pending' && onStageClick;

            return (
              <div key={stage.key} className="flex items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => isClickable && onStageClick(stage.key)}
                      disabled={!isClickable}
                      className={cn(
                        "flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-all",
                        isClickable && "hover:bg-accent cursor-pointer",
                        !isClickable && "cursor-default"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center transition-all",
                          status === 'done' && "bg-green-100 dark:bg-green-900/30",
                          status === 'active' && "bg-primary animate-pulse",
                          status === 'pending' && "bg-muted"
                        )}>
                          {status === 'done' && <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />}
                          {status === 'active' && <Clock className="w-5 h-5 text-primary-foreground" />}
                          {status === 'pending' && <Circle className="w-5 h-5 text-muted-foreground" />}
                        </div>
                        <span className="text-lg">{stage.icon}</span>
                      </div>
                      <span className={cn(
                        "text-xs font-medium whitespace-nowrap",
                        status === 'active' && "text-primary font-semibold",
                        status === 'done' && "text-foreground",
                        status === 'pending' && "text-muted-foreground"
                      )}>
                        {stage.label}
                      </span>
                      {status === 'active' && (
                        <span className="text-xs text-primary">Current</span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-semibold">{stage.label}</p>
                      {stageInfo && (
                        <>
                          <p className="text-xs text-muted-foreground">
                            Completed: {stageInfo.timestamp}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            By: {stageInfo.user}
                          </p>
                        </>
                      )}
                      {status === 'active' && (
                        <p className="text-xs text-primary">Currently in this stage</p>
                      )}
                      {status === 'pending' && (
                        <p className="text-xs text-muted-foreground">Not yet started</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
                
                {!isLast && (
                  <div className={cn(
                    "h-0.5 w-6 mx-1 transition-all",
                    status === 'done' ? "bg-green-500" : "bg-border"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
