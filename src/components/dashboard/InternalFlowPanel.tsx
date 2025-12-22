import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Package, 
  Scissors, 
  Flame, 
  Factory, 
  ClipboardCheck, 
  BoxSelect, 
  Truck,
  ArrowRight,
  Clock,
  AlertTriangle,
  Wrench,
  ShieldAlert,
  Pause
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface StageData {
  stage_name: string;
  active_jobs: number;
  pcs_remaining: number;
  kg_remaining: number;
  avg_wait_hours: number;
}

interface BlockingReason {
  type: 'qc' | 'maintenance' | 'production' | 'external' | 'none';
  label: string;
  count: number;
}

interface EnhancedStageData extends StageData {
  blockingReason: BlockingReason;
  isBottleneck: boolean;
  bottleneckRank: number; // 1 = worst, 2 = second worst, 0 = not a bottleneck
}

interface InternalFlowPanelProps {
  stages: StageData[];
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string; bgColor: string }> = {
  goods_in: { label: 'Goods In', icon: Package, color: 'text-blue-600', bgColor: 'bg-blue-50 dark:bg-blue-950/30' },
  cutting: { label: 'Cutting', icon: Scissors, color: 'text-orange-600', bgColor: 'bg-orange-50 dark:bg-orange-950/30' },
  forging: { label: 'Forging', icon: Flame, color: 'text-red-600', bgColor: 'bg-red-50 dark:bg-red-950/30' },
  production: { label: 'Production', icon: Factory, color: 'text-indigo-600', bgColor: 'bg-indigo-50 dark:bg-indigo-950/30' },
  quality: { label: 'Quality', icon: ClipboardCheck, color: 'text-emerald-600', bgColor: 'bg-emerald-50 dark:bg-emerald-950/30' },
  packing: { label: 'Packing', icon: BoxSelect, color: 'text-purple-600', bgColor: 'bg-purple-50 dark:bg-purple-950/30' },
  dispatch: { label: 'Dispatch', icon: Truck, color: 'text-cyan-600', bgColor: 'bg-cyan-50 dark:bg-cyan-950/30' }
};

const STAGE_ORDER = ['goods_in', 'cutting', 'forging', 'production', 'quality', 'packing', 'dispatch'];

const BLOCKING_ICONS: Record<string, React.ElementType> = {
  qc: ShieldAlert,
  maintenance: Wrench,
  production: Pause,
  external: Clock,
  none: Clock
};

const BLOCKING_COLORS: Record<string, string> = {
  qc: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
  maintenance: 'text-red-600 bg-red-100 dark:bg-red-900/30',
  production: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
  external: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
  none: 'text-muted-foreground bg-muted'
};

