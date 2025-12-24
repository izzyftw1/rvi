import { useNavigate } from "react-router-dom";
import { useExecutionBasedWIP } from "@/hooks/useExecutionBasedWIP";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Package, 
  Factory, 
  ClipboardCheck, 
  Box, 
  Truck, 
  ArrowRight,
  Sparkles,
  Wind,
  Hammer,
  Flame,
  AlertTriangle,
  Clock,
  Wrench,
  Scissors
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * FloorKanban - Live factory floor status
 * 
 * REFACTORED: Now derives all quantities from execution records and batch tables,
 * NOT from work_orders.current_stage.
 * 
 * current_stage is retained only as a high-level status hint.
 */

const STAGE_ICONS: Record<string, React.ElementType> = {
  goods_in: Package,
  cutting: Scissors,
  production: Factory,
  qc: ClipboardCheck,
  packing: Box,
  dispatch: Truck
};

const STAGE_ROUTES: Record<string, string> = {
  goods_in: '/materials/inwards',
  cutting: '/work-orders?stage=cutting_queue',
  production: '/production-progress',
  qc: '/quality',
  packing: '/packing',
  dispatch: '/dispatch'
};

const STAGE_LABELS: Record<string, string> = {
  goods_in: 'Goods In',
  cutting: 'Cutting',
  production: 'Production',
  qc: 'Quality Control',
  packing: 'Packing',
  dispatch: 'Dispatch'
};

const EXTERNAL_ICONS: Record<string, React.ElementType> = {
  'Forging': Flame,
  'Job Work': Wrench,
  'Plating': Sparkles,
  'Buffing': Wind,
  'Blasting': Hammer,
  'Heat Treatment': Flame
};

const AnimatedNumber = ({ value }: { value: number }) => {
  return <span>{value.toLocaleString()}</span>;
};

