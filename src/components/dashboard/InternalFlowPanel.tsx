import { useNavigate } from "react-router-dom";
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
  Clock
} from "lucide-react";
import { cn } from "@/lib/utils";

interface StageData {
  stage_name: string;
  active_jobs: number;
  pcs_remaining: number;
  kg_remaining: number;
  avg_wait_hours: number;
}

interface InternalFlowPanelProps {
  stages: StageData[];
}

const STAGE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  goods_in: { label: 'Goods In', icon: Package, color: 'text-blue-600' },
  cutting: { label: 'Cutting', icon: Scissors, color: 'text-orange-600' },
  forging: { label: 'Forging', icon: Flame, color: 'text-red-600' },
  production: { label: 'Production', icon: Factory, color: 'text-indigo-600' },
  quality: { label: 'Quality', icon: ClipboardCheck, color: 'text-emerald-600' },
  packing: { label: 'Packing', icon: BoxSelect, color: 'text-purple-600' },
  dispatch: { label: 'Dispatch', icon: Truck, color: 'text-cyan-600' }
};

const STAGE_ORDER = ['goods_in', 'cutting', 'forging', 'production', 'quality', 'packing', 'dispatch'];

export const InternalFlowPanel = ({ stages }: InternalFlowPanelProps) => {
  const navigate = useNavigate();

  // Calculate totals for quick glance
  const totalActiveJobs = stages.reduce((sum, s) => sum + (s.active_jobs || 0), 0);
  const totalPcs = stages.reduce((sum, s) => sum + (s.pcs_remaining || 0), 0);

  const handleStageClick = (stageName: string) => {
    navigate(`/production-progress?stage=${stageName}`);
  };

  const getJobsIntensity = (jobs: number) => {
    if (jobs === 0) return 'opacity-40';
    if (jobs <= 3) return '';
    if (jobs <= 7) return 'ring-2 ring-amber-500/30';
    return 'ring-2 ring-destructive/30';
  };

  const orderedStages = STAGE_ORDER.map(key => 
    stages.find(s => s.stage_name === key) || { 
      stage_name: key, 
      active_jobs: 0, 
      pcs_remaining: 0, 
      kg_remaining: 0, 
      avg_wait_hours: 0 
    }
  );

  return (
    <div className="space-y-4">
      {/* Summary strip */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-6 text-sm">
          <span className="text-muted-foreground">
            Total Active: <span className="font-semibold text-foreground">{totalActiveJobs}</span> jobs
          </span>
          <span className="text-muted-foreground">
            WIP: <span className="font-semibold text-foreground">{totalPcs.toLocaleString()}</span> pcs
          </span>
        </div>
      </div>

      {/* Flow visualization */}
      <div className="flex items-center gap-1 overflow-x-auto pb-2">
        {orderedStages.map((stage, index) => {
          const config = STAGE_CONFIG[stage.stage_name];
          if (!config) return null;
          
          const Icon = config.icon;
          const hasWork = stage.active_jobs > 0;
          
          return (
            <div key={stage.stage_name} className="flex items-center">
              <Card
                className={cn(
                  "min-w-[130px] cursor-pointer transition-all hover:shadow-lg hover:-translate-y-1",
                  getJobsIntensity(stage.active_jobs)
                )}
                onClick={() => handleStageClick(stage.stage_name)}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={cn("h-4 w-4", config.color)} />
                    <span className="text-xs font-medium truncate">{config.label}</span>
                  </div>
                  
                  <div className="text-center">
                    <div className={cn(
                      "text-2xl font-bold",
                      hasWork ? "text-foreground" : "text-muted-foreground"
                    )}>
                      {stage.active_jobs}
                    </div>
                    <p className="text-[10px] text-muted-foreground">jobs</p>
                  </div>

                  {hasWork && (
                    <div className="mt-2 space-y-1">
                      <div className="flex justify-between text-[10px] text-muted-foreground">
                        <span>{Math.round(stage.pcs_remaining)} pcs</span>
                        {stage.avg_wait_hours > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {Math.round(stage.avg_wait_hours)}h
                          </span>
                        )}
                      </div>
                      <Progress 
                        value={Math.min((stage.active_jobs / 10) * 100, 100)} 
                        className="h-1"
                      />
                    </div>
                  )}
                </CardContent>
              </Card>

              {index < orderedStages.length - 1 && (
                <ArrowRight className="h-4 w-4 text-muted-foreground/30 flex-shrink-0 mx-1" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