export const InternalFlowPanel = ({ stages }: InternalFlowPanelProps) => {
  const navigate = useNavigate();
  const [blockingData, setBlockingData] = useState<Record<string, BlockingReason>>({});

  // Fetch blocking reasons for each stage
  useEffect(() => {
    const fetchBlockingReasons = async () => {
      const today = new Date().toISOString().split('T')[0];
      
      // Fetch QC blocks - work orders waiting for QC approval
      const { data: qcBlocks } = await supabase
        .from('work_orders')
        .select('current_stage, qc_material_passed, qc_first_piece_passed')
        .or('qc_material_passed.eq.false,qc_first_piece_passed.eq.false')
        .neq('status', 'completed');

      // Fetch maintenance blocks
      const { data: maintenanceBlocks } = await supabase
        .from('maintenance_logs')
        .select('machine_id')
        .is('end_time', null);

      // Fetch machines under maintenance
      const { data: machinesDown } = await supabase
        .from('machines')
        .select('id, department_id')
        .eq('status', 'maintenance');

      // Calculate blocking reasons per stage
      const blocking: Record<string, BlockingReason> = {};
      
      STAGE_ORDER.forEach(stage => {
        const stageData = stages.find(s => s.stage_name === stage);
        if (!stageData || stageData.active_jobs === 0) {
          blocking[stage] = { type: 'none', label: 'No blocks', count: 0 };
          return;
        }

        // Determine primary blocking reason based on stage
        let qcCount = 0;
        let maintenanceCount = machinesDown?.length || 0;
        
        if (qcBlocks) {
          qcCount = qcBlocks.filter(wo => {
            if (stage === 'goods_in' && !wo.qc_material_passed) return true;
            if (stage === 'production' && !wo.qc_first_piece_passed) return true;
            return false;
          }).length;
        }

        // Prioritize blocking reasons
        if (maintenanceCount > 0 && (stage === 'production' || stage === 'cutting' || stage === 'forging')) {
          blocking[stage] = { type: 'maintenance', label: 'Maintenance', count: maintenanceCount };
        } else if (qcCount > 0) {
          blocking[stage] = { type: 'qc', label: 'QC Hold', count: qcCount };
        } else if (stageData.avg_wait_hours > 4) {
          blocking[stage] = { type: 'production', label: 'Capacity', count: stageData.active_jobs };
        } else {
          blocking[stage] = { type: 'none', label: 'Normal', count: 0 };
        }
      });

      setBlockingData(blocking);
    };

    fetchBlockingReasons();
  }, [stages]);

  // Calculate totals for quick glance with null-safety
  const safeStages = Array.isArray(stages) ? stages : [];
  const totalActiveJobs = safeStages.reduce((sum, s) => sum + (s?.active_jobs ?? 0), 0);
  const totalPcs = safeStages.reduce((sum, s) => sum + (s?.pcs_remaining ?? 0), 0);

  // Identify bottlenecks (top 2 stages with highest wait hours * pcs)
  const enhancedStages: EnhancedStageData[] = STAGE_ORDER.map(key => {
    const stage = safeStages.find(s => s?.stage_name === key) || { 
      stage_name: key, 
      active_jobs: 0, 
      pcs_remaining: 0, 
      kg_remaining: 0, 
      avg_wait_hours: 0 
    };
    
    return {
      ...stage,
      blockingReason: blockingData[key] || { type: 'none', label: 'Normal', count: 0 },
      isBottleneck: false,
      bottleneckRank: 0
    };
  });

  // Score stages for bottleneck identification with null-safety
  const stageScores = enhancedStages
    .map((stage, index) => ({
      index,
      stage_name: stage.stage_name,
      score: ((stage.avg_wait_hours ?? 0) * (stage.pcs_remaining ?? 0)) + ((stage.active_jobs ?? 0) * 10),
      hasWork: (stage.active_jobs ?? 0) > 0
    }))
    .filter(s => s.hasWork && s.score > 0)
    .sort((a, b) => b.score - a.score);

  // Mark top 2 as bottlenecks
  stageScores.slice(0, 2).forEach((scored, rank) => {
    if (scored.score > 50) { // Only mark as bottleneck if score is significant
      enhancedStages[scored.index].isBottleneck = true;
      enhancedStages[scored.index].bottleneckRank = rank + 1;
    }
  });

  const handleStageClick = (stageName: string) => {
    navigate(`/production-progress?stage=${stageName}`);
  };

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary strip with bottleneck alert */}
        <div className="flex items-center justify-between px-2">
          <div className="flex items-center gap-6 text-sm">
            <span className="text-muted-foreground">
              Total Active: <span className="font-semibold text-foreground">{totalActiveJobs}</span> jobs
            </span>
            <span className="text-muted-foreground">
              WIP: <span className="font-semibold text-foreground">{totalPcs.toLocaleString()}</span> pcs
            </span>
          </div>
          
          {stageScores.length > 0 && stageScores[0].score > 50 && (
            <Badge variant="destructive" className="flex items-center gap-1 animate-pulse">
              <AlertTriangle className="h-3 w-3" />
              Bottleneck: {STAGE_CONFIG[stageScores[0].stage_name]?.label}
            </Badge>
          )}
        </div>

        {/* Flow visualization */}
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {enhancedStages.map((stage, index) => {
            const config = STAGE_CONFIG[stage.stage_name];
            if (!config) return null;
            
            const Icon = config.icon;
            const hasWork = stage.active_jobs > 0;
            const BlockingIcon = BLOCKING_ICONS[stage.blockingReason.type];
            
            // Determine visual emphasis
            const isWorstBottleneck = stage.bottleneckRank === 1;
            const isSecondBottleneck = stage.bottleneckRank === 2;
            const isDeemphasized = hasWork && !stage.isBottleneck && totalActiveJobs > 3;
            
            return (
              <div key={stage.stage_name} className="flex items-center">
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
                      onClick={() => handleStageClick(stage.stage_name)}
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
                        
                        {/* Main metrics */}
                        <div className="text-center mb-2">
                          <div className={cn(
                            "text-2xl font-bold",
                            hasWork ? "text-foreground" : "text-muted-foreground",
                            isWorstBottleneck && "text-destructive"
                          )}>
                            {stage.active_jobs}
                          </div>
                          <p className="text-[10px] text-muted-foreground">jobs</p>
                        </div>

                        {hasWork && (
                          <div className="space-y-2">
                            {/* Pcs and wait time */}
                            <div className="flex justify-between text-[10px]">
                              <span className="text-muted-foreground">
                                {Math.round(stage.pcs_remaining ?? 0).toLocaleString()} pcs
                              </span>
                              <span className={cn(
                                "flex items-center gap-0.5 font-medium",
                                (stage.avg_wait_hours ?? 0) > 8 ? "text-destructive" :
                                (stage.avg_wait_hours ?? 0) > 4 ? "text-amber-600" : "text-muted-foreground"
                              )}>
                                <Clock className="h-2.5 w-2.5" />
                                {Math.round(stage.avg_wait_hours ?? 0)}h wait
                              </span>
                            </div>
                            
                            {/* Progress bar colored by severity */}
                            <Progress 
                              value={Math.min(((stage.avg_wait_hours ?? 0) / 12) * 100, 100)} 
                              className={cn(
                                "h-1.5",
                                (stage.avg_wait_hours ?? 0) > 8 ? "[&>div]:bg-destructive" :
                                (stage.avg_wait_hours ?? 0) > 4 ? "[&>div]:bg-amber-500" : ""
                              )}
                            />
                            
                            {/* Blocking reason */}
                            {stage.blockingReason.type !== 'none' && (
                              <div className={cn(
                                "flex items-center justify-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full",
                                BLOCKING_COLORS[stage.blockingReason.type]
                              )}>
                                <BlockingIcon className="h-2.5 w-2.5" />
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
                      <p>{(stage?.active_jobs ?? 0)} jobs • {Math.round(stage?.pcs_remaining ?? 0).toLocaleString()} pcs</p>
                      <p>Avg wait: {(stage.avg_wait_hours ?? 0).toFixed(1)} hours</p>
                      {stage.isBottleneck && (
                        <p className="text-destructive font-medium">
                          ⚠️ Bottleneck #{stage.bottleneckRank}
                        </p>
                      )}
                      {stage.blockingReason?.type !== 'none' && (
                        <p>Block: {stage.blockingReason?.label ?? 'Unknown'} ({stage.blockingReason?.count ?? 0})</p>
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
      </div>
    </TooltipProvider>
  );
};