export const FloorKanban = () => {
  const navigate = useNavigate();
  const { internalStages, externalProcesses, summary, loading } = useExecutionBasedWIP();

  const getStatus = (avgWait: number): 'normal' | 'warning' | 'bottleneck' => {
    if (avgWait > 48) return 'bottleneck';
    if (avgWait > 24) return 'warning';
    return 'normal';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'bottleneck': return 'border-red-500 bg-red-50 dark:bg-red-950/30';
      case 'warning': return 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/30';
      default: return 'border-green-500 bg-green-50 dark:bg-green-950/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'bottleneck':
        return (
          <Badge variant="destructive" className="gap-1">
            <AlertTriangle className="h-3 w-3" />
            Bottleneck
          </Badge>
        );
      case 'warning':
        return (
          <Badge className="bg-yellow-500 text-white gap-1">
            <Clock className="h-3 w-3" />
            Warning
          </Badge>
        );
      default:
        return (
          <Badge className="bg-green-500 text-white">
            Normal
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-4">Live Floor Status - Kanban View</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-10 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="h-48 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Filter external processes with activity
  const activeExternalProcesses = externalProcesses.filter(p => p.jobCount > 0 || p.wipPcs > 0);

  return (
    <TooltipProvider>
      <div className="mb-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold">Live Floor Status - Kanban View</h2>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>Active Jobs: <strong className="text-foreground">{summary.totalActiveJobs}</strong></span>
              <span>Internal WIP: <strong className="text-foreground">{summary.totalInternalWIP.toLocaleString()}</strong> pcs</span>
              <span>External WIP: <strong className="text-amber-600">{summary.totalExternalWIP.toLocaleString()}</strong> pcs</span>
            </div>
          </div>
          
          {/* Internal Stages - Derived from batch/execution records */}
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="h-1 w-6 bg-gradient-to-r from-gray-400 to-gray-600 rounded" />
              <h3 className="text-sm font-semibold text-muted-foreground">Internal Flow</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {internalStages.map((stageData, idx) => {
                const StageIcon = STAGE_ICONS[stageData.stage] || Package;
                const status = getStatus(stageData.avgWaitHours);
                const route = STAGE_ROUTES[stageData.stage] || '/production-progress';
                const label = STAGE_LABELS[stageData.stage] || stageData.stage;
                
                return (
                  <div key={stageData.stage} className="relative">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            getStatusColor(status)
                          )}
                          onClick={() => navigate(route)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <StageIcon className="h-5 w-5 text-primary" />
                              {getStatusBadge(status)}
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {label}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Active Jobs</span>
                                <span className="font-bold text-primary text-lg">
                                  <AnimatedNumber value={stageData.jobCount} />
                                </span>
                              </div>
                              {stageData.totalPcs > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Pcs</span>
                                  <span className="font-semibold">
                                    <AnimatedNumber value={stageData.totalPcs} />
                                  </span>
                                </div>
                              )}
                              {stageData.totalKg > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>Kg</span>
                                  <span className="font-semibold">{stageData.totalKg.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            {stageData.jobCount > 0 && (
                              <div className="space-y-1">
                                <Progress 
                                  value={Math.min(stageData.avgWaitHours * 4, 100)} 
                                  className="h-1"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                  {stageData.avgWaitHours.toFixed(1)}h avg wait
                                </p>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="w-64">
                        <div className="space-y-2">
                          <h4 className="font-semibold">{label} Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Active Jobs:</p>
                              <p className="font-medium">{stageData.jobCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Overdue:</p>
                              <p className="font-medium text-red-500">
                                {stageData.overdueCount}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">WIP Quantity:</p>
                              <p className="font-medium">{stageData.totalPcs.toLocaleString()} pcs</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Wait:</p>
                              <p className="font-medium">{stageData.avgWaitHours.toFixed(1)}h</p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Click to view {label.toLowerCase()} details
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                    {idx < internalStages.length - 1 && (
                      <div className="hidden md:flex absolute right-0 top-1/2 transform translate-x-1/2 -translate-y-1/2 z-10">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* External Stages - Derived from wo_external_moves */}
          {activeExternalProcesses.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-1 w-6 bg-gradient-to-r from-amber-400 to-amber-600 rounded" />
                <h3 className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                  External Processing
                </h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {activeExternalProcesses.map((proc) => {
                  const ProcessIcon = EXTERNAL_ICONS[proc.processType] || Factory;
                  const status = getStatus(proc.avgWaitHours);
                  
                  return (
                    <Tooltip key={proc.processType}>
                      <TooltipTrigger asChild>
                        <Card 
                          className={cn(
                            "cursor-pointer hover:shadow-xl transition-all duration-300 border-l-4",
                            getStatusColor(status)
                          )}
                          onClick={() => navigate(`/work-orders?external=${proc.processType.toLowerCase()}`)}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between">
                              <ProcessIcon className="h-5 w-5 text-amber-600" />
                              {getStatusBadge(status)}
                            </div>
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                              {proc.processType}
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Active Jobs</span>
                                <span className="font-bold text-amber-600 text-lg">
                                  <AnimatedNumber value={proc.jobCount} />
                                </span>
                              </div>
                              {proc.wipPcs > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>WIP Pcs</span>
                                  <span className="font-semibold">
                                    <AnimatedNumber value={proc.wipPcs} />
                                  </span>
                                </div>
                              )}
                              {proc.wipKg > 0 && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>WIP Kg</span>
                                  <span className="font-semibold">{proc.wipKg.toFixed(1)}</span>
                                </div>
                              )}
                            </div>
                            {proc.jobCount > 0 && (
                              <div className="space-y-1">
                                <Progress 
                                  value={Math.min(proc.avgWaitHours * 4, 100)} 
                                  className="h-1"
                                />
                                <p className="text-xs text-muted-foreground text-center">
                                  {proc.avgWaitHours.toFixed(1)}h avg
                                </p>
                              </div>
                            )}
                            {proc.overdueCount > 0 && (
                              <Badge variant="destructive" className="text-xs">
                                {proc.overdueCount} overdue
                              </Badge>
                            )}
                          </CardContent>
                        </Card>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="w-64">
                        <div className="space-y-2">
                          <h4 className="font-semibold">{proc.processType} Details</h4>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <p className="text-muted-foreground">Jobs:</p>
                              <p className="font-medium">{proc.jobCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Pending Returns:</p>
                              <p className="font-medium">{proc.pendingMoves}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Sent:</p>
                              <p className="font-medium">{proc.sentPcs.toLocaleString()} pcs</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Returned:</p>
                              <p className="font-medium">{proc.returnedPcs.toLocaleString()} pcs</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Overdue:</p>
                              <p className="font-medium text-red-500">{proc.overdueCount}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Avg Wait:</p>
                              <p className="font-medium">{proc.avgWaitHours.toFixed(1)}h</p>
                            </div>
                          </div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
